#!/usr/bin/env python3
# tools/make-foliage.py — builds assets/textures/leaves.webp, grasstuft.webp, bark*.jpg and grass*.jpg
# from CC0 sources: ambientCG LeafSet024, Foliage001, Grass004 (1K-JPG zips, unpacked into ACG/<id>/)
# and Poly Haven bark_brown_02 (1k diff + nor_gl saved as PH/bark0.jpg, PH/bark1.jpg).
# Usage: python3 tools/make-foliage.py ACG PH assets/textures
# Builds foliage textures for the game from CC0 ambientCG / Poly Haven sources.
import sys, random, math
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
acg, ph, out = sys.argv[1], sys.argv[2], sys.argv[3]
R = random.Random(11)

def cells(color, opac, n, m):
    C = Image.open(color).convert('RGB'); O = Image.open(opac).convert('L')
    W, H = C.size; res = []
    for j in range(m):
        for i in range(n):
            box = (i * W // n, j * H // m, (i + 1) * W // n, (j + 1) * H // m)
            im = C.crop(box).convert('RGBA'); a = O.crop(box)
            im.putalpha(a); bb = a.getbbox()
            if bb: res.append(im.crop(bb))
    return res

# ---- leaf cluster card: twigs + ~55 beech leaves (LeafSet024) -------------------
leaves = cells(f'{acg}/LeafSet024/LeafSet024_1K-JPG_Color.jpg', f'{acg}/LeafSet024/LeafSet024_1K-JPG_Opacity.jpg', 3, 3)
def cluster(seed, dark):
    R.seed(seed)
    S = 512; img = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    twigs = []
    for k in range(7):
        a = math.radians(-90 + R.uniform(-55, 55)); L = R.uniform(0.6, 0.85) * S * 0.5
        x0, y0 = S / 2, S * 0.97
        pts = [(x0, y0)]
        for s in range(1, 6):
            t = s / 5
            pts.append((x0 + math.cos(a) * L * t * 0.95, y0 + math.sin(a) * L * t * 1.6 + R.uniform(-6, 6)))
        twigs.append(pts)
        d.line(pts, fill=(72, 52, 36, 255), width=3)
    for k in range(150):
        tw = R.choice(twigs); p = R.choice(tw[1:])
        lf = R.choice(leaves)
        sc = R.uniform(0.13, 0.21) * S / max(lf.size)
        im = lf.resize((max(4, int(lf.size[0] * sc)), max(4, int(lf.size[1] * sc))), Image.LANCZOS)
        b = R.uniform(0.55, 1.05) * dark
        im = Image.merge('RGBA', [*ImageEnhance.Brightness(im.convert('RGB')).enhance(b).split(), im.getchannel('A')])
        im = im.rotate(R.uniform(-180, 180), expand=True, resample=Image.BICUBIC)
        img.alpha_composite(im, (int(p[0] - im.size[0] / 2 + R.uniform(-28, 28)), int(p[1] - im.size[1] / 2 + R.uniform(-28, 28))))
    return img
a = cluster(3, 1.0); b = cluster(9, 0.85)
atlas = Image.new('RGBA', (1024, 512)); atlas.paste(a, (0, 0)); atlas.paste(b, (512, 0))
# fill transparent pixels' RGB with the average leaf colour (no dark halos when mip-mapped)
bg = Image.new('RGBA', atlas.size, (88, 112, 52, 0)); bg.alpha_composite(atlas)
bg.save(f'{out}/leaves.webp', quality=82, method=6)

# ---- grass tuft card from the Foliage001 blades ---------------------------------
blades = cells(f'{acg}/Foliage001/Foliage001_1K-JPG_Color.jpg', f'{acg}/Foliage001/Foliage001_1K-JPG_Opacity.jpg', 9, 1)
T = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
R.seed(5)
for k in range(22):
    bl = R.choice(blades)
    h = R.uniform(0.55, 1.0) * 250
    im = bl.resize((max(3, int(bl.size[0] * h / bl.size[1] * 1.6)), int(h)), Image.LANCZOS)
    im = Image.merge('RGBA', [*ImageEnhance.Brightness(im.convert('RGB')).enhance(R.uniform(0.75, 1.15)).split(), im.getchannel('A')])
    im = im.rotate(R.uniform(-22, 22), expand=True, resample=Image.BICUBIC)
    T.alpha_composite(im, (int(128 - im.size[0] / 2 + R.uniform(-60, 60)), 256 - im.size[1]))
bg = Image.new('RGBA', T.size, (90, 110, 50, 0)); bg.alpha_composite(T)
bg.save(f'{out}/grasstuft.webp', quality=82, method=6)

# ---- bark & lawn ----------------------------------------------------------------
Image.open(f'{ph}/bark0.jpg').convert('RGB').resize((256, 256), Image.LANCZOS).save(f'{out}/bark.jpg', quality=82)
Image.open(f'{ph}/bark1.jpg').convert('RGB').resize((256, 256), Image.LANCZOS).save(f'{out}/bark_n.jpg', quality=85)
g = Image.open(f'{acg}/Grass004/Grass004_1K-JPG_Color.jpg').convert('RGB').resize((512, 512), Image.LANCZOS)
g.save(f'{out}/grass.jpg', quality=82)
Image.open(f'{acg}/Grass004/Grass004_1K-JPG_NormalGL.jpg').convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{out}/grass_n.jpg', quality=85)
print('ok')
