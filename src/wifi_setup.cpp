#include "wifi_setup.h"
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include "secrets.h"

namespace wifiSetup {

static const char* AP_NAME = "SmartHome-Setup";
static const uint32_t JOIN_TIMEOUT_MS = 20000;
static const uint32_t PORTAL_TIMEOUT_S = 180;

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
  return wm.autoConnect(AP_NAME, SETUP_AP_PASS);  // saved network, else opens the portal
}

void startPortal() {
  WiFiManager wm;
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.startConfigPortal(AP_NAME, SETUP_AP_PASS);
  ESP.restart();  // back to normal, whether saved or timed out
}

}  // namespace wifiSetup
