import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToB64url, b64urlToBytes } from '../auth.js';
import { isGoodbye } from '../assistant.js';

test('credential ids survive the round trip through base64url, including + / and padding cases', () => {
  for (const bytes of [[], [0], [251, 255, 190], [62, 63, 64, 65], Array.from({ length: 32 }, (_, i) => i * 8 + 3)]) {
    const s = bytesToB64url(Uint8Array.from(bytes));
    assert.match(s, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual([...b64urlToBytes(s)], bytes);
  }
});

test('goodbyes end the call, long sentences that merely contain "bye" do not', () => {
  for (const s of ['bye', 'Goodbye!', 'hang up', 'tạm biệt', 'cúp máy', 'kết thúc']) assert.equal(isGoodbye(s), true, s);
  for (const s of ['what is the temperature', 'turn off the light and then say bye to the night shift please']) assert.equal(isGoodbye(s), false, s);
});
