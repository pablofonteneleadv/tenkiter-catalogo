"""Contratos reais do encoder: tamanho, duração, codec e ausência de corte implícito."""
import importlib.util,json,subprocess,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('encoder',Path(__file__).resolve().parents[1]/'scripts/wafly/transcode.py');enc=importlib.util.module_from_spec(spec);spec.loader.exec_module(enc)
with tempfile.TemporaryDirectory() as tmp:
 d=Path(tmp)
 def source(name,seconds,codec='libx264',hdr=False):
  p=d/name;subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i',('testsrc2=size=640x360:rate=24' if seconds>30 else 'testsrc2=size=320x240:rate=24'),'-f','lavfi','-i','sine=frequency=500:sample_rate=48000','-t',str(seconds),'-c:v',codec,'-threads','2','-preset','ultrafast','-c:a','aac',*(['-vf','setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc','-pix_fmt','yuv420p10le','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc'] if hdr else []),'-y',str(p)],check=True);return p
 short=source('hevc.mp4',4,'libx265',hdr=True);r=enc.convert(short,d/'short.mp4');assert r['bytes']<=9961472 and 3<=r['duration']<=30
 assert next(s for s in enc.probe(d/'short.mp4')['streams'] if s['codec_type']=='video')['color_transfer']=='bt709'
 long=source('long.mp4',120);assert 15000000<long.stat().st_size<=40*1048576,'Amostra precisa exigir compressão real'
 try:enc.convert(long,d/'never.mp4');raise AssertionError('Vídeo longo foi cortado implicitamente')
 except ValueError:assert not (d/'never.mp4').exists()
 r=enc.convert(long,d/'message.mp4','mensageiro');assert r['bytes']<=15000000 and abs(r['duration']-120)<.12
 r=enc.convert(long,d/'selected.mp4','postagens',start=15,duration=12);assert 11.9<=r['duration']<=12.1
 r=enc.convert(long,d/'boundary.mp4','postagens',start=10,duration=30);assert 29.99<=r['duration']<=30
 try:enc.convert(long,d/'changed.mp4','mensageiro',duration=20);raise AssertionError('Mensageiro aceitou recorte')
 except ValueError:pass
 print('OK: HEVC→H264, tamanho, 120s preservados, recorte explícito e recusa de corte implícito.')
