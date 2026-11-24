from pathlib import Path
import subprocess,json,hashlib,os
root=Path.cwd()
binpath=Path(os.environ.get('ASCII_AUDIT_FFMPEG_BIN',''))
def run(name,args):
    p=subprocess.run([str(binpath/(name+'.exe')),*map(str,args)],capture_output=True,text=True,encoding='utf-8',errors='replace')
    if p.returncode: raise RuntimeError(p.stderr)
    return p.stdout,p.stderr
files=[root/'src/demo/statue-demo.mp4',root/'tests/fixtures/chrome-raw-avc1.mp4',root/'tests/fixtures/chrome-raw-vp9.webm']
files += [root/'.audit-backup'/name for name in ['finalized-avc1.mp4','finalized-vp9.webm','smoke-png.png','smoke-mp4.mp4','smoke-mp4-repeat.mp4','smoke-webm.webm','smoke-gif.gif','auto-limit.gif'] if (root/'.audit-backup'/name).exists()]
results=[]
for file in files:
    data=json.loads(run('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,profile,level,width,height,time_base,duration,nb_frames,nb_read_frames,color_range,color_space:format=duration,size','-of','json',file])[0])
    _,stderr=run('ffmpeg',['-v','error','-xerror','-i',file,'-fps_mode','passthrough','-enc_time_base','demux','-f','null','-'])
    duration=float(data.get('format',{}).get('duration',0))
    seeks=[]
    if duration>0 and file.suffix in ['.mp4','.webm']:
        for fraction in [0.5,0.9]:
            target=duration*fraction
            stdout,err=run('ffmpeg',['-v','error','-xerror','-ss',f'{target:.6f}','-i',file,'-frames:v','1','-f','framemd5','-'])
            frames=[line for line in stdout.splitlines() if line and not line.startswith('#')]
            if len(frames)!=1: raise RuntimeError(f'seek has no frame {file} {target}')
            seeks.append({'fraction':fraction,'seconds':target,'decoded':len(frames),'stderr':err})
    packets=json.loads(run('ffprobe',['-v','error','-show_packets','-show_entries','packet=pts_time,dts_time,duration_time,flags','-of','json',file])[0]).get('packets',[])
    pts=[float(p['pts_time']) for p in packets if 'pts_time' in p]
    result={'file':str(file.relative_to(root)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'probe':data,'decodeStderr':stderr,'seeks':seeks,'packets':len(packets),'maxPtsGap':max([b-a for a,b in zip(pts,pts[1:])] or [0])}
    results.append(result)
    print(json.dumps(result,ensure_ascii=False))
    if file.suffix in ['.mp4','.webm']:
        run('ffmpeg',['-v','error','-y','-i',file,'-frames:v','1',root/'.audit-backup'/(file.stem+'-first.png')])
hashes={}
for codec in ['avc1.mp4','vp9.webm']:
    entries=[]
    for file in [root/'tests/fixtures'/('chrome-raw-'+codec),root/'.audit-backup'/('finalized-'+codec)]:
        packets=json.loads(run('ffprobe',['-v','error','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash','-of','json',file])[0])['packets']
        entries.append([p['data_hash'] for p in packets])
    assert entries[0]==entries[1],codec
    hashes[codec]={'identicalEncodedPackets':len(entries[0])}
(root/'.audit-backup/media-results.json').write_text(json.dumps({'files':results,'packetHashes':hashes},indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(hashes))

