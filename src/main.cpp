#include <Arduino.h>
#include <time.h>
#include "alerts.h"
#include "timing.h"
#include "topics.h"
#include "pins.h"
#include "leds.h"
#include "sensors.h"
#include "net.h"
#include "wifi_setup.h"
#include "settings.h"
#include "settings_store.h"
#include "health_monitor.h"

using namespace logic;

static Debouncer btn1(30), btn2(30);
static LongPress btn1Long(5000);
static PresenceHold presenceHold(5000);
static Settings settings;
static uint32_t connectMs = 0;
static uint32_t presenceSinceMs = 0;
static bool btn1Prev = false, btn2Prev = false;
static bool presence = false, away = false;
static float lastTemp = NAN;
static Alert alert = Alert::None;
static uint32_t lastTempMs = 0;

static void pub(const char* topic, const char* v) { net::publish(topic, v, true); }

static void publishLed(int n) { pub(ledStateTopic(n), leds::get(n) ? "on" : "off"); }

static void applySettings() { presenceHold.setHoldMs(settings.presenceHoldS * 1000UL); }

static void publishSettings() {
  char b[96];
  if (formatSettings(settings, b, sizeof(b))) pub(T_SETTINGS, b);
}

static bool sameSettings(const Settings& a, const Settings& b) {
  return a.hotOnC == b.hotOnC && a.presenceHoldS == b.presenceHoldS && a.statusLed == b.statusLed;
}

static void publishAlertIfChanged(bool force = false) {
  Alert a = evalAlert(lastTemp, away, presence, alert, settings.hotOnC);
  if (a != alert || force) { alert = a; pub(T_ALERT, alertName(a)); }
}

static void setLed(int n, bool on) { leds::set(n, on); publishLed(n); }

static void setAway(bool on) {
  away = on;
  pub(T_STATE_AWAY, on ? "on" : "off");
  publishAlertIfChanged();
}

static void readTemp() {
  lastTemp = sensors::readTempC();
  Serial.printf("DS18B20 raw: %.2f\n", lastTemp);  // -127 = not found, 85 = bad power/pull-up
  if (tempValid(lastTemp)) { char b[16]; snprintf(b, sizeof(b), "%.1f", lastTemp); pub(T_TEMP, b); }
  publishAlertIfChanged();
}

static void publishPresence(bool changed) {
  pub(T_PRESENCE, presence ? "1" : "0");
  if (changed) { char b[16]; snprintf(b, sizeof(b), "%ld", (long)time(nullptr)); pub(T_PRESENCE_CHANGED, b); }
}

static void onConnected() {  // after every (re)connect: republish everything from RAM
  connectMs = millis();
  publishSettings();
  healthMonitor::publishNow();
  for (int n = 1; n <= 3; n++) publishLed(n);
  pub(T_STATE_AWAY, away ? "on" : "off");
  publishPresence(false);
  if (tempValid(lastTemp)) { char b[16]; snprintf(b, sizeof(b), "%.1f", lastTemp); pub(T_TEMP, b); }
  publishAlertIfChanged(true);
}

static void onCommand(const char* topic, const char* payload, unsigned len) {
  bool on;
  int n = ledFromCmdTopic(topic);
  if (n) { if (parseOnOff(payload, len, on)) setLed(n, on); return; }
  if (strcmp(topic, T_CMD_SETTINGS) == 0) {
    Settings s = settings;
    if (parseSettings(payload, len, s) && !sameSettings(s, settings)) {
      settings = s;
      applySettings();
      settingsStore::save(settings);  // only when something changed: the echo never writes flash
      publishAlertIfChanged();
    }
    publishSettings();  // the echo shows what the board really holds
    return;
  }
  // A retained cmd/setup or cmd/selftest arrives right after connecting; ignore that so it cannot boot-loop the board.
  if (strcmp(topic, T_CMD_SETUP) == 0) { if (millis() - connectMs > 3000) wifiSetup::startPortal(); return; }
  if (strcmp(topic, T_CMD_SELFTEST) == 0) { if (millis() - connectMs > 3000) healthMonitor::runSelfTest(true); return; }
  if (strcmp(topic, T_CMD_AWAY) == 0 && parseOnOff(payload, len, on)) setAway(on);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN1, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);
  leds::begin();
  sensors::begin();
  settings = settingsStore::load();
  applySettings();
  lastTemp = sensors::readTempC();
  net::onMessage(onCommand);
  net::onConnect(onConnected);
  net::begin();
  Serial.println("Ready");
}

void loop() {
  net::loop();
  uint32_t now = millis();

  bool b1 = btn1.update(digitalRead(PIN_BTN1) == LOW, now);
  bool b2 = btn2.update(digitalRead(PIN_BTN2) == LOW, now);
  if (b1 && !btn1Prev) setLed(2, !leds::get(2));  // D1 button -> middle light
  if (b2 && !btn2Prev) setLed(3, !leds::get(3));  // D4 button -> yellow light
  btn1Prev = b1; btn2Prev = b2;
  if (btn1Long.update(b1, now)) wifiSetup::startPortal();

  bool p = presenceHold.update(sensors::irDetected(), now);
  if (p != presence) { presence = p; presenceSinceMs = now; publishPresence(true); publishAlertIfChanged(); }
  healthMonitor::tick(now, tempValid(lastTemp), away, presence ? now - presenceSinceMs : 0);

  if (now - lastTempMs >= 30000) { lastTempMs = now; readTemp(); }
}
