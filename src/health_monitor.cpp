#include "health_monitor.h"
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <time.h>
#include "health.h"
#include "topics.h"
#include "net.h"
#include "leds.h"
#include "sensors.h"
#include "alerts.h"

namespace healthMonitor {

static const char* FW = "2.0.0";
static uint8_t mask = 0;
static uint32_t lastPubMs = 0;
static bool pendingBootTest = true;
static logic::HealthInputs in;

static const char* resetName() {
  switch (ESP.getResetInfoPtr()->reason) {
    case REASON_DEFAULT_RST: return "power";
    case REASON_WDT_RST: return "watchdog";
    case REASON_EXCEPTION_RST: return "exception";
    case REASON_SOFT_WDT_RST: return "soft_watchdog";
    case REASON_SOFT_RESTART: return "soft";
    case REASON_DEEP_SLEEP_AWAKE: return "deep_sleep";
    case REASON_EXT_SYS_RST: return "external";
    default: return "unknown";
  }
}

static bool crashReset() {
  uint32_t r = ESP.getResetInfoPtr()->reason;
  return r == REASON_WDT_RST || r == REASON_EXCEPTION_RST || r == REASON_SOFT_WDT_RST;
}

uint8_t issues() { return mask; }

void publishNow() {
  logic::HealthReport r;
  r.ts = (uint32_t)time(nullptr);
  r.rssi = WiFi.RSSI();
  r.heap = ESP.getFreeHeap();
  r.uptimeS = millis() / 1000;
  r.reset = resetName();
  r.wifiRc = net::wifiReconnects();
  r.mqttRc = net::mqttReconnects();
  r.fw = FW;
  r.issues = mask;
  char buf[256];
  if (logic::formatHealth(r, buf, sizeof(buf)) && net::publish(logic::T_HEALTH, buf, true)) lastPubMs = millis();
}

void runSelfTest(bool blinkLeds) {
  bool tempOk = logic::tempValid(sensors::readTempC());
  bool irOk = !(mask & logic::ISSUE_IR_STUCK);
  if (blinkLeds) {
    for (int n = 1; n <= 3; n++) {
      leds::drive(n, true); delay(300);
      leds::drive(n, leds::get(n));  // back to the state the person set
    }
  }
  char buf[320];
  snprintf(buf, sizeof(buf),
           "{\"ts\":%lu,\"checks\":[{\"name\":\"temp\",\"ok\":%s},{\"name\":\"ir\",\"ok\":%s},{\"name\":\"leds\",\"ok\":true},{\"name\":\"wifi\",\"ok\":%s},{\"name\":\"cloud\",\"ok\":%s}]}",
           (unsigned long)time(nullptr), tempOk ? "true" : "false", irOk ? "true" : "false",
           net::wifiUp() && WiFi.RSSI() >= logic::RSSI_WEAK_DBM ? "true" : "false", net::connected() ? "true" : "false");
  net::publish(logic::T_SELFTEST, buf, true);
}

void tick(uint32_t nowMs, bool tempOk, bool away, uint32_t presenceHeldMs) {
  in.tempOk = tempOk;
  in.away = away;
  in.presenceHeldMs = presenceHeldMs;
  in.rssi = WiFi.RSSI();
  in.heap = ESP.getFreeHeap();
  in.reconnectsIn10Min = net::reconnectsIn10Min();
  in.crashRecent = crashReset() && nowMs < 3600UL * 1000;  // cleared after one clean hour
  uint8_t m = logic::evalIssues(in);
  bool changed = m != mask;
  mask = m;
  if (net::connected() && (changed || lastPubMs == 0 || nowMs - lastPubMs >= 60000)) publishNow();
  if (pendingBootTest && net::connected()) { pendingBootTest = false; runSelfTest(false); }
}

}  // namespace healthMonitor
