/* ---------------------------------------------------------------------------
 * functions/api/chat.js — the AutoRuta24 assistant, on Cloudflare Pages.
 *
 * Same design as before: llama-3.3-70b-versatile runs the conversation and
 * owns two tools; groq/compound does the marketplace search with its built-in
 * web search locked to the listing domains. Both on Groq's free tier.
 *
 * Cloudflare routes this file to /api/chat automatically. Set GROQ_API_KEY in
 * Cloudflare Pages → Settings → Variables and Secrets (Production).
 * ------------------------------------------------------------------------- */
import TaxPT from '../../assets/tax-pt.js';

const API = 'https://api.groq.com/openai/v1/chat/completions';
const chatModel = (e) => e.CHAT_MODEL || 'llama-3.3-70b-versatile';
const searchModel = (e) => e.SEARCH_MODEL || 'groq/compound';
const origin = (e) => e.CHAT_ORIGIN || 'https://www.autoruta24.com';
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

async function groq(env, body, extraHeaders) {
  const res = await fetch(API, {
    method: 'POST',
    headers: Object.assign({
      'content-type': 'application/json',
      'authorization': 'Bearer ' + env.GROQ_API_KEY
    }, extraHeaders || {}),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error('groq ' + res.status);
    err.status = res.status; err.detail = body;
    throw err;
  }
  return res.json();
}

// Compound searches the marketplaces and summarises what it finds. We keep
// the summary as the tool result and lift the URLs out for the widget.
async function searchListings(env, i, sources) {
  const domains = i.mercado === 'nacional' ? LOCAL_MARKETS : EU_MARKETS;
  const where = i.mercado === 'nacional' ? 'em Portugal e Espanha' : 'na Alemanha, Holanda, Bélgica, França, Itália e Áustria';
  const budget = i.preco_max ? ` com preço até ${Math.round(i.preco_max)} euros` : '';
  const prompt = `Procura anúncios à venda de ${i.consulta} ${where}${budget}. ` +
    'Responde em português com uma lista curta de até 6 anúncios concretos: modelo/versão, ano, quilómetros, preço em euros e o URL. ' +
    'Depois indica a faixa de preços encontrada. Só anúncios reais que tenhas visto; se não encontrares, diz que não encontraste.';
  const r = await groq(env, {
    model: searchModel(env),
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


/* -- handlers ------------------------------------------------------------ */

const json = (env, status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': origin(env),
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS'
  }
});

export async function onRequestOptions({ env }) {
  return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': origin(env),
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS'
  }});
}

// Read-only health check: reports whether the key is visible, never its value.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('diag') === '1') {
    return json(env, 200, { configured: !!env.GROQ_API_KEY,
      groq_variables_seen: Object.keys(env).filter(k => /GROQ/i.test(k)),
      model: chatModel(env), search: searchModel(env) });
  }
  if (url.searchParams.get('diag') === '2') {
    const out = { configured: !!env.GROQ_API_KEY };
    if (!env.GROQ_API_KEY) return json(env, 200, out);
    const probe = async (model, extra) => {
      try {
        const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json',
          'authorization': 'Bearer ' + env.GROQ_API_KEY, 'Groq-Model-Version': 'latest' },
          body: JSON.stringify(Object.assign({ model, max_tokens: 8,
            messages: [{ role: 'user', content: 'Diz olá.' }] }, extra || {})) });
        const t = await r.text();
        return { status: r.status, reply: t.slice(0, 200) };
      } catch (e) { return { status: 'fetch-failed', reply: String(e).slice(0, 200) }; }
    };
    out.chat_model = chatModel(env);
    out.chat = await probe(chatModel(env), { tools: TOOLS, tool_choice: 'auto' });
    out.search_model = searchModel(env);
    out.search = await probe(searchModel(env), { compound_custom: { tools: { enabled_tools: ['web_search'] } } });
    return json(env, 200, out);
  }
  return json(env, 405, { error: 'method' });
}

export async function onRequestPost({ request, env }) {
  if (!env.GROQ_API_KEY) return json(env, 503, { error: 'not-configured' });

  let incoming;
  try { incoming = (await request.json()).messages; } catch (e) { incoming = null; }
  if (!Array.isArray(incoming) || !incoming.length) return json(env, 400, { error: 'bad-request' });

  const history = incoming.slice(-MAX_TURNS)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_USER_CHARS) }));
  if (!history.length || history[history.length - 1].role !== 'user') return json(env, 400, { error: 'bad-request' });

  const messages = [{ role: 'system', content: SYSTEM }].concat(history);
  const sources = [];

  try {
    let hops = 0;
    while (hops++ < 5) {
      const r = await groq(env, { model: chatModel(env), messages, tools: TOOLS, tool_choice: 'auto',
                                  temperature: 0.3, max_tokens: 900 });
      const msg = r.choices[0].message;
      const calls = msg.tool_calls || [];
      if (!calls.length) return json(env, 200, { text: (msg.content || '').trim(), sources });
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
        let result;
        if (call.function.name === 'calcular_impostos') result = JSON.stringify(runCalculator(args));
        else if (call.function.name === 'pesquisar_anuncios') result = await searchListings(env, args, sources);
        else result = 'ferramenta desconhecida';
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return json(env, 502, { error: 'loop' });
  } catch (err) {
    console.error(err);
    return json(env, 502, { error: 'upstream', upstream_status: err.status || null,
      detail: (err.detail || err.message || '').slice(0, 300) });
  }
}
