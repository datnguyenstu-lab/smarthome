#pragma once
namespace wifiSetup {
// Joins Wi-Fi: saved credentials first, then the secrets.h default on a first boot,
// then setup mode. Returns true when connected.
bool connect();
// Opens the SmartHome-Setup access point and blocks until saved or timed out, then reboots.
void startPortal();
}  // namespace wifiSetup
