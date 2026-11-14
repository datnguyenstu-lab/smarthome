// Pure helpers for pulling the board's event log over MQTT. No DOM, no MQTT, so node --test can run them.
// Chunk payload: "<seq>:<offset>:<total>\n" followed by raw bytes. Offsets count bytes, not characters.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function parseChunk(payload) {
  const bytes = typeof payload === 'string' ? enc.encode(payload) : payload;
  if (!(bytes instanceof Uint8Array)) return null;
  const nl = bytes.indexOf(10);
  if (nl < 0 || nl > 40) return null;
  const m = /^(\d+):(\d+):(\d+)$/.exec(dec.decode(bytes.subarray(0, nl)));
  if (!m) return null;
  return { seq: Number(m[1]), offset: Number(m[2]), total: Number(m[3]), data: bytes.slice(nl + 1) };
}

// Collects the chunks of one file in order. A duplicate or out-of-order chunk is ignored; nextOffset() says
// where the next byte must start, so the caller can re-request from the first gap.
export class LogAssembler {
  constructor(total) { this.total = total; this.parts = []; this.next = 0; }
  accept(chunk) {
    if (!chunk || chunk.data.length === 0) return false;
    if (chunk.offset !== this.next) return false;
    this.parts.push(chunk.data);
    this.next += chunk.data.length;
    if (Number.isFinite(chunk.total) && chunk.total > 0) this.total = chunk.total;
    return true;
  }
  nextOffset() { return this.next; }
  done() { return this.next >= this.total; }
  text() {
    const all = new Uint8Array(this.next);
    let at = 0;
    for (const p of this.parts) { all.set(p, at); at += p.length; }
    return dec.decode(all);
  }
}

export function requestMessage(kind, seq, offset = 0) {
  if (kind === 'list') return JSON.stringify({ list: 1 });
  if (kind === 'get') return JSON.stringify({ get: seq, offset });
  throw new Error(`unknown log request: ${kind}`);
}
