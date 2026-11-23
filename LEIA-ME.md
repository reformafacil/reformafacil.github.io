# Calculadora da Reforma Tributária (CBS · IBS · IS)

Site: <https://joaovcbarcelos.github.io/reforma-facil/>

- `index.html`: página inicial (apresentação, demonstração grátis e pedido de acesso)
- `app.html`: a calculadora, com login

## Login e contas
O app exige login (Firebase). Cada pessoa tem uma conta individual, criada por você na aba **Admin**,
com validade de acesso. Cada conta só funciona em um aparelho por vez: entrar em outro derruba o anterior.
Dentro do app, cada usuário cria abas de **clientes**, e cada uma guarda a sua própria simulação na nuvem.
Configuração e funcionamento: [CONFIGURAR-FIREBASE.md](CONFIGURAR-FIREBASE.md). Projeto Firebase: `reforma-facil-60df7`.

## Abas
- **Calcular**: escolha a data, o CST e a cClassTrib de cada item, digite a base de cálculo e veja CBS, IBS e IS,
  com explicação em linguagem simples e o passo a passo com as fórmulas oficiais.
- **Entenda a reforma**: o que muda, linha do tempo e o significado de CST, cClassTrib, NCM/NBS.
- **Consultar classificações**: busca nas 170 classificações vigentes, com o percentual de redução de cada uma.

## Arquivos
- `index.html` + `inicio.js`: página inicial
- `app.html`, `app.js`, `conta.js`, `nuvem.js`: a calculadora, o login e o painel do administrador
- `motor.js`: motor de cálculo (mesmas fórmulas e arredondamentos da calculadora da Receita)
- `dados.js`: tabelas extraídas do banco oficial (versão V0073)
- `ferramentas/`: script para atualizar `dados.js` e testes do motor

## Atualizar os dados quando a Receita publicar uma nova versão
1. Gere o banco do projeto oficial (`calculadora-pro.db`), como explica o README da Receita.
2. `python3 ferramentas/extrair.py caminho/calculadora-pro.db dados.js`
3. Teste: `jsc -e "var window=this;" dados.js motor.js ferramentas/testes.js`
   (`jsc` fica em /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/)

Uso educativo, sem valor fiscal. Confirme os valores antes de emitir documentos.

## App para celular (PWA)
O app já é um PWA: tem manifesto (`manifest.webmanifest`), ícones (`icones/`) e funciona offline (`sw.js`).
Para instalar no celular, a pasta precisa estar publicada num endereço **https** (ex.: GitHub Pages, Netlify ou Cloudflare Pages):
- **Android (Chrome):** abra o endereço → menu ⋮ → "Instalar app".
- **iPhone (Safari):** abra o endereço → Compartilhar → "Adicionar à Tela de Início".

Ao mudar algum arquivo, troque `VERSAO` em `sw.js` (ex.: `reforma-facil-v2`) para os aparelhos baixarem a versão nova.
Para refazer os ícones: `python3 ferramentas/gerar_icones.py icones`.

## Próximo passo: Play Store / App Store
- **Android:** com o PWA publicado em https, um empacotador (plugin Pwa2play, Bubblewrap ou PWABuilder) gera o pacote `.aab` assinado.
  Ele também gera um arquivo `.well-known/assetlinks.json`, que precisa ser publicado no mesmo site. Conta Google Play: US$ 25 (uma vez).
- **iOS:** precisa do Xcode e de um empacotador como o Capacitor. Conta Apple Developer: US$ 99/ano.

## Créditos
As tabelas de `dados.js` e as regras do motor vêm do projeto
[calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular),
© 2026 Receita Federal do Brasil, licença MIT (texto em `LICENCA-CALCULADORA-RECEITA.txt`).
