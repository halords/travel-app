from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'public' / 'icons'
root.mkdir(parents=True, exist_ok=True)

def icon(size, filename, maskable=False):
    scale = 3
    canvas = Image.new('RGB' if maskable else 'RGBA', (size * scale, size * scale), '#7060d8' if maskable else (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    side = size * scale
    if not maskable:
        draw.rounded_rectangle((0, 0, side - 1, side - 1), radius=side * .26, fill='#7060d8')
    def point(x, y): return (int(x * side), int(y * side))
    draw.polygon([point(.29, .68), point(.455, .315), point(.485, .29), point(.515, .29), point(.545, .315), point(.73, .68), point(.505, .57)], fill='white')
    draw.line([point(.505, .43), point(.505, .565)], fill='#d9d2ff', width=max(1, int(side * .035)))
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / filename)

icon(192, 'icon-192.png')
icon(512, 'icon-512.png')
icon(180, 'apple-touch-icon.png')
icon(512, 'maskable-512.png', True)
print('Created the install and home-screen icons.')
