#pragma once
namespace sensors {
void begin();
// Blocking read (about 750 ms): for boot and the self-test only.
float readTempC();
// Non-blocking read for the main loop: start a conversion, then collect it when ready (about 800 ms later).
void startTempConversion();
bool tempConversionReady();
float finishTempRead();
// Wiring diagnostic for a failed reading: `lineHigh` is the data line's idle level (low = shorted or held low),
// `present` is whether a device answered the reset pulse (false = nothing connected or a dead sensor).
void busStatus(bool& lineHigh, bool& present);   // raw library value: -127 when the sensor is missing (blocks ~750 ms)
bool irDetected();   // true while the IR sensor sees something
}  // namespace sensors
