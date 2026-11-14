#include "alerts.h"
#include <cmath>

namespace logic {

bool tempValid(float c) {
  return !std::isnan(c) && c != -127.0f && c != 85.0f;
}

Alert evalAlert(float tempC, bool away, bool presence, Alert prev) {
  if (away && presence) return Alert::Intruder;
  if (!tempValid(tempC)) return Alert::TempFault;
  if (tempC >= HOT_ON_C || (prev == Alert::Hot && tempC >= HOT_OFF_C)) return Alert::Hot;
  return Alert::None;
}

const char* alertName(Alert a) {
  switch (a) {
    case Alert::Hot: return "hot";
    case Alert::Intruder: return "intruder";
    case Alert::TempFault: return "temp_fault";
    default: return "none";
  }
}

}  // namespace logic
