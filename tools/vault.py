"""Encrypt / decrypt the private files so they can be committed safely and restored on a new computer.

    python tools/vault.py lock      encrypt include/secrets.h and include/about.json into private/*.enc
    python tools/vault.py unlock    on a new computer: decrypt private/*.enc back into include/
    python tools/vault.py status    which files exist and which are locked

Needs: pip install cryptography. The passphrase is asked on the keyboard (twice when locking, at least 12
characters). Encryption is AES-256-GCM with a key from PBKDF2-SHA256 (600000 rounds); a wrong passphrase or a
changed file is detected. The .enc files are only as safe as the passphrase: use a long one, and do not
reuse it. If the repository is public, anyone can try passphrases offline against these files.
"""
import getpass, os, sys
from pathlib import Path
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(os.environ.get("VAULT_ROOT") or Path(__file__).resolve().parent.parent)
FILES = ["include/secrets.h", "include/about.json"]   # plain files (git-ignored)
VAULT_DIR = "private"
MAGIC = b"SHV1"
ROUNDS = 600_000
MIN_LEN = 12


def _key(passphrase, salt):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ROUNDS).derive(passphrase.encode("utf-8"))


def encrypt(data: bytes, passphrase: str, name: str) -> bytes:
    salt, nonce = os.urandom(16), os.urandom(12)
    ct = AESGCM(_key(passphrase, salt)).encrypt(nonce, data, name.encode())   # the file name is authenticated too
    return MAGIC + salt + nonce + ct


def decrypt(blob: bytes, passphrase: str, name: str) -> bytes:
    if blob[:4] != MAGIC or len(blob) < 4 + 16 + 12 + 16:
        raise ValueError("not a vault file")
    salt, nonce, ct = blob[4:20], blob[20:32], blob[32:]
    return AESGCM(_key(passphrase, salt)).decrypt(nonce, ct, name.encode())


def _enc_path(rel):
    return ROOT / VAULT_DIR / (Path(rel).name + ".enc")


def _passphrase(confirm):
    env = os.environ.get("VAULT_PASSPHRASE")   # for tests and automation only; normally you type it
    if env:
        return env
    p = getpass.getpass("Vault passphrase: ")
    if confirm:
        if len(p) < MIN_LEN:
            sys.exit(f"Use at least {MIN_LEN} characters.")
        if getpass.getpass("Again: ") != p:
            sys.exit("The two entries differ.")
    return p


def lock():
    present = [f for f in FILES if (ROOT / f).exists()]
    if not present:
        sys.exit("Nothing to lock: none of " + ", ".join(FILES) + " exists.")
    p = _passphrase(confirm=True)
    (ROOT / VAULT_DIR).mkdir(exist_ok=True)
    for rel in present:
        _enc_path(rel).write_bytes(encrypt((ROOT / rel).read_bytes(), p, Path(rel).name))
        print("locked  ", rel, "->", _enc_path(rel).relative_to(ROOT))


def unlock(force=False):
    encs = [(rel, _enc_path(rel)) for rel in FILES if _enc_path(rel).exists()]
    if not encs:
        sys.exit("No private/*.enc files found.")
    p = _passphrase(confirm=False)
    for rel, enc in encs:
        try:
            data = decrypt(enc.read_bytes(), p, Path(rel).name)
        except InvalidTag:
            sys.exit("Wrong passphrase, or the file was changed.")
        target = ROOT / rel
        if target.exists() and target.read_bytes() != data and not force:
            print("skipped ", rel, "(exists and differs; use --force to overwrite)")
            continue
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(data)
        print("unlocked", rel)


def status():
    for rel in FILES:
        print(f"{rel:22} plain: {'yes' if (ROOT / rel).exists() else 'no ':3}  locked: {'yes' if _enc_path(rel).exists() else 'no'}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "lock":
        lock()
    elif cmd == "unlock":
        unlock(force="--force" in sys.argv)
    elif cmd == "status":
        status()
    else:
        sys.exit(__doc__)
