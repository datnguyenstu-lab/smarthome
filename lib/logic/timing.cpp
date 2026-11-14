#include "timing.h"

namespace logic {

bool Debouncer::update(bool raw, uint32_t nowMs) {
  if (raw != pending_) { pending_ = raw; since_ = nowMs; }
  else if (nowMs - since_ >= stableMs_) stable_ = pending_;
  return stable_;
}

bool PresenceHold::update(bool detected, uint32_t nowMs) {
  if (detected) { seen_ = true; last_ = nowMs; return true; }
  return seen_ && (nowMs - last_ < holdMs_);
}

bool LongPress::update(bool pressed, uint32_t nowMs) {
  if (!pressed) { down_ = false; fired_ = false; return false; }
  if (!down_) { down_ = true; since_ = nowMs; return false; }
  if (!fired_ && nowMs - since_ >= ms_) { fired_ = true; return true; }
  return false;
}

}  // namespace logic
