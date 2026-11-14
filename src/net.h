#pragma once

namespace net {
using MessageCb = void (*)(const char* topic, const char* payload, unsigned len);

void begin();                              // Wi-Fi, NTP time, TLS and OTA setup; restarts on failure
void loop();                               // keeps MQTT up (5 s retry), handles OTA and messages
bool connected();
bool wifiUp();                             // Wi-Fi link is up (MQTT may still be down)
int wifiReconnects();                      // Wi-Fi links regained since boot
int mqttReconnects();                      // MQTT connects after the first since boot
int reconnectsIn10Min();                   // both kinds, last 10 minutes (newest 8 kept)
bool publish(const char* topic, const char* payload, bool retained);
void onMessage(MessageCb cb);              // every message on smarthome/cmd/#
void onConnect(void (*cb)());              // called after each (re)connect
}  // namespace net
