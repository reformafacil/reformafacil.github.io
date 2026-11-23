// node --test (em functions/)   ou   jsc com o shim de module
const R = (typeof require !== 'undefined') ? require('./regras') : module.exports;
const casos = [];
const t = (nome, ok) => casos.push([nome, !!ok]);
const D = R.DIA, agora = Date.UTC(2026, 10, 23, 12);

let v = R.calcularValidade({ agora, validadeAtual: null, primeiraCompra: true, plano: 'mensal' });
t('primeira mensal = 7 + 30 dias', v.validade === agora + 37 * D);
t('garantia de 7 dias', v.garantiaAte === agora + 7 * D);
v = R.calcularValidade({ agora, validadeAtual: null, primeiraCompra: true, plano: 'anual' });
t('primeira anual = 7 + 365 dias', v.validade === agora + 372 * D);
v = R.calcularValidade({ agora, validadeAtual: agora + 10 * D, primeiraCompra: false, plano: 'mensal' });
t('renovação antecipada soma ao que falta', v.validade === agora + 40 * D && v.garantiaAte === null);
v = R.calcularValidade({ agora, validadeAtual: agora - 5 * D, primeiraCompra: false, plano: 'mensal' });
t('renovação vencida conta a partir de hoje', v.validade === agora + 30 * D);
t('preço mensal R$ 29,90', R.PLANOS.mensal.valor === 2990);
t('preço anual R$ 299,00', R.PLANOS.anual.valor === 29900);
t('estorno no 7º dia', R.podePedirEstorno({ agora: agora + 7 * D, garantiaAte: agora + 7 * D, estornoPedido: false }));
t('sem estorno no 8º dia', !R.podePedirEstorno({ agora: agora + 7 * D + 1, garantiaAte: agora + 7 * D, estornoPedido: false }));
t('sem estorno duplicado', !R.podePedirEstorno({ agora, garantiaAte: agora + 7 * D, estornoPedido: true }));
t('sem estorno em renovação', !R.podePedirEstorno({ agora, garantiaAte: null, estornoPedido: false }));
t('pedido válido', R.validarPedido({ nome: ' Ana ', email: 'ANA@X.COM', plano: 'anual' }).email === 'ana@x.com');
t('e-mail inválido', !!R.validarPedido({ nome: 'Ana', email: 'ana', plano: 'anual' }).erro);
t('plano inválido', !!R.validarPedido({ nome: 'Ana', email: 'a@b.co', plano: 'vitalicio' }).erro);
t('nome vazio', !!R.validarPedido({ nome: ' ', email: 'a@b.co', plano: 'mensal' }).erro);
t('pedido sem dados pessoais', /^rf-[a-z0-9]+-abc$/.test(R.novoPedido('abc')));

if (typeof require !== 'undefined') {
  const test = require('node:test'); const assert = require('node:assert');
  for (const [n, ok] of casos) test(n, () => assert.ok(ok));
} else {
  const f = casos.filter((c) => !c[1]);
  f.forEach((c) => (typeof print !== 'undefined' ? print : console.log)('FALHOU ' + c[0]));
  (typeof print !== 'undefined' ? print : console.log)((casos.length - f.length) + ' ok, ' + f.length + ' falhas');
}
