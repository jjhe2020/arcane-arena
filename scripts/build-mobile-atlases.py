"""Derive a smaller complete frame library for phone GPUs. No master edits."""
from pathlib import Path
from PIL import Image
import concurrent.futures
import hashlib
import json
import time

root=Path(__file__).resolve().parent.parent
public=root/'public'
manifest_file=public/'data/assets.json'
manifest=json.loads(manifest_file.read_text(encoding='utf-8'))
clips={}
def collect(node):
    if isinstance(node,dict):
        if all(k in node for k in ('image','frames','columns','frameWidth','frameHeight')):
            clips[node['image']]=node
        for k,v in node.items():
            if k!='mobileAtlases': collect(v)
    elif isinstance(node,list):
        for v in node: collect(v)
collect(manifest)
started=time.monotonic()
def derive(item):
    url,clip=item
    target_size=256 if '/arenas/' in url else 128
    old_w,old_h=clip['frameWidth'],clip['frameHeight']
    if old_w<=target_size:return None
    columns=clip['columns'];rows=(clip['frames']+columns-1)//columns
    target_url='/art/mobile/'+url.removeprefix('/art/')
    target=public/target_url.lstrip('/')
    target.parent.mkdir(parents=True,exist_ok=True)
    source=public/url.lstrip('/')
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    sidecar=target.with_suffix('.json')
    if target.exists() and sidecar.exists():
        prior=json.loads(sidecar.read_text())
        if prior.get('sourceSha256')==digest and prior.get('frameWidth')==target_size:return (url,prior)
    sheet=Image.new('RGBA',(columns*target_size,rows*target_size))
    with Image.open(source) as image:
        for i in range(clip['frames']):
            x=(i%columns)*old_w;y=(i//columns)*old_h
            cell=image.crop((x,y,x+old_w,y+old_h)).resize((target_size,target_size),Image.Resampling.LANCZOS)
            sheet.paste(cell,((i%columns)*target_size,(i//columns)*target_size))
    sheet.save(target,'WEBP',lossless=True,method=0,exact=True)
    with Image.open(target) as check:
        check.load()
        assert check.size==sheet.size and check.mode=='RGBA'
        for i in {0,clip['frames']-1}:
            x=(i%columns)*target_size;y=(i//columns)*target_size
            assert check.crop((x,y,x+target_size,y+target_size)).tobytes()==sheet.crop((x,y,x+target_size,y+target_size)).tobytes()
    entry={'image':target_url,'frameWidth':target_size,'frameHeight':target_size,'width':sheet.width,'height':sheet.height,'sourceSha256':digest,'frames':clip['frames'],'columns':columns}
    sidecar.write_text(json.dumps(entry),encoding='utf-8')
    return (url,entry)
mobile={}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
    for n,result in enumerate(executor.map(derive,clips.items()),1):
        if result:mobile[result[0]]=result[1]
        if n%200==0:print(f'MOBILE {n}/{len(clips)}',flush=True)
manifest['mobileAtlases']=mobile
manifest_file.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
files=[public/e['image'].lstrip('/') for e in mobile.values()]
report={'status':'complete','atlases':len(mobile),'frames':sum(e['frames'] for e in mobile.values()),'bytes':sum(p.stat().st_size for p in files),'maximumDimension':max(max(e['width'],e['height']) for e in mobile.values()),'elapsedSeconds':round(time.monotonic()-started,2),'validation':'Every derived atlas decoded; first/last cells match the individually resized runtime frames. Original masters and desktop runtime atlases preserved.','sourcePolicy':'Derived per frame from the approved-art runtime library; no generative edits.'}
(public/'data/mobile-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
