#pragma once
#include <cstdint>
namespace logic {

enum class Alert { None, Hot, Intruder, TempFault, DoorOpen };

// Cold storage: "hot" means too warm. The warning starts at 33 C by default and clears 1 degree below.
constexpr float HOT_ON_C = 33.0f;
constexpr float HOT_OFF_C = 32.0f;
constexpr uint32_t DOOR_GRACE_MS = 10000;

// false for -127 (sensor missing), exactly 85.0 (power-on default) and NaN.
bool tempValid(float c);

// One alert at a time, highest priority first:
//   Intruder  - the door is open while lock-up mode (`away`) is on, at once
//   DoorOpen  - the door has been open for at least `doorGraceMs` (0 = at once)
//   TempFault - the temperature reading is invalid
//   Hot       - from `hotOnC`, cleared below `hotOnC - 1` (`prev` gives the hysteresis)
Alert evalAlert(float tempC, bool away, bool doorOpen, uint32_t doorOpenMs, Alert prev,
                float hotOnC = HOT_ON_C, uint32_t doorGraceMs = DOOR_GRACE_MS);

const char* alertName(Alert a);

}  // namespace logic
