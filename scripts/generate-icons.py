from PIL import Image,ImageDraw
from pathlib import Path
out=Path(__file__).parents[1]/'public'/'icons';out.mkdir(parents=True,exist_ok=True)
for size in (180,192,512):
 im=Image.new('RGB',(size,size),'#07080b');d=ImageDraw.Draw(im)
 d.rounded_rectangle((0,0,size-1,size-1),radius=round(size*.23),fill='#07080b')
 d.ellipse((size*.18,size*.18,size*.82,size*.82),outline='#e3264f',width=max(7,round(size*.045)))
 d.ellipse((size*.42,size*.42,size*.58,size*.58),fill='#e3264f')
 d.line((size*.32,size*.68,size*.68,size*.32),fill='#f7f8fa',width=max(6,round(size*.035)))
 im.save(out/f'icon-{size}.png',optimize=True)
print('ICON_OK',','.join(str((out/f'icon-{s}.png').stat().st_size) for s in (180,192,512)))
