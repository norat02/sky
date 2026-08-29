from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1200, 630
img = Image.new('RGB', (W, H), '#f0e7d3')
draw = ImageDraw.Draw(img)
ink, red, muted = '#26221c', '#c73e3a', '#5c5445'
for x in range(0, W, 80):
    draw.line((x, 0, x - 210, H), fill='#e6dbc4', width=2)
for y in range(80, H, 80):
    draw.line((0, y, W, y + 110), fill='#e6dbc4', width=1)
draw.ellipse((790, -125, 1130, 215), fill='#e3b44f')
draw.ellipse((875, -70, 1080, 120), fill='#f0e7d3')
try:
    title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 76)
    sub_font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc', 32, index=0)
except OSError:
    title_font = sub_font = ImageFont.load_default()
draw.text((90, 120), 'SKY BIRD', font=title_font, fill=ink)
draw.text((94, 225), 'CHUYẾN BAY BẦU TRỜI', font=sub_font, fill=red)
draw.line((94, 285, 450, 285), fill=red, width=4)
draw.text((94, 320), 'Arcade flight · Combo · Leaderboard', font=sub_font, fill=muted)
# Minimal bird silhouette and flight trail.
draw.polygon([(720, 310), (850, 250), (1020, 310), (850, 370)], fill=red)
draw.ellipse((815, 282, 925, 362), fill=ink)
draw.polygon([(925, 300), (1005, 325), (925, 342)], fill=red)
draw.ellipse((875, 298, 892, 315), fill='#f7f0de')
for i in range(5):
    draw.arc((590 - i * 35, 250 + i * 20, 800 - i * 35, 470 + i * 20), 195, 335, fill=muted, width=4)
draw.rectangle((0, 560, W, H), fill=ink)
draw.text((94, 580), 'PLAY IN YOUR BROWSER', font=sub_font, fill='#f7f0de')
Path('og-image.png').parent.mkdir(parents=True, exist_ok=True)
img.save('og-image.png', format='PNG', optimize=True)
