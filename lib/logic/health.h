#pragma once
#include <cstddef>
#include <cstdint>
namespace logic {

enum Issue : uint8_t {
  ISSUE_TEMP_FAULT = 1,
  ISSUE_DOOR_OPEN_LONG = 2,
  ISSUE_WIFI_WEAK = 4,
  ISSUE_WIFI_UNSTABLE = 8,
  ISSUE_LOW_MEMORY = 16,
  ISSUE_CRASH_REBOOT = 32,
};

constexpr uint32_t DOOR_OPEN_LONG_MS = 30UL * 60 * 1000;
constexpr int RSSI_WEAK_DBM = -80;   // weak when below this
constexpr int RECONNECTS_MAX = 3;    // unstable when more than this in 10 minutes
constexpr uint32_t HEAP_MIN_BYTES = 10000;

struct HealthInputs {
  bool tempOk = true;
  bool away = false;
  uint32_t doorOpenMs = 0;       // how long the door has been open without a break
  int rssi = 0;
  uint32_t heap = 0;
  int reconnectsIn10Min = 0;
  bool crashRecent = false;
};

uint8_t evalIssues(const HealthInputs& in);

// "temp_fault", "ir_stuck", ... for one Issue bit; nullptr for anything else.
const char* issueName(uint8_t bit);

// Counts events from the last `windowMs` ms. Keeps the newest 8. Safe across the millis() wrap.
class EventWindow {
 public:
  explicit EventWindow(uint32_t windowMs) : windowMs_(windowMs) {}
  void add(uint32_t nowMs);
  int count(uint32_t nowMs) const;
 private:
  uint32_t windowMs_;
  uint32_t t_[8] = {0};
  uint8_t n_ = 0, head_ = 0;  // n_ valid entries, next write at head_
};

struct HealthReport {
  uint32_t ts = 0;
  int rssi = 0;
  uint32_t heap = 0;
  uint32_t uptimeS = 0;
  const char* reset = "";
  int wifiRc = 0;
  int mqttRc = 0;
  const char* fw = "";
  uint8_t issues = 0;
};

// JSON for smarthome/health; returns its length, or 0 when it does not fit in `cap`.
size_t formatHealth(const HealthReport& r, char* buf, size_t cap);

}  // namespace logic
