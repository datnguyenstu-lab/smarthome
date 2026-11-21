// Fingerprint (or face, or screen-lock PIN) check with WebAuthn. The phone's secure hardware does the check and
// returns only "this person is here", so no fingerprint data ever reaches the page.
// shortcut: with no server, nothing verifies the signature. This is a gate on this device, enough for a demo and
// for confirming risky actions. A real product needs a backend that verifies the credential and issues tokens.
const KEY = 'fpCred';

export function bytesToB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlToBytes(str) {
  const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
};
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function fingerprintAvailable() {
  try {
    return !!(window.isSecureContext && window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}
export const fingerprintEnrolled = () => !!store.get();

export async function enrollFingerprint() {
  if (!(await fingerprintAvailable())) return { ok: false, reason: 'unsupported' };
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: random(32), rp: { name: 'Cold Storage Monitor', id: location.hostname },
      user: { id: random(16), name: 'owner', displayName: 'Owner' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none' } });
    if (!cred || !store.set(bytesToB64url(new Uint8Array(cred.rawId)))) return { ok: false, reason: 'error' };
    return { ok: true };
  } catch (e) { return { ok: false, reason: e?.name === 'NotAllowedError' ? 'cancelled' : 'error' }; }
}

export async function verifyFingerprint() {
  const id = store.get();
  if (!id) return { ok: false, reason: 'not enrolled' };
  try {
    const got = await navigator.credentials.get({ publicKey: {
      challenge: random(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: b64urlToBytes(id), transports: ['internal'] }] } });
    return got ? { ok: true } : { ok: false, reason: 'error' };
  } catch (e) { return { ok: false, reason: e?.name === 'NotAllowedError' ? 'cancelled' : 'error' }; }
}
