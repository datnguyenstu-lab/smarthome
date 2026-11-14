#include "settings.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace logic {

Settings clampSettings(Settings s) {
  if (std::isnan(s.hotOnC)) s.hotOnC = 33.0f;
  if (s.hotOnC < -25.0f) s.hotOnC = -25.0f;
  if (s.hotOnC > 60.0f) s.hotOnC = 60.0f;
  if (s.doorOpenS > 600) s.doorOpenS = 600;
  return s;
}

// Pointer to the value text after `"key" :` inside [json, json+len), or nullptr.
static const char* findValue(const char* json, unsigned len, const char* key) {
  char pat[32];
  int pn = snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* end = json + len;
  for (const char* p = json; p + pn <= end; ++p) {
    if (memcmp(p, pat, pn) != 0) continue;
    const char* q = p + pn;
    while (q < end && (*q == ' ' || *q == '\t')) ++q;
    if (q >= end || *q != ':') continue;
    ++q;
    while (q < end && (*q == ' ' || *q == '\t')) ++q;
    return q < end ? q : nullptr;
  }
  return nullptr;
}

static bool readNumber(const char* v, const char* end, double& out) {
  if (v >= end || !(*v == '-' || *v == '+' || *v == '.' || (*v >= '0' && *v <= '9'))) return false;
  char tmp[24];
  unsigned n = 0;
  while (v + n < end && n < sizeof(tmp) - 1 && strchr("+-.eE0123456789", v[n])) { tmp[n] = v[n]; ++n; }
  tmp[n] = '\0';
  char* stop = nullptr;
  out = strtod(tmp, &stop);
  return stop != tmp && *stop == '\0';
}

static bool readBool(const char* v, const char* end, bool& out) {
  if (end - v >= 4 && memcmp(v, "true", 4) == 0) { out = true; return true; }
  if (end - v >= 5 && memcmp(v, "false", 5) == 0) { out = false; return true; }
  return false;
}

bool parseSettings(const char* json, unsigned len, Settings& inOut) {
  if (!json) return false;
  const char* end = json + len;
  const char* a = json;
  while (a < end && (*a == ' ' || *a == '\t' || *a == '\r' || *a == '\n')) ++a;
  const char* z = end;
  while (z > a && (z[-1] == ' ' || z[-1] == '\t' || z[-1] == '\r' || z[-1] == '\n' || z[-1] == '\0')) --z;
  if (z - a < 2 || *a != '{' || z[-1] != '}') return false;

  Settings s = inOut;
  bool any = false;
  double d;
  bool b;
  if (const char* v = findValue(a, (unsigned)(z - a), "hot_on_c"))
    if (readNumber(v, z, d)) { s.hotOnC = (float)d; any = true; }
  if (const char* v = findValue(a, (unsigned)(z - a), "door_open_s"))
    if (readNumber(v, z, d)) { s.doorOpenS = d < 0 ? 0 : d > 600 ? 600 : (uint32_t)d; any = true; }
  if (const char* v = findValue(a, (unsigned)(z - a), "status_led"))
    if (readBool(v, z, b)) { s.statusLed = b; any = true; }
  if (!any) return false;
  inOut = clampSettings(s);
  return true;
}

size_t formatSettings(const Settings& s, char* buf, size_t cap) {
  int n = snprintf(buf, cap, "{\"hot_on_c\":%.1f,\"door_open_s\":%u,\"status_led\":%s}", (double)s.hotOnC,
                   (unsigned)s.doorOpenS, s.statusLed ? "true" : "false");
  return (n < 0 || (size_t)n >= cap) ? 0 : (size_t)n;
}

}  // namespace logic
