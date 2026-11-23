/*
 * Relatório em PDF: pré-visualização em A4 com a marca do escritório.
 * O PDF é gerado pelo próprio navegador (Imprimir → Salvar como PDF), sem bibliotecas externas.
 */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const D = (v) => (v && v.toNumber ? v.toNumber() : Number(v) || 0);
  const brl = (v) => 'R$ ' + D(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctN = (n, c = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) + '%';
  const pctD = (d) => (d ? pctN(D(d), 2) : '—');
  const dataBR = (iso) => iso.split('-').reverse().join('/');
  const hoje = () => new Date().toLocaleDateString('pt-BR');
  const VERSAO_BASE = (window.RTC_DADOS && window.RTC_DADOS.versao && window.RTC_DADOS.versao.v) || '';

  let marca = { nome: '', contato: '', logo: '' };
  let opcoes = { detalhe: true, comparador: true, notas: true };
  let tela = null;

  // ───────── estilos ─────────
  const css = document.createElement('style');
  css.textContent = `
    #rel-tela { position: fixed; inset: 0; z-index: 60; background: var(--bg); display: none; overflow: auto; }
    body.relatorio-aberto #rel-tela { display: block; }
    body.relatorio-aberto { overflow: hidden; }
    .rel-barra { position: sticky; top: 0; z-index: 2; background: color-mix(in srgb, var(--bg) 88%, transparent);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
    .rel-barra-in { max-width: 860px; margin: 0 auto; padding: 12px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .rel-barra h2 { margin: 0; font-size: 17px; }
    .rel-opcoes { max-width: 860px; margin: 14px auto 0; padding: 0 16px; display: grid; gap: 12px; }
    .rel-opcoes .card { margin: 0; }
    .rel-marca-logo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .rel-marca-logo img { max-height: 56px; max-width: 180px; border-radius: 8px; background: #fff; padding: 4px; }
    .rel-previa { padding: 18px 12px 60px; }

    /* folha A4 (sempre clara, como no papel) */
    .folha { --tx: #14161f; --mu: #5b6075; --li: #e3e5ec; --so: #f4f5f9; --pr: #6d5dfc;
      --s-antigo: #eb6834; --s-novo: #2a78d6;
      width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; color: var(--tx); padding: 14mm 14mm 16mm;
      box-shadow: 0 10px 40px rgba(0,0,0,.25); font: 10.5pt/1.45 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif; }
    .folha h1 { font-size: 17pt; margin: 0; letter-spacing: -.01em; }
    .folha h2 { font-size: 12.5pt; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--li); break-after: avoid; }
    .folha h3 { font-size: 10.5pt; margin: 12px 0 4px; break-after: avoid; }
    .folha p { margin: 4px 0; }
    .folha .mu { color: var(--mu); }
    .rel-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 3px solid var(--pr); }
    .rel-cab .esc { display: flex; gap: 12px; align-items: center; }
    .rel-cab .esc img { max-height: 52px; max-width: 170px; }
    .rel-cab .esc b { font-size: 12pt; display: block; }
    .rel-cab .tit { text-align: right; }
    .rel-cli { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 4px; }
    .rel-cli div { background: var(--so); border-radius: 8px; padding: 7px 10px; }
    .rel-cli small { display: block; color: var(--mu); font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
    .rel-cli b { font-size: 10pt; }
    .rel-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .rel-kpis div { border: 1px solid var(--li); border-radius: 8px; padding: 8px 10px; }
    .rel-kpis small { display: block; color: var(--mu); font-size: 8pt; }
    .rel-kpis b { font-size: 12.5pt; font-variant-numeric: tabular-nums; }
    .rel-kpis .tot { background: var(--pr); border-color: var(--pr); color: #fff; } .rel-kpis .tot small { color: rgba(255,255,255,.85); }
    .folha table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 4px 0; }
    .folha th, .folha td { padding: 5px 6px; border-bottom: 1px solid var(--li); text-align: left; vertical-align: top; }
    .folha th { font-size: 7.5pt; color: var(--mu); text-transform: uppercase; letter-spacing: .04em; }
    .folha td.n, .folha th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .folha tr { break-inside: avoid; }
    .folha tr.tot td { font-weight: 700; border-top: 2px solid var(--li); }
    .rel-item { break-inside: avoid; margin-bottom: 10px; }
    .rel-aviso { background: #fff4e0; border-radius: 6px; padding: 5px 8px; font-size: 8.5pt; margin: 4px 0; }
    .folha ul { margin: 4px 0; padding-left: 18px; } .folha li { margin: 2px 0; }
    .folha .grafico svg { width: 100%; height: auto; display: block; }
    .folha .grade-l { stroke: var(--li); } .folha .eixo { fill: var(--mu); font-size: 11px; } .folha .eixo.forte { fill: var(--tx); font-weight: 700; }
    .folha .rotulo { fill: var(--tx); font-size: 11.5px; font-weight: 700; } .folha .alvo { fill: transparent; }
    .folha .leg { display: inline-flex; align-items: center; gap: 5px; font-size: 8.5pt; color: var(--mu); margin-right: 14px; }
    .folha .leg i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .rel-rod { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--li); font-size: 8pt; color: var(--mu); display: flex; justify-content: space-between; gap: 10px; }
    .sem-quebra { break-inside: avoid; }

    @media (max-width: 900px) { .folha { transform-origin: top left; } }
    @media print {
      @page { size: A4; margin: 12mm 12mm 14mm; }
      body.imprimindo-relatorio > *:not(#rel-tela) { display: none !important; }
      body.imprimindo-relatorio #rel-tela { position: static; display: block !important; overflow: visible; background: #fff; }
      body.imprimindo-relatorio .rel-barra, body.imprimindo-relatorio .rel-opcoes { display: none !important; }
      body.imprimindo-relatorio .rel-previa { padding: 0; }
      body.imprimindo-relatorio .folha { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; transform: none !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`;
  document.head.appendChild(css);

  // ───────── conteúdo do relatório ─────────
  function montarFolha() {
    const calc = window.App.calcularAtual();
    const cli = window.Conta && window.Conta.clienteAtivo();
    const cmp = window.ComparadorUI && window.ComparadorUI.atual();
    const op = calc.op;
    const nomeCli = cli ? cli.nome : 'Simulação';
    let h = `<div class="folha" id="rel-folha">
      <div class="rel-cab">
        <div class="esc">${marca.logo ? `<img src="${esc(marca.logo)}" alt="">` : ''}
          <div>${marca.nome ? `<b>${esc(marca.nome)}</b>` : '<b>Reforma Fácil</b>'}
          ${marca.contato ? `<span class="mu" style="white-space:pre-line">${esc(marca.contato)}</span>` : ''}</div></div>
        <div class="tit"><h1>Simulação da Reforma Tributária</h1><span class="mu">CBS · IBS · Imposto Seletivo — emitido em ${hoje()}</span></div>
      </div>
      <div class="rel-cli">
        <div style="grid-column: span 2"><small>Cliente</small><b>${esc(nomeCli)}</b>${cli && cli.documento ? ` <span class="mu">· ${esc(cli.documento)}</span>` : ''}</div>
        <div><small>Data do fato gerador</small><b>${dataBR(op.data)}</b></div>
        <div><small>Alíquotas</small><b>${op.itens[0] && op.itens[0].aliquotas ? 'Simuladas' : 'Referência oficial ' + op.data.slice(0, 4)}</b></div>
      </div>`;

    if (calc.erro) {
      h += `<p class="rel-aviso">${esc(calc.erro)}</p>`;
    } else {
      const r = calc.r, t = r.total;
      const carga = D(t.vBC) ? D(t.vTotal) / D(t.vBC) * 100 : 0;
      h += `<h2>Resumo</h2><div class="rel-kpis">
        <div><small>Base de cálculo</small><b>${brl(t.vBC)}</b></div>
        <div><small>CBS (federal)</small><b>${brl(t.vCBS)}</b></div>
        <div><small>IBS (UF + município)</small><b>${brl(t.vIBS)}</b></div>
        <div><small>Imposto Seletivo</small><b>${brl(t.vIS)}</b></div>
        <div class="tot"><small>Total de tributos</small><b>${brl(t.vTotal)}</b><small>${pctN(carga)} da base</small></div></div>`;

      h += `<h2>Itens</h2><table><thead><tr><th>#</th><th>Item</th><th>Classificação</th><th class="n">Base</th><th class="n">CBS</th><th class="n">IBS</th><th class="n">IS</th><th class="n">Total</th></tr></thead><tbody>`;
      r.itens.forEach((i) => {
        if (!i.ok) { h += `<tr><td>${i.numero}</td><td>${esc(i.descricao)}</td><td colspan="6" class="mu">Não calculado: ${esc(i.erro)}</td></tr>`; return; }
        const g = i.g; const vis = i.is ? D(i.is.vIS) : 0;
        const tot = (g ? D(g.cbs.tributoDevido) + D(g.vIBS) : 0) + vis;
        h += `<tr><td>${i.numero}</td><td>${esc(i.descricao)}</td><td>${esc(i.cClassTrib)} <span class="mu">(CST ${esc(i.cst)})</span></td>
          <td class="n">${g ? brl(g.vBC) : '—'}</td><td class="n">${g ? brl(g.cbs.tributoDevido) : '—'}</td><td class="n">${g ? brl(g.vIBS) : '—'}</td>
          <td class="n">${i.is ? brl(vis) : '—'}</td><td class="n"><b>${brl(tot)}</b></td></tr>`;
      });
      h += `<tr class="tot"><td></td><td>Total</td><td></td><td class="n">${brl(t.vBC)}</td><td class="n">${brl(t.vCBS)}</td><td class="n">${brl(t.vIBS)}</td><td class="n">${brl(t.vIS)}</td><td class="n">${brl(t.vTotal)}</td></tr></tbody></table>`;

      if (opcoes.detalhe) {
        h += '<h2>Detalhamento por item</h2>';
        r.itens.filter((i) => i.ok).forEach((i) => {
          h += `<div class="rel-item"><h3>${i.numero}. ${esc(i.descricao)} — cClassTrib ${esc(i.cClassTrib)}</h3>
            <p class="mu">${esc(i.original.cls.desc)} · Tratamento: ${esc(i.calcTrat.desc)}</p>`;
          i.avisos.forEach((a) => { h += `<p class="rel-aviso">${esc(a)}</p>`; });
          if (i.is) h += `<p>Imposto Seletivo: base ${brl(i.is.baseCalculo)} × ${pctD(i.is.pIS)} = <b>${brl(i.is.vIS)}</b> (entra na base da CBS/IBS).</p>`;
          if (i.semGrupo) { h += `<p>Sem destaque de CBS/IBS: CST ${esc(i.cst)} (${esc(i.original.st.desc)}).</p></div>`; return; }
          const g = i.g;
          h += `<table><thead><tr><th>Tributo</th><th class="n">Alíquota</th><th class="n">Redução</th><th class="n">Alíq. efetiva</th><th class="n">Base</th><th class="n">Valor devido</th>${[g.cbs, g.ibsUF, g.ibsMun].some((x) => x.diferimento) ? '<th class="n">Diferido</th>' : ''}</tr></thead><tbody>`;
          [['CBS', g.cbs], ['IBS estadual', g.ibsUF], ['IBS municipal', g.ibsMun]].forEach(([n, x]) => {
            h += `<tr><td>${n}</td><td class="n">${pctD(x.aliquota)}</td><td class="n">${x.reducao.isZero() ? '—' : pctD(x.reducao)}</td>
              <td class="n">${x.aliquotaEfetiva && !i.temRegular ? pctD(x.aliquotaEfetiva) : '—'}</td><td class="n">${brl(x.baseCalculo)}</td>
              <td class="n"><b>${brl(x.tributoDevido)}</b></td>${[g.cbs, g.ibsUF, g.ibsMun].some((y) => y.diferimento) ? `<td class="n">${x.diferimento ? brl(x.diferimento.vDif) : '—'}</td>` : ''}</tr>`;
          });
          h += '</tbody></table>';
          if (i.temRegular) h += `<p class="mu">Suspensão: a nota informa a tributação regular (CBS ${brl(g.cbs.regular.valor)}, IBS UF ${brl(g.ibsUF.regular.valor)}, IBS Mun ${brl(g.ibsMun.regular.valor)}), que não é cobrada nesta operação.</p>`;
          h += '</div>';
        });
      }
    }

    if (opcoes.comparador && cmp) {
      const { r, e, o, c } = cmp;
      const hj = r.hoje, fim = r.anos[r.anos.length - 1];
      const linhas = [hj, ...r.anos];
      const serv = c.tipo === 'servico';
      const varP = (fim.precoFinal / hj.precoFinal - 1) * 100;
      h += `<div class="sem-quebra"><h2>Antes × depois da reforma</h2>
        <p>Preço de venda hoje <b>${brl(e.preco)}</b> (${serv ? 'serviço, ISS ' + pctN(e.iss) : 'mercadoria, ICMS ' + pctN(e.icms) + (e.ipi ? ', IPI ' + pctN(e.ipi) : '')}, PIS/Cofins ${pctN(e.pisCofins)}).
          Na reforma: classificação ${esc(o.cd)}${o.rc || o.ri ? ` com redução de ${o.rc === o.ri ? o.rc + '%' : o.rc + '% (CBS) e ' + o.ri + '% (IBS)'}` : ''}, CBS ${pctN(e.cbs)} e IBS ${pctN(e.ibs)} de referência (estimativa).</p>
        <div class="rel-kpis" style="grid-template-columns: repeat(4, 1fr)">
          <div><small>Carga hoje</small><b>${pctN(hj.carga * 100, 1)}</b></div>
          <div><small>Carga em 2033</small><b>${pctN(fim.carga * 100, 1)}</b></div>
          <div><small>Preço final hoje</small><b>${brl(hj.precoFinal)}</b></div>
          <div class="tot"><small>Preço final em 2033</small><b>${brl(fim.precoFinal)}</b><small>${varP >= 0 ? '+' : '−'}${pctN(Math.abs(varP), 1)}</small></div></div>
        <p style="margin-top:10px"><span class="leg"><i style="background:var(--s-antigo)"></i>Tributos atuais (ICMS/ISS, PIS/Cofins, IPI)</span>
          <span class="leg"><i style="background:var(--s-novo)"></i>Novos (CBS, IBS${e.is ? ', IS' : ''})</span></p>
        <div class="grafico">${window.ComparadorUI.grafico(linhas)}</div></div>
        <table><thead><tr><th>Ano</th><th class="n">${serv ? 'ISS' : 'ICMS'}</th><th class="n">PIS/Cofins</th>${serv ? '' : '<th class="n">IPI</th>'}<th class="n">CBS</th><th class="n">IBS</th>${e.is ? '<th class="n">IS</th>' : ''}<th class="n">Total</th><th class="n">Preço final</th><th class="n">Carga</th></tr></thead><tbody>
        ${linhas.map((l) => `<tr><td>${l.rotulo}</td><td class="n">${brl(serv ? l.iss : l.icms)}</td><td class="n">${brl(l.pc)}</td>${serv ? '' : `<td class="n">${brl(l.ipi)}</td>`}
          <td class="n">${brl(l.cbs)}</td><td class="n">${brl(l.ibs)}</td>${e.is ? `<td class="n">${brl(l.is)}</td>` : ''}<td class="n"><b>${brl(l.tributos)}</b></td><td class="n">${brl(l.precoFinal)}</td><td class="n">${pctN(l.carga * 100, 1)}</td></tr>`).join('')}
        </tbody></table>`;
    }

    if (opcoes.notas) {
      h += `<div class="sem-quebra"><h2>Observações</h2><ul>
        <li>Cálculo de CBS, IBS e IS feito com as tabelas e as regras da calculadora oficial da Receita Federal (base de dados ${esc(VERSAO_BASE)}), conforme a LC 214/2025.</li>
        <li>${op.data < '2027-01-01' ? 'Em 2026 (ano de teste), CBS de 0,9% e IBS de 0,1% são destacados na nota e compensados com PIS/Cofins.' : 'A partir de 2027 as alíquotas de referência ainda não foram fixadas oficialmente: os valores usam as alíquotas informadas na simulação.'}</li>
        ${opcoes.comparador && cmp ? '<li>Comparador: mantém o valor líquido recebido pela empresa; 2027–2028 sem PIS/Cofins e IPI; ICMS/ISS a 90%, 80%, 70% e 60% de 2029 a 2032 e extintos em 2033; IBS de transição aproximado; valores destacados na venda, sem considerar créditos; não se aplica ao Simples Nacional.</li>' : ''}
        <li>Simulação para planejamento, sem valor fiscal. Confira a classificação de cada produto ou serviço antes de emitir documentos.</li></ul></div>`;
    }
    h += `<div class="rel-rod"><span>${marca.nome ? esc(marca.nome) + ' · ' : ''}Gerado com Reforma Fácil</span><span>${esc(nomeCli)} · ${hoje()}</span></div></div>`;
    return h;
  }

  // ───────── tela ─────────
  function criarTela() {
    tela = document.createElement('div');
    tela.id = 'rel-tela';
    tela.innerHTML = `
      <div class="rel-barra"><div class="rel-barra-in">
        <button class="btn peq" id="rel-fechar">← Voltar</button>
        <h2>Relatório em PDF</h2><span class="esp"></span>
        <button class="btn" id="rel-pdf">Salvar PDF</button></div></div>
      <div class="rel-opcoes">
        <div class="card">
          <div class="linha" style="gap:16px">
            <label class="chk"><input type="checkbox" data-op="detalhe">Detalhamento por item</label>
            <label class="chk"><input type="checkbox" data-op="comparador">Antes × depois da reforma</label>
            <label class="chk"><input type="checkbox" data-op="notas">Observações</label>
          </div>
          <p class="dica" id="rel-dica-cmp" style="margin:8px 0 0"></p>
        </div>
        <details class="card" id="rel-marca"><summary>Marca do escritório (aparece no topo do relatório)</summary>
          <div class="grade" style="margin-top:12px">
            <div><label>Nome do escritório ou empresa</label><input data-m="nome" maxlength="120"></div>
            <div><label>Contato (telefone, e-mail, CRC…)</label><input data-m="contato" maxlength="200"></div>
          </div>
          <div class="rel-marca-logo" style="margin-top:12px">
            <img id="rel-logo-prev" alt="" hidden>
            <label class="btn peq" style="margin:0;cursor:pointer">Escolher logo<input type="file" id="rel-logo" accept="image/png,image/jpeg,image/webp" hidden></label>
            <button class="btn del" id="rel-logo-tirar" hidden>Remover logo</button>
            <span class="esp"></span>
            <span class="dica" id="rel-marca-status" style="margin:0"></span>
            <button class="btn peq" id="rel-marca-salvar">Salvar marca</button>
          </div>
          <p class="dica">PNG ou JPG. A imagem é reduzida automaticamente.</p>
        </details>
      </div>
      <div class="rel-previa" id="rel-previa"></div>`;
    document.body.appendChild(tela);

    $('#rel-fechar', tela).addEventListener('click', fechar);
    $('#rel-pdf', tela).addEventListener('click', imprimir);
    tela.addEventListener('change', (e) => {
      const k = e.target.dataset.op;
      if (k) { opcoes[k] = e.target.checked; localStorage.setItem('rtc-rel-opcoes', JSON.stringify(opcoes)); previa(); }
    });
    tela.addEventListener('input', (e) => {
      const k = e.target.dataset.m;
      if (k) { marca[k] = e.target.value; $('#rel-marca-status').textContent = 'Alterações não salvas'; previa(); }
    });
    $('#rel-logo', tela).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { marca.logo = await reduzirImagem(f); mostrarLogo(); $('#rel-marca-status').textContent = 'Alterações não salvas'; previa(); }
      catch (err) { Dialogo.aviso('Não foi possível usar esta imagem: ' + err.message); }
      e.target.value = '';
    });
    $('#rel-logo-tirar', tela).addEventListener('click', () => { marca.logo = ''; mostrarLogo(); $('#rel-marca-status').textContent = 'Alterações não salvas'; previa(); });
    $('#rel-marca-salvar', tela).addEventListener('click', async () => {
      const st = $('#rel-marca-status'); st.textContent = 'Salvando…';
      try { await window.Conta.salvarMarca(marca); st.textContent = '✓ Marca salva'; }
      catch (err) { st.textContent = 'Não salvou: ' + window.Conta.erro(err); }
    });
    window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo-relatorio'));
    window.addEventListener('resize', ajustarEscala);
  }

  function mostrarLogo() {
    const img = $('#rel-logo-prev'), tirar = $('#rel-logo-tirar');
    img.hidden = !marca.logo; tirar.hidden = !marca.logo; if (marca.logo) img.src = marca.logo;
  }

  // reduz a imagem para no máximo 600×240 px e ~280 KB
  function reduzirImagem(arquivo) {
    return new Promise((resolve, reject) => {
      if (arquivo.size > 8 * 1024 * 1024) return reject(new Error('arquivo maior que 8 MB'));
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 600 / img.width, 240 / img.height);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        let d = cv.toDataURL('image/png');
        if (d.length > 280000) {
          const fundo = document.createElement('canvas'); fundo.width = cv.width; fundo.height = cv.height;
          const fx = fundo.getContext('2d'); fx.fillStyle = '#fff'; fx.fillRect(0, 0, cv.width, cv.height); fx.drawImage(cv, 0, 0);
          d = fundo.toDataURL('image/jpeg', 0.85);
        }
        if (d.length > 290000) return reject(new Error('imagem muito detalhada; use uma versão menor'));
        resolve(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('formato não reconhecido')); };
      img.src = url;
    });
  }

  function previa() {
    const cmp = window.ComparadorUI && window.ComparadorUI.atual();
    const caixa = $('[data-op="comparador"]', tela);
    caixa.disabled = !cmp;
    $('#rel-dica-cmp').textContent = cmp ? '' : 'Para incluir o "antes × depois", preencha a aba Comparar deste cliente.';
    $('#rel-previa').innerHTML = montarFolha();
    ajustarEscala();
  }

  // em telas estreitas a folha A4 é reduzida para caber
  function ajustarEscala() {
    const f = $('#rel-folha'); if (!f) return;
    f.style.transform = ''; f.style.marginBottom = '';
    const larg = f.offsetWidth, disp = window.innerWidth - 24;
    if (larg > disp) {
      const k = disp / larg;
      f.style.transform = `scale(${k})`; f.style.transformOrigin = 'top left';
      f.style.marginLeft = '0'; f.style.marginBottom = `-${f.offsetHeight * (1 - k)}px`;
    } else { f.style.marginLeft = ''; }
  }

  function imprimir() {
    document.body.classList.add('imprimindo-relatorio');
    const f = $('#rel-folha'); if (f) f.style.transform = '';
    const cli = window.Conta && window.Conta.clienteAtivo();
    const tituloAntes = document.title;
    document.title = 'Reforma Tributária - ' + (cli ? cli.nome : 'Simulação') + ' - ' + new Date().toISOString().slice(0, 10);
    try { window.print(); }
    catch (e) { Dialogo.aviso('Este navegador não permite gerar PDF. Abra o app no Chrome, Safari ou Edge.'); }
    setTimeout(() => { document.title = tituloAntes; document.body.classList.remove('imprimindo-relatorio'); ajustarEscala(); }, 1000);
  }

  async function abrir() {
    if (!tela) criarTela();
    try { opcoes = Object.assign(opcoes, JSON.parse(localStorage.getItem('rtc-rel-opcoes')) || {}); } catch (e) { /* padrão */ }
    tela.querySelectorAll('[data-op]').forEach((c) => { c.checked = !!opcoes[c.dataset.op]; });
    document.body.classList.add('relatorio-aberto');
    tela.scrollTop = 0;
    previa();
    try {
      const m = window.Conta ? await window.Conta.lerMarca() : null;
      marca = { nome: '', contato: '', logo: '', ...(m || {}) };
    } catch (e) { /* sem marca */ }
    tela.querySelectorAll('[data-m]').forEach((i) => { i.value = marca[i.dataset.m] || ''; });
    if (!marca.nome && !marca.logo) $('#rel-marca').open = true;
    mostrarLogo();
    $('#rel-marca-status').textContent = '';
    previa();
  }
  function fechar() { document.body.classList.remove('relatorio-aberto'); }

  window.Relatorio = { abrir, fechar };
})();
