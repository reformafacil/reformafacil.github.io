// Executar: jsc comparador-modelo.js ferramentas/testes-comparador.js
let ok = 0, falhas = 0;
const perto = (n, a, b) => { if (Math.abs(a - b) < 0.006) ok++; else { falhas++; print('FALHOU ' + n + ': ' + a.toFixed(4) + ' ≠ ' + b); } };
const base = { preco: 1000, tipo: 'mercadoria', icms: 18, iss: 0, ipi: 0, pisCofins: 9.25, cbs: 8.8, ibs: 17.7, redCbs: 0, redIbs: 0, is: 0 };
let r = Comparador.calcular(base);
const a = (ano) => r.anos.find((x) => x.rotulo === String(ano));
// hoje: ICMS 180; PIS/Cofins 9,25% × 820 = 75,85; líquido 744,15
perto('icms hoje', r.hoje.icms, 180); perto('pc hoje', r.hoje.pc, 75.85); perto('liquido', r.liquido, 744.15);
perto('tributos hoje', r.hoje.tributos, 255.85); perto('preço hoje', r.hoje.precoFinal, 1000);
// 2026: igual a hoje (CBS/IBS compensados)
perto('2026 preço', a(2026).precoFinal, 1000);
// 2027: V = 744,15/0,82 = 907,5; ICMS 163,35; base 744,15; CBS 8,7% = 64,741; IBS 0,1% = 0,744
perto('2027 V', a(2027).V, 907.5); perto('2027 cbs', a(2027).cbs, 64.741); perto('2027 ibs', a(2027).ibs, 0.744);
perto('2027 preço', a(2027).precoFinal, 972.985);
// 2029: ICMS 16,2%: V = 744,15/0,838 = 888,0072; base 744,15; CBS 8,8% = 65,485; IBS 1,77% = 13,171
perto('2029 V', a(2029).V, 888.0072); perto('2029 cbs', a(2029).cbs, 65.485); perto('2029 ibs', a(2029).ibs, 13.171);
// 2033: base = líquido; CBS 65,485; IBS 131,715; preço 941,35
perto('2033 cbs', a(2033).cbs, 65.485); perto('2033 ibs', a(2033).ibs, 131.715); perto('2033 preço', a(2033).precoFinal, 941.35);
perto('2033 antigos', a(2033).antigos, 0);
// com redução de 60% (educação/saúde): 2033 CBS 26,194; IBS 52,686
r = Comparador.calcular({ ...base, redCbs: 60, redIbs: 60 });
perto('2033 red cbs', a(2033).cbs, 26.194); perto('2033 red ibs', a(2033).ibs, 52.686);
// serviço com ISS 5%, presumido 3,65%: líquido = 1000 − 50 − 36,5 = 913,5; 2033 preço = 913,5 × 1,265 = 1155,58
r = Comparador.calcular({ ...base, tipo: 'servico', icms: 0, iss: 5, pisCofins: 3.65 });
perto('serv liquido', r.liquido, 913.5); perto('serv 2033 preço', a(2033).precoFinal, 1155.5775);
// IPI 10% hoje: preço final 1100; some em 2027
r = Comparador.calcular({ ...base, ipi: 10 });
perto('ipi hoje', r.hoje.precoFinal, 1100); perto('ipi 2027', a(2027).ipi, 0);
// IS 10% em 2033: V = líquido; IS = 74,415; base = 818,565; CBS 72,034
r = Comparador.calcular({ ...base, is: 10 });
perto('is 2033', a(2033).is, 74.415); perto('is 2033 cbs', a(2033).cbs, 72.0337);
print(ok + ' verificações ok, ' + falhas + ' falhas');
