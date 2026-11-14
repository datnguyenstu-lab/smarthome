#pragma once
#include <cstddef>
#include <cstdint>
namespace logic {

struct Settings {
  float hotOnC = 8.0f;           // warm alert above this, -25..30 (cold storage)
  uint32_t doorOpenS = 10;       // warn when the door stays open this long, 0..600 (0 = at once)
  bool statusLed = true;
};

// NaN goes to the default; out-of-range values go to the nearest limit.
Settings clampSettings(Settings s);

// Flat JSON {"hot_on_c":..,"door_open_s":..,"status_led":..}. Missing or wrong-type keys leave that
// field alone; the result is clamped. Returns false (and leaves `inOut` untouched) when the text is not an
// object or no key could be read.
bool parseSettings(const char* json, unsigned len, Settings& inOut);

// Writes the JSON above; returns its length, or 0 when it does not fit in `cap`.
size_t formatSettings(const Settings& s, char* buf, size_t cap);

}  // namespace logic
