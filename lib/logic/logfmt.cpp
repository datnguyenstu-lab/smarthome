#include "logfmt.h"
#include <cstdio>
#include <cstring>

namespace logic {

size_t formatLogLine(char* buf, size_t cap, uint32_t epoch, uint32_t uptimeS, const char* code, const char* detail) {
  if (cap < 24) return 0;
  int n = epoch >= 1700000000UL ? snprintf(buf, cap, "%lu %s", (unsigned long)epoch, code ? code : "")
                                : snprintf(buf, cap, "+%lu %s", (unsigned long)uptimeS, code ? code : "");
  size_t len = (n < 0) ? 0 : (size_t)n;
  if (len > cap - 2) len = cap - 2;  // keep room for '\n' and the terminator
  if (detail && *detail) {
    if (len < cap - 2) buf[len++] = ' ';
    for (const char* p = detail; *p && len < cap - 2; ++p) buf[len++] = (*p == '\n' || *p == '\r') ? ' ' : *p;
  }
  buf[len++] = '\n';
  buf[len] = '\0';
  return len;
}

size_t trimToLastLine(const char* buf, size_t len) {
  for (size_t i = len; i > 0; --i)
    if (buf[i - 1] == '\n') return i;
  return 0;
}

size_t formatChunkHeader(char* buf, size_t cap, uint32_t seq, uint32_t offset, uint32_t total) {
  int n = snprintf(buf, cap, "%lu:%lu:%lu\n", (unsigned long)seq, (unsigned long)offset, (unsigned long)total);
  return (n < 0 || (size_t)n >= cap) ? 0 : (size_t)n;
}

}  // namespace logic
