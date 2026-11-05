"""Teste do GAE Vistoria: servidor local + Chrome (Playwright), capturas de tela em tamanho de celular."""
import functools, http.server, json, os, sys, threading
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
    nav.close()

srv.shutdown()
with open(os.path.join(saida, "resultado.json"), "w", encoding="utf-8") as f:
    json.dump({"itens": dados, "json_foto": nota, "itens_apos_recarregar": qtd, "erros": erros}, f, ensure_ascii=False, indent=2)
print("ok")
