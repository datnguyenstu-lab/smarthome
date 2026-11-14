#include "wifi_setup.h"
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include "secrets.h"
#include "event_log.h"
#include <LittleFS.h>

namespace wifiSetup {

static const char* AP_NAME = "SmartHome-Setup";
static const uint32_t JOIN_TIMEOUT_MS = 20000;
static const uint32_t PORTAL_TIMEOUT_S = 180;
static void (*tickCb)() = nullptr;
static const char* NO_DEFAULT_FLAG = "/no_default_wifi";   // present while the owner has forgotten the network

void onTick(void (*cb)()) { tickCb = cb; }

// Keeps the non-blocking portal alive until it finishes (network saved and joined, or its timeout);
// true when the board ends up connected. Must not test WiFi.status() inside the loop: a board that is
// already online (setup started from a command) would leave at once.
static bool waitForPortal(WiFiManager& wm) {
  uint32_t t0 = millis();
  while (millis() - t0 < PORTAL_TIMEOUT_S * 1000UL) {
    if (wm.process()) break;
    if (tickCb) tickCb();
    delay(5);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool connect() {
  WiFi.mode(WIFI_STA);
  bool forgotten = LittleFS.begin() && LittleFS.exists(NO_DEFAULT_FLAG);
  if (WiFi.SSID().length() > 0 && forgotten) LittleFS.remove(NO_DEFAULT_FLAG);   // a network was saved again
  if (WiFi.SSID().length() == 0 && !forgotten) {  // first boot: nothing saved, use the secrets.h default
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < JOIN_TIMEOUT_MS) delay(250);
    if (WiFi.status() == WL_CONNECTED) return true;
  }
  WiFiManager wm;
  wm.setConnectTimeout(JOIN_TIMEOUT_MS / 1000);
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setConfigPortalBlocking(false);
  if (wm.autoConnect(AP_NAME, SETUP_AP_PASS)) return true;  // saved network joined
  return waitForPortal(wm);                                 // else the portal is open: wait for it
}

void startPortal() {
  WiFiManager wm;
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setConfigPortalBlocking(false);
  eventLog::info("setup", "setup mode started");
  wm.startConfigPortal(AP_NAME, SETUP_AP_PASS);
  bool joined = waitForPortal(wm);
  if (joined) eventLog::info("setup", "setup mode ended, network saved"); else eventLog::warn("setup", "setup mode timed out");
  eventLog::flush();
  ESP.restart();  // back to normal, whether saved or timed out
}

void forgetAndSetup() {
  eventLog::warn("wifi", "saved network and password erased on request");
  eventLog::flush();
  if (LittleFS.begin()) { File f = LittleFS.open(NO_DEFAULT_FLAG, "w"); if (f) f.close(); }
  { WiFiManager wm; wm.resetSettings(); }   // erases the saved network and password
  startPortal();                            // waits for a new network, then restarts
}

}  // namespace wifiSetup
