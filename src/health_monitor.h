#pragma once
#include <cstdint>

namespace healthMonitor {
// Call every loop with the current facts from main. Publishes smarthome/health every 60 s and on any
// change of the issue set, and runs the short self-test once after the first MQTT connect.
void tick(uint32_t nowMs, bool tempOk, bool away, uint32_t presenceHeldMs);
void publishNow();                    // health JSON, retained (no-op while offline)
void runSelfTest(bool blinkLeds);     // blocks about 1-2 s; publishes smarthome/selftest, retained
uint8_t issues();                     // current logic::Issue bitmask
}  // namespace healthMonitor
