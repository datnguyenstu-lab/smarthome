#include "event_log.h"
#include <Arduino.h>
#include <LittleFS.h>
#include <time.h>
#include <cstdlib>
#include <cstring>
#include "logfmt.h"
#include "topics.h"
#include "net.h"

#ifndef LOG_MAX_BYTES
#define LOG_MAX_BYTES 65536UL   // per file; a test build may lower it with -DLOG_MAX_BYTES=2048
#endif

namespace eventLog {

static const int KEEP = 3;
static const uint32_t FLUSH_EVERY_MS = 5000;
static const uint32_t MIN_FREE_BYTES = 32768;   // the settings file keeps its room
static const unsigned CHUNK_BYTES = 384;
static const uint32_t CHUNK_EVERY_MS = 25;

static logic::LogRotation rot{LOG_MAX_BYTES, KEEP};
static bool mounted = false;
static uint32_t curSeq = 0, curBytes = 0, lastFlushMs = 0;
static char buf[512];
static size_t bufLen = 0;

static bool streamActive = false;
static uint32_t streamSeq = 0, streamOffset = 0, lastChunkMs = 0;

static String pathFor(uint32_t seq) { return "/log_" + String(seq) + ".txt"; }

static bool mount() {
  if (!mounted) mounted = LittleFS.begin();
  return mounted;
}

static uint32_t freeBytes() {
  FSInfo i;
  if (!LittleFS.info(i)) return 0;
  return i.totalBytes - i.usedBytes;
}

// A power cut can leave a half-written last line: cut the file back to its last complete line.
static void repairTail(uint32_t seq) {
  File f = LittleFS.open(pathFor(seq), "r+");
  if (!f) return;
  uint32_t size = f.size();
  if (size == 0) { f.close(); curBytes = 0; return; }
  uint32_t take = size < 300 ? size : 300;
  char tail[300];
  f.seek(size - take);
  size_t got = f.readBytes(tail, take);
  size_t keep = logic::trimToLastLine(tail, got);
  if (keep != got) {
    uint32_t newSize = size - (uint32_t)(got - keep);
    if (!f.truncate(newSize)) newSize = size;  // could not cut: leave it, the reader trims anyway
    size = newSize;
  }
  f.close();
  curBytes = size;
}

void begin() {
  if (!mount()) return;
  uint32_t maxSeq = 0;
  Dir d = LittleFS.openDir("/");
  while (d.next()) {
    String n = d.fileName();
    if (n.startsWith("log_") && n.endsWith(".txt")) {
      uint32_t s = (uint32_t)n.substring(4, n.length() - 4).toInt();
      if (s > maxSeq) maxSeq = s;
    }
  }
  if (maxSeq == 0) {
    maxSeq = 1;
    File f = LittleFS.open(pathFor(1), "w");
    if (f) f.close();
  }
  curSeq = maxSeq;
  repairTail(curSeq);
}

static void startNewFile() {
  curSeq++;
  File f = LittleFS.open(pathFor(curSeq), "w");
  if (f) f.close();
  curBytes = 0;
  uint32_t old;
  if (rot.seqToDelete(curSeq, old)) LittleFS.remove(pathFor(old));
}

void flush() {
  if (bufLen == 0) return;
  if (mounted && curSeq != 0 && freeBytes() >= MIN_FREE_BYTES) {
    if (rot.needRotate(curBytes, (uint32_t)bufLen)) startNewFile();
    File f = LittleFS.open(pathFor(curSeq), "a");
    if (f) {
      size_t w = f.write((const uint8_t*)buf, bufLen);
      f.close();
      curBytes += (uint32_t)w;
    }
  }
  bufLen = 0;  // written, or dropped: a failed log write must never stall the board
  lastFlushMs = millis();
}

void add(const char* code, const char* detail) {
  char line[160];
  size_t n = logic::formatLogLine(line, sizeof(line), (uint32_t)time(nullptr), millis() / 1000, code, detail);
  if (n == 0) return;
  if (bufLen + n > sizeof(buf)) flush();
  memcpy(buf + bufLen, line, n);
  bufLen += n;
  if (strcmp(code, "boot") == 0) flush();  // the reset reason must survive a crash loop
}

static bool findUint(const char* json, const char* key, uint32_t& out) {
  char pat[16];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* p = strstr(json, pat);
  if (!p) return false;
  p = strchr(p + strlen(pat), ':');
  if (!p) return false;
  ++p;
  while (*p == ' ') ++p;
  if (*p < '0' || *p > '9') return false;
  out = (uint32_t)strtoul(p, nullptr, 10);
  return true;
}

// Size the page may download: complete lines only (the newest file may end in a line still being written).
static uint32_t servableSize(uint32_t seq, bool& exists) {
  File f = LittleFS.open(pathFor(seq), "r");
  exists = (bool)f;
  if (!f) return 0;
  uint32_t size = f.size();
  if (seq == curSeq && size > 0) {
    uint32_t take = size < 200 ? size : 200;
    char tail[200];
    f.seek(size - take);
    size_t got = f.readBytes(tail, take);
    size_t keep = logic::trimToLastLine(tail, got);
    if (keep == 0 && got == size) size = 0;      // no complete line in the whole file yet
    else size -= (uint32_t)(got - keep);         // drop the half-written tail
  }
  f.close();
  return size;
}

static void publishIndex() {
  flush();
  char out[256];
  int n = snprintf(out, sizeof(out), "{\"files\":[");
  bool first = true;
  uint32_t from = curSeq > (uint32_t)KEEP ? curSeq - KEEP + 1 : 1;
  for (uint32_t s = from; s <= curSeq && n < (int)sizeof(out) - 48; s++) {
    bool ex;
    uint32_t sz = servableSize(s, ex);
    if (!ex) continue;
    n += snprintf(out + n, sizeof(out) - n, "%s{\"seq\":%lu,\"bytes\":%lu}", first ? "" : ",", (unsigned long)s, (unsigned long)sz);
    first = false;
  }
  snprintf(out + n, sizeof(out) - n, "],\"max_file_bytes\":%lu}", (unsigned long)LOG_MAX_BYTES);
  net::publish(logic::T_LOG_INDEX, out, false);
}

static void sendChunk() {
  static uint8_t msg[CHUNK_BYTES + 32];
  bool ex;
  uint32_t total = servableSize(streamSeq, ex);
  size_t hl = logic::formatChunkHeader((char*)msg, 32, streamSeq, streamOffset, total);
  size_t dl = 0;
  if (ex && hl && streamOffset < total) {
    File f = LittleFS.open(pathFor(streamSeq), "r");
    if (f) {
      f.seek(streamOffset);
      uint32_t want = total - streamOffset;
      if (want > CHUNK_BYTES) want = CHUNK_BYTES;
      dl = f.readBytes((char*)msg + hl, want);
      f.close();
    }
  }
  if (hl) net::publishBytes(logic::T_LOG_DATA, msg, (unsigned)(hl + dl));
  streamOffset += (uint32_t)dl;
  if (dl == 0 || streamOffset >= total) streamActive = false;  // end, or unknown file / offset: empty chunk stops the page
}

void handleCommand(const char* payload, unsigned len) {
  (void)len;  // the relay hands over a NUL-terminated string
  if (!mounted) return;
  uint32_t v;
  if (strstr(payload, "\"list\"")) { publishIndex(); return; }
  uint32_t seq;
  if (findUint(payload, "get", seq)) {
    flush();  // the newest file must include everything logged so far
    streamSeq = seq;
    streamOffset = findUint(payload, "offset", v) ? v : 0;
    streamActive = true;  // a new get replaces a running stream
    lastChunkMs = 0;
  }
}

void tick(uint32_t nowMs) {
  if (bufLen > 0 && nowMs - lastFlushMs >= FLUSH_EVERY_MS) flush();
  if (streamActive && nowMs - lastChunkMs >= CHUNK_EVERY_MS) { lastChunkMs = nowMs; sendChunk(); }
}

}  // namespace eventLog
