#pragma once
#include <cstdint>

namespace healthMonitor {
// Call every loop with the current facts from main. Publishes smarthome/health every 60 s and on any
// change of the issue set, and publishes the boot self-test result after the first MQTT connect.
void tick(uint32_t nowMs, bool tempOk, bool away, uint32_t presenceHeldMs);
void publishInfo(const char* buildStamp);  // retained smarthome/info: firmware, build, chip, core, flash
void publishNow();                       // health JSON, retained (no-op while offline)

// Self-test: the yellow LED shows the self-test pattern for the whole duration (see selfTestRunning()).
// `onTick` is called every few ms while a self-test blocks, so the caller can keep the LED blinking.
void onTick(void (*cb)());
bool selfTestRunning();
float selfTestAtBoot();                  // call early in setup(): about 2 s; returns the temperature read
void runSelfTest(uint32_t patternMs);    // from cmd/selftest: result published at once, pattern held patternMs

const char* resetReason();               // power, external, soft, watchdog, exception, ...
uint8_t issues();                      // current logic::Issue bitmask
}  // namespace healthMonitor
