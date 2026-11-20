#!/usr/bin/env python3
"""Embed the North Pole ARG transmission in a compressed SWF DefineBinaryData tag."""
from __future__ import annotations

import json
import struct
import sys
import zlib
from pathlib import Path


def read_swf(path: Path) -> bytes:
    data = path.read_bytes()
    if data[:3] == b"CWS":
        body = zlib.decompress(data[8:])
        return b"FWS" + data[3:8] + body
    if data[:3] == b"FWS":
        return data
    raise ValueError("Expected a compressed or uncompressed SWF file")


def tag_span(data: bytes, offset: int) -> tuple[int, int, int]:
    word = struct.unpack_from("<H", data, offset)[0]
    code, length = word >> 6, word & 0x3F
    header_length = 2
    if length == 0x3F:
        length = struct.unpack_from("<I", data, offset + 2)[0]
        header_length = 6
    return code, offset + header_length, offset + header_length + length


def make_tag(code: int, payload: bytes) -> bytes:
    if len(payload) < 0x3F:
        return struct.pack("<H", (code << 6) | len(payload)) + payload
    return struct.pack("<HI", (code << 6) | 0x3F, len(payload)) + payload


def patch(source: Path, lore_path: Path, destination: Path) -> None:
    swf = bytearray(read_swf(source))
    declared_length = struct.unpack_from("<I", swf, 4)[0]
    if declared_length != len(swf):
        raise ValueError(f"SWF length mismatch: header says {declared_length}, file has {len(swf)}")

    # SWF header: signature/version/length, RECT, frame-rate, frame-count.
    rect_bits = swf[8] >> 3
    tag_offset = 8 + (5 + 4 * rect_bits + 7) // 8 + 4
    end_start = None
    while tag_offset < len(swf):
        code, _, next_offset = tag_span(swf, tag_offset)
        if code == 0:
            end_start = tag_offset
            break
        tag_offset = next_offset
    if end_start is None:
        raise ValueError("SWF has no End tag")

    lore = json.loads(lore_path.read_text(encoding="utf-8"))
    lore_bytes = b"NORTH_POLE_CONTINUITY\0" + json.dumps(lore, separators=(",", ":")).encode("utf-8")
    # DefineBinaryData = tag 87: unique character ID, four reserved zero bytes, opaque payload.
    data_tag = make_tag(87, struct.pack("<HI", 62000, 0) + lore_bytes)
    swf[end_start:end_start] = data_tag
    struct.pack_into("<I", swf, 4, len(swf))

    compressed = b"CWS" + bytes([swf[3]]) + struct.pack("<I", len(swf)) + zlib.compress(bytes(swf[8:]), 9)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(compressed)
    print(f"Wrote {destination} ({len(compressed):,} bytes); embedded lore tag {len(lore_bytes):,} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: patch_swf_lore.py input.swf lore-payload.json output.swf")
    patch(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
