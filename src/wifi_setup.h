#pragma once
namespace wifiSetup {
// Joins Wi-Fi: saved credentials first, then the secrets.h default on a first boot,
// then setup mode. Returns true when connected.
bool connect();
// Opens the SmartHome-Setup access point and waits until saved or timed out, then reboots.
void startPortal();
// Erases the saved network and password, then opens the setup access point like startPortal(). Until a new
// network is saved the board does not fall back to the built-in default network from secrets.h.
void forgetAndSetup();
// Called repeatedly (every few ms) while the setup portal is open, so the caller can blink the status LED.
void onTick(void (*cb)());
}  // namespace wifiSetup
