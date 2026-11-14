#pragma once
#include <cstdint>
namespace logic {

enum class Pattern { None, SetupFast, SelfTest, NoWifi, CloudDown, Issue };

// Priority: SetupFast > SelfTest > NoWifi > CloudDown > Issue. Setup mode and a running self-test always
// show; with the setting off everything else is None.
Pattern pickPattern(bool setupMode, bool wifiUp, bool mqttUp, uint8_t issues, bool statusLedEnabled,
                    bool selfTestRunning = false);

// true = LED on. SetupFast 300 ms period; SelfTest 800 ms (on 500, off 100, on 100, off 100); NoWifi double blink / 2 s; CloudDown 1 s on, 1 s off;
// Issue triple blink / 3 s. None is always off (callers ignore it). One short glitch at the millis() wrap.
bool patternLevel(Pattern p, uint32_t nowMs);

}  // namespace logic
