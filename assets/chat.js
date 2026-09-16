/* ---------------------------------------------------------------------------
 * assets/chat.js — the assistant widget.
 * Floating button, panel, conversation kept in sessionStorage so a reload
 * doesn't lose it. Talks to /api/chat. Turns a <resumo> block from the
 * assistant into a WhatsApp handoff button.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'ar24:chat';
  var MAX_STORED = 30;

  var lang = function () { return document.documentElement.lang.slice(0, 2) === 'es' ? 'es' : 'pt'; };
  var T = {
    title:   { pt: 'Assistente AutoRuta24', es: 'Asistente AutoRuta24' },
    hint:    { pt: 'Diz-me que carro procuras e o teu orçamento. Vejo o que há na Europa e faço-te as contas.',
               es: 'Dime qué coche buscas y tu presupuesto. Miro qué hay en Europa y te hago los números.' },
    ph:      { pt: 'Ex.: BMW X5 diesel, 2020 ou mais recente, até 35 mil', es: 'Ej.: BMW X5 diésel, 2020 o más nuevo, hasta 35 mil' },
    send:    { pt: 'Enviar', es: 'Enviar' },
    open:    { pt: 'Perguntar', es: 'Preguntar' },
    thinking:{ pt: 'A procurar…', es: 'Buscando…' },
    err:     { pt: 'Não consegui responder agora. Fala connosco pelo WhatsApp.', es: 'No he podido responder ahora. Escríbenos por WhatsApp.' },
    off:     { pt: 'O assistente ainda não está activo. Fala connosco pelo WhatsApp.', es: 'El asistente aún no está activo. Escríbenos por WhatsApp.' },
    wa:      { pt: 'Enviar isto ao Pedro por WhatsApp', es: 'Enviar esto a Pedro por WhatsApp' },
    sources: { pt: 'Fontes', es: 'Fuentes' },
    reset:   { pt: 'Recomeçar', es: 'Reiniciar' },
    disclaimer: { pt: 'Estimativas a partir de anúncios públicos. O valor final confirma-se na simulação.',
                  es: 'Estimaciones a partir de anuncios públicos. El importe final se confirma en la simulación.' }
  };
  var t = function (k) { return T[k][lang()]; };

  /* -- markup ------------------------------------------------------------- */
  var root = document.createElement('div');
  root.id = 'ar24chat';
  root.innerHTML =
    '<button type="button" class="ar24c-fab" aria-expanded="false" aria-controls="ar24c-panel">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>' +
      '<span data-i18n="open"></span>' +
    '</button>' +
    '<section id="ar24c-panel" class="ar24c-panel" hidden aria-label="Assistente">' +
      '<header class="ar24c-head"><strong data-i18n="title"></strong>' +
        '<div><button type="button" class="ar24c-reset" data-i18n="reset"></button>' +
        '<button type="button" class="ar24c-close" aria-label="Fechar">×</button></div></header>' +
      '<div class="ar24c-log" role="log" aria-live="polite"></div>' +
      '<form class="ar24c-form"><textarea rows="2" required></textarea>' +
        '<button type="submit" class="btn" data-i18n="send"></button></form>' +
      '<p class="ar24c-disc" data-i18n="disclaimer"></p>' +
    '</section>';
  document.body.appendChild(root);

  var fab = root.querySelector('.ar24c-fab');
  var panel = root.querySelector('.ar24c-panel');
  var log = root.querySelector('.ar24c-log');
  var form = root.querySelector('.ar24c-form');
  var input = root.querySelector('textarea');

  function applyLang() {
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    input.placeholder = t('ph');
  }
  applyLang();
  document.addEventListener('langchange', applyLang);

  /* -- state ------------------------------------------------------------- */
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { history = []; }

  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-MAX_STORED))); } catch (e) { /* private mode */ }
  }

  function waLink(summary) {
    var num = (window.__ar24wa && window.__ar24wa()) || '';
    var text = (lang() === 'es' ? 'Hola, vengo del asistente del sitio.\n\n' : 'Olá, venho do assistente do site.\n\n') + summary;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  }

  function render(role, text, sources) {
    var wrap = document.createElement('div');
    wrap.className = 'ar24c-msg ' + role;

    // <resumo>…</resumo> becomes a WhatsApp handoff
    var summary = null;
    var m = text.match(/<resumo>([\s\S]*?)<\/resumo>/i);
    if (m) { summary = m[1].trim(); text = text.replace(m[0], '').trim(); }

    var body = document.createElement('div');
    body.className = 'ar24c-body';
    text.split(/\n{2,}/).forEach(function (para) {
      var p = document.createElement('p');
      p.textContent = para.replace(/\n/g, ' ');
      body.appendChild(p);
    });
    wrap.appendChild(body);

    if (sources && sources.length) {
      var s = document.createElement('div');
      s.className = 'ar24c-src';
      s.textContent = t('sources') + ': ';
      sources.slice(0, 4).forEach(function (src, i) {
        var a = document.createElement('a');
        a.href = src.url; a.target = '_blank'; a.rel = 'noopener';
        try { a.textContent = new URL(src.url).hostname.replace(/^www\./, ''); } catch (e) { a.textContent = 'link'; }
        s.appendChild(a);
        if (i < Math.min(sources.length, 4) - 1) s.appendChild(document.createTextNode(' · '));
      });
      wrap.appendChild(s);
    }

    if (summary) {
      var a = document.createElement('a');
      a.className = 'btn ar24c-wa';
      a.href = waLink(summary); a.target = '_blank'; a.rel = 'noopener';
      a.textContent = t('wa');
      wrap.appendChild(a);
    }

    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function greet() {
    if (!history.length) render('assistant', t('hint'));
  }

  history.forEach(function (m) { render(m.role, m.content, m.sources); });
  greet();

  /* -- behaviour --------------------------------------------------------- */
  function open() {
    panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); root.classList.add('open');
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); root.classList.remove('open'); }
  fab.addEventListener('click', function () { panel.hidden ? open() : close(); });
  root.querySelector('.ar24c-close').addEventListener('click', close);
  root.querySelector('.ar24c-reset').addEventListener('click', function () {
    history = []; save(); log.innerHTML = ''; greet();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    history.push({ role: 'user', content: text }); save();
    render('user', text);

    busy = true;
    var pending = render('assistant', t('thinking'));
    pending.classList.add('pending');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history.map(function (m) { return { role: m.role, content: m.content }; }) })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        pending.remove();
        if (res.status === 503) { render('assistant', t('off')); return; }
        if (!res.ok || !res.j || !res.j.text) { render('assistant', t('err')); return; }
        history.push({ role: 'assistant', content: res.j.text, sources: res.j.sources }); save();
        render('assistant', res.j.text, res.j.sources);
      })
      .catch(function () { pending.remove(); render('assistant', t('err')); })
      .finally(function () { busy = false; input.focus(); });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  // Open straight from any link with data-chat, e.g. "Perguntar ao assistente"
  document.querySelectorAll('[data-chat]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); open(); });
  });
})();
