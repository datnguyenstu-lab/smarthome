#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <time.h>
#include "secrets.h"
#include "ca_cert.h"

BearSSL::WiFiClientSecure net;
BearSSL::X509List ca(CA_CERT);
PubSubClient mqtt(net);

void onMsg(char* topic, byte* payload, unsigned int len) {
  Serial.printf("RX %s: %.*s\n", topic, len, (char*)payload);
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("MQTT connecting... ");
    String id = "esp8266-" + String(ESP.getChipId(), HEX);
    if (mqtt.connect(id.c_str(), MQTT_USER, MQTT_PASS, "smarthome/status", 0, true, "offline")) {
      Serial.println("ok");
      mqtt.publish("smarthome/status", "online", true);
      mqtt.subscribe("smarthome/cmd/#");
    } else {
      char err[128];
      net.getLastSSLError(err, sizeof(err));
      Serial.printf("failed, rc=%d, ssl: %s\n", mqtt.state(), err);
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print('.'); }
  Serial.printf("\nWi-Fi OK, IP %s\n", WiFi.localIP().toString().c_str());

  configTime(0, 0, "time.google.com", "pool.ntp.org");  // TLS cert check needs the real time
  Serial.print("NTP");
  uint32_t t0 = millis();
  while (time(nullptr) < 1700000000 && millis() - t0 < 30000) { delay(300); Serial.print('.'); }
  if (time(nullptr) < 1700000000) { Serial.println(" FAILED, restarting"); delay(500); ESP.restart(); }
  Serial.printf(" ok, epoch %ld\n", (long)time(nullptr));

  net.setTrustAnchors(&ca);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMsg);
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
}
