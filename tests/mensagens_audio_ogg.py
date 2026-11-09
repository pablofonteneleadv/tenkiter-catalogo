# Áudio do Mensageiro para WhatsApp: gravações M4A/WebM viram OGG/Opus com som (o WhatsApp só toca voz nesse formato).
# Prova de verdade: o arquivo convertido é aberto pelo ffprobe/ffmpeg (codec, duração e volume, não só "gerou bytes").
import sys, os, subprocess, tempfile, base64, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mock import BASE_LOCAL as BASE
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
falhas = 0
def chk(nome, ok, extra=""):
    global falhas
    print(("  ok  " if ok else "FALHA ") + nome + ("" if ok else "  -> " + str(extra)))
    if not ok: falhas += 1

d = tempfile.mkdtemp()
def gerar(nome, args):
    p = os.path.join(d, nome)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=44100", *args, p], check=True)
    return p
m4a = gerar("voz.m4a", ["-ac", "1", "-c:a", "aac", "-b:a", "64k"])
webm = gerar("voz.webm", ["-ac", "2", "-c:a", "libopus", "-b:a", "48k"])
mp3 = gerar("voz.mp3", ["-ac", "1", "-c:a", "libmp3lame"])
ruido = os.path.join(d, "lixo.m4a"); open(ruido, "wb").write(os.urandom(3000))

def inspecionar(caminho):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", caminho], capture_output=True, text=True).stdout or "{}")
    e = subprocess.run(["ffmpeg", "-v", "error", "-i", caminho, "-f", "null", "-"], capture_output=True, text=True)
    v = subprocess.run(["ffmpeg", "-hide_banner", "-i", caminho, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    media = None
    for l in v.stderr.splitlines():
        if "mean_volume" in l: media = float(l.split("mean_volume:")[1].split("dB")[0])
    return j, e.stderr, media

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); ctx = b.new_context(); pg = ctx.new_page()
    pg.goto(BASE + "404.html"); pg.add_script_tag(url=BASE + "mensagens-audio-ogg.js"); pg.set_content("<input type=file id=f>") if False else None
    pg.evaluate("() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'f'; document.body.appendChild(i); }")
    chk("navegador de teste suporta WebCodecs de áudio", pg.evaluate("TKAudioOgg.suportado()"))
    def converter(arq):
        pg.set_input_files("#f", arq)
        return pg.evaluate("""async () => { try { const r = await TKAudioOgg.converter(document.getElementById('f').files[0]);
            const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
            return { ok: true, b64: btoa(s), tipo: r.blob.type, seg: r.seg }; } catch (e) { return { ok: false, erro: e.message }; } }""")
    for nome, arq in (("M4A (gravação do celular)", m4a), ("WebM/Opus (gravação do Chrome)", webm), ("MP3 (arquivo escolhido)", mp3)):
        r = converter(arq)
        chk(nome + ": converteu", r["ok"], r)
        if not r["ok"]: continue
        out = os.path.join(d, "saida-" + nome[:3].strip() + ".ogg"); open(out, "wb").write(base64.b64decode(r["b64"]))
        j, erro_ff, media = inspecionar(out)
        st = (j.get("streams") or [{}])[0]
        chk(nome + ": tipo audio/ogg", r["tipo"] == "audio/ogg")
        chk(nome + ": ffprobe vê OGG com Opus mono 48 kHz", j.get("format", {}).get("format_name") == "ogg" and st.get("codec_name") == "opus" and st.get("channels") == 1, j)
        dur = float(j.get("format", {}).get("duration") or 0)
        chk(nome + ": duração ~3 s (não 0:00)", 2.9 <= dur <= 3.15 and abs(r["seg"] - 3) < 0.1, (dur, r["seg"]))
        chk(nome + ": ffmpeg decodifica sem erro (CRC e páginas OGG válidos)", erro_ff.strip() == "", erro_ff[:300])
        chk(nome + ": tem som de verdade (volume médio acima de -40 dB)", media is not None and media > -40, media)
    r = converter(ruido)
    chk("arquivo que não é áudio vira frase em português, sem JSON cru", (not r["ok"]) and "Não consegui ler este áudio" in r["erro"] and "{" not in r["erro"], r)
    b.close()
print("FALHAS=%d" % falhas); sys.exit(1 if falhas else 0)
