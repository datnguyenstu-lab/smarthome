#include "leds.h"
#include "pins.h"

namespace leds {

static bool on_[3] = {false, false, false};

void begin() {
  for (int i = 0; i < 3; i++) { pinMode(PIN_LED[i], OUTPUT); digitalWrite(PIN_LED[i], LOW); }
}

void set(int led, bool on) {
  if (led < 1 || led > 3) return;
  on_[led - 1] = on;
  digitalWrite(PIN_LED[led - 1], on ? HIGH : LOW);
}

bool get(int led) { return led >= 1 && led <= 3 && on_[led - 1]; }

}  // namespace leds
