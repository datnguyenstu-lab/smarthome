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
#include "event_log.h"
#include "version.h"

namespace healthMonitor {

static const char* FW = FW_VERSION;
static const uint32_t HEALTH_EVERY_MS = 10000;   // also published at once when the issues change
static uint8_t mask = 0;
static uint32_t lastPubMs = 0;
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
const char* resetReason() { return resetName(); }

void publishInfo(const char* buildStamp) {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"fw\":\"%s\",\"build\":\"%s\",\"chip\":\"esp8266-%06x\",\"core\":\"%s\",\"flash_kb\":%lu,\"sketch_kb\":%lu}",
           FW, buildStamp, (unsigned)ESP.getChipId(), ESP.getCoreVersion().c_str(),
           (unsigned long)(ESP.getFlashChipRealSize() / 1024), (unsigned long)(ESP.getSketchSize() / 1024));
  net::publish(logic::T_INFO, buf, true);
}

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

static void (*tickCb)() = nullptr;
static bool running = false;
static bool bootPending = false, bootTempOk = true;

void onTick(void (*cb)()) { tickCb = cb; }
bool selfTestRunning() { return running; }

// Keeps the pattern going until `ms` have passed since t0.
static void holdPattern(uint32_t t0, uint32_t ms) {
  while (millis() - t0 < ms) {
    if (tickCb) tickCb();
    delay(5);
  }
}

static void publishSelfTest(bool tempOk) {
  bool doorOk = !(mask & logic::ISSUE_DOOR_OPEN_LONG);
  bool wifiOk = net::wifiUp() && WiFi.RSSI() >= logic::RSSI_WEAK_DBM;
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"ts\":%lu,\"checks\":[{\"name\":\"temp\",\"ok\":%s},{\"name\":\"door\",\"ok\":%s},{\"name\":\"wifi\",\"ok\":%s},{\"name\":\"cloud\",\"ok\":%s}]}",
           (unsigned long)time(nullptr), tempOk ? "true" : "false", doorOk ? "true" : "false", wifiOk ? "true" : "false",
           net::connected() ? "true" : "false");
  net::publish(logic::T_SELFTEST, buf, true);
  bool allOk = tempOk && doorOk && wifiOk && net::connected();
  char d[72];
  snprintf(d, sizeof(d), "%s temp=%s door=%s wifi=%s cloud=%s", allOk ? "passed" : "failed", tempOk ? "ok" : "FAIL", doorOk ? "ok" : "FAIL", wifiOk ? "ok" : "FAIL", net::connected() ? "ok" : "FAIL");
  if (allOk) eventLog::info("selftest", d); else eventLog::warn("selftest", d);
}

float selfTestAtBoot() {
  running = true;
  uint32_t t0 = millis();
  if (tickCb) tickCb();                 // pattern starts before the 750 ms sensor read blocks
  float t = sensors::readTempC();
  bootTempOk = logic::tempValid(t);
  holdPattern(t0, 2000);
  running = false;
  leds::drive(1, false);                // Wi-Fi setup follows and does not tick; leave the LED dark
  bootPending = true;                   // published after the first MQTT connect
  return t;
}

void runSelfTest(uint32_t patternMs) {
  running = true;
  uint32_t t0 = millis();
  if (tickCb) tickCb();
  bool tempOk = logic::tempValid(sensors::readTempC());
  publishSelfTest(tempOk);
  holdPattern(t0, patternMs);
  running = false;
}

void tick(uint32_t nowMs, bool tempOk, bool away, uint32_t doorOpenMs) {
  in.tempOk = tempOk;
  in.away = away;
  in.doorOpenMs = doorOpenMs;
  in.rssi = WiFi.RSSI();
  in.heap = ESP.getFreeHeap();
  in.reconnectsIn10Min = net::reconnectsIn10Min();
  in.crashRecent = crashReset() && nowMs < 3600UL * 1000;  // cleared after one clean hour
  uint8_t m = logic::evalIssues(in);
  bool changed = m != mask;
  if (changed) {
    for (uint8_t bit = 1; bit != 0 && bit <= logic::ISSUE_CRASH_REBOOT; bit <<= 1) {
      char d[40];
      if ((m & bit) && !(mask & bit)) { snprintf(d, sizeof(d), "raised %s", logic::issueName(bit)); eventLog::warn("issue", d); }
      if (!(m & bit) && (mask & bit)) { snprintf(d, sizeof(d), "cleared %s", logic::issueName(bit)); eventLog::info("issue", d); }
    }
  }
  mask = m;
  if (net::connected() && (changed || lastPubMs == 0 || nowMs - lastPubMs >= HEALTH_EVERY_MS)) publishNow();
  if (bootPending && net::connected()) { bootPending = false; publishSelfTest(bootTempOk); }
}

}  // namespace healthMonitor
