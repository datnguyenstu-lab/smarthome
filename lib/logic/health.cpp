#include "health.h"
#include <cstdio>

namespace logic {

uint8_t evalIssues(const HealthInputs& in) {
  uint8_t m = 0;
  if (!in.tempOk) m |= ISSUE_TEMP_FAULT;
  if (!in.away && in.doorOpenMs >= DOOR_OPEN_LONG_MS) m |= ISSUE_DOOR_OPEN_LONG;
  if (in.rssi < RSSI_WEAK_DBM) m |= ISSUE_WIFI_WEAK;
  if (in.reconnectsIn10Min > RECONNECTS_MAX) m |= ISSUE_WIFI_UNSTABLE;
  if (in.heap < HEAP_MIN_BYTES) m |= ISSUE_LOW_MEMORY;
  if (in.crashRecent) m |= ISSUE_CRASH_REBOOT;
  return m;
}

const char* issueName(uint8_t bit) {
  switch (bit) {
    case ISSUE_TEMP_FAULT: return "temp_fault";
    case ISSUE_DOOR_OPEN_LONG: return "door_open_long";
    case ISSUE_WIFI_WEAK: return "wifi_weak";
    case ISSUE_WIFI_UNSTABLE: return "wifi_unstable";
    case ISSUE_LOW_MEMORY: return "low_memory";
    case ISSUE_CRASH_REBOOT: return "crash_reboot";
    default: return nullptr;
  }
}

void EventWindow::add(uint32_t nowMs) {
  t_[head_] = nowMs;
  head_ = (head_ + 1) % 8;
  if (n_ < 8) n_++;
}

int EventWindow::count(uint32_t nowMs) const {
  int c = 0;
  for (uint8_t i = 0; i < n_; i++)
    if (nowMs - t_[i] < windowMs_) c++;
  return c;
}

size_t formatHealth(const HealthReport& r, char* buf, size_t cap) {
  int n = snprintf(buf, cap, "{\"ts\":%lu,\"rssi\":%d,\"heap\":%lu,\"uptime_s\":%lu,\"reset\":\"%s\",\"wifi_rc\":%d,\"mqtt_rc\":%d,\"fw\":\"%s\",\"issues\":[",
                   (unsigned long)r.ts, r.rssi, (unsigned long)r.heap, (unsigned long)r.uptimeS, r.reset, r.wifiRc, r.mqttRc, r.fw);
  if (n < 0 || (size_t)n >= cap) return 0;
  bool first = true;
  for (uint8_t bit = 1; bit != 0 && bit <= ISSUE_CRASH_REBOOT; bit <<= 1) {
    if (!(r.issues & bit)) continue;
    int m = snprintf(buf + n, cap - n, "%s\"%s\"", first ? "" : ",", issueName(bit));
    if (m < 0 || (size_t)m >= cap - n) return 0;
    n += m;
    first = false;
  }
  if ((size_t)n + 2 >= cap) return 0;
  buf[n++] = ']';
  buf[n++] = '}';
  buf[n] = '\0';
  return (size_t)n;
}

}  // namespace logic
