/*
 * Janelas do próprio app no lugar de prompt/confirm/alert (que alguns navegadores bloqueiam,
 * como os navegadores internos de outros apps). Todas devolvem uma Promise.
 *   Dialogo.form({ titulo, texto, campos: [{ nome, label, valor, tipo, obrigatorio, min }], ok })
 *     → objeto com os valores, ou null se cancelar
 *   Dialogo.confirmar(texto, { titulo, ok, perigo }) → true/false
 *   Dialogo.aviso(texto, { titulo }) → quando fechar
 */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const css = document.createElement('style');
  css.textContent = `
    dialog.dlg { border: 0; padding: 0; border-radius: 22px; width: min(440px, calc(100vw - 32px)); background: var(--card); color: var(--ink);
      box-shadow: 0 24px 60px rgba(0,0,0,.35); }
    dialog.dlg::backdrop { background: rgba(10,12,24,.55); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
    dialog.dlg form { padding: 22px; display: grid; gap: 12px; margin: 0; }
    dialog.dlg h3 { margin: 0; font-size: 18px; }
    dialog.dlg p { margin: 0; color: var(--muted); font-size: 14.5px; white-space: pre-line; }
    dialog.dlg .acoes { display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px; }
    dialog.dlg .btn.perigo { background: #f04438; box-shadow: none; }
    dialog.dlg .dlg-erro { color: #f04438; font-size: 13.5px; min-height: 0; }
    dialog.dlg[open] { animation: dlg-in .16s ease; }
    @keyframes dlg-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }`;
  document.head.appendChild(css);

  function abrir(html, aoEnviar) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'dlg';
      d.innerHTML = html;
      document.body.appendChild(d);
      let feito = false;
      // responde na hora (alguns navegadores atrasam o evento "close")
      const terminar = (valor) => {
        if (feito) return; feito = true;
        if (d.open) d.close();
        d.remove(); resolve(valor);
      };
      const f = d.querySelector('form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = aoEnviar(f);
        if (r && r.erro) { d.querySelector('.dlg-erro').textContent = r.erro; return; }
        terminar(r ? r.valor : true);
      });
      d.querySelector('[data-cancelar]')?.addEventListener('click', () => terminar(null));
      d.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); }); // tecla Esc
      d.addEventListener('close', () => terminar(null));
      d.showModal();
      const foco = d.querySelector('input, textarea, select') || d.querySelector('button[type=submit]');
      if (foco) foco.focus();
    });
  }

  window.Dialogo = {
    form({ titulo, texto, campos, ok = 'Salvar', perigo = false }) {
      const html = `<form method="dialog" novalidate>
        <h3>${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}
        ${campos.map((c, i) => `<div><label for="dlg-c${i}">${esc(c.label)}</label>
          <input id="dlg-c${i}" name="${esc(c.nome)}" type="${c.tipo || 'text'}" value="${esc(c.valor || '')}"
            ${c.tipo === 'password' ? 'autocomplete="' + (c.nome === 'atual' ? 'current-password' : 'new-password') + '"' : 'autocomplete="off"'}
            ${c.max ? `maxlength="${c.max}"` : ''}></div>`).join('')}
        <div class="dlg-erro"></div>
        <div class="acoes"><button type="button" class="btn peq" data-cancelar>Cancelar</button>
          <button type="submit" class="btn${perigo ? ' perigo' : ''}">${esc(ok)}</button></div></form>`;
      return abrir(html, (f) => {
        const v = {};
        for (const c of campos) {
          const val = f.elements[c.nome].value.trim();
          if (c.obrigatorio && !val) return { erro: `Preencha: ${c.label}.` };
          if (c.min && val.length < c.min) return { erro: `${c.label}: mínimo de ${c.min} caracteres.` };
          v[c.nome] = val;
        }
        return { valor: v };
      });
    },
    confirmar(texto, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
      return abrir(`<form method="dialog"><h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
        <div class="acoes"><button type="button" class="btn peq" data-cancelar>Cancelar</button>
        <button type="submit" class="btn${perigo ? ' perigo' : ''}">${esc(ok)}</button></div></form>`, () => ({ valor: true }))
        .then((r) => r === true);
    },
    aviso(texto, { titulo = 'Aviso' } = {}) {
      return abrir(`<form method="dialog"><h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
        <div class="acoes"><button type="submit" class="btn">Ok</button></div></form>`, () => ({ valor: true }));
    },
  };
})();
