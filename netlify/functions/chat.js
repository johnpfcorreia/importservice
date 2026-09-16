/* ---------------------------------------------------------------------------
 * netlify/functions/chat.js — the AutoRuta24 assistant, on Groq.
 *
 * Two Groq calls do the work:
 *   - llama-3.3-70b-versatile runs the conversation and owns two tools:
 *     pesquisar_anuncios and calcular_impostos.
 *   - When it asks for listings, this function calls groq/compound with its
 *     built-in web search locked to the marketplace domains, and hands the
 *     answer back as the tool result. Compound can't take custom tools, and
 *     70B can't search on its own, so each does the half it can.
 *
 * Needs GROQ_API_KEY in Netlify → Site configuration → Environment variables.
 * Optional: CHAT_MODEL, SEARCH_MODEL, CHAT_ORIGIN.
 * ------------------------------------------------------------------------- */
'use strict';

const TaxPT = require('../../assets/tax-pt.js');

const API = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL = process.env.CHAT_MODEL || 'llama-3.3-70b-versatile';
const SEARCH_MODEL = process.env.SEARCH_MODEL || 'groq/compound';
const ORIGIN = process.env.CHAT_ORIGIN || 'https://www.autoruta24.com';
const MAX_TURNS = 20;
const MAX_USER_CHARS = 1200;

const EU_MARKETS = ['autoscout24.com', 'autoscout24.de', 'autoscout24.nl', 'autoscout24.be',
                    'autoscout24.fr', 'autoscout24.it', 'autoscout24.at', 'mobile.de'];
const LOCAL_MARKETS = ['standvirtual.com', 'wallapop.com', 'coches.net', 'autoscout24.es'];

// Kept short on purpose: the free tier meters tokens per minute and the
// system prompt is paid on every call.
const SYSTEM = `És o assistente da AutoRuta24, serviço de importação de veículos da Europa para Portugal e Espanha. Português europeu por defeito; espanhol se o utilizador escrever em espanhol. Tratas por "tu". Directo, concreto, honesto. Nunca inventas números: se não tens um preço de anúncio ou um cálculo da ferramenta, dizes que não tens.

FACTOS
Origem: Alemanha, França, Bélgica, Holanda, Itália, Áustria. Destino: Portugal e Espanha. Chave na mão em 25 a 40 dias. O cliente paga o carro directamente ao vendedor; o dinheiro nunca passa pela AutoRuta24.
Serviço, publicado e igual para todos: motos €590; carros até €30.000 €990; €30.000 a €60.000 €1.900; acima de €60.000 €2.900. Metade no início, metade na entrega.
Custos ao valor real, sem margem: veículo; transporte €600 a €1.500; ISV/IUC; legalização (COC, inspecção, matrícula) €400 a €700.
Compensa a partir de cerca de €15.000 de veículo; abaixo disso diz que não compensa. Poupança típica 10% a 20% no custo total; nunca prometas mais.

MÉTODO
1. Percebe marca, modelo, ano mínimo, combustível, orçamento, país de matrícula. Pergunta só o que falta, no máximo duas coisas de cada vez.
2. Usa pesquisar_anuncios para saber o preço real lá fora (mercado "europa") e cá (mercado "nacional"). Cita os preços e as fontes que a ferramenta devolver. Se devolver pouco, diz.
3. Com cilindrada, CO₂ e ano, usa calcular_impostos. Eléctricos: ISV e IUC zero em Portugal.
4. Estimativa total em parcelas: veículo + transporte + ISV + legalização + serviço. Marca como estimativa.
5. Veredicto honesto: compensa, não compensa, ou depende de X.
6. Com estimativa completa, ou se a pessoa quiser avançar, termina com <resumo>marca, modelo, ano, orçamento, país, estimativa</resumo>. Não expliques o bloco.

REGRAS
Não és humano; és o assistente do site. Sem aconselhamento de crédito nem nomes de bancos: financiamento é com o Pedro por WhatsApp. Sem promessas de prazo, disponibilidade ou preço final. Respostas curtas, sem listas longas. Fora de importação de veículos, diz educadamente que só ajudas com isso.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'pesquisar_anuncios',
      description: 'Pesquisa anúncios reais de veículos. mercado="europa" procura na Alemanha, Holanda, Bélgica, França, Itália e Áustria; mercado="nacional" procura em Portugal e Espanha. Devolve preços encontrados e as fontes.',
      parameters: {
        type: 'object',
        properties: {
          consulta: { type: 'string', description: 'Ex.: "BMW X5 xDrive30d 2020 diesel"' },
          mercado: { type: 'string', enum: ['europa', 'nacional'] },
          preco_max: { type: 'number', description: 'Orçamento máximo em euros, opcional' }
        },
        required: ['consulta', 'mercado']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calcular_impostos',
      description: 'Calcula ISV e IUC (Portugal) ou o imposto de matriculação (Espanha). Usa sempre que tiveres cilindrada, CO2 e ano.',
      parameters: {
        type: 'object',
        properties: {
          pais: { type: 'string', enum: ['PT', 'ES'] },
          categoria: { type: 'string', enum: ['A', 'moto'] },
          combustivel: { type: 'string', enum: ['petrol', 'diesel', 'electric', 'phev', 'hev', 'gas'] },
          cilindrada: { type: 'number' },
          co2: { type: 'number' },
          ciclo: { type: 'string', enum: ['WLTP', 'NEDC'] },
          primeira_matricula: { type: 'string', description: 'YYYY-MM' },
          valor: { type: 'number', description: 'Só para Espanha' }
        },
        required: ['pais', 'combustivel']
      }
    }
  }
];

/* -- tools ------------------------------------------------------------- */

function runCalculator(i) {
  const cycle = i.ciclo || ((i.primeira_matricula || '2020').slice(0, 4) >= '2019' ? 'WLTP' : 'NEDC');
  if (i.pais === 'ES') {
    const r = TaxPT.calculateIEDMT({ fuel: i.combustivel, co2: i.co2, value: i.valor });
    return { pais: 'ES', imposto_matriculacao: r.total, taxa: r.rate, base: r.base, taxa_dgt: r.registrationFee, notas: r.notes };
  }
  const common = { category: i.categoria || 'A', fuel: i.combustivel, displacement: i.cilindrada,
                   co2: i.co2, cycle, firstRegistration: i.primeira_matricula };
  const isv = TaxPT.calculateISV(Object.assign({ condition: 'used' }, common));
  const iuc = TaxPT.calculateIUC(common);
  return { pais: 'PT', isv_total: isv.total, componente_cilindrada: isv.cylinderComponent,
           componente_ambiental: isv.environmentalComponent, desconto_anos_uso: isv.ageRelief,
           iuc_anual: iuc.total, notas: isv.notes.concat(iuc.notes) };
}

async function groq(body, extraHeaders) {
  const res = await fetch(API, {
    method: 'POST',
    headers: Object.assign({
      'content-type': 'application/json',
      'authorization': 'Bearer ' + process.env.GROQ_API_KEY
    }, extraHeaders || {}),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('groq ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}

// Compound searches the marketplaces and summarises what it finds. We keep
// the summary as the tool result and lift the URLs out for the widget.
async function searchListings(i, sources) {
  const domains = i.mercado === 'nacional' ? LOCAL_MARKETS : EU_MARKETS;
  const where = i.mercado === 'nacional' ? 'em Portugal e Espanha' : 'na Alemanha, Holanda, Bélgica, França, Itália e Áustria';
  const budget = i.preco_max ? ` com preço até ${Math.round(i.preco_max)} euros` : '';
  const prompt = `Procura anúncios à venda de ${i.consulta} ${where}${budget}. ` +
    'Responde em português com uma lista curta de até 6 anúncios concretos: modelo/versão, ano, quilómetros, preço em euros e o URL. ' +
    'Depois indica a faixa de preços encontrada. Só anúncios reais que tenhas visto; se não encontrares, diz que não encontraste.';
  const r = await groq({
    model: SEARCH_MODEL,
    messages: [{ role: 'user', content: prompt }],
    search_settings: { include_domains: domains },
    compound_custom: { tools: { enabled_tools: ['web_search'] } }
  }, { 'Groq-Model-Version': 'latest' });

  const msg = (r.choices && r.choices[0] && r.choices[0].message) || {};
  const text = msg.content || '';
  // citations may arrive on the message, in executed_tools, or only inline
  const seen = new Set(sources.map(s => s.url));
  const add = (url, title) => { if (url && !seen.has(url)) { seen.add(url); sources.push({ url, title: title || url }); } };
  (msg.citations || []).forEach(c => add(typeof c === 'string' ? c : c.url, c && c.title));
  (msg.executed_tools || []).forEach(t => {
    let out = t.output || t.search_results;
    if (typeof out === 'string') { try { out = JSON.parse(out); } catch (e) { out = null; } }
    const results = (out && (out.results || out)) || [];
    if (Array.isArray(results)) results.forEach(x => add(x && x.url, x && x.title));
  });
  (text.match(/https?:\/\/[^\s)\]]+/g) || []).forEach(u => add(u.replace(/[.,]$/, '')));
  return text || 'Não encontrei anúncios para essa pesquisa.';
}

/* -- handler ----------------------------------------------------------- */

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  // Read-only health check: reports whether the key is visible, never its value.
  if (event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.diag === '1') {
    const names = Object.keys(process.env).filter(k => /GROQ/i.test(k));
    return { statusCode: 200, headers: cors, body: JSON.stringify({
      configured: !!process.env.GROQ_API_KEY, groq_variables_seen: names, model: CHAT_MODEL, search: SEARCH_MODEL }) };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: '{"error":"method"}' };
  if (!process.env.GROQ_API_KEY) return { statusCode: 503, headers: cors, body: '{"error":"not-configured"}' };

  let incoming;
  try { incoming = JSON.parse(event.body || '{}').messages; } catch (e) { incoming = null; }
  if (!Array.isArray(incoming) || !incoming.length) return { statusCode: 400, headers: cors, body: '{"error":"bad-request"}' };

  const history = incoming.slice(-MAX_TURNS)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_USER_CHARS) }));
  if (!history.length || history[history.length - 1].role !== 'user') {
    return { statusCode: 400, headers: cors, body: '{"error":"bad-request"}' };
  }

  const messages = [{ role: 'system', content: SYSTEM }].concat(history);
  const sources = [];

  try {
    let hops = 0;
    while (hops++ < 5) {
      const r = await groq({ model: CHAT_MODEL, messages, tools: TOOLS, tool_choice: 'auto',
                             temperature: 0.3, max_tokens: 900 });
      const msg = r.choices[0].message;
      const calls = msg.tool_calls || [];
      if (!calls.length) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ text: (msg.content || '').trim(), sources }) };
      }
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
        let result;
        if (call.function.name === 'calcular_impostos') result = JSON.stringify(runCalculator(args));
        else if (call.function.name === 'pesquisar_anuncios') result = await searchListings(args, sources);
        else result = 'ferramenta desconhecida';
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return { statusCode: 502, headers: cors, body: '{"error":"loop"}' };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, headers: cors, body: '{"error":"upstream"}' };
  }
};
