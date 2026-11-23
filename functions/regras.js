/* Regras de negócio da assinatura (sem dependências, para poder testar). */
'use strict';

const DIA = 24 * 60 * 60 * 1000;
const TESTE_DIAS = 7;

const PLANOS = {
  mensal: { valor: 2990, dias: 30, nome: 'Reforma Fácil — plano mensal' },
  anual: { valor: 29900, dias: 365, nome: 'Reforma Fácil — plano anual' },
};

function validarPedido(p) {
  const nome = String(p.nome || '').trim();
  const email = String(p.email || '').trim().toLowerCase();
  const plano = String(p.plano || '');
  if (!nome || nome.length > 120) return { erro: 'Informe o seu nome.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return { erro: 'Informe um e-mail válido.' };
  if (!PLANOS[plano]) return { erro: 'Plano inválido.' };
  return { nome, email, plano };
}

/**
 * Nova validade depois de um pagamento confirmado.
 * - Primeira compra: 7 dias grátis + o período pago, a partir de agora; garantia de 7 dias.
 * - Renovação: o período pago soma a partir da validade atual (ou de agora, se já venceu).
 */
function calcularValidade({ agora, validadeAtual, primeiraCompra, plano }) {
  const p = PLANOS[plano];
  if (!p) throw new Error('plano inválido');
  const inicio = validadeAtual && validadeAtual > agora ? validadeAtual : agora;
  const dias = p.dias + (primeiraCompra ? TESTE_DIAS : 0);
  return {
    validade: inicio + dias * DIA,
    garantiaAte: primeiraCompra ? agora + TESTE_DIAS * DIA : null,
  };
}

function podePedirEstorno({ agora, garantiaAte, estornoPedido }) {
  return !!garantiaAte && agora <= garantiaAte && !estornoPedido;
}

// identificador do pedido: único e sem dados pessoais
function novoPedido(aleatorio) {
  return 'rf-' + Date.now().toString(36) + '-' + aleatorio;
}

module.exports = { PLANOS, TESTE_DIAS, DIA, validarPedido, calcularValidade, podePedirEstorno, novoPedido };
