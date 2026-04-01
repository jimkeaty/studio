#!/usr/bin/env python3
"""Generate PWA app icons for Smart Broker USA."""
from PIL import Image, ImageDraw, ImageFont
import os

# Brand colors
BG_COLOR = (37, 99, 235)       # Blue-600 (#2563eb)
TEXT_COLOR = (255, 255, 255)   # White

def make_icon(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect background
    radius = size // 5
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG_COLOR)

    # Draw "SB" text centered
    font_size = size // 3
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "SB"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    draw.text((x, y), text, fill=TEXT_COLOR, font=font)

    img.save(path, "PNG")
    print(f"  Created {path} ({size}x{size})")

os.makedirs("/home/ubuntu/studio/public/icons", exist_ok=True)

sizes = [72, 96, 128, 144, 152, 192, 384, 512]
for s in sizes:
    make_icon(s, f"/home/ubuntu/studio/public/icons/icon-{s}x{s}.png")

# Also create apple-touch-icon
make_icon(180, "/home/ubuntu/studio/public/apple-touch-icon.png")
# favicon
make_icon(32, "/home/ubuntu/studio/public/favicon.ico")

print("All icons generated.")
