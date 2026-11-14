#pragma once
namespace sensors {
void begin();
float readTempC();   // raw library value: -127 when the sensor is missing (blocks ~750 ms)
bool irDetected();   // true while the IR sensor sees something
}  // namespace sensors
