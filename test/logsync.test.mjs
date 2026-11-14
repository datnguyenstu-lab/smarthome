import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChunk, LogAssembler, requestMessage } from '../logsync.js';

const enc = (s) => new TextEncoder().encode(s);
const chunk = (seq, offset, total, data) => enc(`${seq}:${offset}:${total}\n${data}`);

test('parseChunk reads header and data', () => {
  const c = parseChunk(chunk(3, 768, 65000, 'hello\n'));
  assert.equal(c.seq, 3);
  assert.equal(c.offset, 768);
  assert.equal(c.total, 65000);
  assert.equal(new TextDecoder().decode(c.data), 'hello\n');
});
test('parseChunk rejects garbage', () => {
  assert.equal(parseChunk(enc('no header at all')), null);
  assert.equal(parseChunk(enc('a:b:c\nx')), null);
  assert.equal(parseChunk(enc('')), null);
  assert.equal(parseChunk(undefined), null);
});
test('parseChunk accepts a string too', () => {
  assert.equal(parseChunk('1:0:5\nabcde').total, 5);
});
test('assembler joins in-order chunks and reports done', () => {
  const a = new LogAssembler(10);
  assert.equal(a.accept(parseChunk(chunk(1, 0, 10, 'abcde'))), true);
  assert.equal(a.done(), false);
  assert.equal(a.nextOffset(), 5);
  assert.equal(a.accept(parseChunk(chunk(1, 5, 10, 'fghij'))), true);
  assert.equal(a.done(), true);
  assert.equal(a.text(), 'abcdefghij');
});
test('assembler ignores duplicate chunk', () => {
  const a = new LogAssembler(10);
  a.accept(parseChunk(chunk(1, 0, 10, 'abcde')));
  assert.equal(a.accept(parseChunk(chunk(1, 0, 10, 'abcde'))), false);
  assert.equal(a.nextOffset(), 5);
  assert.equal(a.text(), 'abcde');
});
test('assembler reports the gap and nextOffset stays at the gap', () => {
  const a = new LogAssembler(15);
  a.accept(parseChunk(chunk(1, 0, 15, 'abcde')));
  assert.equal(a.accept(parseChunk(chunk(1, 10, 15, 'klmno'))), false);  // chunk at 5 is missing
  assert.equal(a.nextOffset(), 5);
  assert.equal(a.done(), false);
});
test('assembler recovers when the missing chunk arrives', () => {
  const a = new LogAssembler(15);
  a.accept(parseChunk(chunk(1, 0, 15, 'abcde')));
  a.accept(parseChunk(chunk(1, 10, 15, 'klmno')));
  assert.equal(a.accept(parseChunk(chunk(1, 5, 15, 'fghij'))), true);
  assert.equal(a.accept(parseChunk(chunk(1, 10, 15, 'klmno'))), true);
  assert.equal(a.done(), true);
  assert.equal(a.text(), 'abcdefghijklmno');
});
test('assembler handles multi-byte characters by byte offsets', () => {
  const text = 'abé€z\n';  // a, b, é (2 bytes), € (3 bytes), z, newline: 9 bytes in all
  const bytes = enc(text);
  assert.equal(bytes.length, 9);
  const a = new LogAssembler(9);
  const first = bytes.slice(0, 5), second = bytes.slice(5);  // splits the euro sign in two
  const mk = (off, data) => { const h = enc(`1:${off}:9\n`); const out = new Uint8Array(h.length + data.length); out.set(h); out.set(data, h.length); return out; };
  assert.equal(a.accept(parseChunk(mk(0, first))), true);
  assert.equal(a.nextOffset(), 5);
  assert.equal(a.accept(parseChunk(mk(5, second))), true);
  assert.equal(a.done(), true);
  assert.equal(a.text(), text);
});
test('assembler ignores empty data chunks (unknown file or end marker)', () => {
  const a = new LogAssembler(10);
  assert.equal(a.accept(parseChunk(chunk(9, 0, 0, ''))), false);
  assert.equal(a.nextOffset(), 0);
});
test('requestMessage list and get', () => {
  assert.equal(requestMessage('list'), '{"list":1}');
  assert.deepEqual(JSON.parse(requestMessage('get', 4, 768)), { get: 4, offset: 768 });
  assert.throws(() => requestMessage('nope'));
});
