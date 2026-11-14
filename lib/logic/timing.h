#pragma once
#include <cstdint>
namespace logic {

// Returns the debounced level: a new level must hold for `stableMs` before it is reported.
class Debouncer {
 public:
  explicit Debouncer(uint32_t stableMs) : stableMs_(stableMs) {}
  bool update(bool raw, uint32_t nowMs);
 private:
  uint32_t stableMs_, since_ = 0;
  bool pending_ = false, stable_ = false;
};

// True while a detection happened less than `holdMs` ago.
class PresenceHold {
 public:
  explicit PresenceHold(uint32_t holdMs) : holdMs_(holdMs) {}
  bool update(bool detected, uint32_t nowMs);
  void setHoldMs(uint32_t holdMs) { holdMs_ = holdMs; }
 private:
  uint32_t holdMs_, last_ = 0;
  bool seen_ = false;
};

// Returns true once per press, when the button has been held for `ms`; re-arms on release.
class LongPress {
 public:
  explicit LongPress(uint32_t ms) : ms_(ms) {}
  bool update(bool pressed, uint32_t nowMs);
 private:
  uint32_t ms_, since_ = 0;
  bool down_ = false, fired_ = false;
};

// A sensor is reported faulty only after `limit` bad reads in a row; one good read clears it at once. A single
// glitch (a loose wire, noise on the bus) therefore does not flip the alarm.
class FaultFilter {
 public:
  explicit FaultFilter(int limit) : limit_(limit) {}
  bool update(bool readWasValid) {
    if (readWasValid) bad_ = 0;
    else if (bad_ < limit_) bad_++;
    return bad_ >= limit_;
  }
 private:
  int limit_, bad_ = 0;
};

}  // namespace logic
