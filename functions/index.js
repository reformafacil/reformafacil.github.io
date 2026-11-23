/*
 * Servidor de pagamentos do Reforma Fácil (Firebase Functions + InfinitePay Checkout Integrado).
 *
 *  assinar           (público)  cria o pedido e o link de pagamento; serve para nova assinatura e renovação
 *  webhookInfinitepay(público)  aviso da InfinitePay; só libera depois de confirmar em /payment_check
 *  confirmarPagamento(público)  chamado pela página de "obrigado" (caso o aviso atrase)
 *  pedirEstorno      (logado)   cancelamento dentro dos 7 dias: corta o acesso e avisa o administrador
 *
 * A InfinitePay não faz cobrança recorrente nem estorno pela API: cada período é um link novo,
 * e o estorno é feito pelo administrador no app da InfinitePay.
 */
'use strict';

const crypto = require('node:crypto');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { defineString, defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const R = require('./regras');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const REGIAO = 'southamerica-east1';
setGlobalOptions({ region: REGIAO, maxInstances: 5 });

const HANDLE = defineString('INFINITEPAY_HANDLE');          // InfiniteTag, sem o "$"
const SITE = defineString('SITE_URL', { default: 'https://joaovcbarcelos.github.io/reforma-facil/' });
const TOKEN = defineSecret('WEBHOOK_TOKEN');                // segredo na URL do webhook (o aviso não é assinado)

const API = 'https://api.checkout.infinitepay.io';
const ORIGENS = ['https://joaovcbarcelos.github.io', /^http:\/\/localhost(:\d+)?$/];

const iguais = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function infinitepay(caminho, corpo) {
  const r = await fetch(API + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* resposta não-JSON */ }
  if (!r.ok) throw new Error(`InfinitePay ${caminho} respondeu ${r.status}: ${texto.slice(0, 300)}`);
  return json || {};
}

// a documentação não nomeia o campo do link na resposta: aceita os nomes prováveis
function urlDoLink(resp) {
  for (const k of ['url', 'checkout_url', 'link', 'payment_url']) if (typeof resp[k] === 'string' && resp[k].startsWith('http')) return resp[k];
  if (resp.data) return urlDoLink(resp.data);
  return null;
}

// ───────── criar assinatura / renovação ─────────
exports.assinar = onRequest({ cors: ORIGENS, secrets: [TOKEN] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const v = R.validarPedido(req.body || {});
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const plano = R.PLANOS[v.plano];

  let uid = null;
  try { uid = (await admin.auth().getUserByEmail(v.email)).uid; } catch (e) { /* conta nova */ }

  const pedido = R.novoPedido(crypto.randomBytes(6).toString('hex'));
  await db.collection('pagamentos').doc(pedido).set({
    nome: v.nome, email: v.email, plano: v.plano, valor: plano.valor, uid,
    tipo: uid ? 'renovacao' : 'nova', status: 'pendente', criadoEm: FieldValue.serverTimestamp(),
  });

  const projeto = process.env.GCLOUD_PROJECT;
  const site = SITE.value().replace(/\/?$/, '/');
  try {
    const resp = await infinitepay('/links', {
      handle: HANDLE.value(),
      order_nsu: pedido,
      items: [{ description: plano.nome, quantity: 1, price: plano.valor }],
      customer: { name: v.nome, email: v.email },
      redirect_url: `${site}obrigado.html`,
      webhook_url: `https://${REGIAO}-${projeto}.cloudfunctions.net/webhookInfinitepay?t=${encodeURIComponent(TOKEN.value())}`,
    });
    const url = urlDoLink(resp);
    if (!url) { logger.error('link sem URL', resp); throw new Error('resposta sem URL'); }
    await db.collection('pagamentos').doc(pedido).update({ link: url });
    return res.json({ url, pedido });
  } catch (e) {
    logger.error('falha ao criar link', e);
    await db.collection('pagamentos').doc(pedido).update({ status: 'erro', erro: String(e.message).slice(0, 300) });
    return res.status(502).json({ erro: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' });
  }
});

// conta criada pelo pagamento ainda sem senha: a página de obrigado envia o e-mail para criá-la
async function precisaSenha(uid) {
  try { return !(await admin.auth().getUser(uid)).providerData.some((p) => p.providerId === 'password'); }
  catch (e) { return false; }
}

// ───────── confirmar e liberar (comum ao webhook e à página de obrigado) ─────────
async function processar({ order_nsu, transaction_nsu, slug }) {
  if (!order_nsu || !transaction_nsu || !slug) return { status: 'invalido' };
  const ref = db.collection('pagamentos').doc(String(order_nsu));
  const snap = await ref.get();
  if (!snap.exists) return { status: 'desconhecido' };
  const pg = snap.data();
  if (pg.status === 'pago') return { status: 'pago', email: pg.email, novaConta: pg.uid ? await precisaSenha(pg.uid) : false };

  const chk = await infinitepay('/payment_check', {
    handle: HANDLE.value(), order_nsu: String(order_nsu), transaction_nsu: String(transaction_nsu), slug: String(slug),
  });
  if (!(chk.success && chk.paid)) return { status: 'pendente' };

  // conta: usa a existente ou cria uma nova (a pessoa define a senha pelo e-mail)
  let user, novaConta = false;
  try { user = await admin.auth().getUserByEmail(pg.email); }
  catch (e) {
    try { user = await admin.auth().createUser({ email: pg.email, displayName: pg.nome }); novaConta = true; }
    catch (e2) {
      // o aviso e a página de obrigado podem chegar juntos: a outra chamada já criou a conta
      if (e2.code !== 'auth/email-already-exists') throw e2;
      user = await admin.auth().getUserByEmail(pg.email);
    }
  }

  const resultado = await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    if (atual.data().status === 'pago') return { jaPago: true };
    const anteriores = await tx.get(db.collection('pagamentos').where('email', '==', pg.email).where('status', '==', 'pago').limit(1));
    const uref = db.collection('usuarios').doc(user.uid);
    const usnap = await tx.get(uref);
    const u = usnap.exists ? usnap.data() : null;
    const agora = Date.now();
    const v = R.calcularValidade({
      agora, plano: pg.plano, primeiraCompra: anteriores.empty,
      validadeAtual: u && u.validade ? u.validade.toMillis() : null,
    });
    const dadosUsuario = {
      nome: (u && u.nome) || pg.nome, email: pg.email, ativo: true, plano: pg.plano,
      validade: Timestamp.fromMillis(v.validade), ultimoPagamento: ref.id, estornoPedido: false,
    };
    if (v.garantiaAte) dadosUsuario.garantiaAte = Timestamp.fromMillis(v.garantiaAte);
    if (!u) dadosUsuario.criadoEm = FieldValue.serverTimestamp();
    tx.set(uref, dadosUsuario, { merge: true });
    tx.update(ref, {
      status: 'pago', uid: user.uid, pagoEm: FieldValue.serverTimestamp(), transaction_nsu: String(transaction_nsu), slug: String(slug),
      valorPago: chk.paid_amount ?? chk.amount ?? null, meio: chk.capture_method || null, parcelas: chk.installments || null,
      validadeConcedida: Timestamp.fromMillis(v.validade), primeiraCompra: anteriores.empty,
    });
    return { jaPago: false };
  });
  logger.info('pagamento confirmado', { pedido: ref.id, uid: user.uid, plano: pg.plano });
  return { status: 'pago', email: pg.email, novaConta: novaConta || (await precisaSenha(user.uid)), jaPago: resultado.jaPago };
}

exports.webhookInfinitepay = onRequest({ secrets: [TOKEN] }, async (req, res) => {
  if (req.method !== 'POST' || !iguais(req.query.t || '', TOKEN.value())) return res.status(400).send('recusado');
  const b = req.body || {};
  try {
    const r = await processar({ order_nsu: b.order_nsu, transaction_nsu: b.transaction_nsu, slug: b.invoice_slug || b.slug });
    if (b.order_nsu && ['refunded', 'canceled'].includes(String(b.event || b.status || ''))) {
      await db.collection('pagamentos').doc(String(b.order_nsu)).set({ avisoInfinitepay: String(b.event || b.status) }, { merge: true });
    }
    return res.status(200).json({ ok: true, status: r.status });
  } catch (e) {
    logger.error('erro no webhook', e);
    return res.status(500).send('erro'); // a InfinitePay tenta de novo
  }
});

exports.confirmarPagamento = onRequest({ cors: ORIGENS }, async (req, res) => {
  const q = req.method === 'POST' ? (req.body || {}) : req.query;
  try {
    const r = await processar({ order_nsu: q.order_nsu, transaction_nsu: q.transaction_nsu, slug: q.slug });
    return res.json(r);
  } catch (e) {
    logger.error('erro ao confirmar', e);
    return res.status(502).json({ status: 'erro' });
  }
});

// ───────── cancelamento com estorno (garantia de 7 dias) ─────────
exports.pedirEstorno = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const uid = req.auth.uid;
  const uref = db.collection('usuarios').doc(uid);
  return db.runTransaction(async (tx) => {
    const u = (await tx.get(uref)).data();
    if (!u) throw new HttpsError('not-found', 'Conta não encontrada.');
    const agora = Date.now();
    if (!R.podePedirEstorno({ agora, garantiaAte: u.garantiaAte ? u.garantiaAte.toMillis() : null, estornoPedido: u.estornoPedido })) {
      throw new HttpsError('failed-precondition', 'O prazo de 7 dias para cancelar com estorno já passou.');
    }
    const pg = u.ultimoPagamento ? (await tx.get(db.collection('pagamentos').doc(u.ultimoPagamento))).data() : null;
    tx.set(db.collection('estornos').doc(), {
      uid, nome: u.nome || '', email: u.email || '', pedido: u.ultimoPagamento || null,
      valor: pg ? pg.valorPago ?? pg.valor : null, transaction_nsu: pg ? pg.transaction_nsu || null : null,
      plano: u.plano || null, status: 'pendente', pedidoEm: FieldValue.serverTimestamp(),
    });
    tx.update(uref, {
      ativo: false, estornoPedido: true,
      sessao: { id: 'cancelada-' + crypto.randomBytes(8).toString('hex'), aparelho: 'assinatura cancelada', em: FieldValue.serverTimestamp() },
    });
    return { ok: true };
  });
});
