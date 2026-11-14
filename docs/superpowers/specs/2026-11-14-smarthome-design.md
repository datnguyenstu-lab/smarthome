# ESP8266 Smart Home Node: design

Date: 2026-11-14. Status: awaiting approval.

## Intent

A small smart-home node on a NodeMCU (ESP8266MOD) that the owner can watch and control from any phone, from anywhere, without installing an app. The owner already has the hardware wired and tested; this design covers the firmware, the cloud link and a phone web page.

Why: the owner wants to see room temperature and presence and switch lights remotely, and to be warned when something is wrong.

## Goals

- The board connects to Wi-Fi and to a cloud MQTT broker over TLS (done, tested).
- Phone web page, layout "A Dashboard" (chosen by the owner): login, warning banner, temperature tile, presence tile, three light switches, an Away switch.
- Works on mobile data as well as home Wi-Fi.
- Two person logins for the web page, plus one separate login for the board.
- Physical buttons on the board work and the web page reflects them.

## Non-goals

- No custom account system (sign-up, password reset, roles).
- No push notifications. Warnings show only while the web page is open.
- No humidity sensor. The DS18B20 measures temperature only.
- No Home Assistant, no router port-forwarding, no direct exposure of the board.
- No on-device web server.

## Anti-goals

- Anything that lets a stranger switch the lights: broker login and TLS are mandatory, and no credentials live in the web page source or in version control.
- A cloud bill: the broker must stay on the free tier with its spend limit at 0.

## Fixed facts (the owner decided or tested these)

| Item | Value |
|---|---|
| Board | NodeMCU ESP8266MOD, PlatformIO, Arduino framework, project in this folder |
| Wi-Fi | 2.4 GHz network `dat` (a phone hotspot). Credentials are in `include/secrets.h` |
| Broker | EMQX Cloud Serverless, Asia-Pacific, deployment `smarthome`, free quota only (spend limit 0) |
| Broker address | `hff38f13.ala.asia-southeast1.emqxsl.com`, MQTT over TLS 8883, WebSocket over TLS 8084 |
| CA certificate | `cert/emqxsl-ca.crt` (expires 2031), embedded via `include/ca_cert.h` |
| Tested connection | Wi-Fi, NTP time sync, and TLS MQTT login all work (connect test passed 2026-11-14) |

Pin map (each tested on the real board):

| Pin | Part |
|---|---|
| D0 | IR obstacle sensor OUT (low = detected). Needs its trimmer turned for range |
| D1 | Button 1 to GND (use INPUT_PULLUP, pressed = low) |
| D2 | DS18B20 temperature sensor (OneWire). OneWire does not work on D0 |
| D4 | Button 2 to GND. GPIO2 must be high at boot, so never hold it at reset |
| D5, D6, D7 | LED 1, LED 2, LED 3 (active high, with resistors) |
| 3V3, GND | Power for the sensors, from the board |

## Behaviour (the parts below marked *my call* were decided by the designer, not the owner)

**Topics** (all under `smarthome/`, *my call*):

| Topic | Direction | Payload |
|---|---|---|
| `status` | board publishes, retained, last-will = `offline` | `online` or `offline` |
| `temp` | board publishes, retained, every 30 s | e.g. `33.3` (skip the publish if the sensor returns -127) |
| `presence` | board publishes on change, retained | `1` = someone, `0` = clear |
| `state/led1`..`state/led3` | board publishes on change, retained | `on` or `off` |
| `cmd/led1`..`cmd/led3` | page publishes | `on` or `off` |
| `state/away` | board publishes, retained | `on` or `off` |
| `cmd/away` | page publishes, **retained** so the board restores Away after a reboot (*my call*) | `on` or `off` |
| `alert` | board publishes on change, retained | `none`, `hot` or `intruder` |

**Alerts are evaluated on the board** so the logic lives in one place:
- `hot` when temperature is at or above **35 °C** (*my call*, constant in firmware). Clears with 1 °C of hysteresis.
- `intruder` when presence is `1` while Away is `on`.
- "Offline" is not published by the board. The page derives it from `status` (via the last-will message).

**Sensor faults** (approved by the owner):
- Temperature: a reading of -127 (disconnected), exactly 85.0 (power-on default / bad supply) or a failed CRC counts as a fault. The board does not publish `temp` then, and publishes `alert = temp_fault`. The page shows "Temperature sensor not responding". `alert` values are therefore `none`, `hot`, `intruder`, `temp_fault`; if several apply, `intruder` wins over `temp_fault` over `hot` (*my call*).
- IR: a plain digital output cannot be checked for failure. The board publishes `presence_changed` (epoch seconds of the last change, retained) and the page shows "last change: N min ago". No failure claim is made.
- Board offline: covered by the last-will `status`.

**Buttons** (*my call*): button 1 toggles LED 1 and button 2 toggles LED 2, with debounce. LED 3 and Away are remote-only. Every change publishes the new state.

**IR presence**: debounce so a single flicker does not flip state; hold "present" for a short time after the last detection.

**Reconnect**: the board retries Wi-Fi and the broker without a reboot, restoring LED states from its own memory (not from retained commands). MQTT keep-alive is 30 s so the broker marks the board `offline` within about a minute (*added after architecture review*).

**OTA updates** (*added after architecture review*): the board accepts password-protected over-the-air firmware updates on the same network, so later updates need no USB cable or FLASH button. The first OTA-enabled build is flashed by USB.

**Phase 2, not in scope**: push notifications through an EMQX rule to a free push service.

## Wi-Fi setup on the board (owner requirement: the board must be set up first when the Wi-Fi changes)

- The board stores the Wi-Fi name and password in its own flash. `include/secrets.h` supplies only the first-boot default, so it works today without setup.
- **Setup mode** starts automatically when the board cannot join its saved Wi-Fi within about 20 s, and also when the owner **holds button 1 (D1) for 5 s** while the board is running (*my call*). Do not use D4 for this: it must be high at boot.
- In setup mode the board opens its own Wi-Fi network called `SmartHome-Setup` (*my call*). The owner joins it with a phone, a captive page opens, lists the 2.4 GHz networks the board can see, and takes the new password. The board saves it and reboots. The list only shows 2.4 GHz networks, which also avoids the 5 GHz hotspot mistake already made once.
- Suggested implementation: the WiFiManager library for ESP8266, a standard solution for this exact job.
- The setup network should have a password (*my call*) so a neighbour cannot reconfigure the board.
- Only Wi-Fi is set this way. The broker login and certificate stay in `secrets.h` and need a reflash to change.
- While in setup mode the board does not run the lights, sensors or MQTT (*my call*). It returns to normal after saving, or after a timeout of a few minutes so a power cut with the router down does not leave it stuck.

## Web page

- One static HTML file, no build step. MQTT.js from a CDN (pinned version), connecting over secure WebSocket to port 8084 path `/mqtt`.
- Login form (username, password). The page stores nothing permanent; credentials stay in memory for the session.
- Layout A: header with online/offline dot, warning banner (only when an alert or offline applies), temperature tile, presence tile, switch list for Light 1 to 3, and an Away switch.
- Hosted on a free static host (GitHub Pages suggested), with the owner doing the publish step.
- Works at phone width; readable in light and dark mode.

## Accounts and security

- Board login: recreate with a strong password (the current one is trivially weak and must be replaced before the page goes live).
- Two person logins, separate usernames (*owner agreed to two accounts*).
- Nice to have, builder's call: broker authorization rules so person logins can subscribe to `smarthome/#` and publish only to `smarthome/cmd/#`.
- `include/secrets.h` stays out of version control. `.superpowers/` is excluded too.

## Left to the builder

- Library and code structure, exact debounce values, sampling intervals, page styling, Wi-Fi reconnect details.
- How to verify the firmware (suggested: the EMQX Online Test client in the console, and the serial monitor).

## Known risks

- Changing the web-page settings (hot-room limit, update interval, presence hold time) is **under discussion with the owner**, not yet in scope. Wi-Fi and the broker login are never changed from the page.
- **Flashing is unreliable.** Uploads currently need the FLASH button held and the 3V3 sensor wire removed. This is probably a power or wiring issue and should be resolved or documented.
- The hotspot Wi-Fi is a phone, so it will drop whenever the phone moves or sleeps.
- Free-tier limits: 1 million session minutes and 1 GB of traffic a month. One board plus two phones fits easily, but a page left open on many devices could use more sessions.
