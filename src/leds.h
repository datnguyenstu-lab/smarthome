#pragma once
namespace leds {
void begin();
void set(int led, bool on);   // led 1..3; other values are ignored
bool get(int led);
void drive(int led, bool level);  // physical output only: does not change get(); for blink patterns
}  // namespace leds
