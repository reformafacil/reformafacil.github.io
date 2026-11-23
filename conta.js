/* Conta: login, abas de clientes e painel do administrador. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CFG = window.FIREBASE_CONFIG;
  const NUVEM = !!(CFG && CFG.apiKey && CFG.projectId);

  // ───────── armazenamento: nuvem (Firebase) ou local (sem login, para testes) ─────────
  const Local = {
    ler() { try { return JSON.parse(localStorage.getItem('rtc-clientes')) || []; } catch (e) { return []; } },
    gravar(l) { localStorage.setItem('rtc-clientes', JSON.stringify(l)); },
    async listarClientes() { return this.ler(); },
    async criarCliente(nome, documento, operacao) {
      const l = this.ler(); const id = 'c' + Date.now().toString(36);
      l.push({ id, nome, documento, operacao }); this.gravar(l); return id;
    },
    async salvarCliente(id, dados) {
      const l = this.ler(); const c = l.find((x) => x.id === id);
      if (c) Object.assign(c, dados); this.gravar(l);
    },
    async excluirCliente(id) { this.gravar(this.ler().filter((x) => x.id !== id)); },
    async lerMarca() { try { return JSON.parse(localStorage.getItem('rtc-marca')); } catch (e) { return null; } },
    async salvarMarca(m) { localStorage.setItem('rtc-marca', JSON.stringify({ nome: m.nome || '', contato: m.contato || '', logo: m.logo || '' })); },
  };
  let store = Local;

  // ───────── estado ─────────
  let clientes = [];
  let ativo = null;
  let conta = null; // { email, perfil, admin }
  let timer = null;
  let pendente = false;

  // ───────── salvamento automático ─────────
  function status(txt, tipo) {
    const el = $('#salvo'); if (!el) return;
    el.textContent = txt; el.dataset.tipo = tipo || '';
  }
  window.App.aoMudar = function (op) {
    const c = clientes.find((x) => x.id === ativo); if (!c) return;
    c.operacao = JSON.parse(JSON.stringify(op));
    pendente = true; status('Salvando…', 'pend');
    clearTimeout(timer);
    timer = setTimeout(gravarAgora, 900);
  };
  async function gravarAgora() {
    clearTimeout(timer);
    if (!pendente) return;
    const c = clientes.find((x) => x.id === ativo); if (!c) return;
    pendente = false;
    try { await store.salvarCliente(c.id, { nome: c.nome, documento: c.documento || '', operacao: c.operacao }); status(NUVEM ? 'Salvo na nuvem' : 'Salvo neste aparelho', 'ok'); }
    catch (e) { pendente = true; status('Não salvou: ' + (window.Nuvem ? Nuvem.erroAmigavel(e) : e.message), 'erro'); }
  }
  window.addEventListener('beforeunload', () => { if (pendente) gravarAgora(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) gravarAgora(); });

  // ───────── abas de clientes ─────────
  const inicial = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  function renderAbas() {
    const el = $('#barra-clientes');
    el.innerHTML = clientes.map((c) => `
      <button class="cli ${c.id === ativo ? 'on' : ''}" data-cli="${c.id}" title="${esc(c.nome)}">
        <span class="cli-av">${esc(inicial(c.nome))}</span><span class="cli-nome">${esc(c.nome)}</span>
      </button>`).join('') +
      `<button class="cli novo" id="novo-cliente" title="Novo cliente"><span class="cli-av">+</span><span class="cli-nome">Novo cliente</span></button>`;
    const c = clientes.find((x) => x.id === ativo);
    $('#cliente-info').innerHTML = c ? `<div class="linha"><div><b style="font-size:16px">${esc(c.nome)}</b>
        ${c.documento ? `<small class="dica" style="display:block;margin:0">${esc(c.documento)}</small>` : ''}</div><span class="esp"></span>
        <span id="salvo" class="salvo"></span>
        <button class="btn peq" id="pdf-cliente">Relatório PDF</button>
        <button class="btn peq" id="ren-cliente">Editar</button>
        <button class="btn del" id="del-cliente">Excluir</button></div>` : '';
  }
  async function abrirCliente(id) {
    await gravarAgora();
    ativo = id;
    localStorage.setItem('rtc-cliente-ativo', id);
    const c = clientes.find((x) => x.id === id);
    renderAbas();
    window.App.abrir(c && c.operacao);
  }
  async function novoCliente() {
    const v = await Dialogo.form({ titulo: 'Novo cliente', ok: 'Criar', campos: [
      { nome: 'nome', label: 'Nome (pessoa ou empresa)', obrigatorio: true, max: 120 },
      { nome: 'documento', label: 'CPF/CNPJ (opcional)', max: 30 }] });
    if (!v) return;
    const operacao = window.App.novaOperacao();
    try {
      const id = await store.criarCliente(v.nome.slice(0, 120), v.documento, operacao);
      clientes.push({ id, nome: v.nome.slice(0, 120), documento: v.documento, operacao });
      await abrirCliente(id);
    } catch (e) { Dialogo.aviso('Não foi possível criar: ' + (window.Nuvem ? Nuvem.erroAmigavel(e) : e.message)); }
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cli]');
    if (b) return abrirCliente(b.dataset.cli);
    if (e.target.closest('#novo-cliente')) return novoCliente();
    if (e.target.closest('#pdf-cliente')) { await gravarAgora(); return window.Relatorio && window.Relatorio.abrir(); }
    if (e.target.closest('#ren-cliente')) {
      const c = clientes.find((x) => x.id === ativo);
      const v = await Dialogo.form({ titulo: 'Editar cliente', campos: [
        { nome: 'nome', label: 'Nome (pessoa ou empresa)', valor: c.nome, obrigatorio: true, max: 120 },
        { nome: 'documento', label: 'CPF/CNPJ (opcional)', valor: c.documento || '', max: 30 }] });
      if (!v) return;
      c.nome = v.nome.slice(0, 120); c.documento = v.documento;
      pendente = true; await gravarAgora(); renderAbas();
    }
    if (e.target.closest('#del-cliente')) {
      const c = clientes.find((x) => x.id === ativo);
      if (!(await Dialogo.confirmar(`Excluir o cliente "${c.nome}" e a simulação dele? Isso não pode ser desfeito.`, { titulo: 'Excluir cliente', ok: 'Excluir', perigo: true }))) return;
      try {
        await store.excluirCliente(c.id); pendente = false;
        clientes = clientes.filter((x) => x.id !== c.id);
        if (!clientes.length) await criarPrimeiro();
        await abrirCliente(clientes[0].id);
      } catch (err) { Dialogo.aviso('Não foi possível excluir: ' + (window.Nuvem ? Nuvem.erroAmigavel(err) : err.message)); }
    }
  });
  async function criarPrimeiro() {
    const operacao = window.App.novaOperacao();
    const id = await store.criarCliente('Meu primeiro cliente', '', operacao);
    clientes.push({ id, nome: 'Meu primeiro cliente', documento: '', operacao });
  }
  async function carregarClientes() {
    status('', '');
    clientes = await store.listarClientes();
    if (!clientes.length) await criarPrimeiro();
    const guardado = localStorage.getItem('rtc-cliente-ativo');
    const id = clientes.some((c) => c.id === guardado) ? guardado : clientes[0].id;
    await abrirCliente(id);
  }

  // ───────── menu da conta ─────────
  function fmtData(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR');
  }
  function renderConta() {
    const el = { set innerHTML(h) { document.querySelectorAll('.conta-card').forEach((x) => { x.innerHTML = h; }); } };
    if (!NUVEM) {
      el.innerHTML = '<b>Modo local</b><br>Login ainda não configurado: os clientes ficam só neste aparelho. Veja CONFIGURAR-FIREBASE.md.';
      return;
    }
    if (!conta) { el.innerHTML = ''; return; }
    const p = conta.perfil || {};
    el.innerHTML = `<div class="post-cab" style="margin-bottom:10px"><div class="av">${esc(inicial(p.nome || conta.email))}</div>
      <div style="min-width:0"><b style="overflow:hidden;text-overflow:ellipsis">${esc(p.nome || conta.email)}</b><small>${esc(conta.email)}</small></div></div>
      <div class="dica" style="margin:0 0 10px">Acesso até <b>${fmtData(p.validade)}</b>${conta.admin ? ' · administrador' : ''}<br>Sessão neste aparelho: ${esc(p.sessao ? p.sessao.aparelho : '')}</div>
      <div class="linha"><button class="btn peq" id="trocar-senha">Trocar senha</button><button class="btn peq" id="sair">Sair</button></div>`;
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#sair')) { await gravarAgora(); Nuvem.sair(); }
    if (e.target.closest('#trocar-senha')) {
      const v = await Dialogo.form({ titulo: 'Trocar senha', ok: 'Trocar', campos: [
        { nome: 'atual', label: 'Senha atual', tipo: 'password', obrigatorio: true },
        { nome: 'nova', label: 'Nova senha', tipo: 'password', obrigatorio: true, min: 8 }] });
      if (!v) return;
      try { await Nuvem.trocarSenha(v.atual, v.nova); Dialogo.aviso('Senha alterada.', { titulo: 'Pronto' }); }
      catch (err) { Dialogo.aviso(Nuvem.erroAmigavel(err)); }
    }
  });

  // ───────── tela de login ─────────
  const MOTIVOS = {
    derrubado: 'Sua conta foi aberta em outro aparelho, por isso esta sessão foi encerrada. Cada conta só pode ser usada em um aparelho por vez.',
    expirado: 'Seu acesso expirou. Fale com o administrador para renovar.',
    desativado: 'Seu acesso está desativado. Fale com o administrador.',
    'sem-acesso': 'Esta conta não tem acesso liberado. Fale com o administrador.',
    erro: 'Não foi possível entrar agora. Verifique a internet e tente de novo.',
  };
  function mostrarLogin(motivo) {
    document.body.classList.add('deslogado');
    $('#login-msg').innerHTML = motivo && MOTIVOS[motivo] ? `<div class="aviso">${esc(MOTIVOS[motivo])}</div>` : '';
    $('#login-btn').disabled = false; $('#login-btn').textContent = 'Entrar';
  }
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('#login-btn'); b.disabled = true; b.textContent = 'Entrando…';
    $('#login-msg').innerHTML = '';
    try { await Nuvem.entrar($('#login-email').value, $('#login-senha').value); }
    catch (err) { $('#login-msg').innerHTML = `<div class="erro">${esc(Nuvem.erroAmigavel(err))}</div>`; b.disabled = false; b.textContent = 'Entrar'; }
  });
  $('#esqueci').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    if (!email) { $('#login-msg').innerHTML = '<div class="aviso">Digite seu e-mail acima e toque de novo em "Esqueci minha senha".</div>'; return; }
    try { await Nuvem.recuperarSenha(email); } catch (err) { /* não revela se o e-mail existe */ }
    $('#login-msg').innerHTML = '<div class="info">Se este e-mail tiver conta, você vai receber um link para criar uma nova senha.</div>';
  });

  // ───────── painel do administrador ─────────
  const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(23, 59, 59, 0); return d; };
  const paraInput = (ts) => { const d = ts && ts.toDate ? ts.toDate() : null; return d ? [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') : ''; };
  async function renderPedidos() {
    const el = $('#pedidos-lista');
    try {
      const ps = await Nuvem.listarSolicitacoes();
      $('#pedidos-conta').textContent = ps.length ? ps.length + ' pendente(s)' : '';
      const aba = document.querySelector('#abas button[data-aba="admin"] span');
      if (aba) aba.textContent = ps.length ? 'Admin (' + ps.length + ')' : 'Admin';
      el.innerHTML = ps.map((p) => `<div class="usuario" data-pedido="${p.id}">
          <div class="post-cab" style="margin:0"><div class="av">${esc(inicial(p.nome))}</div>
            <div style="min-width:0"><b>${esc(p.nome)}</b><small>${esc(p.email)}${p.telefone ? ' · ' + esc(p.telefone) : ''}</small></div>
            <span class="esp"></span><span class="tag">${esc(p.perfil || '')}</span></div>
          ${p.mensagem ? `<p style="margin:10px 0 0;white-space:pre-line">${esc(p.mensagem)}</p>` : ''}
          <div class="linha" style="margin-top:10px"><span class="dica" style="margin:0">${fmtData(p.criadoEm)}</span><span class="esp"></span>
            ${p.telefone ? `<a class="btn peq" target="_blank" rel="noopener" href="https://wa.me/55${esc(p.telefone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))}">WhatsApp</a>` : ''}
            <a class="btn peq" href="mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent('Acesso ao Reforma Fácil')}">E-mail</a>
            <button class="btn peq" data-pacao="criar">Criar conta</button>
            <button class="btn del" data-pacao="remover">Remover</button></div></div>`).join('')
        || '<p class="dica">Nenhum pedido no momento.</p>';
      el._pedidos = ps;
    } catch (e) { el.innerHTML = `<div class="erro">${esc(Nuvem.erroAmigavel(e))}</div>`; }
  }
  $('#pedidos-lista').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pacao]'); if (!b) return;
    const id = b.closest('[data-pedido]').dataset.pedido;
    const p = $('#pedidos-lista')._pedidos.find((x) => x.id === id);
    if (b.dataset.pacao === 'criar') {
      const f = $('#form-novo-usuario'); f.nome.value = p.nome; f.email.value = p.email;
      f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.dias.focus();
      $('#admin-msg').innerHTML = '<div class="info">Dados do pedido preenchidos. Escolha o período e clique em "Criar conta"; depois remova o pedido.</div>';
    }
    if (b.dataset.pacao === 'remover') {
      if (!(await Dialogo.confirmar('Remover o pedido de ' + p.nome + '?', { titulo: 'Remover pedido', ok: 'Remover', perigo: true }))) return;
      try { await Nuvem.excluirSolicitacao(id); renderPedidos(); } catch (err) { Dialogo.aviso(Nuvem.erroAmigavel(err)); }
    }
  });

  async function renderAdmin() {
    renderPedidos();
    const el = $('#admin-lista');
    el.innerHTML = '<p class="dica">Carregando…</p>';
    try {
      const us = await Nuvem.listarUsuarios();
      const agora = Date.now();
      $('#admin-conta').textContent = `${us.length} conta(s) · ${us.filter((u) => u.ativo && u.validade && u.validade.toMillis() > agora).length} com acesso ativo`;
      el.innerHTML = us.map((u) => {
        const valido = u.ativo && u.validade && u.validade.toMillis() > agora;
        return `<div class="usuario" data-uid="${u.uid}">
          <div class="post-cab" style="margin:0"><div class="av" style="${valido ? '' : 'background:var(--line);color:var(--muted)'}">${esc(inicial(u.nome || u.email))}</div>
            <div style="min-width:0"><b>${esc(u.nome || '—')}</b><small>${esc(u.email)}</small></div><span class="esp"></span>
            <span class="tag ${valido ? 'ibs' : ''}">${valido ? 'ativo' : u.ativo ? 'expirado' : 'desativado'}</span></div>
          <div class="grade" style="margin-top:10px">
            <div><label>Acesso válido até</label><input type="date" data-campo="validade" value="${paraInput(u.validade)}"></div>
            <div><label>Sessão atual</label><div class="dica" style="margin:8px 4px">${esc(u.sessao ? u.sessao.aparelho + ' · ' + fmtData(u.sessao.em) : 'nunca entrou')}</div></div>
          </div>
          <div class="linha" style="margin-top:10px">
            <button class="btn peq" data-acao="mais30">+30 dias</button>
            <button class="btn peq" data-acao="mais365">+1 ano</button>
            <button class="btn peq" data-acao="ativo">${u.ativo ? 'Desativar' : 'Reativar'}</button>
            <button class="btn peq" data-acao="derrubar">Encerrar sessão</button>
            <button class="btn peq" data-acao="senha">Reenviar e-mail de senha</button>
          </div></div>`;
      }).join('') || '<p class="dica">Nenhuma conta ainda.</p>';
      el._usuarios = us;
    } catch (e) { el.innerHTML = `<div class="erro">${esc(Nuvem.erroAmigavel(e))}</div>`; }
  }
  $('#admin-lista').addEventListener('change', async (e) => {
    const card = e.target.closest('[data-uid]'); if (!card || e.target.dataset.campo !== 'validade' || !e.target.value) return;
    try { await Nuvem.atualizarUsuario(card.dataset.uid, { validade: new Date(e.target.value + 'T23:59:59') }); renderAdmin(); }
    catch (err) { Dialogo.aviso(Nuvem.erroAmigavel(err)); }
  });
  $('#admin-lista').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const card = b.closest('[data-uid]'); const uid = card.dataset.uid;
    const u = $('#admin-lista')._usuarios.find((x) => x.uid === uid);
    const base = u.validade && u.validade.toMillis() > Date.now() ? u.validade.toDate() : new Date();
    const somar = (dias) => { const d = new Date(base); d.setDate(d.getDate() + dias); d.setHours(23, 59, 59, 0); return d; };
    try {
      if (b.dataset.acao === 'mais30') await Nuvem.atualizarUsuario(uid, { validade: somar(30), ativo: true });
      if (b.dataset.acao === 'mais365') await Nuvem.atualizarUsuario(uid, { validade: somar(365), ativo: true });
      if (b.dataset.acao === 'ativo') await Nuvem.atualizarUsuario(uid, { ativo: !u.ativo });
      if (b.dataset.acao === 'derrubar') { if (!(await Dialogo.confirmar('Encerrar a sessão de ' + u.email + '? A pessoa terá que entrar de novo.', { titulo: 'Encerrar sessão', ok: 'Encerrar', perigo: true }))) return; await Nuvem.derrubarSessao(uid); }
      if (b.dataset.acao === 'senha') { await Nuvem.reenviarSenha(u.email); Dialogo.aviso('E-mail enviado para ' + u.email, { titulo: 'Pronto' }); }
      renderAdmin();
    } catch (err) { Dialogo.aviso(Nuvem.erroAmigavel(err)); }
  });
  $('#form-novo-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const b = $('button', f);
    const dias = parseInt(f.dias.value, 10);
    b.disabled = true; b.textContent = 'Criando…';
    try {
      await Nuvem.criarUsuario({ nome: f.nome.value.trim(), email: f.email.value.trim(), validade: emDias(dias) });
      $('#admin-msg').innerHTML = `<div class="info">Conta criada. <b>${esc(f.email.value)}</b> vai receber um e-mail para criar a senha.</div>`;
      f.reset(); renderAdmin();
    } catch (err) { $('#admin-msg').innerHTML = `<div class="erro">${esc(Nuvem.erroAmigavel(err))}</div>`; }
    b.disabled = false; b.textContent = 'Criar conta';
  });
  $('#abas').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.aba === 'admin') renderAdmin(); });

  // dados para o relatório
  window.Conta = {
    clienteAtivo: () => clientes.find((x) => x.id === ativo) || null,
    usuario: () => conta,
    lerMarca: () => store.lerMarca(),
    salvarMarca: (m) => store.salvarMarca(m),
    erro: (e) => (window.Nuvem ? Nuvem.erroAmigavel(e) : e.message),
  };

  // ───────── início ─────────
  async function iniciarNuvem() {
    store = window.Nuvem;
    try {
      await Nuvem.iniciar({
        entrou: async (c) => {
          conta = c;
          document.body.classList.remove('deslogado', 'carregando');
          document.body.classList.toggle('admin', !!c.admin);
          renderConta();
          if (c.admin) renderPedidos();
          try { await carregarClientes(); } catch (e) { status('Erro ao carregar clientes: ' + Nuvem.erroAmigavel(e), 'erro'); }
        },
        saiu: (motivo) => {
          conta = null; clientes = []; ativo = null; pendente = false;
          document.body.classList.remove('admin');
          document.querySelector('#abas button[data-aba="calc"]').click();
          window.App.abrir(null);
          renderConta(); mostrarLogin(motivo);
          document.body.classList.remove('carregando');
        },
        perfilMudou: (p) => { if (conta) { conta.perfil = p; renderConta(); } },
      });
    } catch (e) {
      document.body.classList.remove('carregando');
      mostrarLogin('erro');
      console.error(e);
    }
  }

  if (NUVEM) {
    document.body.classList.add('deslogado', 'carregando');
    const ir = () => iniciarNuvem();
    if (window.Nuvem) ir(); else window.addEventListener('nuvem-pronta', ir, { once: true });
  } else {
    renderConta();
    carregarClientes();
  }
})();
