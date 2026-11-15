from pathlib import Path
import json
import re
import subprocess
import os

root=Path(__file__).resolve().parents[1]
ffmpeg=Path(os.environ.get('FFMPEG',str(root/'.local/tools/node_modules/ffmpeg-static/ffmpeg')))
raw=root/'.local/native-recording.mp4'
report=json.loads((root/'docs/native-audio-test.json').read_text())
out=root.parent/'output/demo'
out.mkdir(parents=True,exist_ok=True)
texts=root/'.local/captions'
texts.mkdir(exist_ok=True)
probe=subprocess.run([str(ffmpeg),'-hide_banner','-i',str(raw)],capture_output=True,text=True)
m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',probe.stderr)
duration=int(m[1])*3600+int(m[2])*60+float(m[3])
font="/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
def text_filter(name,text,size,y,color='white',enable=None):
    (texts/name).write_text(text)
    f=f"drawtext=fontfile='{font}':textfile=.local/captions/{name}:fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}"
    if enable:f+=f":enable='{enable}'"
    return f
filters=['pad=1280:880:0:80:color=0x101b27']
filters.append(text_filter('title.txt','텔레CAR시 | Pleos Connect 실제 실행 데모',28,24))
filters.append(text_filter('scope.txt','가상 위치 · 실제 음성 통신 · 터치 조작 시연 · 화면 녹화는 무음',17,849,'0xB4C6D0'))
timeline=report['timeline']
for i,item in enumerate(timeline):
    end=timeline[i+1]['at'] if i+1<len(timeline) else duration
    filters.append(text_filter(f'step-{i}.txt',item['label'],24,811,'0x71E6C5',f'between(t,{item["at"]:.2f},{end:.2f})'))
target=out/'텔레CAR시_Pleos_데모시연.mp4'
subprocess.run([str(ffmpeg),'-y','-hide_banner','-loglevel','warning','-i',str(raw),'-vf',','.join(filters),'-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','-map_metadata','-1',str(target)],cwd=root,check=True)
print(target)
print('duration_seconds:',duration)
