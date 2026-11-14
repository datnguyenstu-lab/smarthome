#include "net.h"
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <time.h>
#include "secrets.h"
#include "ca_cert.h"
#include "wifi_setup.h"
#include "topics.h"
#include "health.h"
#include "event_log.h"

namespace net {

static BearSSL::WiFiClientSecure tls;
static BearSSL::X509List ca(CA_CERT);
static PubSubClient mqtt(tls);
static MessageCb msgCb = nullptr;
static void (*connectCb)() = nullptr;
static uint32_t lastTry = 0;
static logic::EventWindow reconnects(600000);
static int wifiRc = 0, mqttRc = 0;
static bool wifiWasUp = true, everMqtt = false, mqttWasUp = false, failLogged = false;

static void relay(char* topic, byte* payload, unsigned len) {
  if (!msgCb) return;
  char buf[256];
  if (len >= sizeof(buf)) return;  // commands are small (settings JSON is about 70 bytes); bigger is garbage
  memcpy(buf, payload, len);
  buf[len] = '\0';
  msgCb(topic, buf, len);
}

static bool tryConnect() {
  String id = "esp8266-" + String(ESP.getChipId(), HEX);
  if (!mqtt.connect(id.c_str(), MQTT_USER, MQTT_PASS, logic::T_STATUS, 0, true, "offline")) {
    char err[96];
    tls.getLastSSLError(err, sizeof(err));
    Serial.printf("MQTT failed rc=%d ssl=%s\n", mqtt.state(), err);
    if (!failLogged) { failLogged = true; char d[48]; snprintf(d, sizeof(d), "connection failed rc=%d", mqtt.state()); eventLog::warn("mqtt", d); }
    return false;
  }
  Serial.println("MQTT connected");
  eventLog::info("mqtt", "connected");
  failLogged = false;
  mqttWasUp = true;
  if (everMqtt) { mqttRc++; reconnects.add(millis()); }
  everMqtt = true;
  mqtt.publish(logic::T_STATUS, "online", true);
  mqtt.subscribe(logic::T_CMD_ALL);
  if (connectCb) connectCb();
  return true;
}

void begin() {
  if (!wifiSetup::connect()) { Serial.println("Wi-Fi setup failed, restarting"); delay(500); ESP.restart(); }
  Serial.printf("Wi-Fi OK, IP %s\n", WiFi.localIP().toString().c_str());
  { char d[48]; snprintf(d, sizeof(d), "connected rssi=%d dBm", WiFi.RSSI()); eventLog::info("wifi", d); }

  configTime(0, 0, "time.google.com", "pool.ntp.org");  // TLS certificate check needs the real time
  uint32_t t0 = millis();
  while (time(nullptr) < 1700000000 && millis() - t0 < 30000) delay(300);
  if (time(nullptr) < 1700000000) { Serial.println("NTP failed, restarting"); delay(500); ESP.restart(); }

  tls.setTrustAnchors(&ca);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(30);
  mqtt.setBufferSize(512);  // default 256 is too small for the health JSON
  mqtt.setCallback(relay);

  ArduinoOTA.setHostname("smarthome-node");
  ArduinoOTA.setPassword(OTA_PASS);
  ArduinoOTA.onStart([]() { eventLog::info("ota", "update started"); });
  ArduinoOTA.onEnd([]() { eventLog::info("ota", "update finished"); eventLog::flush(); });
  ArduinoOTA.onError([](ota_error_t e) { char d[24]; snprintf(d, sizeof(d), "update failed code=%d", (int)e); eventLog::error("ota", d); });
  ArduinoOTA.begin();
}

void loop() {
  ArduinoOTA.handle();
  bool up = WiFi.status() == WL_CONNECTED;
  if (up && !wifiWasUp) { wifiRc++; reconnects.add(millis()); eventLog::info("wifi", "reconnected"); }
  if (!up && wifiWasUp) eventLog::warn("wifi", "connection lost");
  wifiWasUp = up;
  bool mq = mqtt.connected();
  if (!mq && mqttWasUp) eventLog::warn("mqtt", "connection lost");
  mqttWasUp = mq;
  if (mqtt.connected()) { mqtt.loop(); return; }
  if (millis() - lastTry >= 5000 || lastTry == 0) { lastTry = millis(); if (WiFi.status() == WL_CONNECTED) tryConnect(); }
}

bool connected() { return mqtt.connected(); }

// Before the board leaves for setup mode it stops answering MQTT. Without this the broker only notices after the
// keep-alive runs out (45 to 60 s) and the page keeps showing "online". A clean disconnect does not trigger the
// last will, so the retained status is set here.
void goOffline() {
  if (mqtt.connected()) {
    mqtt.publish(logic::T_STATUS, "offline", true);   // written out at once; no mqtt.loop() here: we may be inside its callback
    mqtt.disconnect();
    delay(100);   // let the packets leave before the portal takes over
  }
  mqttWasUp = false;
}
bool wifiUp() { return WiFi.status() == WL_CONNECTED; }
int wifiReconnects() { return wifiRc; }
int mqttReconnects() { return mqttRc; }
int reconnectsIn10Min() { return reconnects.count(millis()); }
bool publishBytes(const char* topic, const uint8_t* data, unsigned len) { return mqtt.connected() && mqtt.publish(topic, data, len, false); }
bool publish(const char* topic, const char* payload, bool retained) { return mqtt.connected() && mqtt.publish(topic, payload, retained); }
void onMessage(MessageCb cb) { msgCb = cb; }
void onConnect(void (*cb)()) { connectCb = cb; }

}  // namespace net
