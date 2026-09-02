#!/usr/bin/env python3
import math
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
ICON_DIR.mkdir(exist_ok=True)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: pathlib.Path, size: int, pixels: bytes) -> None:
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def shield_distance(x: float, y: float) -> float:
    """Negative inside. x,y in 0..1."""
    cx = 0.5
    top, bottom = 0.12, 0.90
    half_top = 0.30
    waist = 0.52
    if y < top:
        return top - y
    if y <= waist:
        return abs(x - cx) - half_top
    t = (y - waist) / (bottom - waist)
    half = half_top * (1 - t)
    if y > bottom:
        return y - bottom
    return abs(x - cx) - half


def wave_distance(x: float, y: float) -> float:
    curve = 0.50 + 0.07 * math.sin((x - 0.22) / 0.56 * math.pi * 2)
    if x < 0.22 or x > 0.78:
        return 1
    return abs(y - curve) - 0.035


def draw(size: int) -> bytes:
    fill = (139, 124, 184)
    fill_hi = (168, 154, 210)
    fill_lo = (104, 90, 148)
    wave = (22, 22, 26)
    pixels = bytearray(size * size * 4)
    aa = 1.25 / size
    for y in range(size):
        for x in range(size):
            px = (x + 0.5) / size
            py = (y + 0.5) / size
            d = shield_distance(px, py)
            alpha = max(0.0, min(1.0, (aa - d) / (2 * aa))) if d > -aa else 1.0
            idx = (y * size + x) * 4
            if alpha <= 0:
                continue
            shade = max(0.0, min(1.0, (py - 0.18) / 0.7))
            r = int(fill_hi[0] * (1 - shade) + fill_lo[0] * shade)
            g = int(fill_hi[1] * (1 - shade) + fill_lo[1] * shade)
            b = int(fill_hi[2] * (1 - shade) + fill_lo[2] * shade)
            if wave_distance(px, py) <= 0 and d < -0.01:
                r, g, b = wave
            a = int(255 * alpha)
            pixels[idx:idx + 4] = bytes((r, g, b, a))
    return bytes(pixels)


def main() -> None:
    for size in (16, 32, 48, 128):
        write_png(ICON_DIR / f"icon{size}.png", size, draw(size))


if __name__ == "__main__":
    main()
