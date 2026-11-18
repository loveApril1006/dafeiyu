import struct
import zlib

import pytest

from qzone_sdk.utils.png import decode_png, render_qr_ascii


def _make_png(w: int, h: int, pixels: list[list[int]]) -> bytes:
    """构造最小灰度 PNG（8 位、非交错）。"""
    raw = b"".join(b"\x00" + bytes(row) for row in pixels)  # 每行滤波类型 0

    def chunk(t: bytes, d: bytes) -> bytes:
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)  # 灰度、8 位、非交错
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_decode_png():
    w, h, gray = decode_png(_make_png(2, 2, [[255, 0], [0, 255]]))
    assert (w, h) == (2, 2)
    assert gray == [[255, 0], [0, 255]]


def test_decode_png_not_png():
    with pytest.raises(ValueError):
        decode_png(b"not a png")


def test_decode_png_1bit_gray():
    # 8x2、1 位深灰度：PNG 中位值 1=白(255)、0=黑(0)
    img = _make_png_1bit(8, 2, [0xF0, 0x0F])
    w, h, gray = decode_png(img)
    assert (w, h) == (8, 2)
    assert gray[0] == [255, 255, 255, 255, 0, 0, 0, 0]
    assert gray[1] == [0, 0, 0, 0, 255, 255, 255, 255]


def _make_png_1bit(w: int, h: int, row_bytes: list[int]) -> bytes:
    """构造 1 位深灰度 PNG。"""
    raw = b"".join(b"\x00" + bytes([b]) for b in row_bytes)  # 每行滤波类型 0

    def chunk(t: bytes, d: bytes) -> bytes:
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 1, 0, 0, 0, 0)  # 灰度、1 位、非交错
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_render_qr_ascii_blocks():
    # 4x4：左上 2x2 黑、右下 2x2 白
    img = _make_png(4, 4, [[0, 0, 255, 255], [0, 0, 255, 255], [255, 255, 0, 0], [255, 255, 0, 0]])
    art = render_qr_ascii(img, max_width=4)
    lines = art.splitlines()
    assert lines[0] == "██  "   # 上两行：左半黑
    assert lines[1] == "  ██"   # 下两行：右半黑


def test_render_qr_ascii_halves():
    # 2x2：上半黑下半白 → 半块字符 ▀
    img = _make_png(2, 2, [[0, 0], [255, 255]])
    art = render_qr_ascii(img, max_width=2)
    assert art == "▀▀"
