#!/usr/bin/env python3
"""Processa solicitações HEVC explícitas da fila, sem segredos no repositório."""
import json, os, re, subprocess, tempfile, urllib.request, urllib.error, datetime
from pathlib import Path

TOKEN=os.environ["CLOUDFLARE_API_TOKEN"]
ACCOUNT=os.environ["CLOUDFLARE_ACCOUNT_ID"]
DB="15731893-d51a-4631-877f-6b7a6517bd54"
BASE=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
MEDIA="https://tenkiter-midia.distkrpconfeccoes.workers.dev/m/"
BUCKET="tenkiter-midia"

def api(path, method="GET", body=None, binary=False):
    data=body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
    headers={"Authorization":f"Bearer {TOKEN}"}
    if data is not None: headers["Content-Type"]="application/octet-stream" if isinstance(body,bytes) else "application/json"
    req=urllib.request.Request(BASE+path,data=data,headers=headers,method=method)
    with urllib.request.urlopen(req,timeout=90) as r:
        raw=r.read(16*1024*1024 if binary else 1024*1024)
        if binary: return raw
        val=json.loads(raw)
        if not val.get("success"): raise RuntimeError("Cloudflare API returned error")
        return val["result"]

def sql(query,params=None):
    res=api(f"/d1/database/{DB}/query","POST",{"sql":query,"params":params or []})
    return res[0] if isinstance(res,list) else res

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def process(row):
    ident=row["id"]
    medias=json.loads(row["midias"])
    if len(medias)!=1 or medias[0].get("tipo")!="video": raise ValueError("Somente vídeo único")
    url=medias[0].get("url","")
    if not url.startswith(MEDIA): raise ValueError("Mídia fora do R2")
    key=url[len(MEDIA):]
    if not re.fullmatch(r"[a-z0-9/_-]+\.mp4",key) or ".." in key: raise ValueError("Chave inválida")
    old=sql("SELECT 1 FROM postagem_grupo_recibo WHERE postagem_id=? LIMIT 1",[ident]).get("results",[])
    if old: raise ValueError("Existe recibo de envio: não converter")
    # Claim atômico: nunca dois runners convertem o mesmo trabalho.
    claimed=sql("UPDATE postagem SET status='transcodificando', atualizado_em=? WHERE id=? AND status='convertendo' AND canal='grupo'",[stamp(),ident])
    if claimed.get("meta",{}).get("changes")!=1: return
    try:
        source=api(f"/r2/buckets/{BUCKET}/objects/{key}",binary=True)
        if not source or len(source)>12*1024*1024: raise ValueError("Arquivo ausente ou maior que 12 MiB")
        with tempfile.TemporaryDirectory() as d:
            inp=Path(d)/"entrada.mp4"; out=Path(d)/"saida.mp4"
            inp.write_bytes(source)
            subprocess.run(["bash","scripts/wafly/transcode.sh",str(inp),str(out)],check=True,timeout=240)
            result=out.read_bytes()
        if len(result)>12*1024*1024: raise ValueError("Vídeo convertido acima de 12 MiB")
        newkey=f"wafly-convertidos/{ident}-h264.mp4"
        api(f"/r2/buckets/{BUCKET}/objects/{newkey}","PUT",result)
        medias[0]["url"]=MEDIA+newkey
        # Compare-and-swap: nunca altera post cancelado ou em envio.
        updated=sql("""UPDATE postagem SET midias=?, status='agendado', agendado_em=?, tentativas=0,
            erro='', atualizado_em=? WHERE id=? AND status='transcodificando'
            AND NOT EXISTS (SELECT 1 FROM postagem_grupo_recibo WHERE postagem_id=?)""",
            [json.dumps(medias,ensure_ascii=False),stamp(),stamp(),ident,ident])
        if updated.get("meta",{}).get("changes")!=1: raise RuntimeError("Postagem alterada; não liberar envio")
        print(f"Postagem {ident}: convertido e liberado para fila")
    except Exception as exc:
        sql("UPDATE postagem SET status='erro', erro=?, atualizado_em=? WHERE id=? AND status='transcodificando'",
            ["Conversão automática falhou: "+str(exc)[:190],stamp(),ident])
        raise

def main():
    rows=sql("""SELECT id,midias FROM postagem WHERE status='convertendo' AND canal='grupo'
        ORDER BY atualizado_em LIMIT 3""").get("results",[])
    for row in rows:
        try: process(row)
        except Exception as exc: print(f"Postagem {row['id']}: {exc}")
    print(f"Solicitações encontradas: {len(rows)}")

if __name__=="__main__": main()
