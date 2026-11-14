#include "statusled.h"

namespace logic {

Pattern pickPattern(bool setupMode, bool wifiUp, bool mqttUp, uint8_t issues, bool statusLedEnabled,
                    bool selfTestRunning) {
  if (setupMode) return Pattern::SetupFast;
  if (selfTestRunning) return Pattern::SelfTest;
  if (!statusLedEnabled) return Pattern::None;
  if (!wifiUp) return Pattern::NoWifi;
  if (!mqttUp) return Pattern::CloudDown;
  if (issues) return Pattern::Issue;
  return Pattern::None;
}

bool patternLevel(Pattern p, uint32_t nowMs) {
  switch (p) {
    case Pattern::SetupFast: return nowMs % 300 < 150;
    case Pattern::SelfTest: { uint32_t t = nowMs % 800; return t < 500 || (t >= 600 && t < 700); }
    case Pattern::CloudDown: return nowMs % 2000 < 1000;
    case Pattern::NoWifi: { uint32_t t = nowMs % 2000; return t < 100 || (t >= 250 && t < 350); }
    case Pattern::Issue: { uint32_t t = nowMs % 3000; return t < 100 || (t >= 250 && t < 350) || (t >= 500 && t < 600); }
    default: return false;
  }
}

}  // namespace logic
