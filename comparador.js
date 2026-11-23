/* Aba "Comparar": antes × depois da reforma, ano a ano. Usa comparador-modelo.js. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const base = new RTC.Base(window.RTC_DADOS);
  const DATA_CLS = '2027-06-01';

  const PADRAO = { preco: '1000', tipo: 'mercadoria', regime: 'real', icms: '18', iss: '5', ipi: '0', pisCofins: '9,25',
    cbs: '8,8', ibs: '17,7', cls: '000001', is: '0' };
  const PC_REGIME = { real: '9,25', presumido: '3,65' };

  const num = (v) => { let s = String(v == null ? '' : v).trim().replace(/\s|R\$|%/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isFinite(n) ? n : NaN; };
  const brl = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl0 = (n) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const pct = (n, c = 1) => (n * 100).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) + '%';
  const sinal = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pct(Math.abs(n));

  function cfg() {
    const op = window.App.operacaoAtual();
    if (!op.comparador) op.comparador = Object.assign({}, PADRAO);
    return op.comparador;
  }

  // classificações da reforma com o respectivo percentual de redução
  const opcoesCls = base.classificacoes(DATA_CLS, 2).filter((c) => {
    const st = base.cstPorId[c.sitr];
    return ['000', '011', '200'].includes(st.cd);
  }).map((c) => {
    const rc = base.reducao(c, '2', DATA_CLS), ri = base.reducao(c, '3', DATA_CLS);
    return { cd: c.cd, desc: c.desc, rc: rc ? rc.toNumber() : 0, ri: ri ? ri.toNumber() : 0 };
  });

  function renderForm() {
    const c = cfg();
    const ehServ = c.tipo === 'servico';
    $('#cmp-form').innerHTML = `
      <div class="post-cab"><div class="av">⇄</div><div><b>Antes × depois da reforma</b>
        <small>Quanto o seu produto ou serviço paga hoje e quanto vai pagar em cada ano até 2033</small></div></div>
      <div class="grade">
        <div><label>Preço de venda hoje (R$)</label><input data-c="preco" inputmode="decimal" value="${esc(c.preco)}">
          <p class="dica">Valor cobrado hoje, com ICMS/ISS embutidos e sem IPI.</p></div>
        <div><label>O que você vende</label><select data-c="tipo">
          <option value="mercadoria" ${!ehServ ? 'selected' : ''}>Mercadoria (ICMS)</option>
          <option value="servico" ${ehServ ? 'selected' : ''}>Serviço (ISS)</option></select></div>
        <div><label>Regime de tributação hoje</label><select data-c="regime">
          <option value="real" ${c.regime === 'real' ? 'selected' : ''}>Lucro Real (PIS/Cofins 9,25%)</option>
          <option value="presumido" ${c.regime === 'presumido' ? 'selected' : ''}>Lucro Presumido (PIS/Cofins 3,65%)</option></select></div>
        <div style="align-self:end"><button class="btn peq" id="cmp-usar">Usar o valor dos itens deste cliente</button></div>
      </div>
      <h3>Tributos de hoje</h3>
      <div class="grade">
        ${ehServ
          ? `<div><label>ISS (%)</label><input data-c="iss" inputmode="decimal" value="${esc(c.iss)}"><p class="dica">De 2% a 5%, conforme o município.</p></div>`
          : `<div><label>ICMS (%)</label><input data-c="icms" inputmode="decimal" value="${esc(c.icms)}"><p class="dica">Confira a alíquota do seu estado e produto.</p></div>
             <div><label>IPI (%)</label><input data-c="ipi" inputmode="decimal" value="${esc(c.ipi)}"><p class="dica">Só para produtos industrializados.</p></div>`}
        <div><label>PIS + Cofins (%)</label><input data-c="pisCofins" inputmode="decimal" value="${esc(c.pisCofins)}"></div>
      </div>
      <h3>Na reforma</h3>
      <div class="grade">
        <div style="grid-column: span 2"><label>Classificação na reforma (define a redução)</label>
          <select data-c="cls">${opcoesCls.map((o) => `<option value="${o.cd}" ${o.cd === c.cls ? 'selected' : ''}>${o.cd} — ${esc(o.desc.length > 80 ? o.desc.slice(0, 79) + '…' : o.desc)}${o.rc || o.ri ? ` (−${o.rc === o.ri ? o.rc : o.rc + '/' + o.ri}%)` : ''}</option>`).join('')}</select></div>
        <div><label>CBS de referência (%)</label><input data-c="cbs" inputmode="decimal" value="${esc(c.cbs)}"></div>
        <div><label>IBS de referência (%)</label><input data-c="ibs" inputmode="decimal" value="${esc(c.ibs)}"></div>
        ${ehServ ? '' : `<div><label>Imposto Seletivo (%)</label><input data-c="is" inputmode="decimal" value="${esc(c.is)}"><p class="dica">Só cigarro, bebida alcoólica etc.</p></div>`}
      </div>
      <p class="dica">CBS 8,8% + IBS 17,7% (26,5% no total) é a estimativa mais citada pelo governo. As alíquotas de referência ainda serão fixadas oficialmente: ajuste para simular outros cenários.</p>`;
  }

  function renderResultado() {
    const c = cfg();
    const o = opcoesCls.find((x) => x.cd === c.cls) || { rc: 0, ri: 0 };
    const e = { preco: num(c.preco), tipo: c.tipo, icms: num(c.icms), iss: num(c.iss), ipi: num(c.ipi), pisCofins: num(c.pisCofins),
      cbs: num(c.cbs), ibs: num(c.ibs), redCbs: o.rc, redIbs: o.ri, is: num(c.is) || 0 };
    const el = $('#cmp-resultado');
    const campos = c.tipo === 'servico' ? ['preco', 'iss', 'pisCofins', 'cbs', 'ibs'] : ['preco', 'icms', 'ipi', 'pisCofins', 'cbs', 'ibs'];
    if (campos.some((k) => !isFinite(e[k]) || e[k] < 0) || !(e.preco > 0)) { el.innerHTML = '<div class="aviso">Preencha os valores com números (ex.: 1.000,00 e 18).</div>'; return; }
    let r;
    try { r = Comparador.calcular(e); } catch (err) { el.innerHTML = `<div class="erro">${esc(err.message)}</div>`; return; }
    const h = r.hoje, fim = r.anos[r.anos.length - 1];
    const varPreco = fim.precoFinal / h.precoFinal - 1;
    const tom = varPreco < -0.0005 ? 'cai' : varPreco > 0.0005 ? 'sobe' : 'fica igual';
    const linhas = [h, ...r.anos];

    el.innerHTML = `
      <div class="card">
        <div class="resumo">
          <div class="kpi"><div class="r">Carga hoje</div><div class="v">${pct(h.carga)}</div><div class="s">${brl(h.tributos)} de tributos no preço</div></div>
          <div class="kpi cbs"><div class="r">Carga em 2033</div><div class="v">${pct(fim.carga)}</div><div class="s">${brl(fim.tributos)} de tributos no preço</div></div>
          <div class="kpi tot"><div class="r">Preço final em 2033</div><div class="v">${brl(fim.precoFinal)}</div><div class="s">${sinal(varPreco)} em relação a hoje (${brl(h.precoFinal)})</div></div>
        </div>
        <ul class="explica">
          <li>Mantendo o que a empresa recebe hoje (<b>${brl(r.liquido)}</b> líquidos de tributos), o preço ao comprador <b>${tom}</b>${tom === 'fica igual' ? '' : ` ${sinal(varPreco).replace('+', '').replace('−', '')}`} até 2033.</li>
          ${o.rc || o.ri ? `<li>A classificação escolhida tem <b>redução de ${o.rc === o.ri ? o.rc + '%' : o.rc + '% na CBS e ' + o.ri + '% no IBS'}</b>.</li>` : ''}
          <li>Hoje os tributos ficam "escondidos" no preço; na reforma, a CBS e o IBS aparecem separados na nota, e quem compra para a empresa recupera esse valor como crédito.</li>
        </ul>
      </div>
      <div class="card">
        <div class="linha"><h2 style="margin:0">Tributos no preço, ano a ano</h2><span class="esp"></span>
          <span class="leg"><i style="background:var(--s-antigo)"></i>Atuais (ICMS/ISS, PIS/Cofins, IPI)</span>
          <span class="leg"><i style="background:var(--s-novo)"></i>Novos (CBS, IBS${e.is ? ', IS' : ''})</span></div>
        <div class="grafico" id="cmp-graf">${grafico(linhas)}</div>
        <div class="dica-graf" id="cmp-dica" hidden></div>
      </div>
      <div class="card">
        <h2>Tabela</h2>
        <div class="tabela-wrap"><table><thead><tr><th>Ano</th>
          <th class="n">${c.tipo === 'servico' ? 'ISS' : 'ICMS'}</th><th class="n">PIS/Cofins</th>${c.tipo === 'servico' ? '' : '<th class="n">IPI</th>'}
          <th class="n">CBS</th><th class="n">IBS</th>${e.is ? '<th class="n">IS</th>' : ''}<th class="n">Total</th><th class="n">Preço final</th><th class="n">Carga</th></tr></thead><tbody>
          ${linhas.map((l) => `<tr${l === h ? ' style="font-weight:700"' : ''}><td>${l.rotulo}</td>
            <td class="n">${brl(c.tipo === 'servico' ? l.iss : l.icms)}</td><td class="n">${brl(l.pc)}</td>${c.tipo === 'servico' ? '' : `<td class="n">${brl(l.ipi)}</td>`}
            <td class="n">${brl(l.cbs)}</td><td class="n">${brl(l.ibs)}</td>${e.is ? `<td class="n">${brl(l.is)}</td>` : ''}
            <td class="n"><b>${brl(l.tributos)}</b></td><td class="n">${brl(l.precoFinal)}</td><td class="n">${pct(l.carga)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card">
        <h2>Premissas e limites</h2>
        <ul class="explica">
          <li><b>2026</b>: CBS 0,9% e IBS 0,1% aparecem na nota, mas são compensados com PIS/Cofins, por isso não mudam o preço.</li>
          <li><b>2027–2028</b>: PIS/Cofins acabam, o IPI é zerado (exceto produtos da Zona Franca de Manaus), CBS = referência − 0,1 ponto e IBS = 0,1%.</li>
          <li><b>2029–2032</b>: ICMS e ISS caem para 90%, 80%, 70% e 60% das alíquotas; o IBS sobe na proporção inversa (aproximação).</li>
          <li><b>2033</b>: ICMS e ISS deixam de existir.</li>
          <li>PIS/Cofins de hoje calculados sem o ICMS na base (decisão do STF, Tema 69). A base da CBS/IBS exclui ICMS e ISS, como na calculadora oficial.</li>
          <li>Valores destacados na venda. O tributo efetivamente pago depende dos créditos das compras. Empresas do Simples Nacional têm regras próprias, não tratadas aqui.</li>
          <li>Estimativa para planejamento, sem valor fiscal.</li>
        </ul>
      </div>`;
    ligarGrafico(linhas);
  }

  // ───────── gráfico de barras empilhadas (SVG) ─────────
  function grafico(linhas) {
    const W = 760, H = 280, mL = 64, mR = 12, mT = 24, mB = 30;
    const max = Math.max(...linhas.map((l) => l.tributos)) * 1.12 || 1;
    const passo = niceStep(max / 4);
    const topo = Math.ceil(max / passo) * passo;
    const y = (v) => mT + (H - mT - mB) * (1 - v / topo);
    const largura = (W - mL - mR) / linhas.length;
    const bw = Math.min(46, largura * 0.56);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tributos no preço, de hoje até 2033">`;
    for (let v = 0; v <= topo + 1e-9; v += passo) {
      s += `<line x1="${mL}" x2="${W - mR}" y1="${y(v)}" y2="${y(v)}" class="grade-l"/><text x="${mL - 8}" y="${y(v) + 4}" text-anchor="end" class="eixo">${brl0(v)}</text>`;
    }
    linhas.forEach((l, k) => {
      const cx = mL + largura * k + largura / 2, x = cx - bw / 2;
      const yA = y(l.antigos), yT = y(l.tributos), y0 = y(0);
      const gap = l.antigos > 0 && l.novos > 0 ? 2 : 0;
      if (l.antigos > 0) s += barra(x, l.novos > 0 ? yA : yA, bw, y0 - yA, 'var(--s-antigo)', l.novos <= 0);
      if (l.novos > 0) s += barra(x, yT, bw, Math.max(yA - yT - gap, 0.5), 'var(--s-novo)', true);
      s += `<text x="${cx}" y="${H - 10}" text-anchor="middle" class="eixo${k === 0 ? ' forte' : ''}">${l.rotulo}</text>`;
      if (k === 0 || k === linhas.length - 1) s += `<text x="${cx}" y="${yT - 7}" text-anchor="middle" class="rotulo">${brl0(l.tributos)}</text>`;
      s += `<rect x="${cx - largura / 2}" y="${mT}" width="${largura}" height="${H - mT - mB}" fill="transparent" data-k="${k}" class="alvo"/>`;
    });
    return s + '</svg>';
  }
  // barra com os cantos de cima arredondados (4px) e a base reta
  function barra(x, y, w, h, cor, arredonda) {
    if (h <= 0) return '';
    const r = arredonda ? Math.min(4, h, w / 2) : 0;
    return `<path d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z" fill="${cor}"/>`;
  }
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

  function ligarGrafico(linhas) {
    const g = $('#cmp-graf'), dica = $('#cmp-dica');
    g.querySelectorAll('.alvo').forEach((a) => {
      const mostrar = () => {
        const l = linhas[+a.dataset.k];
        g.querySelectorAll('.alvo').forEach((o) => o.classList.toggle('ativo', o === a));
        dica.hidden = false;
        dica.innerHTML = `<b>${l.rotulo}</b> · Atuais ${brl(l.antigos)} · Novos ${brl(l.novos)} · <b>Total ${brl(l.tributos)}</b> · Preço final ${brl(l.precoFinal)} · Carga ${pct(l.carga)}`;
      };
      a.addEventListener('mouseenter', mostrar);
      a.addEventListener('click', mostrar);
    });
    g.addEventListener('mouseleave', () => { dica.hidden = true; g.querySelectorAll('.alvo').forEach((o) => o.classList.remove('ativo')); });
  }

  // ───────── eventos ─────────
  const raiz = $('#aba-comparar');
  raiz.addEventListener('input', (e) => {
    const k = e.target.dataset.c; if (!k || e.target.tagName !== 'INPUT') return;
    cfg()[k] = e.target.value; window.App.notificar(); renderResultado();
  });
  raiz.addEventListener('change', (e) => {
    const k = e.target.dataset.c; if (!k || e.target.tagName !== 'SELECT') return;
    const c = cfg(); c[k] = e.target.value;
    if (k === 'regime') c.pisCofins = PC_REGIME[c.regime];
    window.App.notificar(); renderForm(); renderResultado();
  });
  raiz.addEventListener('click', (e) => {
    if (e.target.id !== 'cmp-usar') return;
    const op = window.App.operacaoAtual();
    let soma = 0;
    op.itens.forEach((i) => { const v = num(i.baseCalculo); if (isFinite(v)) soma += v; });
    if (!soma) { Dialogo.aviso('Este cliente ainda não tem itens com valor na aba Calcular.'); return; }
    cfg().preco = soma.toFixed(2).replace('.', ','); window.App.notificar(); renderForm(); renderResultado();
  });

  function render() { renderForm(); renderResultado(); }
  window.addEventListener('operacao-aberta', () => { if (raiz.classList.contains('on')) render(); });
  $('#abas').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.aba === 'comparar') render(); });
})();
