"""Particionamento integral e bordas; encoder real com áudio e ordem temporal."""
import sys,tempfile,subprocess,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/wafly'))
from transcode import plan_parts,convert,probe
for duration,expected in [(59,[30,29]),(75,[30,30,15]),(90,[30,30,30]),(61,[30,28,3]),(31,[28,3]),(1800,[30]*60)]:
 parts=plan_parts(duration);assert [p['duracao'] for p in parts]==expected;assert sum(p['duracao'] for p in parts)==duration;assert parts[-1]['inicio']+parts[-1]['duracao']==duration
with tempfile.TemporaryDirectory() as d:
 source=Path(d)/'original.mp4'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=320x240:rate=24','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','75','-c:v','libx264','-preset','ultrafast','-threads','2','-c:a','aac','-y',str(source)],check=True)
 durations=[]
 for part in plan_parts(75):
  out=Path(d)/f"parte-{part['ordem']}.mp4";v=convert(source,out,'postagens',part['inicio'],part['duracao']);durations.append(v['duration']);assert out.stat().st_size<=9961472;assert any(s['codec_type']=='audio' for s in probe(out)['streams'])
 assert abs(sum(durations)-75)<.15
print('OK: partes 59/75/90s, cauda curta, 30min, áudio e encoder real sem perda de duração.')
