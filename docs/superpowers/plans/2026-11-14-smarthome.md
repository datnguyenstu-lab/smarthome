# ESP8266 Smart Home Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firmware and a phone web page that show temperature and presence, switch three LEDs, and raise warnings, over a TLS MQTT cloud broker, with on-device Wi-Fi setup.

**Architecture:** All decision logic (alerts, debounce, payload and topic parsing) lives in a hardware-free library `lib/logic`, unit-tested on the PC with PlatformIO's `native` environment. Thin ESP8266 modules in `src/` wire that logic to pins, Wi-Fi and MQTT. The web page is one static file whose logic is a separate `web/logic.js` tested with `node --test`.

**Tech Stack:** PlatformIO, Arduino framework for ESP8266, PubSubClient, OneWire + DallasTemperature, WiFiManager (tzapu), Unity (native tests), MQTT.js 5.x in the browser, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-14-smarthome-design.md`

## Global Constraints

- Board: NodeMCU ESP8266MOD, env `nodemcuv2`, COM3, `upload_speed = 115200`.
- Pins: D0 IR OUT (low = detected), D1 button 1, D2 DS18B20, D4 button 2, D5/D6/D7 LED 1/2/3. Buttons use `INPUT_PULLUP`, pressed = low. D4 must be high at boot.
- Broker `hff38f13.ala.asia-southeast1.emqxsl.com`, TLS 8883 (board), WSS 8084 path `/mqtt` (page). CA in `cert/emqxsl-ca.crt` / `include/ca_cert.h`. NTP sync is required before TLS.
- Free tier only, spend limit 0. No credentials in git or in the web page source. `include/secrets.h` stays git-ignored.
- Topics (all `smarthome/...`): `status`, `temp`, `presence`, `presence_changed`, `state/led1..3`, `cmd/led1..3`, `state/away`, `cmd/away` (retained), `alert`.
- Alerts: `none | hot | intruder | temp_fault`. Priority `intruder > temp_fault > hot`. Hot at >= 35.0 C, clears below 34.0 C.
- Temp fault: -127, exactly 85.0, or NaN. Never publish `temp` for a faulty reading.
- Setup mode: open AP `SmartHome-Setup` with a password, entered automatically when saved Wi-Fi fails for about 20 s, or by holding D1 for 5 s while running; times out after a few minutes.
- Flashing: hold FLASH and pull the 3V3 sensor wire during upload (known issue). Release FLASH afterwards. From Task 4 on, updates go over Wi-Fi (OTA) once the first OTA-enabled build is flashed by USB.
- MQTT keep-alive 30 s. OTA hostname `smarthome-node`, protected by `OTA_PASS` in `include/secrets.h` (the owner picks it; 8+ characters).
- Layout A for the page; works at phone width, light and dark mode.

## Review Focus

- Sensor reports 85.0 or -127 at boot or on a power dip: no hot alert, `temp_fault` instead (Task 2).
- Garbage on a command topic (`ON`, `1`, empty, oversized payload, unknown topic `cmd/led9`): ignored, no LED change (Task 3).
- Away switched on while presence is already 1: `intruder` immediately. Switched off: clears (Task 2).
- Router down at boot or mid-run: board reaches setup mode or reconnects, never hangs, returns to normal after the setup timeout (Task 6).
- Page opened with a wrong password, or while the board is offline: shows an error or "offline", keeps no credentials, never shows stale values as live (Tasks 7, 8).

---

### Task 1: Test harness and repository

**Files:**
- Create: `lib/logic/logic.h`, `test/test_native/test_main.cpp`
- Modify: `platformio.ini`, `.gitignore`

**Interfaces:**
- Produces: env `native` (`pio test -e native`); library folder `lib/logic` with headers in namespace `logic`.

- [ ] **Step 1:** `git init`; add `CP210x_Universal_Windows_Driver.zip` and `.pio/` to `.gitignore` (keep `include/secrets.h`, `.superpowers/`).
- [ ] **Step 2:** Add `[env:native]` (`platform = native`, `test_framework = unity`) to `platformio.ini`.
- [ ] **Step 3:** Write a smoke test `test_harness_runs` asserting `logic::version() == 1` (declare `int version();` in `logic.h`, define it in `lib/logic/logic.cpp`).
- [ ] **Step 4:** Run `pio test -e native`. Expected: 1 test PASSED (MinGW gcc is installed at `C:\MinGW\bin`).
- [ ] **Step 5:** Commit all but ignored files.

### Task 2: Sensor validity and alert rules

**Files:**
- Create: `lib/logic/alerts.h`, `lib/logic/alerts.cpp`, `test/test_native/test_alerts.cpp`

**Interfaces:**
- Produces:
  - `enum class logic::Alert { None, Hot, Intruder, TempFault };`
  - `bool logic::tempValid(float c);`
  - `Alert logic::evalAlert(float tempC, bool away, bool presence, Alert prev);`
  - `const char* logic::alertName(Alert a);` returns `none|hot|intruder|temp_fault`.

- [ ] **Step 1:** Tests, as `TEST` functions with these assertions: `tempValid(-127)`, `tempValid(85.0)`, `tempValid(NAN)` are false; `tempValid(33.3)` and `tempValid(-5)` true. `evalAlert(35.0,false,false,None)==Hot`; `evalAlert(34.5,false,false,Hot)==Hot` and with prev `None` is `None` (hysteresis); `evalAlert(33.9,false,false,Hot)==None`. `evalAlert(85.0,...)` is `TempFault` and never `Hot`. `evalAlert(20,true,true,None)==Intruder`; `evalAlert(20,false,true,Intruder)==None`; `evalAlert(-127,true,true,None)==Intruder` (priority). `alertName` returns the four strings.
- [ ] **Step 2:** Run; expect FAIL (undefined).
- [ ] **Step 3:** Implement exactly the signatures above; a faulty temp never counts as hot, and a `prev` of `TempFault` is not a latched hot.
- [ ] **Step 4:** Run; expect all PASS. Commit.

### Task 3: Debounce, presence hold, long press, payload and topic parsing

**Files:**
- Create: `lib/logic/timing.h`, `lib/logic/timing.cpp`, `lib/logic/topics.h`, `lib/logic/topics.cpp`, `test/test_native/test_timing.cpp`, `test/test_native/test_topics.cpp`

**Interfaces:**
- Produces:
  - `class logic::Debouncer { explicit Debouncer(uint32_t stableMs); bool update(bool raw, uint32_t nowMs); }` returns the debounced level.
  - `class logic::PresenceHold { explicit PresenceHold(uint32_t holdMs); bool update(bool detected, uint32_t nowMs); }` stays true for `holdMs` after the last detection.
  - `class logic::LongPress { explicit LongPress(uint32_t ms); bool update(bool pressed, uint32_t nowMs); }` returns true once per press when held for `ms`, re-arms on release.
  - `bool logic::parseOnOff(const char* payload, unsigned len, bool& on);` accepts only exact lowercase `on` / `off`.
  - `int logic::ledFromCmdTopic(const char* topic);` returns 1..3 for `smarthome/cmd/led1..3`, else 0.
  - `const char* logic::ledStateTopic(int led);` returns `smarthome/state/led1..3`, else `nullptr`. Plus `constexpr` strings for the other topics in `topics.h`.

- [ ] **Step 1:** Tests: debouncer ignores a 10 ms blip at 30 ms and accepts 30 ms stable; presence hold stays true 4999 ms after the last detection and false at 5000 ms; long press fires once at 5000 ms and again only after release and a new 5 s press; `parseOnOff` true for `on`/`off`, false for `ON`, `1`, empty, `"on "`, 200-byte payloads; `ledFromCmdTopic` returns 0 for `smarthome/cmd/led9`, `smarthome/cmd/led`, `smarthome/cmd/away`, `""`; `ledStateTopic(0)` and `(4)` are null.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the signatures. Values (builder's call, spec leaves them open): button debounce 30 ms, presence hold 5000 ms.
- [ ] **Step 4:** Run; all PASS. Commit.

### Task 4: Telemetry, alerts and reconnect

**Files:**
- Create: `src/pins.h`, `src/sensors.h`, `src/sensors.cpp`, `src/net.h`, `src/net.cpp`
- Modify: `src/main.cpp`, `platformio.ini` (no new libs)

**Interfaces:**
- Consumes: `logic::evalAlert`, `tempValid`, `Debouncer`, `PresenceHold`, topic constants.
- Produces: `float sensors::readTempC();` (returns the raw library value, -127 when absent), `bool sensors::irDetected();` (D0 low), `void net::begin(); void net::loop(); bool net::publish(const char* topic, const char* payload, bool retained);` and a callback registration `void net::onMessage(void (*cb)(const char* topic, const char* payload, unsigned len));`.

- [ ] **Step 0 (owner, 10 minutes, before any code):** find out why uploads need FLASH held and the 3V3 wire pulled. Try another USB cable and a port directly on the PC, then upload with the 3V3 wire plugged in. If it still fails, add a 100-470 uF capacitor across 3V3 and GND near the board and try again. Write the finding down in the README (Task 9). If nothing helps, keep the workaround; OTA (Step 1) reduces how often it matters.
- [ ] **Step 1:** Move the tested connection code from `main.cpp` into `net.cpp` (Wi-Fi, NTP with 30 s timeout then `ESP.restart()`, TLS, last-will `status=offline`, `status=online` retained on connect). Set `mqtt.setKeepAlive(30)`. Add non-blocking reconnect with a 5 s retry, so `loop()` keeps running while offline. Enable `ArduinoOTA` (hostname `smarthome-node`, `OTA_PASS`), calling `ArduinoOTA.handle()` in `net::loop()`. Add an `[env:ota]` to `platformio.ini` extending `nodemcuv2` with `upload_protocol = espota` and `upload_port = smarthome-node.local`; if mDNS does not resolve on Windows, use the board's IP.
- [ ] **Step 2:** `main.cpp`: every 30 s publish `temp` (one decimal, retained) only if `tempValid`; publish `alert` (retained) whenever it changes; publish `presence` (`1`/`0`, retained) and `presence_changed` (epoch seconds, retained) on a debounced change.
- [ ] **Step 3:** `pio run`; expect SUCCESS. Flash (see Global Constraints).
- [ ] **Step 4:** Verify with the EMQX console *Diagnostics, Online Test* client subscribed to `smarthome/#`: `status=online`, `temp` about every 30 s, `presence` flips when you touch the IR LEDs. Unplug the DS18B20 data wire: `alert=temp_fault` within 30 s and no `temp`. Replug: `alert=none`. Pull USB: `status=offline` arrives within about a minute (keep-alive). Then flash once more with `pio run -e ota -t upload` over Wi-Fi with no cable and no FLASH button; expect SUCCESS and the board reconnecting. A wrong `OTA_PASS` must be refused.
- [ ] **Step 5:** Commit.

### Task 5: LED commands, buttons and Away

**Files:**
- Create: `src/leds.h`, `src/leds.cpp`
- Modify: `src/main.cpp`

**Interfaces:**
- Consumes: `net::onMessage`, `logic::parseOnOff`, `ledFromCmdTopic`, `ledStateTopic`, `Debouncer`.
- Produces: `void leds::set(int led, bool on);` `bool leds::get(int led);` (led 1..3).

- [ ] **Step 1:** Subscribe to `smarthome/cmd/#` after connecting. On a message: LED topics call `leds::set` only when `parseOnOff` succeeds; `cmd/away` sets Away (retained message restores it on boot). Anything else is ignored.
- [ ] **Step 2:** Every LED change, from a command or button, publishes `state/ledN` (`on`/`off`, retained). After every (re)connect publish all three states from RAM. Away changes publish `state/away` (retained).
- [ ] **Step 3:** Debounced D1 toggles LED 1 and D4 toggles LED 2 on the press edge.
- [ ] **Step 4:** Flash and verify in the Online Test client: publishing `on` to `smarthome/cmd/led3` lights LED 3 and `state/led3=on` appears; publishing `ON`, `1` and `smarthome/cmd/led9` does nothing; pressing each button toggles the right LED and publishes state; publish retained `on` to `cmd/away`, touch the IR sensor, `alert=intruder`; publish `off`, alert clears.
- [ ] **Step 5:** Commit.

### Task 6: Wi-Fi setup mode

**Files:**
- Create: `src/wifi_setup.h`, `src/wifi_setup.cpp`
- Modify: `platformio.ini` (add `tzapu/WiFiManager`), `src/net.cpp`, `src/main.cpp`

**Interfaces:**
- Consumes: `logic::LongPress`.
- Produces: `bool wifiSetup::connect();` (true when joined) and `void wifiSetup::startPortal();` (blocks in setup mode until saved or timeout).

- [ ] **Step 1:** At boot: if no saved credentials, try `WIFI_SSID`/`WIFI_PASS` from `secrets.h`; on failure within 20 s, call `startPortal()`. Add `SETUP_AP_PASS` to `secrets.h` (8+ characters; the owner chooses it).
- [ ] **Step 2:** `startPortal()` opens `SmartHome-Setup` with that password, a 3-minute timeout, then reboots normally. In `loop()`, a 5 s hold of D1 (`LongPress`) calls it.
- [ ] **Step 3:** Flash and verify: hold D1 for 5 s, the AP appears, join it with a phone, choose the network, enter its password, board reboots and reconnects. Turn the hotspot off at boot: the AP appears after about 20 s, and after the timeout the board retries normally without hanging.
- [ ] **Step 4:** Commit.

### Task 7: Web page logic

**Files:**
- Create: `web/logic.js`, `web/test/logic.test.mjs`

**Interfaces:**
- Produces (ES module):
  - `describeBanner({alert, status}) -> {level: 'ok'|'warn'|'error', text: string}`. `status==='offline'` is `error`; `hot|intruder|temp_fault` are `warn`/`error` with the texts "Room too hot", "Presence while Away is on", "Temperature sensor not responding"; `none` is `ok` with empty text.
  - `ageText(nowSec, thenSec) -> string` ("just now", "5 min ago", "3 h ago", "2 d ago"; `""` when `thenSec` is missing).
  - `onOff(payload) -> boolean|null` accepts only `on`/`off`.

- [ ] **Step 1:** `node --test` tests: offline beats any alert; each alert's level and text; `ageText(1000,1000)` is `just now`, `(1300,1000)` is `5 min ago`, `(1000,undefined)` is `""`, a `thenSec` in the future is `just now`; `onOff('on')` true, `'off'` false, `'ON'`/`''` null.
- [ ] **Step 2:** Run `node --test web`; expect FAIL.
- [ ] **Step 3:** Implement the three functions.
- [ ] **Step 4:** Run; all PASS. Commit.

### Task 8: Web page

**Files:**
- Create: `web/index.html`

**Interfaces:**
- Consumes: `web/logic.js` (inline module import).

- [ ] **Step 1:** Single page, layout A: login form (username, password, Connect) shown first; then header with online/offline dot, banner from `describeBanner`, temperature tile, presence tile with "last change: ..." from `presence_changed`, three light switches, an Away switch. Connects with MQTT.js (pin an exact 5.x version from jsDelivr, at least two weeks old) to `wss://hff38f13.ala.asia-southeast1.emqxsl.com:8084/mqtt`, subscribes to `smarthome/#`. Switches publish `cmd/ledN` (not retained); Away publishes `cmd/away` retained.
- [ ] **Step 2:** Credentials live only in memory. A wrong password shows "Login failed" and stays on the form. While `status` is `offline` or unknown, tiles show "--" and switches are disabled.
- [ ] **Step 3:** Verify in a phone browser (open the file or a local server): log in as `solo` to test, see live values, toggle an LED, press a board button and watch the switch follow; log in with a wrong password.
- [ ] **Step 4:** Commit.

### Task 9: Accounts, hardening and publishing

**Files:**
- Create: `README.md` (flashing, setup mode, accounts, hosting)
- Modify: `include/secrets.h` (owner edits the board password; not committed)

- [ ] **Step 1 (owner, EMQX console):** create two person logins; create a new strong password for the board's login and reflash with it; delete the old weak one. Optional: under *Access Control, Authorization*, let person logins subscribe to `smarthome/#` and publish only to `smarthome/cmd/#`.
- [ ] **Step 2 (owner):** publish `web/` on GitHub Pages (Settings, Pages, deploy from branch). Open the address on a phone using mobile data and log in.
- [ ] **Step 3:** Write the README (under 60 lines): how to flash by USB and by OTA (and the Step 0 finding from Task 4), how to enter setup mode, how to add an account, how to publish the page.
- [ ] **Step 4:** Final check from mobile data: all warnings and switches work; stop the board and see "offline". Commit.

## Phase 2 (not in this plan)

Push notifications: an EMQX rule on `smarthome/alert` that sends an HTTP request to a free push service such as ntfy.sh, so warnings reach the phone while the page is closed. It needs no firmware change. Other deferred items: web settings panel, humidity sensor, history chart. Battery operation / sleep modes (owner is only thinking about it): the board stays always awake on USB power. Deep sleep would break remote commands and presence, and needs D0 wired to RST, which the IR sensor already uses; modem or light sleep is a one-line change if wanted.
