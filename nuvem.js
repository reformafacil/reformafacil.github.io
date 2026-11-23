/*
 * Nuvem: login (Firebase Authentication), sessão única por conta e dados por cliente (Cloud Firestore).
 * Exposto como window.Nuvem. Configuração em firebase-config.js.
 */
const V = '13.4.0';
const cfg = window.FIREBASE_CONFIG;
const ouvintes = { entrou: null, saiu: null, perfil: null };
let fb = null;          // módulos do Firebase
let app, auth, db;
let usuario = null;     // usuário do Firebase Auth
let perfil = null;      // documento usuarios/{uid}
let ehAdmin = false;
let sessaoId = null;
let pararPerfil = null;
let entrandoAgora = false;

const chaveSessao = (uid) => 'rtc-sessao-' + uid;
const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function aparelho() {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'navegador';
  return so + ' · ' + nav;
}

function erroAmigavel(e) {
  const c = (e && e.code) || '';
  const m = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'permission-denied': 'Sem permissão. Seu acesso pode ter expirado ou a sessão foi aberta em outro aparelho.',
    'unavailable': 'Servidor indisponível ou sem internet. Tente de novo.',
    'auth/operation-not-allowed': 'Login por e-mail e senha não está ativado no Firebase.',
  };
  if (c.startsWith('auth/api-key-not-valid')) return 'Configuração do Firebase inválida (confira firebase-config.js).';
  return m[c] || (e && e.message) || 'Erro inesperado.';
}

async function carregar() {
  const [a, au, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  fb = { ...a, ...au, ...fs };
  app = fb.initializeApp(cfg);
  auth = fb.getAuth(app);
  await fb.setPersistence(auth, fb.browserLocalPersistence);
  db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
}

function encerrar(motivo) {
  if (pararPerfil) { pararPerfil(); pararPerfil = null; }
  const uid = usuario && usuario.uid;
  usuario = null; perfil = null; ehAdmin = false; sessaoId = null;
  if (uid && motivo !== 'derrubado') localStorage.removeItem(chaveSessao(uid));
  return fb.signOut(auth).finally(() => ouvintes.saiu && ouvintes.saiu(motivo || null));
}

function acessoValido(p) {
  return p && p.ativo === true && p.validade && p.validade.toMillis() > Date.now();
}

async function aoMudarUsuario(u) {
  if (!u) { if (usuario) encerrar(null); else ouvintes.saiu && ouvintes.saiu(null); return; }
  usuario = u;
  try {
    const adm = await fb.getDoc(fb.doc(db, 'admins', u.uid)).catch(() => null);
    ehAdmin = !!(adm && adm.exists());
    const ref = fb.doc(db, 'usuarios', u.uid);
    let snap = await fb.getDoc(ref);
    if (!snap.exists() && ehAdmin) {
      // o administrador ganha o próprio acesso automaticamente
      const validade = fb.Timestamp.fromDate(new Date('2099-12-31T23:59:59'));
      await fb.setDoc(ref, { nome: u.email, email: u.email, ativo: true, validade, criadoEm: fb.serverTimestamp() });
      snap = await fb.getDoc(ref);
    }
    if (!snap.exists()) return encerrar('sem-acesso');
    const p = snap.data();
    if (!acessoValido(p)) return encerrar(p.ativo === false ? 'desativado' : 'expirado');

    const guardado = localStorage.getItem(chaveSessao(u.uid));
    if (entrandoAgora || !guardado) {
      // login novo: este aparelho vira a sessão ativa e derruba qualquer outro
      sessaoId = novoId();
      await fb.updateDoc(ref, { sessao: { id: sessaoId, aparelho: aparelho(), em: fb.serverTimestamp() } });
      localStorage.setItem(chaveSessao(u.uid), sessaoId);
    } else {
      sessaoId = guardado;
      if (!p.sessao || p.sessao.id !== sessaoId) return encerrar('derrubado');
    }
    entrandoAgora = false;

    // vigia o perfil: outro login, desativação ou fim da validade encerram esta sessão na hora
    pararPerfil = fb.onSnapshot(ref, (s) => {
      if (!usuario) return;
      const d = s.data();
      if (!d) return encerrar('sem-acesso');
      if (!acessoValido(d)) return encerrar(d.ativo === false ? 'desativado' : 'expirado');
      if (!d.sessao || d.sessao.id !== sessaoId) return encerrar('derrubado');
      perfil = d;
      ouvintes.perfil && ouvintes.perfil(d);
    }, () => {});
    perfil = (await fb.getDoc(ref)).data();
    ouvintes.entrou && ouvintes.entrou({ uid: u.uid, email: u.email, perfil, admin: ehAdmin });
  } catch (e) {
    entrandoAgora = false;
    console.error(e);
    encerrar(e.code === 'permission-denied' ? 'sem-acesso' : 'erro');
  }
}

const Nuvem = {
  configurado: !!(cfg && cfg.apiKey && cfg.projectId),
  erroAmigavel,

  async iniciar({ entrou, saiu, perfilMudou }) {
    ouvintes.entrou = entrou; ouvintes.saiu = saiu; ouvintes.perfil = perfilMudou;
    await carregar();
    fb.onAuthStateChanged(auth, aoMudarUsuario);
  },

  async entrar(email, senha) {
    entrandoAgora = true;
    try { await fb.signInWithEmailAndPassword(auth, email.trim(), senha); }
    catch (e) { entrandoAgora = false; throw e; }
  },
  sair: () => encerrar(null),
  recuperarSenha: (email) => fb.sendPasswordResetEmail(auth, email.trim()),
  async trocarSenha(atual, nova) {
    const cred = fb.EmailAuthProvider.credential(usuario.email, atual);
    await fb.reauthenticateWithCredential(usuario, cred);
    await fb.updatePassword(usuario, nova);
  },

  // ── clientes (cada um é uma aba no app) ──
  async listarClientes() {
    const q = fb.query(fb.collection(db, 'usuarios', usuario.uid, 'clientes'), fb.orderBy('criadoEm'));
    const s = await fb.getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async criarCliente(nome, documento, operacao) {
    const ref = fb.doc(fb.collection(db, 'usuarios', usuario.uid, 'clientes'));
    await fb.setDoc(ref, { nome, documento: documento || '', operacao, sessao: sessaoId, criadoEm: fb.serverTimestamp(), atualizadoEm: fb.serverTimestamp() });
    return ref.id;
  },
  salvarCliente(id, dados) {
    return fb.setDoc(fb.doc(db, 'usuarios', usuario.uid, 'clientes', id),
      { ...dados, sessao: sessaoId, atualizadoEm: fb.serverTimestamp() }, { merge: true });
  },
  excluirCliente: (id) => fb.deleteDoc(fb.doc(db, 'usuarios', usuario.uid, 'clientes', id)),

  // ── assinatura ──
  async pedirEstorno() {
    const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`);
    const fn = F.httpsCallable(F.getFunctions(app, 'southamerica-east1'), 'pedirEstorno');
    return (await fn({})).data;
  },
  async listarEstornos() {
    const s = await fb.getDocs(fb.query(fb.collection(db, 'estornos'), fb.where('status', '==', 'pendente')));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  marcarEstornoFeito: (id) => fb.updateDoc(fb.doc(db, 'estornos', id), { status: 'feito', feitoEm: fb.serverTimestamp() }),

  // ── marca do escritório (para o relatório) ──
  async lerMarca() {
    const s = await fb.getDoc(fb.doc(db, 'usuarios', usuario.uid, 'config', 'marca'));
    return s.exists() ? s.data() : null;
  },
  salvarMarca: (m) => fb.setDoc(fb.doc(db, 'usuarios', usuario.uid, 'config', 'marca'),
    { nome: m.nome || '', contato: m.contato || '', logo: m.logo || '', atualizadoEm: fb.serverTimestamp() }),

  // ── administrador ──
  async listarUsuarios() {
    const s = await fb.getDocs(fb.query(fb.collection(db, 'usuarios'), fb.orderBy('email')));
    return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
  },
  async criarUsuario({ nome, email, validade }) {
    // app secundário: cria a conta sem desconectar o administrador
    const sec = fb.initializeApp(cfg, 'cadastro-' + Date.now());
    const authSec = fb.getAuth(sec);
    try {
      const senhaTemp = novoId() + 'Aa1!';
      const cred = await fb.createUserWithEmailAndPassword(authSec, email.trim(), senhaTemp);
      await fb.setDoc(fb.doc(db, 'usuarios', cred.user.uid), {
        nome, email: email.trim().toLowerCase(), ativo: true,
        validade: fb.Timestamp.fromDate(validade), criadoEm: fb.serverTimestamp(),
      });
      // a pessoa recebe um e-mail para criar a própria senha
      await fb.sendPasswordResetEmail(auth, email.trim());
      await fb.signOut(authSec);
      return cred.user.uid;
    } finally {
      fb.deleteApp(sec).catch(() => {});
    }
  },
  atualizarUsuario(uid, campos) {
    const c = { ...campos };
    if (c.validade instanceof Date) c.validade = fb.Timestamp.fromDate(c.validade);
    return fb.updateDoc(fb.doc(db, 'usuarios', uid), c);
  },
  derrubarSessao: (uid) => fb.updateDoc(fb.doc(db, 'usuarios', uid), { sessao: { id: 'revogada-' + novoId(), aparelho: 'revogada pelo administrador', em: fb.serverTimestamp() } }),
  reenviarSenha: (email) => fb.sendPasswordResetEmail(auth, email),
  async listarSolicitacoes() {
    const s = await fb.getDocs(fb.query(fb.collection(db, 'solicitacoes'), fb.orderBy('criadoEm', 'desc')));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  excluirSolicitacao: (id) => fb.deleteDoc(fb.doc(db, 'solicitacoes', id)),
};

window.Nuvem = Nuvem;
window.dispatchEvent(new Event('nuvem-pronta'));
