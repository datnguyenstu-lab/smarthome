#include "alerts.h"
#include <cmath>

namespace logic {

bool tempValid(float c) {
  return !std::isnan(c) && c != -127.0f && c != 85.0f;
}

Alert evalAlert(float tempC, bool away, bool doorOpen, uint32_t doorOpenMs, Alert prev, float hotOnC,
                uint32_t doorGraceMs) {
  if (away && doorOpen) return Alert::Intruder;
  if (doorOpen && doorOpenMs >= doorGraceMs) return Alert::DoorOpen;
  if (!tempValid(tempC)) return Alert::TempFault;
  if (tempC >= hotOnC || (prev == Alert::Hot && tempC >= hotOnC - 1.0f)) return Alert::Hot;
  return Alert::None;
}

const char* alertName(Alert a) {
  switch (a) {
    case Alert::Hot: return "hot";
    case Alert::Intruder: return "intruder";
    case Alert::TempFault: return "temp_fault";
    case Alert::DoorOpen: return "door_open";
    default: return "none";
  }
}

}  // namespace logic
