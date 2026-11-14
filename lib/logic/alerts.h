#pragma once
namespace logic {

enum class Alert { None, Hot, Intruder, TempFault };

constexpr float HOT_ON_C = 35.0f;
constexpr float HOT_OFF_C = 34.0f;

// false for -127 (sensor missing), exactly 85.0 (power-on default) and NaN.
bool tempValid(float c);

// Priority: Intruder > TempFault > Hot. `prev` gives the hot alert its hysteresis:
// hot from `hotOnC`, cleared below `hotOnC - 1`.
Alert evalAlert(float tempC, bool away, bool presence, Alert prev, float hotOnC = HOT_ON_C);

const char* alertName(Alert a);

}  // namespace logic
