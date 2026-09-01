from PIL import Image
from pathlib import Path
out=Path(__file__).parents[1]/'public'/'icons';out.mkdir(parents=True,exist_ok=True)
source=out/'icon-source.png'
if not source.exists(): raise SystemExit('Missing public/icons/icon-source.png')
im=Image.open(source).convert('RGBA')
w,h=im.size;side=min(w,h);left=(w-side)//2;top=(h-side)//2;im=im.crop((left,top,left+side,top+side))
for size in (180,192,512):
 im.resize((size,size),Image.Resampling.LANCZOS).save(out/f'icon-{size}.png',optimize=True)
print('ICON_OK',','.join(str((out/f'icon-{s}.png').stat().st_size) for s in (180,192,512)))
