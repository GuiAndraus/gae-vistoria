# GAE Vistoria — como colocar para funcionar

## 1. Ligar ao Google Drive (uma vez só)

1. Entre em **console.cloud.google.com** com a conta do Google onde ficam as vistorias.
2. No topo, **Selecionar projeto → Novo projeto**: nome `GAE Vistoria` → Criar (e selecione o projeto criado).
3. Menu **APIs e serviços → Biblioteca** → procure **Google Drive API** → **Ativar**.
4. Menu **APIs e serviços → Tela de permissão OAuth** (ou "Google Auth Platform"):
   - Tipo de usuário **Externo**; nome do app `GAE Vistoria`; seu e-mail no suporte e no contato → Salvar.
   - Em **Público / Usuários de teste**, adicione o seu e-mail do Google.
5. Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo **Aplicativo da Web**, nome `GAE Vistoria`.
   - **Origens JavaScript autorizadas**: o endereço onde o app ficar (ex.: `https://guiandraus.github.io`).
   - Criar → copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele não é segredo.
6. O ID vai em `config.js` (`googleClientId`). Depois é só publicar de novo.

No primeiro login o Google avisa que o app "não foi verificado" (é normal para app de uso próprio): toque em
**Continuar**. O app só tem acesso aos arquivos que ele mesmo cria no seu Drive.

## 2. Instalar no iPhone

Abra o endereço do app no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**. Abra pelo ícone
"GAE Vistoria" (permita câmera e microfone quando pedir).

## 3. Na vistoria

- **📷 Foto + nota**: tira a foto pelo celular e grava a nota (legenda).
- **🎙 Só nota**: depois de fotografar com a câmera fotográfica; a nota é ligada à foto pelo horário.
- Usando a câmera: no começo, **⋯ → Acertar relógio da câmera**, fotografe a tela com a câmera e toque em
  **Fotografei**.
- Tudo fica no celular e vai para `Meu Drive\GAE Vistorias\<CÓDIGO>_<data>` quando houver internet (no computador:
  `H:\Meu Drive\GAE Vistorias`).

## Publicar uma versão nova
Ao mudar qualquer arquivo, aumente `VERSAO` em `sw.js` (senão o celular continua com a versão guardada).
