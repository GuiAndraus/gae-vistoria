# GAE Vistoria — Contexto do projeto

App de celular (app web instalável, PWA) para a vistoria: **foto pelo celular + nota falada** ou **só a nota** (foto
tirada na câmera fotográfica, ligada pelo horário). Envia para o Google Drive; o **Gerador de Laudos**
(`..\GaeFotosLaudo`) importa as fotos com as notas. Pedido do usuário em 05/11/2026.

## Decisões
- **App web** (HTML/CSS/JS puro, sem build, sem bibliotecas), instalado pelo "Adicionar à Tela de Início": sem loja,
  sem conta de desenvolvedor da Apple, sem Mac. O usuário usa iPhone (fotos HEIC).
- **Fotos e notas ficam no celular** (IndexedDB) até irem para o Drive; funciona sem internet e envia quando houver
  sinal (`enviarSePuder`: ao salvar, ao voltar ao app, ao reconectar). `navigator.storage.persist()`.
- **Nota = legenda da foto** (decisão do usuário): no Gerador, sem IA vira a legenda direto; com IA é a base para
  legenda e observação. Uma nota por foto; "legenda: … observação: …" falado pode ser separado depois no Gerador.
- **Transcrição** pelo reconhecimento de voz do navegador (`webkitSpeechRecognition`, pt-BR, reinicia após silêncio);
  se não houver, o microfone do teclado do iPhone. **Áudio** gravado junto (MediaRecorder, `audio/mp4` no iPhone);
  dá para desligar no menu ("Guardar também o áudio"). Ainda não testado num iPhone de verdade.
- **Câmera externa**: "Só nota" guarda a hora do toque; o Gerador liga a nota à **última foto da câmera antes dela**.
  "Acertar relógio da câmera" (menu) mostra um relógio grande para fotografar com a câmera; o toque em "Fotografei"
  vira um item `relogio` para o Gerador achar essa foto e calcular a diferença de horário.
- **Google Drive**: login pelo Google Identity Services (token de 1 h, escopo **`drive.file`**: o app só enxerga o que
  ele mesmo criou). Pasta `GAE Vistorias/<CÓDIGO>_<aaaa-mm-dd>` no Meu Drive → no computador
  `H:\Meu Drive\GAE Vistorias\...` (Google Drive para computador, letra H:). Envio "resumable" (fotos grandes).
  Exclusões no celular vão para a lixeira do Drive no próximo envio (`vistoria.exclusoes`).
- Sem Google configurado (`config.js` vazio): "Compartilhar arquivos" (menu) manda tudo pelo menu do celular.

## Arquivos de cada vistoria (contrato com o Gerador de Laudos)
```
CEL_20261105_143012.jpg    foto tirada pelo app
NOTA_20261105_143012.json  { app, versao: 1, vistoria, tipo: "foto"|"nota"|"relogio", hora: "2026-11-05T14:30:12-03:00",
                             texto, foto: "CEL_...jpg"|null, audio: "NOTA_...m4a"|null }
NOTA_20261105_143012.m4a   áudio da nota (opcional; .webm no Android)
```
Nome = data e hora local (`_2`, `_3`… se repetir no mesmo segundo). JSON reenviado (mesmo arquivo no Drive) quando a
nota é editada.

## Estrutura
```
index.html        telas: lista de vistorias, vistoria, relógio; diálogos: nota, nova vistoria, menu
estilo.css        cores GAE (marinho #012956, laranja #EF7E46), feito para celular (safe-area do iPhone)
app.js            tudo: banco no celular, telas, gravação/ditado, Google Drive, compartilhar
config.js         ID do cliente OAuth do Google e nome da pasta raiz
sw.js             guarda o app para abrir sem internet — **aumentar VERSAO a cada publicação**
manifest.webmanifest, icones/
```

## Teste
`python tools\teste_app.py <pasta do app> <pasta de saída>` (Playwright + Chrome instalado, tela 390×844; servidor
local em 127.0.0.1:8123): cria vistoria, foto + nota, só nota, relógio, edição, recarrega e confere os itens; grava
capturas de tela e `resultado.json`. Passou em 05/11/2026 sem erros de console. Falta testar no iPhone (câmera, ditado,
áudio) e o envio ao Drive (depende do ID do cliente).

## Pendências
- Hospedagem com HTTPS (câmera e microfone exigem) — a decidir com o usuário (GitHub Pages ou Hostinger).
- Projeto no Google Cloud + ID do cliente OAuth (passo a passo no LEIAME.md) → `config.js`.
- Etapa 2, no Gerador de Laudos: importar a pasta da vistoria, ligar notas às fotos pelo horário (com acerto do
  relógio da câmera), mostrar a nota na Organização (sai junto com a foto "fora do laudo"), usar como legenda ou como
  notas da IA na Descrição.

## Preferências do usuário
- Respostas técnicas diretas e concisas, em português. Entregas por etapas.
