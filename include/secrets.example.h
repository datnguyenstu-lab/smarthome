// Copy this file to secrets.h (which is git-ignored) and fill in your own values. Never commit secrets.h.
#pragma once
#define WIFI_SSID "your-2.4GHz-network"          // first-boot default; later changed through setup mode
#define WIFI_PASS "your-wifi-password"
#define MQTT_HOST "your-deployment.emqxsl.com"   // EMQX Cloud Serverless address
#define MQTT_PORT 8883
#define MQTT_USER "board"                         // the board's own broker login, not a person's
#define MQTT_PASS "a-long-random-password"
#define OTA_PASS "another-random-password"        // needed for over-the-air updates
#define SETUP_AP_PASS "at-least-8-chars"          // password of the "SmartHome-Setup" Wi-Fi network
