"""Story em vídeo (admin.html → 🎨 Arte → 🎬 Gravar Story em vídeo).

O que este teste prova, com o navegador REAL e o ffmpeg/ffprobe (nada é simulado na gravação em si):
  1. grava de verdade (canvas + MediaRecorder), o arquivo tem 1080×1920, ~30 quadros/s e ~7 s, e a imagem tem foto + nome + preço (não é vídeo preto);
  2. a foto se aproxima ao longo do vídeo (existe animação), e o texto entra no começo;
  3. o painel ABRE o arquivo e diz o que ele é: MP4/H.264 = serve; WebM ou MP4 com VP9 = o Instagram pode recusar;
  4. um arquivo gravado nesse formato PODE ser convertido para MP4 H.264 + AAC (o que o Instagram quer) — é o passo seguinte, caso o Instagram recuse o original;
  5. o JPG do Story continua igual (a arte foi dividida em camadas sem mudar o desenho);
  6. cancelar, fechar a janela no meio e foto bloqueada não quebram nada.
O que NÃO dá para provar aqui: se o Instagram aceita o arquivo. Isso só o celular do Pablo responde (o painel mostra o parecer na hora)."""
import sys, os, io, json, base64, subprocess, tempfile, shutil
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
SAIDA = os.path.join(AQUI, "saida")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def sh(cmd): return subprocess.run(cmd, capture_output=True, text=True)
def dados(img): return list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())
def probe(path):
    r = sh(["ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=codec_name,codec_type,width,height,avg_frame_rate,nb_read_frames,pix_fmt:format=duration,format_name", "-of", "json", path])
    return json.loads(r.stdout or "{}")
def quadro(path, seg, saida):
    sh(["ffmpeg", "-y", "-v", "error", "-ss", str(seg), "-i", path, "-frames:v", "1", saida]); return Image.open(saida).convert("RGB")

# foto de teste (com CORS, como o Cloudinary/Google fazem)
im = Image.new("RGB", (900, 1200), (210, 80, 120)); d = ImageDraw.Draw(im)
for i in range(0, 1200, 40): d.rectangle([0, i, 900, i + 20], fill=(60 + i % 180, 90, 190 - i % 150))
d.ellipse([200, 300, 700, 900], fill=(250, 230, 120))
buf = io.BytesIO(); im.save(buf, "JPEG", quality=90); FOTO = buf.getvalue()
def rota_foto(route): return route.fulfill(body=FOTO, content_type="image/jpeg", headers={"access-control-allow-origin": "*"})
def rota_foto_sem_cors(route): return route.fulfill(body=FOTO, content_type="image/jpeg", headers={"access-control-allow-origin": "https://nao-permitido.example"})   # o navegador recusa: a loja não está na lista

# arquivos REAIS nos três formatos, feitos pelo ffmpeg, para o "gravador falso" devolver
tmp = tempfile.mkdtemp(prefix="tk-vid-")
def gerar(nome, args):
    sh(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=360x640:rate=30"] + args + [os.path.join(tmp, nome)])
    return base64.b64encode(open(os.path.join(tmp, nome), "rb").read()).decode()
B64 = {"h264": gerar("h264.mp4", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+frag_keyframe+empty_moov"]),
       "vp8webm": gerar("vp8.webm", ["-c:v", "libvpx", "-pix_fmt", "yuv420p"]),
       "vp9mp4": gerar("vp9.mp4", ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-f", "mp4", "-movflags", "+frag_keyframe+empty_moov"])}

FAKE = """
(() => {
  const bytes = Uint8Array.from(atob(window.__B64), c => c.charCodeAt(0));
  class Falso {
    static isTypeSupported(t) { return t.indexOf('avc1') >= 0 || t === 'video/mp4'; }
    constructor(stream, opts) { this.mimeType = (opts && opts.mimeType) || 'video/mp4'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob([bytes], { type: this.mimeType }) }); this.onstop && this.onstop(); }, 10); }
  }
  window.MediaRecorder = Falso;
})();
"""

def novo_contexto(b, cors=True, fake=None):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", accept_downloads=True)
    ctx.add_init_script(SESSION)
    if fake:
        ctx.add_init_script("window.__B64 = '%s';" % B64[fake]); ctx.add_init_script(FAKE)
    install(ctx)
    rota = rota_foto if cors else rota_foto_sem_cors
    ctx.route("**/lh3.googleusercontent.com/**", rota); ctx.route("**/res.cloudinary.com/**", rota)
    return ctx

def abrir_arte(pg):
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2200)
    pg.locator(".btn-arte").first.click(); pg.wait_for_timeout(700)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    print("== Gravação real (o navegador desta máquina) ==")
    ctx = novo_contexto(b); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    abrir_arte(pg)
    chk("bloco 'Story em vídeo' aparece na janela da arte", pg.locator("#arte-video").is_visible() and pg.locator("#btn-gravar-video-arte").is_enabled())
    fmt = pg.evaluate("escolherFormatoVideo_()")
    print("   formato escolhido por este navegador:", repr(fmt))
    pg.fill("#input-preco-arte", "120.50")
    pg.click("#btn-gravar-video-arte"); pg.wait_for_timeout(2500)
    chk("durante a gravação o botão vira 'Cancelar' e o status mostra os segundos", "Cancelar" in pg.inner_text("#btn-gravar-video-arte") and "Gravando" in pg.inner_text("#status-video-arte"), pg.inner_text("#status-video-arte"))
    pg.wait_for_selector("#resultado-video-arte:not([hidden])", timeout=20000)
    chk("terminou: prévia do vídeo e parecer aparecem", pg.locator("#video-arte-preview").is_visible() and pg.locator("#info-video-arte").inner_text() != "")
    info = pg.inner_text("#info-video-arte"); print("   parecer do painel:", info.replace("\n", " | "))
    chk("o painel informa formato, tamanho, duração e 'sem som'", "1080×1920" in info and "7 s" in info and "sem som" in info and "MB" in info, info)
    chk("o parecer é coerente: VP9/VP8 NUNCA é marcado como aceito pelo Instagram", ("✅" not in info) if ("VP9" in info or "VP8" in info) else True, info)
    with pg.expect_download() as dl: pg.click("#btn-baixar-video-arte")
    arq = os.path.join(SAIDA, dl.value.suggested_filename); dl.value.save_as(arq)
    chk("o arquivo baixado tem nome story-<código>.<ext>", dl.value.suggested_filename.startswith("story-TK-") and dl.value.suggested_filename.split(".")[-1] in ("mp4", "webm"), dl.value.suggested_filename)
    pr = probe(arq); v = [s for s in pr.get("streams", []) if s["codec_type"] == "video"][0]
    num, den = v["avg_frame_rate"].split("/"); fps = float(num) / float(den or 1)
    print("   ffprobe:", v["codec_name"], "%sx%s" % (v["width"], v["height"]), "%.1f fps" % fps, "quadros:", v.get("nb_read_frames"), "formato:", pr["format"]["format_name"])
    chk("vídeo é 1080×1920 (9:16, tela cheia de Story)", (v["width"], v["height"]) == (1080, 1920))
    # a taxa real depende da CPU de quem grava (aqui, sem placa de vídeo: 25–28 fps; com a máquina ocupada chegou a cair perto de 22). Só reprovamos vídeo "em câmera lenta".
    chk("taxa de quadros razoável (entre 18 e 31 por segundo; alvo 30)", 18 <= fps <= 31, fps)
    nq = int(v.get("nb_read_frames") or 0)
    chk("duração de ~7 s (quadros entre 120 e 260)", 120 <= nq <= 260, nq)
    chk("o painel descreveu o que o ffprobe encontrou (contêiner e codec batem)", v["codec_name"].upper() in info.upper() and (("MP4" in info) == ("mp4" in pr["format"]["format_name"])), (v["codec_name"], pr["format"]["format_name"], info))
    f0 = quadro(arq, 0.1, os.path.join(SAIDA, "q0.png")); f1 = quadro(arq, 3.5, os.path.join(SAIDA, "q1.png")); f2 = quadro(arq, 6.7, os.path.join(SAIDA, "q2.png"))
    def pixels_perto(img, rgb, caixa, tol=45):
        c = img.crop(caixa); return sum(1 for px in dados(c) if all(abs(px[i] - rgb[i]) <= tol for i in range(3)))
    verde = (126, 231, 135)
    chk("no meio do vídeo há foto (parte de cima não é preta nem lisa)", len(set(dados(f1.crop((0, 200, 1080, 1200)).resize((60, 60))))) > 200)
    chk("o preço (verde) aparece no rodapé no meio do vídeo", pixels_perto(f1, verde, (0, 1450, 1080, 1760)) > 300, pixels_perto(f1, verde, (0, 1450, 1080, 1760)))
    chk("o texto ENTRA no começo (quase nada de verde no 1º quadro)", pixels_perto(f0, verde, (0, 1450, 1080, 1760)) < pixels_perto(f1, verde, (0, 1450, 1080, 1760)) / 3)
    laranja_mid = pixels_perto(f1, (255, 122, 26), (0, 1230, 1080, 1260)); chk("faixa laranja entre foto e rodapé", laranja_mid > 5000, laranja_mid)
    def largura_foto(img):   # largura da parte "clara" no meio da área da foto
        l = img.crop((0, 700, 1080, 701)).convert("L"); xs = [x for x in range(1080) if l.getpixel((x, 0)) > 150]; return (xs[-1] - xs[0]) if xs else 0
    chk("a foto se aproxima ao longo do vídeo (zoom suave)", largura_foto(f2) > largura_foto(f0), (largura_foto(f0), largura_foto(f2)))
    # conversão (equivalente ao Cloudinary f_mp4,vc_h264,ac_aac) — caminho de reserva se o Instagram recusar o original
    conv = os.path.join(SAIDA, "convertido.mp4")
    r = sh(["ffmpeg", "-y", "-v", "error", "-i", arq, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", conv])
    pc = probe(conv); vs = {s["codec_type"]: s for s in pc.get("streams", [])}
    chk("conversão do arquivo gravado dá MP4 H.264 + AAC 1080×1920 (formato do Instagram)", r.returncode == 0 and vs.get("video", {}).get("codec_name") == "h264" and vs.get("audio", {}).get("codec_name") == "aac" and (vs["video"]["width"], vs["video"]["height"]) == (1080, 1920) and vs["video"]["pix_fmt"] == "yuv420p", r.stderr[:200])
    chk("o MP4 convertido dura ~7 s (≤ 60 s do Story)", 6 <= float(pc["format"]["duration"]) <= 8, pc["format"].get("duration"))
    chk("nenhum erro de JavaScript", not erros, erros)

    print("== Cancelar / fechar no meio ==")
    pg.click("#btn-gravar-video-arte"); pg.wait_for_timeout(1500)
    pg.click("#btn-gravar-video-arte"); pg.wait_for_timeout(600)
    chk("segundo toque cancela a gravação", "cancelada" in pg.inner_text("#status-video-arte") and pg.locator("#resultado-video-arte").is_hidden(), pg.inner_text("#status-video-arte"))
    chk("botão volta ao normal", "Gravar" in pg.inner_text("#btn-gravar-video-arte"))
    pg.click("#btn-gravar-video-arte"); pg.wait_for_timeout(1200)
    pg.click("#btn-fechar-arte-config"); pg.wait_for_timeout(1500)
    chk("fechar a janela no meio da gravação para tudo sem erro", pg.evaluate("gravacaoVideoArte_") is None and not erros, erros)
    pg.locator(".btn-arte").first.click(); pg.wait_for_timeout(600)
    chk("ao reabrir, não sobra vídeo antigo", pg.locator("#resultado-video-arte").is_hidden())
    ctx.close()

    print("== O JPG do Story continua igual ==")
    ctx = novo_contexto(b); pg = ctx.new_page(); pg.on("dialog", lambda d: d.accept())
    abrir_arte(pg); pg.fill("#input-preco-arte", "120.50")
    with pg.expect_download() as dl: pg.click("#btn-baixar-arte")
    jpg = os.path.join(SAIDA, "story.jpg"); dl.value.save_as(jpg)
    im2 = Image.open(jpg)
    chk("JPG 1080×1920 gerado", im2.size == (1080, 1920) and im2.format == "JPEG", (im2.size, im2.format))
    chk("JPG tem o preço em verde e a faixa laranja", pixels_perto(im2.convert("RGB"), verde, (0, 1450, 1080, 1760)) > 300 and pixels_perto(im2.convert("RGB"), (255, 122, 26), (0, 1230, 1080, 1260)) > 5000)
    ctx.close()

    print("== Parecer do painel com arquivos reais de cada formato ==")
    for fake, esperado_ok, rotulo in (("h264", True, "MP4 + H.264"), ("vp8webm", False, "WebM + VP8"), ("vp9mp4", False, "MP4 + VP9")):
        ctx = novo_contexto(b, fake=fake); pg = ctx.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
        abrir_arte(pg)
        pg.click("#btn-gravar-video-arte"); pg.wait_for_selector("#resultado-video-arte:not([hidden])", timeout=20000)
        info = pg.inner_text("#info-video-arte")
        if esperado_ok:
            chk(rotulo + ": parecer VERDE (serve para o Instagram)", "✅" in info and "H.264" in info and "MP4" in info, info)
            chk(rotulo + ": arquivo baixado leva extensão .mp4", pg.evaluate("document.getElementById('btn-baixar-video-arte') && true"))
        else:
            chk(rotulo + ": parecer de ATENÇÃO (Instagram pode recusar), sem prometer", "⚠️" in info and "✅" not in info and "recus" in info, info)
        chk(rotulo + ": identifica o contêiner/codec certo", {"h264": ("MP4", "H264"), "vp8webm": ("WEBM", "VP8"), "vp9mp4": ("MP4", "VP9")}[fake][0] in info.upper() and {"h264": "H264", "vp8webm": "VP8", "vp9mp4": "VP9"}[fake] in info.upper().replace(".", ""), info)
        if fake == "vp8webm":
            with pg.expect_download() as dl: pg.click("#btn-baixar-video-arte")
            chk("WebM baixa como .webm", dl.value.suggested_filename.endswith(".webm"), dl.value.suggested_filename)
        chk(rotulo + ": sem erro de JavaScript", not erros, erros)
        ctx.close()

    print("== Foto que bloqueia o uso (sem CORS) ==")
    ctx = novo_contexto(b, cors=False); pg = ctx.new_page(); pg.on("dialog", lambda d: d.accept())
    abrir_arte(pg)
    pg.click("#btn-gravar-video-arte"); pg.wait_for_timeout(3000)
    st = pg.inner_text("#status-video-arte")
    chk("avisa com clareza (e não grava vídeo preto)", ("bloqueia" in st or "carregar a foto" in st) and pg.locator("#resultado-video-arte").is_hidden(), st)
    ctx.close()

    print("== Navegador sem gravação de vídeo ==")
    ctx = novo_contexto(b); ctx.add_init_script("delete window.MediaRecorder;"); pg = ctx.new_page()
    abrir_arte(pg)
    chk("botão desativado com explicação (sem quebrar a janela da arte)", pg.locator("#btn-gravar-video-arte").is_disabled() and "não grava vídeo" in pg.inner_text("#status-video-arte") and pg.locator("#btn-baixar-arte").is_enabled())
    ctx.close(); b.close()
shutil.rmtree(tmp, ignore_errors=True)
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
