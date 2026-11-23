/* Interface da Calculadora da Reforma Tributária */
(function () {
  'use strict';
  const D = window.RTC_DADOS;
  const base = new RTC.Base(D);
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hoje = new Date().toISOString().slice(0, 10);
  const SUGESTAO_2027 = { 2: '8.8', 3: '0.05', 4: '0.05' }; // valores do exemplo oficial (docs/exemplos.md)

  // ───────── formatação pt-BR ─────────
  const brl = (d) => 'R$ ' + num(d, 2);
  function num(d, casas) {
    const s = (d && d.toFixedStr) ? d.toFixedStr(casas) : RTC.dec(d || 0).toFixedStr(casas);
    const neg = s[0] === '-';
    let [i, f] = (neg ? s.slice(1) : s).split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + i + (f ? ',' + f : '');
  }
  function pctFmt(d) {
    if (!d) return '—';
    let s = num(d, 4).replace(/0+$/, '').replace(/,$/, '');
    if (!s.includes(',')) s += ',00'; else if (s.split(',')[1].length === 1) s += '0';
    return s + '%';
  }
  const curto = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + '…' : t || '');

  // ───────── estado ─────────
  let seq = 1;
  const novoItem = (o) => Object.assign({
    id: seq++, descricao: '', cst: '000', cClassTrib: '000001', baseCalculo: '', quantidade: '1',
    regCst: '000', regCls: '000001', temIS: false,
    is: { cClassTrib: '000001', baseCalculo: '', quantidade: '1', adValorem: '', adRem: '', isInformado: '' },
  }, o || {});
  function novaOperacao() {
    return { data: hoje, uf: '', simular: false, aliq: Object.assign({}, SUGESTAO_2027), itens: [novoItem({ descricao: 'Item 1', baseCalculo: '' })] };
  }
  let est = novaOperacao();

  // cada cliente (aba) tem a sua operação; quem guarda é conta.js (nuvem ou armazenamento local)
  function salvar() { if (window.App && typeof window.App.aoMudar === 'function') window.App.aoMudar(est); }
  const ano = () => parseInt((est.data || hoje).slice(0, 4), 10);
  const dataOk = () => (est.data && est.data >= '2026-01-01' ? est.data : '2026-01-01');

  // ───────── abas ─────────
  $('#abas').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#abas button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.aba').forEach((x) => x.classList.toggle('on', x.id === 'aba-' + b.dataset.aba));
    if (b.dataset.aba === 'cons') renderConsulta();
  });

  // ───────── operação ─────────
  const ufSel = $('#uf');
  ufSel.innerHTML = '<option value="">—</option>' + D.uf.map((u) => `<option value="${u.sigla}">${u.sigla} — ${esc(u.nome)}</option>`).join('');
  $('#data').value = est.data; ufSel.value = est.uf || '';
  $('#data').addEventListener('change', (e) => { est.data = e.target.value; renderTudo(); });
  ufSel.addEventListener('change', (e) => { est.uf = e.target.value; salvar(); });

  function renderAliq() {
    const el = $('#painel-aliq');
    const d = dataOk();
    const ref = (t) => base.aliquotaReferencia(String(t), d);
    const r2 = ref(2), r3 = ref(3), r4 = ref(4);
    const obrig = ano() >= 2027;
    const usarCampos = obrig || est.simular;
    let h = '<h3>Alíquotas</h3>';
    if (!obrig) {
      h += `<div class="info">Em <b>${ano()}</b> vale a alíquota de referência oficial (ano de teste): <b>CBS ${pctFmt(r2)}</b>,
        <b>IBS estadual ${pctFmt(r3)}</b> e <b>IBS municipal ${pctFmt(r4)}</b>. Classificações com alíquota fixa ou setorial usam a própria tabela.</div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" id="simular" ${est.simular ? 'checked' : ''}>Simular com outras alíquotas</label>`;
    } else {
      h += `<div class="aviso">A partir de 2027 a base oficial ainda não traz alíquotas de referência: <b>informe as alíquotas</b>.
        Os valores preenchidos (CBS 8,8%, IBS 0,05% + 0,05%) são os do exemplo da documentação da Receita — <b>confirme as alíquotas vigentes</b>. O resultado é uma simulação.</div>`;
    }
    if (usarCampos) {
      h += `<div class="grade" style="margin-top:10px">
        <div><label>CBS (%)</label><input data-aliq="2" inputmode="decimal" value="${esc(est.aliq[2])}"></div>
        <div><label>IBS estadual (%)</label><input data-aliq="3" inputmode="decimal" value="${esc(est.aliq[3])}"></div>
        <div><label>IBS municipal (%)</label><input data-aliq="4" inputmode="decimal" value="${esc(est.aliq[4])}"></div></div>`;
    }
    el.innerHTML = h;
    const s = $('#simular', el);
    if (s) s.addEventListener('change', () => { est.simular = s.checked; renderTudo(); });
    el.querySelectorAll('[data-aliq]').forEach((i) => i.addEventListener('input', () => { est.aliq[i.dataset.aliq] = i.value; calcular(); }));
  }

  // ───────── itens ─────────
  function opcoesCst(tributo, sel) {
    return base.csts(dataOk(), tributo).map((c) => `<option value="${c.cd}" ${c.cd === sel ? 'selected' : ''}>${c.cd} — ${esc(c.desc)}</option>`).join('');
  }
  function opcoesCls(tributo, cst, sel, filtro) {
    let l = base.classificacoes(dataOk(), tributo, cst);
    if (filtro) {
      const f = norm(filtro);
      l = l.filter((c) => c.cd === sel || norm(c.cd + ' ' + c.desc).includes(f));
    }
    if (!l.length) return '<option value="">(nenhuma classificação vigente)</option>';
    return l.map((c) => `<option value="${c.cd}" ${c.cd === sel ? 'selected' : ''}>${c.cd} — ${esc(curto(c.desc, 110))}</option>`).join('');
  }
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function garantirCls(it) {
    const d = dataOk();
    const ok = (cst, cd, t) => base.classificacoes(d, t, cst).some((c) => c.cd === cd);
    if (!base.csts(d, 2).some((c) => c.cd === it.cst)) it.cst = '000';
    if (!ok(it.cst, it.cClassTrib, 2)) { const l = base.classificacoes(d, 2, it.cst); it.cClassTrib = l[0] ? l[0].cd : ''; }
    if (!ok(it.regCst, it.regCls, 2)) { const l = base.classificacoes(d, 2, it.regCst); it.regCls = l[0] ? l[0].cd : ''; }
    const isl = base.classificacoes(d, 1);
    if (isl.length && !isl.some((c) => c.cd === it.is.cClassTrib)) it.is.cClassTrib = isl[0].cd;
  }

  function cardItem(it, n) {
    garantirCls(it);
    const d = dataOk();
    const cls = base.classificacao(it.cClassTrib, d, 2);
    const trat = cls ? base.tratamento(cls, d) : null;
    let h = `<div class="card item" data-id="${it.id}">
      <div class="item-cab"><span class="num">${n}</span>
        <input data-k="descricao" value="${esc(it.descricao)}" placeholder="Descrição do item (opcional)" style="max-width:420px">
        <span class="esp"></span>
        <button class="btn del peq nao-imprimir" data-acao="remover" title="Remover item">Remover</button></div>
      <div class="grade">
        <div><label>CST — tipo de tratamento</label><select data-k="cst">${opcoesCst(2, it.cst)}</select></div>
        <div style="grid-column: span 2"><label>cClassTrib — classificação tributária</label>
          <input data-k="filtro" placeholder="Filtrar por palavra ou código…" value="${esc(it.filtro || '')}" style="margin-bottom:6px">
          <select data-k="cClassTrib">${opcoesCls(2, it.cst, it.cClassTrib, it.filtro)}</select></div>
      </div>
      <div class="grade" style="margin-top:12px">
        <div><label>Base de cálculo (R$)</label><input data-k="baseCalculo" inputmode="decimal" value="${esc(it.baseCalculo)}" placeholder="${it.temIS ? 'vazio = base do IS + IS' : '0,00'}">
          <p class="dica">Valor da operação (produto/serviço, frete, seguro etc., menos descontos).</p></div>
        <div><label>Quantidade</label><input data-k="quantidade" inputmode="decimal" value="${esc(it.quantidade)}"></div>
      </div>`;
    if (cls) h += explicaCls(cls, trat, d);
    if (trat && trat.exigeReg) {
      h += `<div class="sub"><b>Tributação regular</b> — esta classificação suspende/desonera o tributo, e a nota precisa informar
        quanto seria devido sem o benefício. Escolha a classificação que valeria normalmente:
        <div class="grade" style="margin-top:8px">
          <div><label>CST regular</label><select data-k="regCst">${opcoesCst(2, it.regCst)}</select></div>
          <div style="grid-column: span 2"><label>cClassTrib regular</label><select data-k="regCls">${opcoesCls(2, it.regCst, it.regCls)}</select></div>
        </div></div>`;
    }
    if (ano() >= 2027) {
      h += `<div class="sub"><label class="chk"><input type="checkbox" data-k="temIS" ${it.temIS ? 'checked' : ''}>Produto sujeito ao Imposto Seletivo (cigarro, bebida alcoólica, bebida açucarada, veículos, minerais etc.)</label>`;
      if (it.temIS) {
        h += `<div class="grade" style="margin-top:8px">
          <div style="grid-column: span 2"><label>cClassTrib do IS</label><select data-is="cClassTrib">${opcoesCls(1, null, it.is.cClassTrib)}</select></div>
          <div><label>Base do IS (R$)</label><input data-is="baseCalculo" inputmode="decimal" value="${esc(it.is.baseCalculo)}"></div>
          <div><label>Quantidade (IS)</label><input data-is="quantidade" inputmode="decimal" value="${esc(it.is.quantidade)}"></div>
          <div><label>Alíquota ad valorem (%)</label><input data-is="adValorem" inputmode="decimal" value="${esc(it.is.adValorem)}" placeholder="ex.: 10"></div>
          <div><label>Alíquota ad rem (R$/unidade)</label><input data-is="adRem" inputmode="decimal" value="${esc(it.is.adRem)}" placeholder="opcional"></div>
          <div><label>IS informado no documento (R$)</label><input data-is="isInformado" inputmode="decimal" value="${esc(it.is.isInformado)}" placeholder="opcional"></div>
        </div>
        <p class="dica">As alíquotas do IS ainda não estão definidas em lei; informe-as. O IS entra na base da CBS e do IBS.</p>`;
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  function explicaCls(cls, trat, d) {
    const st = base.cstPorId[cls.sitr];
    const r = (t) => base.reducao(cls, String(t), d);
    const rc = r(2), ru = r(3), rm = r(4);
    const partes = [];
    partes.push(`<b>${esc(cls.cd)}</b> — ${esc(cls.desc)}`);
    const det = [];
    det.push('Tratamento: <b>' + esc(trat ? trat.desc : '—') + '</b>');
    det.push('Tipo de alíquota: <b>' + esc(cls.tipoAliq) + '</b>');
    if (rc && !rc.isZero() || ru && !ru.isZero()) {
      det.push(rc && ru && rc.cmp(ru) === 0 && rm && rm.cmp(rc) === 0
        ? 'Redução de alíquota: <b>' + num(rc, 2).replace(',00', '') + '%</b>'
        : 'Redução: CBS <b>' + (rc ? num(rc, 2) : '0') + '%</b>, IBS <b>' + (ru ? num(ru, 2) : '0') + '%</b>');
    }
    if (!st.gIBSCBS) det.push('<b>Sem destaque de CBS/IBS</b> na nota');
    if (cls.nomencl) det.push('Exige: ' + esc(cls.nomencl));
    if (cls.anexo) det.push('Anexo ' + esc(cls.anexo) + ' da LC 214/2025');
    const f = cls.fund && cls.fund[0];
    let h = `<div class="info">${partes.join('')}<br>${det.join(' · ')}`;
    if (f) h += `<details><summary>Fundamentação legal: ${esc(f.curto)}</summary><p style="white-space:pre-line;margin:6px 0 0">${esc(f.texto)}</p></details>`;
    if (trat && (trat.ajuste || trat.mono)) h += '<br><b>Atenção:</b> a calculadora oficial ainda não calcula esta classificação.';
    return h + '</div>';
  }

  function renderItens() {
    $('#itens').innerHTML = '<div class="titulo-feed">Itens da operação</div>' + est.itens.map((it, i) => cardItem(it, i + 1)).join('');
  }

  $('#itens').addEventListener('input', (e) => {
    const card = e.target.closest('.item'); if (!card) return;
    const it = est.itens.find((x) => x.id === +card.dataset.id);
    const k = e.target.dataset.k, ki = e.target.dataset.is;
    if (k === 'filtro') {
      it.filtro = e.target.value;
      const sel = $('select[data-k="cClassTrib"]', card);
      sel.innerHTML = opcoesCls(2, it.cst, it.cClassTrib, it.filtro);
      if (sel.value && sel.value !== it.cClassTrib) { it.cClassTrib = sel.value; rerenderCard(card, it); }
      return;
    }
    if (k && e.target.type !== 'checkbox' && e.target.tagName === 'INPUT') { it[k] = e.target.value; calcular(); }
    if (ki && e.target.tagName === 'INPUT') { it.is[ki] = e.target.value; calcular(); }
  });
  $('#itens').addEventListener('change', (e) => {
    const card = e.target.closest('.item'); if (!card) return;
    const it = est.itens.find((x) => x.id === +card.dataset.id);
    const k = e.target.dataset.k, ki = e.target.dataset.is;
    if (k === 'temIS') it.temIS = e.target.checked;
    else if (k && e.target.tagName === 'SELECT') {
      it[k] = e.target.value;
      if (k === 'cst') { it.filtro = ''; it.cClassTrib = ''; }
    } else if (ki && e.target.tagName === 'SELECT') it.is[ki] = e.target.value;
    else return;
    rerenderCard(card, it);
  });
  $('#itens').addEventListener('click', (e) => {
    if (e.target.dataset.acao !== 'remover') return;
    const id = +e.target.closest('.item').dataset.id;
    est.itens = est.itens.filter((x) => x.id !== id);
    if (!est.itens.length) est.itens.push(novoItem());
    renderTudo();
  });
  function rerenderCard(card, it) {
    const n = est.itens.indexOf(it) + 1;
    const tmp = document.createElement('div'); tmp.innerHTML = cardItem(it, n);
    card.replaceWith(tmp.firstElementChild);
    calcular();
  }

  $('#add-item').addEventListener('click', () => { est.itens.push(novoItem({ descricao: 'Item ' + (est.itens.length + 1) })); renderTudo(); });
  $('#limpar').addEventListener('click', () => {
    if (!confirm('Apagar todos os itens?')) return;
    est.itens = [novoItem({ descricao: 'Item 1' })]; renderTudo();
  });
  $('#exemplo').addEventListener('click', () => {
    est.data = '2026-06-15'; est.simular = false;
    est.itens = [
      novoItem({ descricao: 'Notebook (tributação integral)', cst: '000', cClassTrib: '000001', baseCalculo: '4500' }),
      novoItem({ descricao: 'Arroz — Cesta Básica Nacional', cst: '200', cClassTrib: '200003', baseCalculo: '100', quantidade: '20' }),
      novoItem({ descricao: 'Mensalidade escolar (educação)', cst: '200', cClassTrib: '200028', baseCalculo: '1200' }),
    ];
    $('#data').value = est.data; renderTudo();
  });

  // ───────── cálculo ─────────
  function montarOperacao() {
    const usar = ano() >= 2027 || est.simular;
    const aliq = usar ? { 2: est.aliq[2], 3: est.aliq[3], 4: est.aliq[4] } : null;
    return {
      data: dataOk(),
      itens: est.itens.map((it, i) => {
        const cls = base.classificacao(it.cClassTrib, dataOk(), 2);
        const trat = cls ? base.tratamento(cls, dataOk()) : null;
        return {
          numero: i + 1, descricao: it.descricao || 'Item ' + (i + 1), cst: it.cst, cClassTrib: it.cClassTrib,
          baseCalculo: limpa(it.baseCalculo), quantidade: limpa(it.quantidade) || '1', aliquotas: aliq,
          regular: trat && trat.exigeReg ? { cst: it.regCst, cClassTrib: it.regCls } : null,
          is: ano() >= 2027 && it.temIS ? {
            cst: '000', cClassTrib: it.is.cClassTrib, baseCalculo: limpa(it.is.baseCalculo), quantidade: limpa(it.is.quantidade) || '1',
            adValorem: limpa(it.is.adValorem), adRem: limpa(it.is.adRem), isInformado: limpa(it.is.isInformado),
          } : null,
        };
      }),
    };
  }
  // aceita "1.234,56", "1234,56" e "1234.56"
  function limpa(v) {
    if (v === null || v === undefined) return '';
    let s = String(v).trim().replace(/\s|R\$/g, '');
    if (!s) return '';
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return /^-?\d*\.?\d+$/.test(s) ? s : 'x';
  }

  function calcular() {
    salvar();
    const op = montarOperacao();
    const el = $('#resultado');
    const invalido = op.itens.find((i) => [i.baseCalculo, i.quantidade].includes('x') || (op.itens.some(() => i.aliquotas && Object.values(i.aliquotas).some((a) => limpa(a) === 'x'))));
    if (invalido) { el.innerHTML = '<div class="erro">Há um número inválido no item ' + invalido.numero + ' ou nas alíquotas. Use apenas dígitos e vírgula (ex.: 1.234,56).</div>'; return; }
    op.itens.forEach((i) => { if (i.aliquotas) Object.keys(i.aliquotas).forEach((k) => { i.aliquotas[k] = limpa(i.aliquotas[k]); }); });
    let r;
    try { r = RTC.calcularOperacao(base, op); }
    catch (e) { el.innerHTML = '<div class="erro">' + esc(e.message) + '</div>'; return; }
    el.innerHTML = renderResultado(r, op);
    const b = $('#btn-json', el);
    if (b) b.addEventListener('click', () => copiarJson(op, b));
    const p = $('#btn-print', el);
    if (p) p.addEventListener('click', () => window.print());
  }

  function renderResultado(r, op) {
    const t = r.total;
    const carga = t.vBC.isZero() ? null : t.vTotal.mul(RTC.dec(100)).div(t.vBC);
    let h = `<div class="card"><div class="linha"><div class="post-cab" style="margin:0"><div class="av">=</div><div><b>Resultado</b><small>Fato gerador em ${RTC.fmtData(op.data)}${est.uf ? ' · ' + est.uf : ''} · atualiza enquanto você digita</small></div></div><span class="esp"></span>
      <button class="btn sec peq nao-imprimir" id="btn-print">Imprimir</button>
      <button class="btn sec peq nao-imprimir" id="btn-json">Copiar JSON da API</button></div>
      <div class="resumo" style="margin-top:10px">
        <div class="kpi"><div class="r">Base de cálculo</div><div class="v">${brl(t.vBC)}</div><div class="s">soma dos itens com CBS/IBS</div></div>
        <div class="kpi cbs"><div class="r">CBS (federal)</div><div class="v">${brl(t.vCBS)}</div>${t.vDifCBS.isZero() ? '' : '<div class="s">+ ' + brl(t.vDifCBS) + ' diferido</div>'}</div>
        <div class="kpi ibs"><div class="r">IBS (UF + município)</div><div class="v">${brl(t.vIBS)}</div><div class="s">UF ${brl(t.vIBSUF)} · Mun ${brl(t.vIBSMun)}${t.vDifIBS.isZero() ? '' : ' · ' + brl(t.vDifIBS) + ' diferido'}</div></div>
        ${t.vIS.isZero() && !r.itens.some((i) => i.is) ? '' : `<div class="kpi is"><div class="r">Imposto Seletivo</div><div class="v">${brl(t.vIS)}</div></div>`}
        <div class="kpi tot"><div class="r">Total de tributos</div><div class="v">${brl(t.vTotal)}</div><div class="s">${carga ? 'equivale a ' + pctFmt(carga.setScale(2)) + ' da base' : ''}</div></div>
      </div>`;
    if (r.itens.length > 1) {
      h += `<h3>Por item</h3><div class="tabela-wrap"><table><thead><tr><th>#</th><th>Item</th><th>cClassTrib</th><th class="n">Base</th><th class="n">CBS</th><th class="n">IBS UF</th><th class="n">IBS Mun</th><th class="n">IS</th><th class="n">Total</th></tr></thead><tbody>`;
      r.itens.forEach((i) => {
        if (!i.ok) { h += `<tr><td>${i.numero}</td><td>${esc(i.descricao)}</td><td colspan="7" style="color:var(--err)">não calculado</td></tr>`; return; }
        const g = i.g, z = RTC.ZERO;
        const vis = i.is ? i.is.vIS : z;
        const tot = (g ? g.cbs.tributoDevido.add(g.vIBS) : z).add(vis);
        h += `<tr><td>${i.numero}</td><td>${esc(i.descricao)}</td><td>${i.cClassTrib}</td><td class="n">${g ? brl(g.vBC) : '—'}</td>
          <td class="n">${g ? brl(g.cbs.tributoDevido) : '—'}</td><td class="n">${g ? brl(g.ibsUF.tributoDevido) : '—'}</td>
          <td class="n">${g ? brl(g.ibsMun.tributoDevido) : '—'}</td><td class="n">${i.is ? brl(vis) : '—'}</td><td class="n">${brl(tot)}</td></tr>`;
      });
      h += `<tr class="tot"><td></td><td>Total</td><td></td><td class="n">${brl(t.vBC)}</td><td class="n">${brl(t.vCBS)}</td><td class="n">${brl(t.vIBSUF)}</td><td class="n">${brl(t.vIBSMun)}</td><td class="n">${brl(t.vIS)}</td><td class="n">${brl(t.vTotal)}</td></tr></tbody></table></div>`;
    }
    h += '</div>';
    r.itens.forEach((i) => { h += detalheItem(i); });
    return h;
  }

  function detalheItem(i) {
    let h = `<div class="card item"><div class="item-cab"><span class="num">${i.numero}</span><b>${esc(i.descricao)}</b>
      <span class="esp"></span><span class="tag">CST ${esc(i.cst)}</span><span class="tag">${esc(i.cClassTrib)}</span></div>`;
    if (!i.ok) {
      return h + `<div class="${i.tipo === 'nao-implementado' ? 'aviso' : 'erro'}">${esc(i.erro)}</div></div>`;
    }
    i.avisos.forEach((a) => { h += `<div class="aviso">${esc(a)}</div>`; });

    if (i.is) {
      const s = i.is;
      h += `<h3><span class="tag is">IS</span> Imposto Seletivo — ${brl(s.vIS)}</h3>
        <p class="explica">Base ${brl(s.baseCalculo)} × ${pctFmt(s.pIS)}${s.adRem.isZero() ? '' : ' + quantidade × R$ ' + num(s.adRem, 2)} = <b>${brl(s.vIS)}</b>. Esse valor entra na base da CBS/IBS.</p>
        ${passosHtml(s.passos)}`;
    }

    if (i.semGrupo) {
      h += `<p class="explica"><b>Sem CBS/IBS a pagar.</b> O CST ${esc(i.cst)} (${esc(i.original.st.desc)}) não tem destaque de CBS e IBS na nota.</p>`;
      return h + '</div>';
    }
    const g = i.g;
    const linhas = [['CBS', 'cbs', g.cbs], ['IBS estadual', 'ibs', g.ibsUF], ['IBS municipal', 'ibs', g.ibsMun]];
    h += `<div class="tabela-wrap"><table><thead><tr><th>Tributo</th><th class="n">Alíquota</th><th class="n">Redução</th><th class="n">Alíq. efetiva</th>
      <th class="n">Base</th><th class="n">Valor devido</th>${linhas.some((l) => l[2].diferimento) ? '<th class="n">Diferido</th>' : ''}</tr></thead><tbody>`;
    linhas.forEach(([nome, cl, x]) => {
      h += `<tr><td><span class="tag ${cl}">${nome}</span></td><td class="n">${pctFmt(x.aliquota)}</td>
        <td class="n">${x.reducao.isZero() ? '—' : num(x.reducao, 2).replace(',00', '') + '%'}</td>
        <td class="n">${x.aliquotaEfetiva && !i.temRegular ? pctFmt(x.aliquotaEfetiva) : '—'}</td><td class="n">${brl(x.baseCalculo)}</td>
        <td class="n"><b>${brl(x.tributoDevido)}</b></td>${linhas.some((l) => l[2].diferimento) ? `<td class="n">${x.diferimento ? brl(x.diferimento.vDif) : '—'}</td>` : ''}</tr>`;
    });
    const totItem = g.cbs.tributoDevido.add(g.vIBS);
    h += `<tr class="tot"><td>Total CBS + IBS</td><td></td><td></td><td></td><td class="n">${brl(g.vBC)}</td><td class="n">${brl(totItem)}</td>${linhas.some((l) => l[2].diferimento) ? '<td></td>' : ''}</tr></tbody></table></div>`;

    if (i.temRegular) {
      h += `<div class="info"><b>Tributação regular</b> (o que seria devido sem a suspensão — CST ${esc(i.regularCst)}, cClassTrib ${esc(i.calcCls.cd)}):
        CBS ${pctFmt(g.cbs.regular.aliqEf)} = <b>${brl(g.cbs.regular.valor)}</b> · IBS UF ${pctFmt(g.ibsUF.regular.aliqEf)} = <b>${brl(g.ibsUF.regular.valor)}</b>
        · IBS Mun ${pctFmt(g.ibsMun.regular.aliqEf)} = <b>${brl(g.ibsMun.regular.valor)}</b>. Esses valores vão para a nota, mas não são cobrados agora.</div>`;
    }

    h += '<h3>Em palavras simples</h3><ul class="explica">' + emPalavras(i) + '</ul>';
    h += `<details><summary>Ver o passo a passo com as fórmulas oficiais</summary>
      <p class="dica">Tratamento tributário: <b>${esc(i.calcTrat.desc)}</b>. As fórmulas são as mesmas gravadas no banco da calculadora da Receita.</p>
      <h3><span class="tag cbs">CBS</span></h3>${passosHtml(i.passos[2])}
      <h3><span class="tag ibs">IBS estadual</span></h3>${passosHtml(i.passos[3])}
      <h3><span class="tag ibs">IBS municipal</span></h3>${passosHtml(i.passos[4])}</details>`;
    return h + '</div>';
  }

  function emPalavras(i) {
    const g = i.g, c = g.cbs, l = [];
    l.push(`A base de cálculo é <b>${brl(g.vBC)}</b>${i.is ? ' (já incluindo o Imposto Seletivo)' : ''}.`);
    if (i.temRegular) {
      l.push('O tributo está <b>suspenso</b>: nada é cobrado nesta operação; a nota só informa o valor da tributação regular.');
      return l.map((x) => '<li>' + x + '</li>').join('');
    }
    if (!c.reducao.isZero() && c.aliquotaEfetiva) {
      if (c.reducao.cmp(RTC.dec(100)) === 0) l.push('Esta classificação tem <b>redução de 100%</b>: a alíquota efetiva é zero, então não há CBS nem IBS a pagar.');
      else l.push(`Esta classificação tem <b>redução de ${num(c.reducao, 2).replace(',00', '')}%</b> na alíquota: a CBS de ${pctFmt(c.aliquota)} passa a ${pctFmt(c.aliquotaEfetiva)}.`);
    }
    const ef = c.aliquotaEfetiva || c.aliquota;
    l.push(`CBS: ${brl(g.vBC)} × ${pctFmt(ef)} = <b>${brl(c.tributoCalculado)}</b>.`);
    const eu = g.ibsUF.aliquotaEfetiva || g.ibsUF.aliquota, em = g.ibsMun.aliquotaEfetiva || g.ibsMun.aliquota;
    l.push(`IBS: ${brl(g.vBC)} × ${pctFmt(eu)} (estado) + ${brl(g.vBC)} × ${pctFmt(em)} (município) = <b>${brl(g.ibsUF.tributoCalculado.add(g.ibsMun.tributoCalculado))}</b>.`);
    if (c.diferimento) l.push(`Há <b>diferimento de ${num(c.diferimento.pDif, 2).replace(',00', '')}%</b>: o pagamento fica para a etapa seguinte da cadeia, então o valor devido agora é ${brl(c.tributoDevido.add(g.vIBS))}.`);
    l.push('Esses tributos são destacados "por fora": somam-se ao preço e geram crédito para quem compra (se for contribuinte).');
    return l.map((x) => '<li>' + x + '</li>').join('');
  }

  const NOMES = {
    baseCalculoInformada: 'base informada', impostoSeletivoInformado: 'IS informado', impostoSeletivoCalculado: 'IS calculado',
    baseCalculo: 'base', aliquotaEfetiva: 'alíquota efetiva', aliquota: 'alíquota', percentualReducao: 'redução',
    pRedutorCompraGov: 'redutor compra gov.', tributoCalculado: 'tributo calculado', quantidade: 'quantidade',
    aliquotaAdValorem: 'alíquota ad valorem', aliquotaAdRem: 'alíquota ad rem', percentualDiferimento: '% diferimento',
  };
  const humano = (f) => String(f).replace(/[A-Za-z_]\w*/g, (w) => NOMES[w] || w).replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\s+/g, ' ');
  function passosHtml(ps) {
    return '<ol class="passos">' + ps.map((p) => `<li><b>${esc(p.t)}</b>: ${esc(p.r.replace(/-?\d+(\.\d+)?/, (m) => num(RTC.dec(m), m.includes('.') ? m.split('.')[1].length : 0)))}
      ${p.f && p.f !== '—' ? `<br><span class="dica">fórmula: <span class="f">${esc(humano(p.f))}</span></span>` : ''}
      ${p.obs ? `<br><span class="dica">${esc(p.obs)}</span>` : ''}</li>`).join('') + '</ol>';
  }

  function copiarJson(op, btn) {
    const ent = {
      id: 'simulacao', versao: '1.0.0', dhFatoGerador: op.data + 'T12:00:00-03:00', municipio: 0, uf: est.uf || 'XX',
      itens: op.itens.map((i) => {
        const o = { numero: i.numero, ncm: '00000000', cst: i.cst, cClassTrib: i.cClassTrib, quantidade: +i.quantidade, unidade: 'UN' };
        if (i.baseCalculo) o.baseCalculo = +i.baseCalculo;
        if (i.regular) o.tributacaoRegular = { cst: i.regular.cst, cClassTrib: i.regular.cClassTrib };
        if (i.aliquotas) o.aliquotasNominais = { cbs: +i.aliquotas[2], ibsEstadual: +i.aliquotas[3], ibsMunicipal: +i.aliquotas[4] };
        if (i.is) {
          o.impostoSeletivo = { cst: i.is.cst, cClassTrib: i.is.cClassTrib, baseCalculo: +i.is.baseCalculo || 0, quantidade: +i.is.quantidade, unidade: 'UN' };
          if (i.is.isInformado) o.impostoSeletivo.impostoInformado = +i.is.isInformado;
          o.aliquotasNominais = o.aliquotasNominais || {};
          o.aliquotasNominais.impostoSeletivo = { adValorem: +i.is.adValorem || 0 };
          if (i.is.adRem) o.aliquotasNominais.impostoSeletivo.adRem = +i.is.adRem;
        }
        return o;
      }),
    };
    const txt = JSON.stringify(ent, null, 2);
    const fim = () => { btn.textContent = 'Copiado! (troque NCM/NBS e município)'; setTimeout(() => { btn.textContent = 'Copiar JSON da API'; }, 3500); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(fim, () => prompt('Copie o JSON:', txt));
    else prompt('Copie o JSON:', txt);
  }

  // ───────── consulta ─────────
  const cData = $('#c-data'), cCst = $('#c-cst'), cBusca = $('#c-busca');
  cData.value = dataOk();
  function renderConsulta() {
    const d = cData.value && cData.value >= '2026-01-01' ? cData.value : dataOk();
    const sel = cCst.value;
    cCst.innerHTML = '<option value="">Todos</option>' + base.csts(d, 2).map((c) => `<option value="${c.cd}">${c.cd} — ${esc(c.desc)}</option>`).join('');
    cCst.value = sel;
    const f = norm(cBusca.value || '');
    const l = base.classificacoes(d, 2, cCst.value || null).filter((c) => !f || norm(c.cd + ' ' + c.desc + ' ' + (c.nomencl || '')).includes(f));
    $('#c-conta').textContent = l.length + ' classificação(ões) encontrada(s). Clique em "Usar" para levar ao cálculo.';
    $('#c-tab').innerHTML = '<thead><tr><th>cClassTrib</th><th>CST</th><th>Descrição</th><th>Tipo de alíquota</th><th class="n">Redução CBS</th><th class="n">Redução IBS</th><th></th></tr></thead><tbody>' +
      l.map((c) => {
        const st = base.cstPorId[c.sitr];
        const rc = base.reducao(c, '2', d), ru = base.reducao(c, '3', d);
        return `<tr><td><b>${c.cd}</b></td><td>${st.cd}</td><td>${esc(c.desc)}${c.nomencl ? '<br><span class="dica">Exige ' + esc(c.nomencl) + '</span>' : ''}</td>
          <td>${esc(c.tipoAliq)}</td><td class="n">${rc ? num(rc, 2) + '%' : '—'}</td><td class="n">${ru ? num(ru, 2) + '%' : '—'}</td>
          <td><button class="btn sec peq" data-usar="${c.cd}" data-cst="${st.cd}">Usar</button></td></tr>`;
      }).join('') + '</tbody>';
  }
  [cData, cCst].forEach((x) => x.addEventListener('change', renderConsulta));
  cBusca.addEventListener('input', renderConsulta);
  $('#c-tab').addEventListener('click', (e) => {
    const b = e.target.closest('[data-usar]'); if (!b) return;
    const ultimo = est.itens[est.itens.length - 1];
    const vazio = ultimo && !ultimo.baseCalculo && est.itens.length === 1;
    const it = vazio ? ultimo : novoItem({ descricao: 'Item ' + (est.itens.length + 1) });
    it.cst = b.dataset.cst; it.cClassTrib = b.dataset.usar; it.filtro = '';
    if (!vazio) est.itens.push(it);
    if (cData.value && cData.value !== est.data) { est.data = cData.value; $('#data').value = est.data; }
    renderTudo();
    $('#abas button[data-aba="calc"]').click();
    const card = document.querySelector(`.item[data-id="${it.id}"]`);
    if (card) { card.scrollIntoView({ behavior: 'smooth' }); $('input[data-k="baseCalculo"]', card).focus(); }
  });

  // ───────── sobre ─────────
  $('#sobre-versao').innerHTML = `Versão da base de dados oficial: <b>${esc(D.versao.v)}</b> (${esc(D.versao.d.slice(0, 10).split('-').reverse().join('/'))}) — ${esc(D.versao.descr)}`;

  function renderTudo() { renderAliq(); renderItens(); calcular(); }

  window.App = {
    novaOperacao,
    aoMudar: null,
    // abre a operação de um cliente (sem disparar salvamento)
    abrir(op) {
      const salvarAntes = window.App.aoMudar; window.App.aoMudar = null;
      est = op && op.itens ? JSON.parse(JSON.stringify(op)) : novaOperacao();
      if (!est.aliq) est.aliq = Object.assign({}, SUGESTAO_2027);
      est.itens.forEach((i) => { if (!i.is) i.is = novoItem().is; });
      seq = Math.max(1, ...est.itens.map((i) => (i.id || 0) + 1));
      $('#data').value = est.data || hoje; ufSel.value = est.uf || '';
      cData.value = dataOk();
      renderTudo();
      window.App.aoMudar = salvarAntes;
    },
    operacaoAtual: () => est,
  };
  renderTudo();
  window.dispatchEvent(new Event('app-pronto'));
})();
