#include "sensors.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include "pins.h"

namespace sensors {

static OneWire ow(PIN_DS18);
static DallasTemperature dallas(&ow);

void begin() {
  pinMode(PIN_IR, INPUT);
  dallas.begin();
}

float readTempC() {
  dallas.requestTemperatures();
  return dallas.getTempCByIndex(0);
}

static uint32_t convStartMs = 0;
static bool converting = false;

void startTempConversion() {
  dallas.setWaitForConversion(false);   // return at once instead of waiting 750 ms
  dallas.requestTemperatures();
  dallas.setWaitForConversion(true);    // readTempC() keeps its blocking behaviour
  convStartMs = millis();
  converting = true;
}

bool tempConversionReady() { return converting && millis() - convStartMs >= 800; }

float finishTempRead() {
  converting = false;
  return dallas.getTempCByIndex(0);     // -127 when the sensor is missing, as before
}

void busStatus(bool& lineHigh, bool& present) {
  pinMode(PIN_DS18, INPUT);
  delayMicroseconds(100);
  lineHigh = digitalRead(PIN_DS18) == HIGH;
  present = ow.reset() == 1;
}

bool irDetected() { return digitalRead(PIN_IR) == LOW; }

}  // namespace sensors
