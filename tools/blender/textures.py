"""Small textures for the bus: number plate and side livery text (fictional, no real brands)."""
from PIL import Image, ImageDraw, ImageFont

BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
COND = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


def plate(path):
    W, H = 512, 160
    im = Image.new('RGB', (W, H), (246, 246, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 3, W - 4, H - 4], outline=(30, 90, 50), width=6)
    d.text((W / 2, 30), 'LAGOS', fill=(20, 110, 60), font=ImageFont.truetype(BOLD, 26), anchor='mm')
    d.text((W / 2, 92), 'KJA 482 XY', fill=(25, 25, 25), font=ImageFont.truetype(COND, 64), anchor='mm')
    d.text((W / 2, 140), 'CENTRE OF EXCELLENCE', fill=(20, 110, 60), font=ImageFont.truetype(BOLD, 18), anchor='mm')
    im.save(path)


def livery(path):
    """Side band: fictional operator name over blue/yellow stripes."""
    W, H = 2048, 256
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 150, W, 196], fill=(29, 95, 168, 255))
    d.rectangle([0, 200, W, 216], fill=(240, 180, 20, 255))
    f = ImageFont.truetype(BOLD, 92)
    d.text((W / 2, 78), 'LAGOS  —  IBADAN', fill=(29, 95, 168, 255), font=f, anchor='mm')
    im.save(path)


if __name__ == '__main__':
    plate('plate.png')
    livery('livery.png')
