#include "logfmt.h"
#include <cstdio>
#include <cstring>

namespace logic {

// Date from days since 1970-01-01 (Howard Hinnant's civil-from-days).
static void civil(uint32_t days, int& y, unsigned& m, unsigned& d) {
  int32_t z = (int32_t)days + 719468;
  int32_t era = z / 146097;
  uint32_t doe = (uint32_t)(z - era * 146097);
  uint32_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  y = (int)yoe + era * 400;
  uint32_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  uint32_t mp = (5 * doy + 2) / 153;
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y++;
}

size_t formatLogLine(char* buf, size_t cap, uint32_t epoch, uint32_t uptimeS, LogLevel level, const char* component,
                     const char* message) {
  if (cap < 48) return 0;
  size_t limit = cap - 2;  // room for the newline and the terminator
  size_t len = 0;
  if (epoch >= 1700000000UL) {
    int y; unsigned mo, d;
    civil(epoch / 86400, y, mo, d);
    uint32_t t = epoch % 86400;
    len = (size_t)snprintf(buf, cap, "%04d-%02u-%02uT%02u:%02u:%02uZ", y, mo, d, (unsigned)(t / 3600), (unsigned)(t % 3600 / 60), (unsigned)(t % 60));
  } else {
    len = (size_t)snprintf(buf, cap, "T+%02lu:%02lu:%02lu", (unsigned long)(uptimeS / 3600), (unsigned long)(uptimeS % 3600 / 60), (unsigned long)(uptimeS % 60));
  }
  const char* lv = level == LogLevel::Warn ? "WARN " : level == LogLevel::Error ? "ERROR" : "INFO ";
  auto put = [&](char c) { if (len < limit) buf[len++] = c; };
  put(' ');
  for (const char* p = lv; *p; ++p) put(*p);
  put(' ');
  size_t compLen = 0;
  for (const char* p = component ? component : ""; *p; ++p, ++compLen) put(*p);
  if (message && *message) {
    for (; compLen < 8; ++compLen) put(' ');   // pad the component so the messages line up
    put(' ');
    for (const char* p = message; *p; ++p) put((*p == '\n' || *p == '\r') ? ' ' : *p);
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
