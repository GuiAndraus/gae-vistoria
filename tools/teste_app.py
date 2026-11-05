"""Teste do GAE Vistoria: servidor local + Chrome (Playwright), capturas de tela em tamanho de celular."""
import functools, http.server, json, os, sys, threading, urllib.parse
from playwright.sync_api import sync_playwright

raiz, saida = sys.argv[1], sys.argv[2]
os.makedirs(saida, exist_ok=True)
class Base(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}
    def log_message(self, *a): pass
Handler = functools.partial(Base, directory=raiz)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8123), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

erros = []
with sync_playwright() as p:
    nav = p.chromium.launch(channel="chrome")
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and erros.append(m.text))
    foto = lambda nome: (pg.wait_for_timeout(400), pg.screenshot(path=os.path.join(saida, nome)))

    pg.goto("http://127.0.0.1:8123/")
    pg.wait_for_timeout(1200)
    foto("1-lista-vazia.png")

    pg.click("#btNovaVistoria")
    pg.fill("#novaCodigo", "toc")
    pg.fill("#novaDescricao", "Residencial Tocantins")
    pg.click("#btCriarNova")
    pg.wait_for_timeout(600)

    # foto pelo celular (imagem gerada num canvas) + nota
    pg.evaluate("""async () => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const g = c.getContext('2d');
      g.fillStyle = '#8a8f96'; g.fillRect(0,0,1600,1200); g.strokeStyle = '#222'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(300,200); g.lineTo(900,900); g.stroke();
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
      await fotoEscolhida(new File([b], 'IMG_0001.jpg', { type: 'image/jpeg', lastModified: Date.now() - 5000 }));
    }""")
    pg.wait_for_timeout(500)
    pg.fill("#notaTexto", "Fissura na viga de borda")
    foto("2-nota-foto.png")
    pg.click("#btSalvarNota")
    pg.wait_for_timeout(600)

    # só nota (foto na câmera)
    pg.click("#btSoNota")
    pg.wait_for_timeout(300)
    pg.fill("#notaTexto", "Armadura exposta na laje, fora do escopo")
    pg.click("#btSalvarNota")
    pg.wait_for_timeout(600)
    foto("3-vistoria.png")

    pg.click("#btMenu")
    foto("4-menu.png")
    pg.click("#mnRelogio")
    foto("5-relogio.png")
    pg.click("#btFotografei")
    pg.wait_for_timeout(600)

    # editar a nota da foto e conferir que continua pendente; excluir a nota da câmera
    pg.click("#listaItens .cartao:nth-child(2)")
    pg.wait_for_timeout(300)
    pg.fill("#notaTexto", "Armadura exposta na laje")
    pg.click("#btSalvarNota")
    pg.wait_for_timeout(500)

    dados = pg.evaluate("""async () => (await itensDa(vistoria.id)).map(i => ({ nome: i.nome, tipo: i.tipo, hora: i.hora,
        texto: i.texto, foto: i.fotoNome, mini: !!i.mini, pendente: temPendencia(i) }))""")
    nota = pg.evaluate("""async () => { const it = (await itensDa(vistoria.id)).find(i => i.tipo === 'foto');
        return await jsonNota(it, vistoria).text(); }""")
    foto("6-vistoria-final.png")
    pg.click("#btVoltar")
    foto("7-lista.png")
    # recarregar: tudo continua guardado no celular
    pg.reload()
    pg.wait_for_timeout(1000)
    qtd = pg.evaluate("async () => (await todos('itens')).length")

    # ---------- envio para um Google Drive simulado ----------
    # O áudio falha na 1ª vez (500): os outros itens têm de seguir e o áudio vai no envio seguinte.
    enviados, pastas, falhou = [], {}, {"audio": False}
    def drive(route):
        rq, url = route.request, route.request.url
        if "/upload/drive/v3/files" in url:
            corpo = rq.post_data_buffer or b""
            fronteira = rq.headers["content-type"].split("boundary=")[1].encode()
            partes = [p for p in corpo.split(b"--" + fronteira) if p.strip() not in (b"", b"--")]
            meta = json.loads(partes[0].split(b"\r\n\r\n", 1)[1].strip())
            cab, dados_arq = partes[1].split(b"\r\n\r\n", 1)
            dados_arq = dados_arq[:-2] if dados_arq.endswith(b"\r\n") else dados_arq
            nome = meta.get("name", "(atualização)")
            if nome.endswith(".m4a") and not falhou["audio"]:
                falhou["audio"] = True
                return route.fulfill(status=500, body="erro simulado")
            enviados.append({"nome": nome, "pai": meta.get("parents"), "metodo": rq.method, "bytes": len(dados_arq),
                             "tipo": cab.decode().split("Content-Type: ")[1].strip(),
                             "conteudo": dados_arq.decode() if nome.endswith(".json") else None})
            return route.fulfill(json={"id": f"arq{len(enviados)}"})
        if "/drive/v3/files" in url and rq.method == "GET":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("q", [""])[0]
            nome = q.split("name='")[1].split("'")[0] if "name='" in q else ""
            return route.fulfill(json={"files": [{"id": pastas[nome]}] if nome in pastas else []})
        if "/drive/v3/files" in url and rq.method == "POST":
            nome = json.loads(rq.post_data)["name"]
            pastas[nome] = f"pasta{len(pastas) + 1}"
            return route.fulfill(json={"id": pastas[nome]})
        return route.fulfill(status=404, body="")
    pg.route("https://www.googleapis.com/**", drive)
    pg.route("https://accounts.google.com/**", lambda r: r.fulfill(body="", content_type="text/javascript"))
    pg.evaluate("localStorage.setItem('gaeToken', JSON.stringify({ token: 'teste', expira: Date.now() + 3600e3 }))")
    pg.reload()
    pg.wait_for_timeout(800)
    # áudio no item da foto (guardado como bytes) e um item antigo com a foto guardada como Blob
    pg.evaluate("""async () => {
        const its = await todos('itens');
        const f = its.find(i => i.tipo === 'foto');
        f.audio = await guardavel(new Blob([new Uint8Array(110000)], { type: 'audio/mp4' }));
        f.audioNome = `NOTA_${f.nome}.m4a`;
        await gravar('itens', f);
        const antigo = { ...f, id: f.vistoriaId + '/20261105_000001', nome: '20261105_000001', fotoNome: 'CEL_20261105_000001.jpg',
                         foto: new Blob([new Uint8Array(50000)], { type: 'image/jpeg' }), audio: null, audioNome: null, texto: 'Item antigo',
                         drive: { foto: null, audio: null, nota: null }, notaAlterada: false };
        await gravar('itens', antigo);
    }""")
    espera_envio = "async () => { await enviar(true); for (let i = 0; i < 50 && enviando; i++) await new Promise(r => setTimeout(r, 100)); }"
    pg.evaluate(espera_envio)
    pendentes_1 = pg.evaluate("async () => (await todos('itens')).filter(temPendencia).map(i => i.nome)")
    pg.evaluate(espera_envio)
    pendentes_2 = pg.evaluate("async () => (await todos('itens')).filter(temPendencia).map(i => i.nome)")
    registro = pg.evaluate("JSON.parse(localStorage.getItem('gaeRegistro') || '[]')")
    pg.click("#listaVistorias .cartao")
    pg.wait_for_timeout(400)
    pg.click("#btMenu")
    pg.click("#mnRegistro")
    foto("8-registro.png")
    nav.close()

srv.shutdown()
with open(os.path.join(saida, "resultado.json"), "w", encoding="utf-8") as f:
    json.dump({"itens": dados, "json_foto": nota, "itens_apos_recarregar": qtd,
               "drive": {"pastas": pastas, "enviados": enviados, "pendentes_apos_1o_envio": pendentes_1,
                         "pendentes_apos_2o_envio": pendentes_2, "registro": registro},
               "erros": erros}, f, ensure_ascii=False, indent=2)
print("ok")
