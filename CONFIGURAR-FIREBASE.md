# Configurar o login (Firebase)

O plano gratuito do Firebase (Spark) basta para começar: até 50 mil leituras e 20 mil gravações por dia, sem cartão de crédito.
Tempo estimado: 15 minutos.

## 1. Criar o projeto
1. Acesse <https://console.firebase.google.com> com sua conta Google e clique em **Criar projeto**.
2. Nome: `reforma-facil`. O Google Analytics pode ser desativado.

## 2. Ativar o login por e-mail e senha
1. Menu **Criação → Authentication → Vamos começar**.
2. Aba **Método de login → E-mail/senha → Ativar → Salvar**.
3. Aba **Configurações → Domínios autorizados → Adicionar domínio**: `joaovcbarcelos.github.io`.
4. (Opcional) Aba **Modelos** → ícone de idioma → **Português (Brasil)**, para os e-mails de senha saírem em português.

## 3. Criar o banco de dados
1. Menu **Criação → Firestore Database → Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**. Modo: **produção**.
3. Aba **Regras**: apague o conteúdo, cole todo o arquivo [`firestore.rules`](firestore.rules) e clique em **Publicar**.

## 4. Pegar a configuração do app
1. Engrenagem ⚙ → **Configurações do projeto** → em "Seus apps", clique no ícone **`</>`** (Web).
2. Apelido: `reforma-facil-web` (não marque Firebase Hosting) → **Registrar app**.
3. Copie o bloco `firebaseConfig` (apiKey, authDomain, projectId…) e cole em `firebase-config.js`:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" };
   ```
   Esses valores **não são secretos**: ficam visíveis em qualquer app web. Quem protege os dados são as regras do passo 3.

## 5. Tornar-se administrador
1. **Authentication → Usuários → Adicionar usuário**: seu e-mail e uma senha.
2. Copie o **UID** que aparece na lista.
3. **Firestore Database → Dados → Iniciar coleção**: ID da coleção `admins` → ID do documento: **cole o UID** →
   campo `nome` (string) com seu nome → **Salvar**.
4. Entre no app com esse e-mail: aparece a aba **Admin**, onde você cria as contas dos clientes pagantes.

## Como funciona
- **Contas:** só o administrador cria. A pessoa recebe um e-mail do Firebase para definir a senha.
  Contas criadas por fora (sem documento em `usuarios`) não acessam nada.
- **Validade:** cada conta tem data de validade. Ao vencer, a pessoa é desconectada na hora; renove com "+30 dias" ou "+1 ano".
- **Uma sessão por vez:** entrar em outro aparelho derruba o anterior na hora. As regras do servidor também
  recusam gravações vindas de um aparelho derrubado. "Encerrar sessão", no painel, derruba a pessoa remotamente.
- **Clientes (abas):** cada usuário cria quantos clientes quiser. Cada um guarda a própria simulação na nuvem, visível só para o dono.
  O administrador **não** vê os clientes dos usuários.
- **Sem internet:** quem já entrou continua usando com os dados guardados no aparelho, e as mudanças sobem quando a conexão volta.
  Um aparelho que ficou offline só percebe que foi derrubado quando reconecta.
