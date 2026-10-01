"""Textures for the roadside kit: concrete, sandcrete blocks, corrugated roofing, elephant grass, and
fictional hand-painted signs and billboards (no real brands)."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kit_tex')
os.makedirs(OUT, exist_ok=True)
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
COND = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
rng = np.random.default_rng(7)


def noise(n, octaves=5, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    for o in range(octaves):
        f = 2 ** (o + 2)
        g = r.random((f + 1, f + 1)).astype(np.float32)
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
        out += np.asarray(img, np.float32) / 255 / (2 ** o)
    return out / out.max()


def save(name, arr):
    Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name))


def concrete(n=512):
    nz = noise(n, 6, 1)
    base = 0.5 + (nz - 0.5) * 0.16
    v = np.linspace(0, 1, n)[:, None]
    stain = np.clip((v - 0.6) * 2.2, 0, 1) * noise(n, 4, 2) * 0.25           # damp / dirt rising from the bottom
    g = base - stain
    save('concrete.png', np.dstack([g * 1.0, g * 0.98, g * 0.94]))


def blocks(n=512):
    """Sandcrete blocks: 4 across × 8 rows per tile, grey mortar, slight colour variation."""
    img = np.zeros((n, n, 3), np.float32)
    nz = noise(n, 6, 3)
    bw, bh = n // 4, n // 8
    for r in range(8):
        off = (bw // 2) * (r % 2)
        for c in range(-1, 5):
            x0 = c * bw + off; y0 = r * bh
            tone = 0.6 + rng.random() * 0.08
            xs, xe = max(0, x0 + 3), min(n, x0 + bw - 3)
            if xs < xe: img[y0 + 3:y0 + bh - 3, xs:xe] = tone
    mortar = (img.sum(axis=2) == 0)
    img[mortar] = 0.5
    img *= (0.88 + nz[..., None] * 0.2)
    img[..., 2] *= 0.95
    save('blocks.png', img)


def corrugated(n=256):
    u = np.linspace(0, 1, n)[None, :].repeat(n, 0)
    h = np.sin(u * 16 * 2 * math.pi) * 0.5 + 0.5
    gx = np.gradient(h, axis=1) * 10
    nrm = np.dstack([-gx, np.zeros_like(gx), np.ones_like(gx)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    save('corrugated_normal.png', nrm * 0.5 + 0.5)
    nz = noise(n, 5, 4)
    rust = np.clip((nz - 0.45) * 3, 0, 1) * np.clip(np.linspace(0.3, 1, n)[:, None], 0, 1)
    zinc = np.dstack([0.62 + h * 0.06, 0.64 + h * 0.06, 0.64 + h * 0.06])
    rustc = np.array([0.42, 0.2, 0.09])
    save('roof_rust.png', zinc * (1 - rust[..., None]) + rustc * rust[..., None])


def grass(w=512, h=512):
    """Elephant-grass tuft card (RGBA): tall blades fanning out, green to straw."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for _ in range(140):
        x0 = w / 2 + rng.normal(0, w * 0.08); lean = rng.normal(0, w * 0.22)
        top = h * (0.02 + rng.random() * 0.45)
        g = rng.random()
        col = (int(70 + g * 110), int(110 + g * 70), int(40 + g * 25), 255)
        pts = [(x0 + lean * t * t, h - (h - top) * t) for t in np.linspace(0, 1, 8)]
        d.line(pts, fill=col, width=int(3 + rng.random() * 4))
    im = im.filter(ImageFilter.SMOOTH)
    im.save(os.path.join(OUT, 'grass.png'))


def sign(name, lines, bg, fg, w=1024, h=384, accent=None, font=BOLD, border=True):
    """Hand-painted style shop sign."""
    im = Image.new('RGB', (w, h), bg); d = ImageDraw.Draw(im)
    if accent: d.rectangle([0, h - h // 6, w, h], fill=accent)
    if border: d.rectangle([6, 6, w - 7, h - 7], outline=fg, width=8)
    sizes = [int(h * 0.3), int(h * 0.16), int(h * 0.13)]
    y = h * 0.33 if len(lines) > 1 else h * 0.5
    for i, t in enumerate(lines):
        f = ImageFont.truetype(font, sizes[min(i, 2)])
        while d.textlength(t, font=f) > w * 0.9: f = ImageFont.truetype(font, f.size - 4)
        d.text((w / 2, y), t, fill=fg if i == 0 else fg, font=f, anchor='mm')
        y += sizes[min(i, 2)] * (1.25 if i == 0 else 1.2)
    # weathering: faded, speckled
    a = np.asarray(im, np.float32) / 255
    nz = noise(max(w, h), 4, hash(name) % 1000)[:h, :w]
    a = a * (0.86 + nz[..., None] * 0.16) + (1 - a) * 0.04
    save(name, a)


def billboard(name, title, sub, bg1, bg2, fg, w=1536, h=640, tag=''):
    im = Image.new('RGB', (w, h), bg1); d = ImageDraw.Draw(im)
    for y in range(h):  # vertical gradient
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(bg1[i] * (1 - t) + bg2[i] * t) for i in range(3)))
    d.ellipse([w * 0.62, -h * 0.3, w * 1.25, h * 1.1], fill=tuple(min(255, c + 40) for c in bg1))
    f1 = ImageFont.truetype(BOLD, 120); f2 = ImageFont.truetype(COND, 64); f3 = ImageFont.truetype(BOLD, 40)
    d.text((70, h * 0.36), title, fill=fg, font=f1, anchor='lm')
    d.text((74, h * 0.62), sub, fill=fg, font=f2, anchor='lm')
    if tag: d.text((74, h * 0.84), tag, fill=fg, font=f3, anchor='lm')
    a = np.asarray(im, np.float32) / 255
    nz = noise(w, 4, hash(name) % 997)[:h, :w]
    save(name, a * (0.9 + nz[..., None] * 0.1))


def price_board(name):
    im = Image.new('RGB', (512, 768), (20, 60, 120)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(BOLD, 72); f2 = ImageFont.truetype(COND, 96)
    for i, (k, v) in enumerate((('PMS', '1,050'), ('AGO', '1,320'), ('DPK', '1,400'))):
        y = 120 + i * 220
        d.rectangle([30, y - 70, 482, y + 90], fill=(245, 245, 240))
        d.text((256, y - 20), k, fill=(20, 60, 120), font=f, anchor='mm')
        d.text((256, y + 50), '₦' + v, fill=(200, 30, 30), font=f2, anchor='mm')
    im.save(os.path.join(OUT, name))


if __name__ == '__main__':
    concrete(); blocks(); corrugated(); grass()
    sign('sign_provisions.png', ['MAMA TOLU', 'PROVISIONS & SOFT DRINKS', 'Pure water sold here'], (250, 214, 40), (30, 30, 30), accent=(200, 30, 30))
    sign('sign_buka.png', ['IYA BASIRAT', 'FOOD IS READY', 'Amala · Ewedu · Rice'], (240, 240, 232), (20, 110, 50), accent=(20, 110, 50))
    sign('sign_vulcanizer.png', ['VULCANIZER', 'Tyre repair & gas', '24 hours'], (30, 30, 30), (250, 210, 40))
    sign('sign_pos.png', ['POS', 'Withdrawal · Transfer', 'Recharge card'], (20, 90, 170), (255, 255, 255))
    sign('sign_church.png', ['GRACE GOSPEL ASSEMBLY', 'Sunday Service 8am', 'All are welcome'], (250, 250, 250), (30, 50, 140), font=SERIF)
    sign('sign_station.png', ['KOLA OIL'], (220, 40, 40), (255, 255, 255), w=1024, h=256, border=False)
    price_board('sign_prices.png')
    billboard('bb_network.png', 'NaijaNet 5G', 'Talk more. Browse more. Pay less.', (120, 20, 140), (60, 10, 90), (255, 255, 255), tag='Dial *555# to join')
    billboard('bb_rice.png', 'Ofada Gold', 'Proudly local rice. Sweet like home.', (230, 160, 20), (170, 90, 10), (40, 20, 0), tag='Now in every market')
    billboard('bb_safety.png', 'Drive safe.', 'Arrive alive. Speed kills, slow down.', (20, 120, 70), (10, 70, 40), (255, 255, 255), tag='Lagos–Ibadan Expressway')
    print('ok', sorted(os.listdir(OUT)))
