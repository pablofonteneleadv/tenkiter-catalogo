#!/usr/bin/env python3
"""Encoder limitado, duas passagens e inspeção final. Não conhece credenciais/envios."""
import argparse,json,math,subprocess,tempfile
from pathlib import Path
PROFILES={'postagens':(9961472,3,30),'mensageiro':(15000000,0,1800)}
def probe(path):
 return json.loads(subprocess.check_output(['ffprobe','-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-show_format','-show_streams','-of','json',str(path)],timeout=20,stderr=subprocess.PIPE))
def plan_parts(duration,maximum=30):
 if not math.isfinite(duration) or not 3<=duration<=1800 or not 3<=maximum<=30:raise ValueError('Duração fora do limite')
 n=math.ceil(duration/maximum);ds=[min(maximum,duration-i*maximum) for i in range(n)]
 if n>1 and ds[-1]<3:ds[-2]-=3-ds[-1];ds[-1]=3
 if any(d<3 for d in ds):raise ValueError('Parte menor que 3 segundos')
 start=0;parts=[]
 for i,d in enumerate(ds):parts.append({'ordem':i+1,'total':n,'inicio':start,'duracao':d});start+=d
 return parts

def convert(source,target,profile='postagens',start=0,duration=0,max_bytes=0):
 source,target=Path(source),Path(target)
 if source.resolve()==target.resolve() or not 0<source.stat().st_size<=40*1048576:raise ValueError('Entrada inválida ou acima de 40 MiB')
 meta=probe(source);original=float(meta['format']['duration']);limit,minsec,maxsec=PROFILES[profile]
 if not math.isfinite(original) or not 0<original<=1800:raise ValueError('Preparação aceita até 30 minutos; preserve o original e use um link para vídeos maiores')
 if profile=='mensageiro' and (start or duration):raise ValueError('Mensageiro preserva duração')
 if start<0 or (duration and start+duration>original+0.05):raise ValueError('Trecho fora do vídeo')
 seconds=duration or original
 if not minsec<=seconds<=maxsec:raise ValueError('Postagens exige escolha explícita de trecho entre 3 e 30 segundos')
 video=next((s for s in meta['streams'] if s['codec_type']=='video'),None)
 if not video or video.get('width',0)>8192 or video.get('height',0)>8192:raise ValueError('Resolução de entrada fora do limite de preparação')
 if max_bytes:limit=min(limit,max_bytes)
 audio=any(s['codec_type']=='audio' for s in meta['streams']);abps=96000 if audio else 0
 bitrate=math.floor(limit*8*.94/seconds)-abps
 if bitrate<150000:raise ValueError('Não cabe com qualidade mínima. Use um link para preservar o vídeo')
 bitrate=min(bitrate,6000000)
 # Não amplia. Normaliza SAR/orientação; preserva todo o enquadramento.
 vf="scale=w='min(720,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1"
 hdr=video.get('color_transfer') in ('smpte2084','arib-std-b67')
 if hdr:vf='zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,'+vf+',setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709'
 with tempfile.TemporaryDirectory() as d:
  log=str(Path(d)/'pass');out=Path(d)/'final.mp4'
  base=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-threads','2']
  if start:base+=['-ss',str(start)]
  base+=['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-i',str(source),'-t',str(seconds),'-map','0:v:0','-vf',vf,'-c:v','libx264','-threads','2','-preset','fast','-b:v',str(bitrate),'-pix_fmt','yuv420p','-r','30','-g','60','-flags','+cgop','-passlogfile',log]
  if hdr:base+=['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709']
  subprocess.run(base+['-pass','1','-an','-f','null','-y','/dev/null'],check=True,timeout=300,capture_output=True)
  subprocess.run(base+['-pass','2','-map','0:a:0?','-c:a','aac','-b:a','96k','-ar','48000','-movflags','+faststart','-y',str(out)],check=True,timeout=300,capture_output=True)
  final=probe(out);length=float(final['format']['duration'])
  if out.stat().st_size>limit:raise ValueError('Saída excedeu orçamento de bytes')
  if profile=='postagens' and not 3<=length<=30:raise ValueError('Duração final fora de 3–30 segundos')
  if profile=='mensageiro' and abs(length-original)>.12:raise ValueError('A conversão não preservou a duração')
  if any(s['codec_name']!=('h264' if s['codec_type']=='video' else 'aac') for s in final['streams'] if s['codec_type'] in ('video','audio')):raise ValueError('Codec final inválido')
  subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(out),'-f','null','-'],check=True,timeout=120,capture_output=True)
  target.write_bytes(out.read_bytes())
 return {'bytes':target.stat().st_size,'duration':length,'profile':profile}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('target');p.add_argument('--max-bytes',type=int,default=0);p.add_argument('--profile',choices=PROFILES,default='postagens');p.add_argument('--start',type=float,default=0);p.add_argument('--duration',type=float,default=0);a=p.parse_args()
 try:print(json.dumps(convert(a.source,a.target,a.profile,a.start,a.duration,a.max_bytes)))
 except Exception as e:p.exit(1,'Não foi possível preparar o vídeo: '+str(e)+'\n')
