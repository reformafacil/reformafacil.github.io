/* Página inicial: demonstração ao vivo e pedido de acesso. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const base = new RTC.Base(window.RTC_DADOS);
  const DATA = '2026-06-15';

  // casos populares (cClassTrib oficiais)
  const CASOS = [
    { cst: '000', cls: '000001', nome: 'Produto ou serviço em geral' },
    { cst: '200', cls: '200003', nome: 'Alimento da Cesta Básica Nacional' },
    { cst: '200', cls: '200014', nome: 'Frutas, verduras e ovos' },
    { cst: '200', cls: '200028', nome: 'Mensalidade escolar (educação)' },
    { cst: '200', cls: '200029', nome: 'Consulta ou serviço de saúde' },
    { cst: '200', cls: '200032', nome: 'Medicamento' },
    { cst: '200', cls: '200049', nome: 'Transporte coletivo de passageiros' },
  ].filter((c) => base.classificacao(c.cls, DATA, 2));

  $('#d-tipo').innerHTML = CASOS.map((c, i) => `<option value="${i}">${c.nome}</option>`).join('');

  const num = (d) => {
    const s = d.toFixedStr(2); const neg = s[0] === '-';
    let [i, f] = (neg ? s.slice(1) : s).split('.');
    return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + f;
  };
  const brl = (d) => 'R$ ' + num(d);
  const pct = (d) => num(d).replace(/,00$/, '') + '%';
  const limpa = (v) => {
    let s = String(v).trim().replace(/\s|R\$/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return /^\d*\.?\d+$/.test(s) ? s : null;
  };
  function calcular(caso, valor) {
    const r = RTC.calcularOperacao(base, { data: DATA, itens: [{ numero: 1, quantidade: '1', cst: caso.cst, cClassTrib: caso.cls, baseCalculo: valor }] });
    return r.itens[0].ok ? r : null;
  }

  function atualizar() {
    const caso = CASOS[+$('#d-tipo').value];
    const valor = limpa($('#d-valor').value);
    if (!valor) { $('#d-explica').textContent = 'Digite um valor, por exemplo 1.000,00.'; return; }
    const r = calcular(caso, valor);
    if (!r) { $('#d-explica').textContent = 'Não foi possível calcular este caso.'; return; }
    const t = r.total; const g = r.itens[0].g;
    $('#d-cbs').textContent = brl(t.vCBS);
    $('#d-ibs').textContent = brl(t.vIBS);
    $('#d-tot').textContent = brl(t.vTotal);
    const red = g.cbs.reducao;
    let h = `Base de <b>${brl(g.vBC)}</b>. `;
    if (!red.isZero()) {
      h += red.cmp(RTC.dec(100)) === 0
        ? `Esta categoria tem <b>redução de 100%</b>: não há CBS nem IBS a pagar. `
        : `Esta categoria tem <b>redução de ${pct(red)}</b>: a CBS cai de ${pct(g.cbs.aliquota)} para ${pct(g.cbs.aliquotaEfetiva)}. `;
      const integral = calcular(CASOS[0], valor);
      if (integral && caso.cls !== '000001') {
        const eco = integral.total.vTotal.sub(t.vTotal);
        if (!eco.isZero()) h += `<span class="economia">Economia de ${brl(eco)}</span> em relação à tributação integral.`;
      }
    } else {
      h += `CBS de ${pct(g.cbs.aliquota)} e IBS de ${pct(g.ibsUF.aliquota)}, as alíquotas do ano de teste.`;
    }
    $('#d-explica').innerHTML = h;
  }
  $('#d-tipo').addEventListener('change', atualizar);
  $('#d-valor').addEventListener('input', atualizar);
  atualizar();

  // quem já entrou neste aparelho vê "Abrir o app"
  if (Object.keys(localStorage).some((k) => k.startsWith('rtc-sessao-'))) $('#btn-entrar').textContent = 'Abrir o app';

  // ───── pedido de acesso (grava em "solicitacoes" no Firestore; só o administrador lê) ─────
  const form = $('#form-acesso');
  const retorno = (txt, ok) => { $('#a-retorno').innerHTML = `<div class="msg ${ok ? 'ok' : 'erro'}">${txt}</div>`; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.site.value) return; // armadilha para robôs
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg) { retorno('Pedidos de acesso ainda não estão configurados.', false); return; }
    const b = form.querySelector('button'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const V = '13.4.0';
      const [A, F] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
      ]);
      const app = A.getApps().length ? A.getApps()[0] : A.initializeApp(cfg);
      const db = F.getFirestore(app);
      await F.addDoc(F.collection(db, 'solicitacoes'), {
        nome: form.nome.value.trim().slice(0, 120),
        email: form.email.value.trim().toLowerCase().slice(0, 160),
        telefone: form.telefone.value.trim().slice(0, 30),
        perfil: form.perfil.value.slice(0, 60),
        mensagem: form.mensagem.value.trim().slice(0, 1000),
        criadoEm: F.serverTimestamp(),
      });
      form.reset();
      retorno('Pedido enviado! Vamos responder no seu e-mail em breve.', true);
    } catch (err) {
      console.error(err);
      retorno('Não foi possível enviar agora. Verifique a internet e tente de novo.', false);
    }
    b.disabled = false; b.textContent = 'Quero acesso';
  });
})();
