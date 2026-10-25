import subprocess, sys
R='docs/video/screen.mov'; S='docs/video/slides'
VOICE='/Users/anudeepbonagiri/Desktop/Chancellor Hotel 2.m4a'
V="fps=30,crop=3000:1600:12:352,scale=1920:1024,pad=1920:1080:0:28:color=0x121417,setsar=1,format=yuv420p,setpts=PTS-STARTPTS"
# stills: (path, duration, prefit to 16:9, zoom amount, focus x, focus y)
stills={
 'title':(f'{S}/01.png',5.72,'',0.04,0.5,0.5),
 'arch1':(f'{S}/02.png',16.36,'',0.06,0.5,0.5),
 'ovw':('docs/evidence/dashboard/01-overview-day44.png',9.32,'crop=1280:684:0:36,pad=1280:720:0:18:color=0x121417,',0.05,0.5,0.5),
 'hold':('docs/images/gallery-00.png',16.76,'crop=1800:1013:0:90,',0.22,0.367,0.661),
 'droid':(f'{S}/03.png',14.16,'',0.05,0.5,0.5),
 'proof':(f'{S}/04.png',19.36,'',0.05,0.5,0.5),
 'bench':('docs/images/gallery-09-benchmark.png',23.68,'pad=2134:1200:167:0:color=0x121417,',0.04,0.5,0.5),
 'arch2':(f'{S}/02.png',6.02,'',0.04,0.5,0.5),
 'elastic':('docs/images/gallery-08.png',11.14,'pad=2134:1200:167:0:color=0x121417,',0.06,0.5,0.5),
 'close':(f'{S}/05.png',14.71,'',0.04,0.5,0.5),
}
# raw chat segments: (start, end, output duration)
raw={
 's2':(44.0,58.0,14.32), 's3':(60.5,74.3,13.80),
 's8a':(133.5,140.0,4.50), 's8b':(140.0,148.5,12.70),
 's9a':(148.5,155.0,3.92), 's9b':(155.0,165.5,8.88),
 's10a':(172.8,177.3,4.50), 's10b':(180.0,187.9,7.90),
 's11':(194.0,203.0,6.56),
 's12a':(233.0,245.0,7.60), 's12b1':(245.0,251.2,3.60), 's12b2':(251.2,258.44,7.24),
}
order=['title','s2','s3','arch1','ovw','hold','droid','s8a','s8b','s9a','s9b','s10a','s10b','s11','s12a','s12b1','s12b2','proof','bench','arch2','elastic','close']
args=['ffmpeg','-y','-v','error','-i',R]
idx={}
for k,(p,d,_,_,_,_) in stills.items():
    idx[k]=len(idx)+1
    args+=['-loop','1','-framerate','30','-t',f'{d}','-i',p]
aidx=len(idx)+1
args+=['-i',VOICE]
lines=[]
for k,(a,b,d) in raw.items():
    f=d/(b-a)
    lines.append(f"[0:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)*{f:.6f},{V}[{k}];")
for k,(p,d,pre,z,fx,fy) in stills.items():
    n=round(d*30)
    lines.append(f"[{idx[k]}:v]{pre}scale=3840:2160,setsar=1,zoompan=z='1+{z}*on/{n}':x='{fx}*(iw-iw/zoom)':y='{fy}*(ih-ih/zoom)':d=1:s=1920x1080:fps=30,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[{k}];")
lines.append(''.join(f'[{k}]' for k in order)+f"concat=n={len(order)}:v=1:a=0[v];")
lines.append(f"[{aidx}:a]highpass=f=80,afftdn=nr=10:nf=-30,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]")
open('/tmp/final.filter','w').write('\n'.join(lines))
args+=['-filter_complex_script','/tmp/final.filter','-map','[v]','-map','[a]','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart','docs/video/caliber.mp4']
r=subprocess.run(args,capture_output=True,text=True)
print('exit',r.returncode); print(r.stderr[-1500:])
