// GAE Vistoria — fotos e notas faladas da vistoria, guardadas no celular e enviadas para o Google Drive.
// O Gerador de Laudos lê a pasta de cada vistoria (H:\Meu Drive\GAE Vistorias\<CÓDIGO>_<data>):
//   CEL_<data_hora>.jpg   foto tirada pelo app
//   NOTA_<data_hora>.json { tipo: foto|nota|relogio, hora, texto, foto, audio } — "nota" = foto tirada na câmera,
//                         ligada pelo horário; "relogio" = momento em que a tela do relógio foi fotografada
//   NOTA_<data_hora>.m4a  áudio da nota (opcional)
"use strict";

const VERSAO_APP = "1.0.2";
const CFG = window.GAE_CONFIG || {};
const $ = s => document.querySelector(s);

// =====================================================================
// Utilidades
// =====================================================================

const p2 = n => String(n).padStart(2, "0");

/** 2026-11-05T14:30:12-03:00 (hora local com o fuso, como o Gerador compara com o EXIF das fotos). */
function isoLocal(d) {
  const off = -d.getTimezoneOffset(), a = Math.abs(off);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` +
         `${off >= 0 ? "+" : "-"}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}
const carimbo = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const horaCurta = iso => iso.slice(11, 19);
const dataCurta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const escapar = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function extensao(tipo, padrao) {
  if (!tipo) return padrao;
  if (tipo.includes("jpeg")) return "jpg";
  if (tipo.includes("png")) return "png";
  if (tipo.includes("heic")) return "heic";
  if (tipo.includes("mp4") || tipo.includes("m4a") || tipo.includes("aac")) return "m4a";
  if (tipo.includes("webm")) return "webm";
  if (tipo.includes("ogg")) return "ogg";
  return padrao;
}

let timerAviso;
function aviso(texto, ms = 3500) {
  const a = $("#aviso");
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (a.hidden = true), ms);
}

// =====================================================================
// Banco no celular (IndexedDB): vistorias e itens (foto/nota/relógio)
// =====================================================================

let db;
function abrirDb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open("gae-vistoria", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("vistorias", { keyPath: "id" });
      d.createObjectStore("itens", { keyPath: "id" }).createIndex("vistoria", "vistoriaId");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
function req(store, modo, fn) {
  return new Promise((ok, erro) => {
    const t = db.transaction(store, modo);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => erro(t.error);
  });
}
const gravar = (store, obj) => req(store, "readwrite", s => s.put(obj));
const ler = (store, id) => req(store, "readonly", s => s.get(id));
const apagar = (store, id) => req(store, "readwrite", s => s.delete(id));
const todos = store => req(store, "readonly", s => s.getAll());
const itensDa = vid => req("itens", "readonly", s => s.index("vistoria").getAll(vid));

/** Lê o item de novo, aplica a mudança e grava (evita sobrescrever o que foi editado durante um envio). */
async function mudarItem(id, fn) {
  const it = await ler("itens", id);
  if (!it) return null;
  fn(it);
  await gravar("itens", it);
  return it;
}

const temPendencia = it =>
  (it.foto && !it.drive.foto) || (it.audio && !it.drive.audio) || !it.drive.nota || it.notaAlterada;

// =====================================================================
// Telas
// =====================================================================

let vistoria = null;          // vistoria aberta
let urls = [];                // miniaturas (object URLs) da tela atual

function mostrar(id) {
  for (const t of document.querySelectorAll(".tela")) t.hidden = t.id !== id;
  window.scrollTo(0, 0);
}

async function mostrarLista() {
  vistoria = null;
  mostrar("telaLista");
  const vs = (await todos("vistorias")).sort((a, b) => b.criada.localeCompare(a.criada));
  const cont = $("#listaVistorias");
  if (!vs.length) {
    cont.innerHTML = `<div class="vazio-lista">Nenhuma vistoria ainda.</div>`;
  } else {
    const linhas = [];
    for (const v of vs) {
      const its = await itensDa(v.id);
      const fotos = its.filter(i => i.foto).length, notas = its.filter(i => i.tipo !== "relogio").length;
      const pend = its.filter(temPendencia).length + (v.exclusoes?.length ? 1 : 0);
      linhas.push(`<div class="cartao" data-id="${v.id}">
        <div class="info"><div class="nome">${escapar(v.codigo)}${v.descricao ? " · " + escapar(v.descricao) : ""}</div>
        <div class="sub">${dataCurta(v.criada)} · ${notas} nota(s), ${fotos} foto(s) do celular
          ${pend ? `<span class="estado pendente">· ${pend} aguardando envio</span>` : its.length ? `<span class="estado ok">· enviado ✓</span>` : ""}</div></div>
        <div>›</div></div>`);
    }
    cont.innerHTML = linhas.join("");
  }
  atualizarBotaoGoogle();
}

async function abrirVistoria(id) {
  vistoria = await ler("vistorias", id);
  if (!vistoria) return mostrarLista();
  $("#tituloVistoria").textContent = vistoria.codigo + (vistoria.descricao ? " · " + vistoria.descricao : "");
  mostrar("telaVistoria");
  await desenharItens();
}

async function desenharItens() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  const its = (await itensDa(vistoria.id)).sort((a, b) => b.hora.localeCompare(a.hora));
  const cont = $("#listaItens");
  if (!its.length) {
    cont.innerHTML = `<div class="vazio-lista">Toque em <b>Foto + nota</b> para fotografar pelo celular,
      ou em <b>Só nota</b> depois de fotografar com a câmera.</div>`;
  } else {
    cont.innerHTML = its.map(it => {
      let figura;
      if (it.mini) {
        const u = URL.createObjectURL(it.mini);
        urls.push(u);
        figura = `<img class="miniatura" src="${u}" alt="">`;
      } else {
        figura = `<div class="icone">${it.tipo === "relogio" ? "🕒" : "🎙"}</div>`;
      }
      const titulo = it.tipo === "foto" ? "Foto do celular" : it.tipo === "relogio" ? "Relógio da câmera" : "Nota (foto na câmera)";
      const estado = temPendencia(it) ? `<span class="estado pendente">⏳</span>` : `<span class="estado ok">☁✓</span>`;
      const texto = it.tipo === "relogio" ? "" :
        it.texto ? `<div class="texto">${escapar(it.texto)}</div>` : `<div class="texto vazio">sem nota</div>`;
      return `<div class="cartao item" data-id="${it.id}">${figura}
        <div class="info"><div class="sub">${horaCurta(it.hora)} · ${titulo}${estado}${it.audio ? " · 🔊" : ""}</div>${texto}</div></div>`;
    }).join("");
  }
  atualizarFaixa(its);
}

async function atualizarFaixa(its) {
  if (!vistoria) return;
  its ??= await itensDa(vistoria.id);
  const pend = its.filter(temPendencia).length;
  const f = $("#faixaEnvio");
  if (!pend && !vistoria.exclusoes?.length) { f.innerHTML = ""; return; }
  if (!CFG.googleClientId) {
    f.innerHTML = `<span>${pend} item(ns) só no celular. Envio para o Drive não configurado: use ⋯ › Compartilhar.</span>`;
  } else if (enviando) {
    f.innerHTML = `<span>Enviando para o Drive…</span>`;
  } else if (!conectado()) {
    f.innerHTML = `<span>${pend} item(ns) aguardando envio.</span><button id="fxEntrar">Entrar no Google</button>`;
    $("#fxEntrar").onclick = () => entrarGoogle().then(() => enviar(true)).catch(e => aviso(e.message));
  } else {
    f.innerHTML = `<span>${pend} item(ns) aguardando envio${navigator.onLine ? "" : " (sem internet)"}.</span><button id="fxEnviar">Enviar</button>`;
    $("#fxEnviar").onclick = () => enviar(true);
  }
}

// =====================================================================
// Nova vistoria
// =====================================================================

function abrirNova() {
  $("#novaCodigo").value = "";
  $("#novaDescricao").value = "";
  $("#novaErro").textContent = "";
  $("#dlgNova").showModal();
  setTimeout(() => $("#novaCodigo").focus(), 50);
}

async function criarNova() {
  const codigo = $("#novaCodigo").value.trim().toUpperCase().replace(/[\\/:*?"<>|\s]+/g, "-");
  if (!codigo) { $("#novaErro").textContent = "Informe o código do cliente."; return; }
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${p2(agora.getMonth() + 1)}-${p2(agora.getDate())}`;
  const existentes = new Set((await todos("vistorias")).map(v => v.pasta));
  let pasta = `${codigo}_${hoje}`;
  for (let n = 2; existentes.has(pasta); n++) pasta = `${codigo}_${hoje}_${n}`;
  const v = {
    id: "v" + agora.getTime(), codigo, descricao: $("#novaDescricao").value.trim(),
    criada: isoLocal(agora), pasta, pastaId: null, exclusoes: []
  };
  await gravar("vistorias", v);
  $("#dlgNova").close();
  abrirVistoria(v.id);
}

// =====================================================================
// Itens: foto pelo celular, só nota, relógio
// =====================================================================

async function idLivre(d) {
  const base = carimbo(d);
  let id = base;
  for (let n = 2; await ler("itens", vistoria.id + "/" + id); n++) id = `${base}-${n}`;
  return id;
}

function novoItem(tipo, d, id) {
  return {
    id: vistoria.id + "/" + id, nome: id, vistoriaId: vistoria.id, tipo, hora: isoLocal(d),
    texto: "", foto: null, fotoNome: null, mini: null, audio: null, audioNome: null,
    drive: { foto: null, audio: null, nota: null }, notaAlterada: false
  };
}

/** Miniatura de ~200 px para a lista (a foto inteira fica guardada à parte). */
function miniatura(blob) {
  return new Promise(ok => {
    const img = new Image(), u = URL.createObjectURL(blob);
    img.onload = () => {
      const lado = 200, k = lado / Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      c.getContext("2d").drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
      URL.revokeObjectURL(u);
      c.toBlob(b => ok(b), "image/jpeg", 0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(u); ok(null); };
    img.src = u;
  });
}

async function fotoEscolhida(arquivo) {
  if (!arquivo) return;
  // a câmera do celular grava a hora da foto no arquivo; se não parecer recente, usa a hora de agora
  const agora = Date.now();
  const d = new Date(arquivo.lastModified && arquivo.lastModified > agora - 15 * 60000 && arquivo.lastModified < agora + 60000
                     ? arquivo.lastModified : agora);
  const id = await idLivre(d);
  const it = novoItem("foto", d, id);
  it.foto = arquivo;
  it.fotoNome = `CEL_${id}.${extensao(arquivo.type, "jpg")}`;
  it.mini = await miniatura(arquivo);
  await gravar("itens", it);         // já fica guardada, mesmo se a nota não for gravada
  await desenharItens();
  abrirNota(it);
}

async function soNota() {
  const d = new Date();                // hora do toque: a foto da câmera foi tirada logo antes
  const it = novoItem("nota", d, await idLivre(d));
  abrirNota(it, true);
}

let timerRelogio;
function abrirRelogio() {
  $("#dlgMenu").close();
  mostrar("telaRelogio");
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const tique = () => {
    const d = new Date();
    $("#relogioHora").textContent = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    $("#relogioData").textContent = `${dias[d.getDay()]}, ${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  tique();
  timerRelogio = setInterval(tique, 200);
}
function fecharRelogio() {
  clearInterval(timerRelogio);
  mostrar("telaVistoria");
}
async function fotografei() {
  const d = new Date();
  const it = novoItem("relogio", d, await idLivre(d));
  it.texto = "Relógio da câmera";
  await gravar("itens", it);
  fecharRelogio();
  await desenharItens();
  aviso("Anotado. O Gerador usa essa foto para acertar o horário da câmera.");
  enviarSePuder();
}

// =====================================================================
// Nota: texto (ditado) + áudio
// =====================================================================

let notaAtual = null;         // { item, nova, audioNovo }
let gravacao = null;

const guardarAudio = () => localStorage.getItem("gaeGuardarAudio") !== "nao";

function abrirNota(item, nova = false) {
  notaAtual = { item, nova, audioNovo: null };
  const img = $("#notaFoto");
  if (img.src) URL.revokeObjectURL(img.src);
  if (item.foto) { img.src = URL.createObjectURL(item.foto); img.hidden = false; }
  else { img.removeAttribute("src"); img.hidden = true; }
  $("#notaTipo").textContent = item.tipo === "foto" ? "Foto do celular" : item.tipo === "relogio" ? "Relógio da câmera" : "Nota da foto tirada na câmera";
  $("#notaHora").textContent = horaCurta(item.hora);
  $("#notaTexto").value = item.texto || "";
  $("#notaStatus").textContent = "";
  mostrarAudio(item.audio);
  $("#btExcluir").hidden = nova;
  $("#btGravar").hidden = item.tipo === "relogio";
  $("#dlgNota").showModal();
}

function mostrarAudio(blob) {
  const a = $("#notaAudio");
  if (a.src) URL.revokeObjectURL(a.src);
  if (blob) { a.src = URL.createObjectURL(blob); a.hidden = false; }
  else { a.removeAttribute("src"); a.hidden = true; }
}

async function alternarGravacao() {
  if (gravacao) return pararGravacao();
  const txt = $("#notaTexto"), status = $("#notaStatus"), bt = $("#btGravar");
  gravacao = { ativo: true, base: txt.value.trim(), pedacos: [], rec: null, stream: null, reconhecimento: null };
  const g = gravacao;
  bt.textContent = "■ Parar";
  bt.classList.add("gravando");
  status.textContent = "Gravando… fale a legenda da foto.";

  if (guardarAudio() && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
    try {
      g.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(t => MediaRecorder.isTypeSupported?.(t));
      g.rec = new MediaRecorder(g.stream, tipo ? { mimeType: tipo } : undefined);
      g.rec.ondataavailable = e => e.data.size && g.pedacos.push(e.data);
      g.rec.start();
    } catch (e) {
      status.textContent = "Áudio não gravado (" + e.message + "); a transcrição continua.";
    }
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    status.textContent = "Este navegador não transcreve sozinho: ao parar, toque no texto e use o microfone do teclado.";
    return;
  }
  const r = new SR();
  r.lang = "pt-BR";
  r.continuous = true;
  r.interimResults = true;
  r.onresult = ev => {
    let t = "";
    for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
    txt.value = (g.base ? g.base + " " : "") + t.trim();
  };
  r.onerror = ev => {
    if (ev.error === "no-speech" || ev.error === "aborted") return;
    status.textContent = `Transcrição indisponível (${ev.error}): ao parar, use o microfone do teclado.` +
                         (g.rec ? " O áudio está sendo gravado." : "");
  };
  // o reconhecimento para sozinho depois de um silêncio: continua enquanto o botão estiver em "Parar"
  r.onend = () => {
    g.base = txt.value.trim();
    if (g.ativo) try { r.start(); } catch { /* já parado */ }
  };
  g.reconhecimento = r;
  try { r.start(); } catch (e) { status.textContent = "Transcrição indisponível: " + e.message; }
}

function pararGravacao() {
  const g = gravacao;
  if (!g) return Promise.resolve();
  gravacao = null;
  g.ativo = false;
  const bt = $("#btGravar");
  bt.textContent = "🎙 Gravar";
  bt.classList.remove("gravando");
  try { g.reconhecimento?.stop(); } catch { /* ok */ }
  $("#notaStatus").textContent = "";
  if (!g.rec) return Promise.resolve();
  return new Promise(ok => {
    g.rec.onstop = () => {
      g.stream.getTracks().forEach(t => t.stop());
      if (g.pedacos.length && notaAtual) {
        notaAtual.audioNovo = new Blob(g.pedacos, { type: g.rec.mimeType || "audio/mp4" });
        mostrarAudio(notaAtual.audioNovo);
      }
      ok();
    };
    g.rec.stop();
  });
}

async function salvarNota() {
  await pararGravacao();
  const { item, nova, audioNovo } = notaAtual;
  const texto = $("#notaTexto").value.trim();
  const atual = nova ? item : await ler("itens", item.id);
  if (!atual) { $("#dlgNota").close(); return; }
  const exclusoes = [];
  if (atual.texto !== texto) { atual.texto = texto; atual.notaAlterada = !!atual.drive.nota; }
  if (audioNovo) {
    if (atual.drive.audio) exclusoes.push(atual.drive.audio);     // áudio novo substitui o enviado
    atual.audio = audioNovo;
    atual.audioNome = `NOTA_${atual.nome}.${extensao(audioNovo.type, "m4a")}`;
    atual.drive.audio = null;
    atual.notaAlterada = !!atual.drive.nota;
  }
  await gravar("itens", atual);
  if (exclusoes.length) await guardarExclusoes(exclusoes);
  $("#dlgNota").close();
  await desenharItens();
  enviarSePuder();
}

async function cancelarNota() {
  await pararGravacao();
  $("#dlgNota").close();
}

async function excluirItem() {
  const { item } = notaAtual;
  if (!confirm("Excluir este item" + (item.foto ? " (a foto também)" : "") + "?")) return;
  await pararGravacao();
  const atual = await ler("itens", item.id);
  if (atual) {
    await guardarExclusoes(Object.values(atual.drive).filter(Boolean));
    await apagar("itens", atual.id);
  }
  $("#dlgNota").close();
  await desenharItens();
  enviarSePuder();
}

/** Arquivos já enviados que devem ir para a lixeira do Drive no próximo envio. */
async function guardarExclusoes(ids) {
  if (!ids.length) return;
  const v = await ler("vistorias", vistoria.id);
  v.exclusoes = [...(v.exclusoes || []), ...ids];
  await gravar("vistorias", v);
  vistoria = v;
}

// =====================================================================
// Google Drive (só os arquivos criados pelo próprio app: escopo drive.file)
// =====================================================================

let token = null, tokenExpira = 0, enviando = false;
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

try {
  const t = JSON.parse(localStorage.getItem("gaeToken") || "null");
  if (t && t.expira > Date.now()) { token = t.token; tokenExpira = t.expira; }
} catch { /* sem token guardado */ }

const conectado = () => !!token && Date.now() < tokenExpira - 60000;

function carregarGoogle() {
  if (!CFG.googleClientId || window.google?.accounts?.oauth2 || !navigator.onLine) return Promise.resolve();
  return new Promise(ok => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = s.onerror = () => ok();
    document.head.appendChild(s);
  });
}

/** Precisa vir de um toque (o Google abre a janela de login). O acesso vale 1 hora. */
function entrarGoogle() {
  if (!CFG.googleClientId) return Promise.reject(new Error("Envio para o Drive ainda não configurado (config.js)."));
  if (!window.google?.accounts?.oauth2) {
    carregarGoogle().then(atualizarBotaoGoogle);
    return Promise.reject(new Error(navigator.onLine ? "Carregando o Google… toque de novo." : "Sem internet."));
  }
  return new Promise((ok, erro) => {
    const cliente = google.accounts.oauth2.initTokenClient({
      client_id: CFG.googleClientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: r => {
        if (r.error) return erro(new Error("Login no Google: " + r.error));
        token = r.access_token;
        tokenExpira = Date.now() + r.expires_in * 1000;
        localStorage.setItem("gaeToken", JSON.stringify({ token, expira: tokenExpira }));
        localStorage.setItem("gaeGoogleOk", "1");
        atualizarBotaoGoogle();
        ok();
      },
      error_callback: e => erro(new Error("Login no Google cancelado (" + (e?.type || "erro") + ")."))
    });
    cliente.requestAccessToken({ prompt: localStorage.getItem("gaeGoogleOk") ? "" : "consent" });
  });
}

function atualizarBotaoGoogle() {
  const b = $("#btGoogle");
  b.hidden = !CFG.googleClientId;
  b.textContent = conectado() ? "Google ✓" : "Entrar no Google";
}

async function api(url, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { Authorization: "Bearer " + token, ...(opcoes.headers || {}) } });
  if (r.status === 401) {
    token = null;
    localStorage.removeItem("gaeToken");
    throw new Error("O acesso ao Google expirou: toque em Entrar no Google.");
  }
  if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function pastaDrive(nome, pai) {
  const q = `name='${nome.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' ` +
            `and trashed=false and '${pai}' in parents`;
  const achou = await (await api(`${API}?fields=files(id)&q=${encodeURIComponent(q)}`)).json();
  if (achou.files.length) return achou.files[0].id;
  const nova = await api(`${API}?fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [pai] })
  });
  return (await nova.json()).id;
}

/** Envio em 2 passos (resumable): aceita fotos grandes. Com idExistente, troca o conteúdo do arquivo. */
async function subir(nome, blob, pai, idExistente) {
  const inicio = await api(idExistente ? `${UPLOAD}/${idExistente}?uploadType=resumable` : `${UPLOAD}?uploadType=resumable`, {
    method: idExistente ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": blob.type || "application/octet-stream" },
    body: JSON.stringify(idExistente ? {} : { name: nome, parents: [pai] })
  });
  const destino = inicio.headers.get("Location");
  if (!destino) throw new Error("O Drive não devolveu o endereço de envio.");
  const r = await fetch(destino, { method: "PUT", body: blob });
  if (!r.ok) throw new Error(`Drive ${r.status} ao enviar ${nome}`);
  return (await r.json()).id;
}

function jsonNota(it, v) {
  const dados = {
    app: "GAE Vistoria", versao: 1, vistoria: v.codigo, tipo: it.tipo, hora: it.hora,
    texto: it.texto || "", foto: it.fotoNome, audio: it.audioNome
  };
  return new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
}

function enviarSePuder() {
  if (CFG.googleClientId && conectado() && navigator.onLine) enviar(false);
  else atualizarFaixa();
}

async function enviar(manual) {
  if (enviando) return;
  const falha = !CFG.googleClientId ? "Envio para o Drive ainda não configurado: use ⋯ › Compartilhar."
              : !navigator.onLine ? "Sem internet: os itens ficam no celular e vão quando houver sinal."
              : !conectado() ? "Toque em Entrar no Google para enviar." : null;
  if (falha) { if (manual) aviso(falha); atualizarFaixa(); return; }

  enviando = true;
  atualizarFaixa();
  let enviados = 0;
  try {
    const raiz = await pastaDrive(CFG.pastaRaiz || "GAE Vistorias", "root");
    for (const v0 of await todos("vistorias")) {
      let v = v0;
      const pend = (await itensDa(v.id)).filter(temPendencia);
      if (!pend.length && !v.exclusoes?.length) continue;
      if (!v.pastaId) {
        v.pastaId = await pastaDrive(v.pasta, raiz);
        await gravar("vistorias", v);
      }
      for (const id of v.exclusoes || []) {
        try { await api(`${API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }); }
        catch (e) { if (!/ 404/.test(e.message)) throw e; }
      }
      v = await ler("vistorias", v.id);
      v.exclusoes = [];
      await gravar("vistorias", v);

      for (const p of pend) {
        let it = await ler("itens", p.id);
        if (!it) continue;
        if (it.foto && !it.drive.foto) {
          const id = await subir(it.fotoNome, it.foto, v.pastaId);
          it = await mudarItem(it.id, x => (x.drive.foto = id));
        }
        if (it?.audio && !it.drive.audio) {
          const id = await subir(it.audioNome, it.audio, v.pastaId);
          it = await mudarItem(it.id, x => (x.drive.audio = id));
        }
        if (!it) continue;
        const texto = it.texto, nomeAudio = it.audioNome;
        const id = await subir(`NOTA_${it.nome}.json`, jsonNota(it, v), v.pastaId, it.drive.nota);
        await mudarItem(it.id, x => {
          x.drive.nota = id;
          if (x.texto === texto && x.audioNome === nomeAudio) x.notaAlterada = false;   // mudou durante o envio: vai de novo
        });
        enviados++;
        if (vistoria?.id === v.id) await desenharItens();
      }
    }
    if (manual || enviados) aviso(enviados ? `${enviados} item(ns) enviado(s) para o Drive.` : "Nada para enviar.");
  } catch (e) {
    aviso("Envio interrompido: " + e.message, 6000);
  } finally {
    enviando = false;
    atualizarBotaoGoogle();
    if (vistoria) { vistoria = await ler("vistorias", vistoria.id); await desenharItens(); }
    else if (!$("#telaLista").hidden) mostrarLista();
  }
}

// =====================================================================
// Compartilhar (sem Google): manda os arquivos da vistoria pelo menu do celular
// =====================================================================

async function compartilhar() {
  $("#dlgMenu").close();
  const arquivos = [];
  for (const it of await itensDa(vistoria.id)) {
    if (it.foto) arquivos.push(new File([it.foto], it.fotoNome, { type: it.foto.type || "image/jpeg" }));
    if (it.audio) arquivos.push(new File([it.audio], it.audioNome, { type: it.audio.type || "audio/mp4" }));
    arquivos.push(new File([jsonNota(it, vistoria)], `NOTA_${it.nome}.json`, { type: "application/json" }));
  }
  if (!arquivos.length) return aviso("A vistoria ainda não tem itens.");
  if (!navigator.canShare?.({ files: arquivos })) return aviso("Este navegador não compartilha arquivos.");
  try {
    await navigator.share({ files: arquivos, title: vistoria.pasta });
  } catch (e) {
    if (e.name !== "AbortError") aviso("Não foi possível compartilhar: " + e.message);
  }
}

async function excluirVistoria() {
  $("#dlgMenu").close();
  const its = await itensDa(vistoria.id);
  const pend = its.filter(temPendencia).length;
  const msg = pend ? `${pend} item(ns) ainda NÃO foram enviados e serão perdidos. Excluir a vistoria do celular mesmo assim?`
                   : "Excluir a vistoria do celular? O que já está no Drive continua lá.";
  if (!confirm(msg)) return;
  for (const it of its) await apagar("itens", it.id);
  await apagar("vistorias", vistoria.id);
  mostrarLista();
}

// =====================================================================
// Início
// =====================================================================

function ligar() {
  $("#versao").textContent = "versão " + VERSAO_APP;
  $("#btNovaVistoria").onclick = abrirNova;
  $("#btCriarNova").onclick = criarNova;
  $("#btCancelarNova").onclick = () => $("#dlgNova").close();
  $("#novaCodigo").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("#novaDescricao").focus(); } };
  $("#novaDescricao").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); criarNova(); } };
  $("#listaVistorias").onclick = e => { const c = e.target.closest("[data-id]"); if (c) abrirVistoria(c.dataset.id); };
  $("#btGoogle").onclick = () => entrarGoogle().then(() => enviar(false)).catch(e => aviso(e.message));

  $("#btVoltar").onclick = mostrarLista;
  $("#btFoto").onclick = () => { $("#entradaFoto").value = ""; $("#entradaFoto").click(); };
  $("#entradaFoto").onchange = e => fotoEscolhida(e.target.files[0]);
  $("#btSoNota").onclick = soNota;
  $("#listaItens").onclick = async e => {
    const c = e.target.closest("[data-id]");
    if (c) abrirNota(await ler("itens", c.dataset.id));
  };

  $("#btGravar").onclick = alternarGravacao;
  $("#btSalvarNota").onclick = salvarNota;
  $("#btCancelarNota").onclick = cancelarNota;
  $("#btExcluir").onclick = excluirItem;
  $("#dlgNota").addEventListener("cancel", () => pararGravacao());

  const textoAudio = () => ($("#mnAudio").textContent = "🔊 Guardar também o áudio das notas: " + (guardarAudio() ? "sim" : "não"));
  $("#btMenu").onclick = () => {
    $("#mnEnviar").hidden = !CFG.googleClientId;
    textoAudio();
    $("#dlgMenu").showModal();
  };
  $("#mnAudio").onclick = () => { localStorage.setItem("gaeGuardarAudio", guardarAudio() ? "nao" : "sim"); textoAudio(); };
  $("#mnRelogio").onclick = abrirRelogio;
  $("#mnEnviar").onclick = () => { $("#dlgMenu").close(); enviar(true); };
  $("#mnCompartilhar").onclick = compartilhar;
  $("#mnExcluir").onclick = excluirVistoria;
  $("#mnFechar").onclick = () => $("#dlgMenu").close();
  $("#btFotografei").onclick = fotografei;
  $("#btFecharRelogio").onclick = fecharRelogio;

  window.addEventListener("online", () => carregarGoogle().then(() => { atualizarBotaoGoogle(); enviarSePuder(); }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { atualizarBotaoGoogle(); enviarSePuder(); } });
}

(async function iniciar() {
  ligar();
  try {
    db = await abrirDb();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:20px">Não foi possível abrir o armazenamento do celular: ${escapar(e.message)}</p>`;
    return;
  }
  navigator.storage?.persist?.();                       // pede para o sistema não apagar as fotos guardadas
  if ("serviceWorker" in navigator) {
    // versão nova publicada: o service worker novo assume e o app recarrega sozinho (não na 1ª instalação)
    const tinha = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (tinha && !gravacao) location.reload(); });
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  await mostrarLista();
  carregarGoogle().then(atualizarBotaoGoogle);
  enviarSePuder();
})();
