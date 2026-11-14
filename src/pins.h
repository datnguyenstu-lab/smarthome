#pragma once
#include <Arduino.h>

constexpr uint8_t PIN_IR = D0;      // IR obstacle sensor OUT, low = detected
constexpr uint8_t PIN_BTN1 = D1;    // button to GND
constexpr uint8_t PIN_DS18 = D2;    // DS18B20 data (OneWire does not work on D0)
constexpr uint8_t PIN_BTN2 = D4;    // button to GND; GPIO2 must be high at boot
constexpr uint8_t PIN_LED[3] = {D5, D6, D7};
