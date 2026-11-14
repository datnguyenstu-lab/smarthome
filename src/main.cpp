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
#include "statusled.h"
#include "event_log.h"
#include "version.h"

using namespace logic;

static Debouncer btn1(30), btn2(30);
static LongPress btn1Long(5000);
static Debouncer doorDebounce(300);   // the IR sensor is the door sensor: a change must hold for 300 ms
static Settings settings;
static uint32_t connectMs = 0;
static uint32_t doorOpenSinceMs = 0;
static bool btn1Prev = false, btn2Prev = false;
static bool doorOpen = false, away = false;   // `away` is lock-up mode on the page
static float lastTemp = NAN;
static Alert alert = Alert::None;
static uint32_t lastTempMs = 0;

static void pub(const char* topic, const char* v) { net::publish(topic, v, true); }

static void publishLed(int n) { pub(ledStateTopic(n), leds::get(n) ? "on" : "off"); }

static void publishSettings() {
  char b[96];
  if (formatSettings(settings, b, sizeof(b))) pub(T_SETTINGS, b);
}

static bool sameSettings(const Settings& a, const Settings& b) {
  return a.hotOnC == b.hotOnC && a.doorOpenS == b.doorOpenS && a.statusLed == b.statusLed;
}

static void publishAlertIfChanged(bool force = false) {
  uint32_t openMs = doorOpen ? millis() - doorOpenSinceMs : 0;
  Alert a = evalAlert(lastTemp, away, doorOpen, openMs, alert, settings.hotOnC, settings.doorOpenS * 1000UL);
  if (a != alert || force) { alert = a; pub(T_ALERT, alertName(a)); }
}

static void setLed(int n, bool on) { leds::set(n, on); publishLed(n); }

static void setAway(bool on) {
  away = on;
  pub(T_STATE_AWAY, on ? "on" : "off");
  publishAlertIfChanged();
}

static const uint32_t TEMP_EVERY_MS = 10000;
static bool tempPending = false;   // a conversion was started and not collected yet

static void readTemp() {           // collects the conversion started by the loop: no 750 ms stall
  lastTemp = sensors::finishTempRead();
  Serial.printf("DS18B20 raw: %.2f\n", lastTemp);  // -127 = not found, 85 = bad power/pull-up
  if (tempValid(lastTemp)) { char b[16]; snprintf(b, sizeof(b), "%.1f", lastTemp); pub(T_TEMP, b); }
  publishAlertIfChanged();
}

static void publishDoor(bool changed) {
  pub(T_DOOR, doorOpen ? "open" : "closed");
  if (changed) { char b[16]; snprintf(b, sizeof(b), "%ld", (long)time(nullptr)); pub(T_DOOR_CHANGED, b); }
}

// The yellow LED (led 1) is the status LED: dark when all is well, a blink pattern when something needs
// attention. It is not a light the person controls.
static void driveStatusLed(bool setupMode) {
  static Pattern prev = Pattern::None;
  Pattern p = pickPattern(setupMode, net::wifiUp(), net::connected(), healthMonitor::issues(), settings.statusLed,
                      healthMonitor::selfTestRunning());
  if (p != Pattern::None) leds::drive(1, patternLevel(p, millis()));
  else if (prev != Pattern::None) leds::drive(1, false);
  prev = p;
}

static void onConnected() {  // after every (re)connect: republish everything from RAM
  connectMs = millis();
  publishSettings();
  healthMonitor::publishInfo(__DATE__ " " __TIME__);
  healthMonitor::publishNow();
  for (int n = 2; n <= 3; n++) publishLed(n);  // led 1 is the status LED, not a light
  pub(T_STATE_AWAY, away ? "on" : "off");
  publishDoor(false);
  if (tempValid(lastTemp)) { char b[16]; snprintf(b, sizeof(b), "%.1f", lastTemp); pub(T_TEMP, b); }
  publishAlertIfChanged(true);
}

static void onCommand(const char* topic, const char* payload, unsigned len) {
  bool on;
  int n = ledFromCmdTopic(topic);
  if (n) { if (n != 1 && parseOnOff(payload, len, on)) setLed(n, on); return; }  // led 1 = status LED: ignored
  if (strcmp(topic, T_CMD_SETTINGS) == 0) {
    Settings s = settings;
    if (parseSettings(payload, len, s) && !sameSettings(s, settings)) {
      settings = s;
      settingsStore::save(settings);  // only when something changed: the echo never writes flash
      { char d[96]; if (formatSettings(settings, d, sizeof(d))) eventLog::add("settings", d); }
      publishAlertIfChanged();
    }
    publishSettings();  // the echo shows what the board really holds
    return;
  }
  // A retained cmd/setup or cmd/selftest arrives right after connecting; ignore that so it cannot boot-loop the board.
  if (strcmp(topic, T_CMD_SETUP) == 0) { if (millis() - connectMs > 3000) wifiSetup::startPortal(); return; }
  if (strcmp(topic, T_CMD_FORGET_WIFI) == 0) { if (millis() - connectMs > 3000) wifiSetup::forgetAndSetup(); return; }
  if (strcmp(topic, T_CMD_LOG) == 0) { if (millis() - connectMs > 3000) eventLog::handleCommand(payload, len); return; }
  if (strcmp(topic, T_CMD_SELFTEST) == 0) { if (millis() - connectMs > 3000) healthMonitor::runSelfTest(3000); return; }
  if (strcmp(topic, T_CMD_AWAY) == 0 && parseOnOff(payload, len, on)) setAway(on);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN1, INPUT_PULLUP);
  pinMode(PIN_BTN2, INPUT_PULLUP);
  leds::begin();
  sensors::begin();
  eventLog::begin();
  { char d[64]; snprintf(d, sizeof(d), "reset=%s fw=%s", healthMonitor::resetReason(), FW_VERSION); eventLog::add("boot", d); }
  settings = settingsStore::load();
  wifiSetup::onTick([]() { driveStatusLed(true); });
  healthMonitor::onTick([]() { driveStatusLed(false); });
  lastTemp = healthMonitor::selfTestAtBoot();  // yellow LED shows the self-test pattern for about 2 s
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

  // IR sees the door (closed) -> detected; sees nothing -> the door is open
  bool open = doorDebounce.update(!sensors::irDetected(), now);
  if (open != doorOpen) {
    doorOpen = open; doorOpenSinceMs = now;
    publishDoor(true);
    eventLog::add("door", open ? "open" : "closed");
  }
  publishAlertIfChanged();   // the grace time runs out without any event, so check every loop (publishes only on change)
  healthMonitor::tick(now, tempValid(lastTemp), away, doorOpen ? now - doorOpenSinceMs : 0);
  driveStatusLed(false);
  eventLog::tick(now);

  if (!tempPending && now - lastTempMs >= TEMP_EVERY_MS) { lastTempMs = now; sensors::startTempConversion(); tempPending = true; }
  if (tempPending && sensors::tempConversionReady()) { tempPending = false; readTemp(); }
}
