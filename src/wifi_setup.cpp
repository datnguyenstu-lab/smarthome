#include "wifi_setup.h"
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include "secrets.h"

namespace wifiSetup {

static const char* AP_NAME = "SmartHome-Setup";
static const uint32_t JOIN_TIMEOUT_MS = 20000;
static const uint32_t PORTAL_TIMEOUT_S = 180;
static void (*tickCb)() = nullptr;

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
  if (WiFi.SSID().length() == 0) {  // first boot: nothing saved, use the secrets.h default
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
  wm.startConfigPortal(AP_NAME, SETUP_AP_PASS);
  waitForPortal(wm);
  ESP.restart();  // back to normal, whether saved or timed out
}

}  // namespace wifiSetup
