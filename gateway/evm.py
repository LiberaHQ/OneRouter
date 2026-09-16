"""The EVM primitives Arc needs: Keccak-256, address derivation, signature recovery.

Keccak-256 is not SHA3-256 — same permutation, different padding — so hashlib cannot
stand in for it, and every Ethereum address and event topic depends on it. It is
implemented here rather than pulled in, which keeps the dependency surface at the one
package `auth.py` already needs.
"""

from __future__ import annotations

_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
        [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_MASK = (1 << 64) - 1


def _rotl(value: int, shift: int) -> int:
    return ((value << shift) | (value >> (64 - shift))) & _MASK


def _permute(lanes: list[list[int]]) -> None:
    for rnd in range(24):
        # theta
        c = [lanes[x][0] ^ lanes[x][1] ^ lanes[x][2] ^ lanes[x][3] ^ lanes[x][4]
             for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rotl(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                lanes[x][y] ^= d[x]
        # rho and pi
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rotl(lanes[x][y], _ROT[x][y])
        # chi
        for x in range(5):
            for y in range(5):
                lanes[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y] & _MASK)
        # iota
        lanes[0][0] ^= _RC[rnd]


def keccak256(data: bytes) -> bytes:
    rate = 136  # 1088 bits, the rate for a 256-bit digest
    padded = bytearray(data)
    padded.append(0x01)                       # Keccak padding, not SHA3's 0x06
    while len(padded) % rate:
        padded.append(0x00)
    padded[-1] |= 0x80

    lanes = [[0] * 5 for _ in range(5)]
    for offset in range(0, len(padded), rate):
        block = padded[offset:offset + rate]
        for i in range(rate // 8):
            x, y = i % 5, i // 5
            lanes[x][y] ^= int.from_bytes(block[i * 8:i * 8 + 8], "little")
        _permute(lanes)

    out = bytearray()
    for i in range(4):  # 32 bytes out of the first squeeze
        x, y = i % 5, i // 5
        out += lanes[x][y].to_bytes(8, "little")
    return bytes(out[:32])


# ── secp256k1, for recovering the signer of a personal_sign ─────────────────────
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8


def _add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if p1 == p2:
        lam = 3 * x1 * x1 * pow(2 * y1, P - 2, P) % P
    else:
        lam = (y2 - y1) * pow(x2 - x1, P - 2, P) % P
    x3 = (lam * lam - x1 - x2) % P
    return (x3, (lam * (x1 - x3) - y1) % P)


def _mul(point, scalar: int):
    result, addend = None, point
    while scalar:
        if scalar & 1:
            result = _add(result, addend)
        addend = _add(addend, addend)
        scalar >>= 1
    return result


def recover_address(message_hash: bytes, signature: bytes) -> str:
    """The address that produced this signature, from (r, s, v) — EVM signatures carry
    no public key, so it is recovered from the curve maths."""
    if len(signature) != 65:
        raise ValueError("an EVM signature is 65 bytes")
    r = int.from_bytes(signature[0:32], "big")
    s = int.from_bytes(signature[32:64], "big")
    v = signature[64]
    if v >= 27:
        v -= 27
    if not (0 < r < N and 0 < s < N) or v not in (0, 1):
        raise ValueError("signature values are out of range")

    # Rebuild the point R from its x-coordinate and the parity bit.
    x = r
    y_sq = (pow(x, 3, P) + 7) % P
    y = pow(y_sq, (P + 1) // 4, P)
    if pow(y, 2, P) != y_sq:
        raise ValueError("no curve point matches r")
    if y % 2 != v:
        y = P - y

    e = int.from_bytes(message_hash, "big")
    r_inv = pow(r, N - 2, N)
    # Q = r^-1 (sR - eG)
    point = _mul((x, y), s)
    minus_eg = _mul((GX, GY), (N - e) % N)
    point = _add(point, minus_eg)
    public = _mul(point, r_inv)
    if public is None:
        raise ValueError("recovery produced the point at infinity")

    raw = public[0].to_bytes(32, "big") + public[1].to_bytes(32, "big")
    return to_checksum("0x" + keccak256(raw)[-20:].hex())


def to_checksum(address: str) -> str:
    """EIP-55 mixed-case checksum."""
    body = address.lower().replace("0x", "")
    digest = keccak256(body.encode()).hex()
    return "0x" + "".join(
        char.upper() if char in "abcdef" and int(digest[i], 16) >= 8 else char
        for i, char in enumerate(body))


def personal_hash(message: str) -> bytes:
    """EIP-191: what a wallet actually signs for personal_sign."""
    raw = message.encode()
    return keccak256(b"\x19Ethereum Signed Message:\n" + str(len(raw)).encode() + raw)


TRANSFER_TOPIC = "0x" + keccak256(b"Transfer(address,address,uint256)").hex()
