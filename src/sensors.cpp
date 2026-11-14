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

bool irDetected() { return digitalRead(PIN_IR) == LOW; }

}  // namespace sensors
