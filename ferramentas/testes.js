// Executar: jsc dados.js motor.js testes.js
const base = new RTC.Base(window.RTC_DADOS);
let ok = 0, falhas = 0;
function eq(nome, obtido, esperado) {
  const o = obtido === null || obtido === undefined ? 'null' : RTC.dec(obtido.toString()).toString();
  const e = RTC.dec(esperado).toString();
  if (RTC.dec(o === 'null' ? '-999999' : o).cmp(RTC.dec(e)) === 0) ok++;
  else { falhas++; print('FALHOU ' + nome + ': obtido ' + o + ' esperado ' + e); }
}
function item(data, it) {
  const r = RTC.calcularOperacao(base, { data, itens: [Object.assign({ numero: 1, quantidade: 1 }, it)] });
  const x = r.itens[0];
  if (!x.ok) { falhas++; print('ERRO ' + JSON.stringify(it) + ': ' + x.erro); return null; }
  return { x, r };
}

// decimal
eq('div', RTC.dec('1').div(RTC.dec('3')).mul(RTC.dec('3')), '0.9999999999999999999999999999999999');
eq('halfeven1', RTC.dec('0.125').setScale(2), '0.12');
eq('halfeven2', RTC.dec('0.135').setScale(2), '0.14');
eq('expr', RTC.avaliar('(a-b+c)*(1-100/100)', { a: RTC.dec('10'), b: RTC.dec('1'), c: RTC.dec('2') }), '0');

// Teste_200032_1 (2026, redução 60%)
let t = item('2026-01-01', { cst: '200', cClassTrib: '200032', baseCalculo: 200 });
if (t) {
  const g = t.x.g;
  eq('200032 vBC', g.vBC, '200.00');
  eq('200032 pCBS', g.cbs.aliquota, '0.90'); eq('200032 vCBS', g.cbs.tributoDevido, '0.72');
  eq('200032 gRed CBS', g.cbs.grupoReducao.pAliqEfet, '0.36'); eq('200032 pRed', g.cbs.grupoReducao.pRedAliq, '60');
  eq('200032 pUF', g.ibsUF.aliquota, '0.10'); eq('200032 vUF', g.ibsUF.tributoDevido, '0.08');
  eq('200032 gRed UF', g.ibsUF.grupoReducao.pAliqEfet, '0.04');
  eq('200032 vMun', g.ibsMun.tributoDevido, '0'); eq('200032 gRed Mun', g.ibsMun.grupoReducao.pAliqEfet, '0');
}
// Teste_011002_1
t = item('2026-01-01', { cst: '011', cClassTrib: '011002', baseCalculo: 200 });
if (t) {
  const g = t.x.g;
  eq('011002 vCBS', g.cbs.tributoDevido, '0.72'); eq('011002 gRed', g.cbs.grupoReducao.pAliqEfet, '0.36');
  eq('011002 vUF', g.ibsUF.tributoDevido, '0.08');
}
// Diferimento 510001 (100% diferido)
t = item('2026-01-01', { cst: '510', cClassTrib: '510001', baseCalculo: 200 });
if (t) {
  const g = t.x.g;
  eq('510001 pCBS', g.cbs.aliquota, '0.9'); eq('510001 vCBS', g.cbs.tributoDevido, '0');
  eq('510001 vDif', g.cbs.diferimento.vDif, '1.80'); eq('510001 pDif', g.cbs.diferimento.pDif, '100');
  eq('510001 vUF', g.ibsUF.tributoDevido, '0'); eq('510001 vDifUF', g.ibsUF.diferimento.vDif, '0.20');
}
// Teste_000001_3 (suspensão com tributação regular)
t = item('2026-01-01', { cst: '550', cClassTrib: '550001', baseCalculo: 200, regular: { cst: '000', cClassTrib: '000001' } });
if (t) {
  const g = t.x.g;
  eq('550001 vBC', g.vBC, '200'); eq('550001 vCBS', g.cbs.tributoDevido, '0'); eq('550001 pCBS', g.cbs.aliquota, '0');
  eq('550001 reg CBS', g.cbs.regular.valor, '1.80'); eq('550001 reg aliq', g.cbs.regular.aliqEf, '0.90');
  eq('550001 reg UF', g.ibsUF.regular.valor, '0.20');
}
// Teste_200002_2 (2027 com IS)
t = item('2027-01-01', {
  cst: '200', cClassTrib: '200002', baseCalculo: 200, aliquotas: { 2: 8.4, 3: 0.05, 4: 0.05 },
  is: { cst: '000', cClassTrib: '000001', baseCalculo: 200, quantidade: 1, isInformado: 0, adValorem: 13, adRem: 21.3 },
});
if (t) {
  const g = t.x.g;
  eq('200002 vBC', g.vBC, '247.30'); eq('200002 pCBS', g.cbs.aliquota, '8.40'); eq('200002 vCBS', g.cbs.tributoDevido, '0');
  eq('200002 vBCIS', t.x.is.baseCalculo, '200'); eq('200002 pIS', t.x.is.pIS, '13'); eq('200002 vIS', t.x.is.vIS, '47.30');
}
// Exemplo docs/exemplos.md (2027, itens 1 a 3)
const ex = RTC.calcularOperacao(base, {
  data: '2027-03-10', itens: [
    { numero: 1, cst: '200', cClassTrib: '200003', baseCalculo: 100, quantidade: 20, aliquotas: { 2: 8.8, 3: 0.05, 4: 0.05 } },
    { numero: 2, cst: '000', cClassTrib: '000001', quantidade: 12, aliquotas: { 2: 8.8, 3: 0.05, 4: 0.05 },
      is: { cst: '000', cClassTrib: '000001', baseCalculo: 150, quantidade: 12, isInformado: 15, adValorem: 10 } },
    { numero: 3, cst: '200', cClassTrib: '200028', baseCalculo: 1200, aliquotas: { 2: 8.8, 3: 0.05, 4: 0.05 } },
  ],
});
ex.itens.forEach((i) => { if (!i.ok) { falhas++; print('ERRO exemplo item ' + i.numero + ': ' + i.erro); } });
eq('ex vBC', ex.total.vBC, '1465'); eq('ex vCBS', ex.total.vCBS, '56.76'); eq('ex vIBS', ex.total.vIBS, '0.64'); eq('ex vIS', ex.total.vIS, '15');
if (ex.itens[2].ok) {
  eq('ex it3 vCBS', ex.itens[2].g.cbs.tributoDevido, '42.24'); eq('ex it3 gRed', ex.itens[2].g.cbs.grupoReducao.pAliqEfet, '3.52');
  eq('ex it3 vUF', ex.itens[2].g.ibsUF.tributoDevido, '0.24'); eq('ex it3 efUF', ex.itens[2].g.ibsUF.grupoReducao.pAliqEfet, '0.02');
}

// Roda TODAS as classificações vigentes em 2026 e 2027 para detectar falhas técnicas
['2026-06-01', '2027-06-01'].forEach((d) => {
  const ano = d.slice(0, 4);
  const cls = base.classificacoes(d, 2);
  let calc = 0, ni = 0, ent = 0;
  cls.forEach((c) => {
    const st = base.cstPorId[c.sitr];
    const it = { numero: 1, quantidade: 1, cst: st.cd, cClassTrib: c.cd, baseCalculo: 1000,
      regular: { cst: '000', cClassTrib: '000001' } };
    if (ano === '2027') it.aliquotas = { 2: 8.8, 3: 0.05, 4: 0.05 };
    const r = RTC.calcularOperacao(base, { data: d, itens: [it] }).itens[0];
    if (r.ok) calc++;
    else if (r.tipo === 'tecnica') { falhas++; print('TÉCNICA ' + d + ' ' + c.cd + ': ' + r.erro); }
    else if (r.tipo === 'nao-implementado') ni++;
    else { ent++; print('  entrada ' + d + ' ' + c.cd + ': ' + r.erro); }
  });
  print(d + ': ' + cls.length + ' classificações → ' + calc + ' calculadas, ' + ni + ' não implementadas, ' + ent + ' recusadas');
});

print('\n' + ok + ' verificações ok, ' + falhas + ' falhas');
