"""Tests for tools/vault.py. Run: python -m unittest discover -s tools -p "test_*.py" -v"""
import os, subprocess, sys, tempfile, unittest
from pathlib import Path

VAULT = Path(__file__).resolve().parent / "vault.py"
PASS = "correct horse battery staple"


def run(root, cmd, passphrase=PASS, *extra):
    env = dict(os.environ, VAULT_ROOT=str(root), VAULT_PASSPHRASE=passphrase)
    return subprocess.run([sys.executable, str(VAULT), cmd, *extra], env=env, capture_output=True, text=True)


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "include").mkdir()
        (self.root / "include" / "secrets.h").write_text('#define MQTT_PASS "s3cret-ü"\n', encoding="utf-8")
        (self.root / "include" / "about.json").write_text('{"name":"Test Đ"}', encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_round_trip_restores_both_files_byte_for_byte(self):
        originals = {n: (self.root / "include" / n).read_bytes() for n in ("secrets.h", "about.json")}
        self.assertEqual(run(self.root, "lock").returncode, 0)
        for n in originals:
            (self.root / "include" / n).unlink()
        r = run(self.root, "unlock")
        self.assertEqual(r.returncode, 0, r.stderr)
        for n, data in originals.items():
            self.assertEqual((self.root / "include" / n).read_bytes(), data)

    def test_encrypted_files_do_not_contain_the_plain_text(self):
        run(self.root, "lock")
        blob = (self.root / "private" / "secrets.h.enc").read_bytes()
        self.assertNotIn(b"s3cret", blob)
        self.assertNotIn(b"MQTT_PASS", blob)

    def test_two_locks_of_the_same_file_differ(self):
        run(self.root, "lock")
        a = (self.root / "private" / "secrets.h.enc").read_bytes()
        run(self.root, "lock")
        self.assertNotEqual(a, (self.root / "private" / "secrets.h.enc").read_bytes())

    def test_wrong_passphrase_is_refused_and_writes_nothing(self):
        run(self.root, "lock")
        (self.root / "include" / "secrets.h").unlink()
        r = run(self.root, "unlock", "not the passphrase at all")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Wrong passphrase", r.stderr)
        self.assertFalse((self.root / "include" / "secrets.h").exists())

    def test_a_changed_file_is_detected(self):
        run(self.root, "lock")
        enc = self.root / "private" / "secrets.h.enc"
        b = bytearray(enc.read_bytes())
        b[-1] ^= 1
        enc.write_bytes(bytes(b))
        (self.root / "include" / "secrets.h").unlink()
        self.assertNotEqual(run(self.root, "unlock").returncode, 0)

    def test_unlock_does_not_overwrite_a_different_existing_file(self):
        run(self.root, "lock")
        (self.root / "include" / "secrets.h").write_text("my newer edits\n")
        r = run(self.root, "unlock")
        self.assertIn("skipped", r.stdout)
        self.assertEqual((self.root / "include" / "secrets.h").read_text(), "my newer edits\n")
        run(self.root, "unlock", PASS, "--force")
        self.assertIn("MQTT_PASS", (self.root / "include" / "secrets.h").read_text(encoding="utf-8"))

    def test_a_file_cannot_be_swapped_for_another_encrypted_file(self):
        run(self.root, "lock")
        priv = self.root / "private"
        (priv / "secrets.h.enc").write_bytes((priv / "about.json.enc").read_bytes())   # name is authenticated
        (self.root / "include" / "secrets.h").unlink()
        self.assertNotEqual(run(self.root, "unlock").returncode, 0)


if __name__ == "__main__":
    unittest.main()
