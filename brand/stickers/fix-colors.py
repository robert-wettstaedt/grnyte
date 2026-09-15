#!/usr/bin/env python3
"""Post-process the FOGRA51 PDF: force the black to K-only and push the purple toward the
gamut boundary. ICC conversion turns RGB black into a rich black, which misregisters on a QR
at 0.74 mm per module, and it converts the brand violet conservatively."""
import re
import sys
import zlib

RICH_BLACK = b"0.824 0.671 0.51 0.945"
K_ONLY = b"0 0 0 1"
ICC_PURPLE = b"0.608 0.808 0 0"
VIVID_PURPLE = b"0.7 0.95 0 0"


def patch(content: bytes) -> tuple[bytes, int]:
    hits = 0
    for old, new in ((RICH_BLACK, K_ONLY), (ICC_PURPLE, VIVID_PURPLE)):
        # keep byte length identical so stream offsets stay sane before the normalising pass
        padded = new + b" " * (len(old) - len(new))
        assert len(padded) == len(old)
        hits += content.count(old)
        content = content.replace(old, padded)
    return content, hits


def main(src: str, dst: str) -> None:
    raw = open(src, "rb").read()
    out = bytearray()
    pos = 0
    total = 0
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", raw, re.S):
        body = m.group(1)
        try:
            plain = zlib.decompress(body)
        except zlib.error:
            continue
        patched, hits = patch(plain)
        if hits == 0:
            continue
        total += hits
        redone = zlib.compress(patched, 9)
        out += raw[pos : m.start(1)]
        out += redone
        pos = m.end(1)
    out += raw[pos:]
    open(dst, "wb").write(bytes(out))
    print(f"substitutions: {total}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
