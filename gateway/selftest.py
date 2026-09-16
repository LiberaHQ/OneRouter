"""Self-test for the parts of sign-in where being wrong is a security hole.

    python3 gateway/selftest.py

Checks that a real signature verifies and — the half that matters — that a forged
one, a replayed challenge, a foreign origin and a rewound counter are all refused.
Also pins Keccak-256 and EIP-55 to their published vectors.
"""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from cryptography.hazmat.primitives.asymmetric import ec, ed25519
from cryptography.hazmat.primitives import hashes
from gateway import auth

def enc(value):
    """Tiny CBOR encoder, test-side only."""
    if isinstance(value, int):
        if value >= 0: major, n = 0, value
        else: major, n = 1, -1 - value
        if n < 24: return bytes([major << 5 | n])
        if n < 256: return bytes([major << 5 | 24, n])
        if n < 65536: return bytes([major << 5 | 25]) + n.to_bytes(2, "big")
        return bytes([major << 5 | 26]) + n.to_bytes(4, "big")
    if isinstance(value, bytes):
        return enc_head(2, len(value)) + value
    if isinstance(value, str):
        raw = value.encode(); return enc_head(3, len(raw)) + raw
    if isinstance(value, list):
        return enc_head(4, len(value)) + b"".join(enc(v) for v in value)
    if isinstance(value, dict):
        return enc_head(5, len(value)) + b"".join(enc(k) + enc(v) for k, v in value.items())
    raise TypeError(value)

def enc_head(major, n):
    if n < 24: return bytes([major << 5 | n])
    if n < 256: return bytes([major << 5 | 24, n])
    if n < 65536: return bytes([major << 5 | 25]) + n.to_bytes(2, "big")
    return bytes([major << 5 | 26]) + n.to_bytes(4, "big")

ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  PASS  {name}")
    else: fail += 1; print(f"  FAIL  {name} {detail}")

# ── CBOR round trip ────────────────────────────────────────────────────────
sample = {1: 2, 3: -7, -1: 1, "fmt": "none", "b": b"\x01\x02", "a": [1, 2, 3]}
decoded, _ = auth.cbor(enc(sample))
check("cbor round trip", decoded == sample, f"{decoded}")

# ── Passkey registration + assertion ───────────────────────────────────────
priv = ec.generate_private_key(ec.SECP256R1())
nums = priv.public_key().public_numbers()
cose = enc({1: 2, 3: -7, -1: 1,
            -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
rp_hash = hashlib.sha256(auth.RP_ID.encode()).digest()
cred_id = b"\x11" * 20
auth_data = rp_hash + bytes([0x41]) + (0).to_bytes(4, "big") + \
            b"\x00" * 16 + len(cred_id).to_bytes(2, "big") + cred_id + cose
attestation = auth.b64url(enc({"fmt": "none", "attStmt": {}, "authData": auth_data}))

challenge = auth.b64url(b"challenge-bytes-here")
client_create = auth.b64url(json.dumps({
    "type": "webauthn.create", "challenge": challenge,
    "origin": auth.ORIGINS[0]}).encode())

stored = auth.register_passkey(challenge, attestation, client_create)
check("registration verifies", stored["credential_id"] == auth.b64url(cred_id))

# assertion
challenge2 = auth.b64url(b"second-challenge")
client_get = json.dumps({"type": "webauthn.get", "challenge": challenge2,
                         "origin": auth.ORIGINS[0]}).encode()
assert_data = rp_hash + bytes([0x01]) + (5).to_bytes(4, "big")
signature = priv.sign(assert_data + hashlib.sha256(client_get).digest(),
                      ec.ECDSA(hashes.SHA256()))
count = auth.verify_passkey(challenge2, stored["cose"], 0, auth.b64url(assert_data),
                            auth.b64url(client_get), auth.b64url(signature))
check("assertion verifies", count == 5, f"count={count}")

# ── Negative cases: these must all be rejected ─────────────────────────────
def rejects(name, fn):
    try:
        fn(); check(name, False, "accepted something it should refuse")
    except auth.AuthError:
        check(name, True)

rejects("rejects a forged signature", lambda: auth.verify_passkey(
    challenge2, stored["cose"], 0, auth.b64url(assert_data),
    auth.b64url(client_get), auth.b64url(b"\x00" * 70)))

rejects("rejects a replayed challenge", lambda: auth.verify_passkey(
    auth.b64url(b"different-challenge"), stored["cose"], 0,
    auth.b64url(assert_data), auth.b64url(client_get), auth.b64url(signature)))

bad_origin = json.dumps({"type": "webauthn.get", "challenge": challenge2,
                         "origin": "https://evil.example"}).encode()
rejects("rejects a foreign origin", lambda: auth.verify_passkey(
    challenge2, stored["cose"], 0, auth.b64url(assert_data),
    auth.b64url(bad_origin), auth.b64url(signature)))

rejects("rejects a counter that went backwards", lambda: auth.verify_passkey(
    challenge2, stored["cose"], 99, auth.b64url(assert_data),
    auth.b64url(client_get), auth.b64url(signature)))

# ── Solana wallet ──────────────────────────────────────────────────────────
wallet = ed25519.Ed25519PrivateKey.generate()
raw = wallet.public_key().public_bytes_raw()
def b58(data: bytes) -> str:
    n = int.from_bytes(data, "big"); out = ""
    while n: n, r = divmod(n, 58); out = auth.B58[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\x00"))) + out
address = b58(raw)
message = auth.wallet_statement("nonce-123", "onerouter.dev")
sig = wallet.sign(message.encode())
check("wallet signature verifies",
      auth.verify_wallet(address, message, auth.b64url(sig)) == address)
rejects("rejects a wallet signature over a different message",
        lambda: auth.verify_wallet(address, message + "!", auth.b64url(sig)))
other = ed25519.Ed25519PrivateKey.generate()
rejects("rejects a signature from another wallet",
        lambda: auth.verify_wallet(address, message, auth.b64url(other.sign(message.encode()))))

# ── Keccak-256 and EIP-55, against published vectors ───────────────────────
from gateway import evm

for data, want in {
    b"": "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    b"abc": "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
}.items():
    check(f"keccak256({data!r})", evm.keccak256(data).hex() == want)
check("ERC-20 Transfer topic",
      evm.TRANSFER_TOPIC ==
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef")
check("EIP-55 checksum",
      evm.to_checksum("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed") ==
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")

# ── EVM signature recovery ─────────────────────────────────────────────────
from cryptography.hazmat.primitives.asymmetric import utils as _u

evm_key = ec.generate_private_key(ec.SECP256K1())
pn = evm_key.public_key().public_numbers()
evm_addr = evm.to_checksum("0x" + evm.keccak256(
    pn.x.to_bytes(32, "big") + pn.y.to_bytes(32, "big"))[-20:].hex())
msg = auth.wallet_statement("nonce", "onerouter.dev", "arc")
h = evm.personal_hash(msg)
r_, s_ = _u.decode_dss_signature(evm_key.sign(h, ec.ECDSA(_u.Prehashed(hashes.SHA256()))))
if s_ > evm.N // 2:
    s_ = evm.N - s_
found = None
for v in (27, 28):
    cand = r_.to_bytes(32, "big") + s_.to_bytes(32, "big") + bytes([v])
    try:
        if evm.recover_address(h, cand) == evm_addr:
            found = cand
            break
    except ValueError:
        pass
check("EVM signature recovers the signer", found is not None)
if found:
    check("EVM sign-in verifies",
          auth.verify_evm_wallet(evm_addr, msg, "0x" + found.hex()) == evm_addr)
    rejects("rejects an EVM signature from another address",
            lambda: auth.verify_evm_wallet(
                "0x" + "11" * 20, msg, "0x" + found.hex()))

# ── QR: a wrong code on a payment page sends money nowhere ─────────────────
from gateway import qr as _qr

for payload in ["0x1111111111111111111111111111111111111111",
                "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                "HELLO WORLD", "ünïcode ✓"]:
    grid = _qr.matrix(payload)
    check(f"QR round trips {payload[:24]!r}", _qr.decode(grid) == payload)

_g = _qr.matrix("0x1111111111111111111111111111111111111111")
_size = len(_g)
check("QR finder patterns", all(
    _g[r + i][c + j] == (1 if (i in (0, 6) or j in (0, 6) or (2 <= i <= 4 and 2 <= j <= 4)) else 0)
    for r, c in ((0, 0), (0, _size - 7), (_size - 7, 0))
    for i in range(7) for j in range(7)))
check("QR timing patterns", all(
    _g[6][i] == (1 if i % 2 == 0 else 0) and _g[i][6] == (1 if i % 2 == 0 else 0)
    for i in range(8, _size - 8)))
check("QR dark module", _g[_size - 8][8] == 1)

_bad = [row[:] for row in _g]
for _r, _c in ((12, 12), (13, 14), (15, 16), (17, 18), (19, 20)):
    _bad[_r][_c] ^= 1
try:
    check("a tampered QR fails the read-back guard",
          _qr.decode(_bad) != "0x1111111111111111111111111111111111111111")
except Exception:
    check("a tampered QR fails the read-back guard", True)

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
