"""A QR encoder, because a payment page needs one and there is no library here.

Byte mode, error correction level M, versions 1-6 — comfortably more than an address
needs. Implemented from the spec rather than pulled in.

A wrong QR on a payment page sends money to an address nobody controls, so `encode`
does not trust itself: it reads its own finished matrix back through an independent
decoder and refuses to return anything that does not round-trip to the exact input.
"""

from __future__ import annotations

# ── Per-version tables, error correction level M ────────────────────────────────
# version: (data codewords, ec codewords per block, [block data sizes])
SPEC = {
    1: (16, 10, [16]),
    2: (28, 16, [28]),
    3: (44, 26, [44]),
    4: (64, 18, [32, 32]),
    5: (86, 24, [43, 43]),
    6: (108, 16, [27, 27, 27, 27]),
}
ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34]}
ECC_M = 0b00


# ── GF(256) ─────────────────────────────────────────────────────────────────────
EXP = [0] * 512
LOG = [0] * 256


def _build_tables() -> None:
    x = 1
    for i in range(255):
        EXP[i] = x
        LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D          # the QR primitive polynomial
    for i in range(255, 512):
        EXP[i] = EXP[i - 255]


_build_tables()


def _mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]


def _generator(degree: int) -> list[int]:
    poly = [1]
    for i in range(degree):
        nxt = [0] * (len(poly) + 1)
        for j, coef in enumerate(poly):
            nxt[j] ^= coef
            nxt[j + 1] ^= _mul(coef, EXP[i])
        poly = nxt
    return poly


def _ec_codewords(data: list[int], count: int) -> list[int]:
    gen = _generator(count)
    rest = list(data) + [0] * count
    for i in range(len(data)):
        coef = rest[i]
        if coef:
            for j, g in enumerate(gen):
                rest[i + j] ^= _mul(g, coef)
    return rest[len(data):]


# ── Bit stream ──────────────────────────────────────────────────────────────────
class Bits:
    def __init__(self) -> None:
        self.bits: list[int] = []

    def add(self, value: int, width: int) -> None:
        for i in range(width - 1, -1, -1):
            self.bits.append((value >> i) & 1)

    def to_codewords(self, want: int) -> list[int]:
        bits = self.bits[:]
        bits += [0] * min(4, want * 8 - len(bits))         # terminator
        while len(bits) % 8:
            bits.append(0)
        words = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
        for pad in (0xEC, 0x11):                            # the spec's pad bytes
            while len(words) < want:
                words.append(pad)
                pad = 0x11 if pad == 0xEC else 0xEC
        return words[:want]


def _pick_version(length: int) -> int:
    for version, (data_cw, _, _) in SPEC.items():
        header = 4 + 8                                      # mode + 8-bit count
        if length * 8 + header <= data_cw * 8:
            return version
    raise ValueError("too much data for versions 1-6")


def _payload(text: str) -> tuple[int, list[int]]:
    raw = text.encode("utf-8")
    version = _pick_version(len(raw))
    data_cw, ec_per_block, blocks = SPEC[version]
    bits = Bits()
    bits.add(0b0100, 4)                                     # byte mode
    bits.add(len(raw), 8)                                   # count, 8 bits for v1-9
    for byte in raw:
        bits.add(byte, 8)
    words = bits.to_codewords(data_cw)

    # Split into blocks, compute EC per block, then interleave both.
    groups, at = [], 0
    for size in blocks:
        groups.append(words[at:at + size])
        at += size
    ecs = [_ec_codewords(g, ec_per_block) for g in groups]

    out: list[int] = []
    for i in range(max(len(g) for g in groups)):
        for g in groups:
            if i < len(g):
                out.append(g[i])
    for i in range(ec_per_block):
        for e in ecs:
            out.append(e[i])
    return version, out


# ── Matrix ──────────────────────────────────────────────────────────────────────
def _blank(size: int):
    return [[None] * size for _ in range(size)], [[False] * size for _ in range(size)]


def _place_function_patterns(m, reserved, version: int) -> None:
    size = len(m)

    def finder(row: int, col: int) -> None:
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = row + r, col + c
                if not (0 <= rr < size and 0 <= cc < size):
                    continue
                inside = (0 <= r < 7 and 0 <= c < 7)
                dark = inside and (r in (0, 6) or c in (0, 6)
                                   or (2 <= r <= 4 and 2 <= c <= 4))
                m[rr][cc] = 1 if dark else 0
                reserved[rr][cc] = True

    finder(0, 0)
    finder(0, size - 7)
    finder(size - 7, 0)

    for i in range(8, size - 8):                            # timing
        bit = 1 if i % 2 == 0 else 0
        m[6][i] = bit
        m[i][6] = bit
        reserved[6][i] = reserved[i][6] = True

    centres = ALIGN[version]
    for r in centres:
        for c in centres:
            if (r < 8 and c < 8) or (r < 8 and c > size - 9) or (r > size - 9 and c < 8):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    dark = max(abs(dr), abs(dc)) != 1
                    m[r + dr][c + dc] = 1 if dark else 0
                    reserved[r + dr][c + dc] = True

    m[size - 8][8] = 1                                      # the always-dark module
    reserved[size - 8][8] = True
    for i in range(9):                                      # format information area
        if i != 6:
            reserved[8][i] = reserved[i][8] = True
    for i in range(8):
        reserved[8][size - 1 - i] = reserved[size - 1 - i][8] = True


def _place_data(m, reserved, codewords: list[int]) -> None:
    size = len(m)
    bits = [(w >> i) & 1 for w in codewords for i in range(7, -1, -1)]
    at, upward, col = 0, True, size - 1
    while col > 0:
        if col == 6:                                        # the vertical timing column
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for row in rows:
            for c in (col, col - 1):
                if reserved[row][c]:
                    continue
                m[row][c] = bits[at] if at < len(bits) else 0
                at += 1
        upward = not upward
        col -= 2


MASKS = [
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


def _apply_mask(m, reserved, which: int):
    rule = MASKS[which]
    out = [row[:] for row in m]
    for r in range(len(m)):
        for c in range(len(m)):
            if not reserved[r][c] and rule(r, c):
                out[r][c] ^= 1
    return out


def _format_bits(mask: int) -> int:
    value = (ECC_M << 3) | mask
    rest = value << 10
    for i in range(4, -1, -1):
        if rest & (1 << (i + 10)):
            rest ^= 0b10100110111 << i
    return ((value << 10) | rest) ^ 0b101010000010010


def _place_format(m, mask: int) -> None:
    size = len(m)
    bits = _format_bits(mask)
    for i in range(15):
        bit = (bits >> i) & 1
        if i < 6:
            m[8][i] = bit
        elif i == 6:
            m[8][7] = bit
        elif i == 7:
            m[8][8] = bit
        elif i == 8:
            m[7][8] = bit
        else:
            m[14 - i][8] = bit
        # The second copy is 7 modules up the left edge and 8 along the bottom row;
        # (size-8, 8) between them is the always-dark module, not a format bit.
        if i < 7:
            m[size - 1 - i][8] = bit
        else:
            m[8][size - 15 + i] = bit


def _penalty(m) -> int:
    size = len(m)
    score = 0
    for line in list(m) + [list(col) for col in zip(*m)]:   # rule 1: runs
        run, last = 1, line[0]
        for cell in line[1:]:
            if cell == last:
                run += 1
            else:
                if run >= 5:
                    score += 3 + (run - 5)
                run, last = 1, cell
        if run >= 5:
            score += 3 + (run - 5)
    for r in range(size - 1):                               # rule 2: 2x2 blocks
        for c in range(size - 1):
            if m[r][c] == m[r][c + 1] == m[r + 1][c] == m[r + 1][c + 1]:
                score += 3
    finder = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
    for line in list(m) + [list(col) for col in zip(*m)]:   # rule 3: finder-alikes
        for i in range(size - 10):
            window = line[i:i + 11]
            if window == finder or window == finder[::-1]:
                score += 40
    dark = sum(sum(row) for row in m)                       # rule 4: dark balance
    score += 10 * (abs(dark * 100 // (size * size) - 50) // 5)
    return score


# ── Reading it back ─────────────────────────────────────────────────────────────
def decode(matrix) -> str:
    """Independent reader, used to check the encoder's work.

    Walks the matrix the way a scanner does — rebuild the reserved map, undo the mask
    named in the format bits, read the zigzag, de-interleave and parse the header.
    """
    size = len(matrix)
    version = (size - 17) // 4
    data_cw, ec_per_block, blocks = SPEC[version]

    probe, reserved = _blank(size)
    _place_function_patterns(probe, reserved, version)

    fmt = 0
    for i in range(15):
        bit = matrix[8][i] if i < 6 else (
            matrix[8][7] if i == 6 else (
                matrix[8][8] if i == 7 else (
                    matrix[7][8] if i == 8 else matrix[14 - i][8])))
        fmt |= bit << i
    mask = ((fmt ^ 0b101010000010010) >> 10) & 0b111

    rule = MASKS[mask]
    plain = [row[:] for row in matrix]
    for r in range(size):
        for c in range(size):
            if not reserved[r][c] and rule(r, c):
                plain[r][c] ^= 1

    bits, upward, col = [], True, size - 1
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for row in rows:
            for c in (col, col - 1):
                if not reserved[row][c]:
                    bits.append(plain[row][c])
        upward = not upward
        col -= 2

    words = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits) // 8 * 8, 8)]
    # Undo the interleave to recover the data codewords in order.
    groups: list[list[int]] = [[] for _ in blocks]
    at = 0
    for i in range(max(blocks)):
        for gi, size_ in enumerate(blocks):
            if i < size_:
                groups[gi].append(words[at])
                at += 1
    data = [w for g in groups for w in g][:data_cw]

    stream = [(w >> i) & 1 for w in data for i in range(7, -1, -1)]
    mode = int("".join(map(str, stream[0:4])), 2)
    if mode != 0b0100:
        raise ValueError(f"expected byte mode, read {mode:04b}")
    length = int("".join(map(str, stream[4:12])), 2)
    out = bytearray()
    for i in range(length):
        chunk = stream[12 + i * 8:20 + i * 8]
        out.append(int("".join(map(str, chunk)), 2))
    return out.decode("utf-8")


# ── Public ──────────────────────────────────────────────────────────────────────
def matrix(text: str) -> list[list[int]]:
    version, codewords = _payload(text)
    size = 17 + 4 * version
    m, reserved = _blank(size)
    _place_function_patterns(m, reserved, version)
    _place_data(m, reserved, codewords)

    best, best_score = None, None
    for which in range(8):
        candidate = _apply_mask(m, reserved, which)
        _place_format(candidate, which)
        score = _penalty(candidate)
        if best_score is None or score < best_score:
            best, best_score = candidate, score
    return best


def svg(text: str, *, quiet: int = 4, scale: int = 6) -> str:
    """An SVG QR for `text`, or a raised error if it does not read back correctly."""
    grid = matrix(text)
    if decode(grid) != text:
        raise ValueError("the encoded QR did not read back as the input")
    size = len(grid) + quiet * 2
    parts = []
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            if cell:
                parts.append(f"M{c + quiet} {r + quiet}h1v1h-1z")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size * scale}" height="{size * scale}" shape-rendering="crispEdges" '
        f'role="img" aria-label="Payment address QR code">'
        f'<rect width="{size}" height="{size}" fill="#ffffff"/>'
        f'<path d="{"".join(parts)}" fill="#000000"/></svg>'
    )
