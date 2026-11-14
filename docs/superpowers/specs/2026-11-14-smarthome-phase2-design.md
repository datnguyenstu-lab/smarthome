# Smart Home Phase 2: self-test, settings, status light, new web UI, reconnect guide

Builds on `2026-11-14-smarthome-design.md` (Phase 1, built and working: board, EMQX broker, web page on GitHub Pages).

## Intent

Phase 1 works but is a demo: when something goes wrong you need a serial cable, thresholds are fixed in code, the page is plain, and a board that has lost its Wi-Fi is a dead end. Phase 2 makes it something two people can live with: the system **tells you what is wrong and how to fix it**, you can **change settings from the page**, and the page looks like a product.

## Goals

1. **Self-test and issue detection.** The board checks itself, reports health, and the page and LEDs say what is wrong in plain words.
2. **Settings from the web page**, kept on the board across reboots, safe against bad values.
3. **Reconnect guide** on the page for a board that is offline or on a new Wi-Fi, ending when the board is seen again.
4. **Status light patterns** on the yellow LED.
5. **Web UI redesign**, mobile first, dark mode. Mockups are shown and approved before it is built.

## Non-goals / anti-goals

- Not in this phase: push notifications, humidity sensor, battery or sleep, several boards, user roles beyond "logged in".
- The page cannot change Wi-Fi on a board that is offline. It can only guide the person, or restart an online board into setup mode.
- No silent failure: every fault the board can detect must reach the page.
- Not in this phase: compressing logs on the board, a live log stream, log search or filters on the page.
- No secret in the web files. A bad or malicious setting value must never brick the board.

## Decided by the owner

- Both accounts may change settings and use "Restart into setup mode".
- All of the five goals are in scope.

## Design

### Self-test and health

- Board publishes `smarthome/health` (retained, JSON, every 60 s and on change): `rssi`, `heap`, `uptime_s`, `reset_reason`, `wifi_reconnects`, `mqtt_reconnects`, `fw` version, `issues` (list of codes).
- Issue codes and rules (my calls, tunable in code constants):
  - `temp_fault`: reading is -127 or 85 or out of -40..125 (already exists as an alert).
  - `ir_stuck`: presence held continuously for 30 min while Away is off.
  - `wifi_weak`: RSSI below -80 dBm.
  - `wifi_unstable`: more than 3 Wi-Fi or MQTT reconnects in 10 min.
  - `low_memory`: free heap below 10 kB.
  - `crash_reboot`: last reset reason was an exception or watchdog (cleared after one clean hour).
- `smarthome/cmd/selftest` (not retained) runs the self-test now: reads the sensors, shows the self-test pattern on the yellow LED (see below), then publishes `smarthome/selftest` (retained JSON: per-check pass or fail with a short cause). A short self-test also runs at boot.
- The page shows a Health card (signal, memory, uptime, last restart reason) and plain-language issue messages with a suggested fix for each.

### Settings

- Settings (defaults and clamps): `hot_on_c` 35 (20 to 60, hysteresis stays 1 degree), `presence_hold_s` 5 (1 to 60), `status_led` on (on or off).
- The page publishes `smarthome/cmd/settings` (retained JSON). The board validates and clamps every field, applies it, saves it to its own flash, and echoes the accepted values on `smarthome/settings` (retained). The page shows the echoed values, not what it sent, and shows "applied" only after the echo.
- A retained command means a setting changed while the board was offline is applied when it returns.
- "Reset to defaults" button.
- The MQTT receive buffer must grow (it is 64 bytes today) to fit the settings JSON; oversize payloads are still dropped.

### Status light (yellow LED = led 1)

The yellow LED (leftmost, led 1, pin D7) is **the status LED only**: the owner decided it is not a light to control. It is dark when all is well and shows a pattern while something needs attention, highest priority first (timings tunable). The lights are led 2 (middle, button D1) and led 3 (right, button D4); `cmd/led1` is ignored and `state/led1` is no longer published.

| State | Pattern |
|---|---|
| Setup mode | fast blink |
| No Wi-Fi | double blink every 2 s |
| Cloud not reachable | slow blink |
| Sensor or health issue | triple blink every 3 s |
| OK | dark |

Setting `status_led` off keeps the yellow LED dark except for setup mode and self-test.

### Self-test pattern (added at the owner's request)

The yellow LED shows a distinct **self-test pattern** (long on, short pause, short on, short pause: 800 ms period) while a self-test runs, both at **board start-up** (a short test right after boot, about 2 s) and when started **remotely** (`cmd/selftest`, about 3 s). The result is then shown by the normal patterns: issues found give the triple blink, none gives Light 3 again. The self-test no longer blinks all three LEDs. The pattern has priority just below setup mode.

### Event log kept on the board (added at the owner's request)

- **What is logged:** one text line per event: boot (reset reason, firmware), Wi-Fi and MQTT lost and regained, issue raised or cleared, settings changed (accepted values), self-test result, setup mode entered and left, OTA start and end. Format: `<epoch seconds, or +uptime before the clock is set> <code> <detail>`, about 60 to 100 bytes a line.
- **Where:** rotating files in the board's flash (`/log_<n>.txt`, plain text). The newest 3 files are kept; when the current file reaches the size limit (default **64 KB**, a constant) the next file is started and the oldest is deleted. At 64 KB x 3 that is roughly 650 lines per file, weeks of history at normal event rates. Writes are batched (flushed at most every 5 s, immediately for boot and crash events) to limit flash wear.
- **No compression on the board** (my call, see below). The web page compresses when it downloads.
- **Pulling it from the website:** the page publishes `smarthome/cmd/log` (`{"list":1}` or `{"get":<n>,"offset":<bytes>}`, not retained). The board answers on `smarthome/log/index` (files and sizes) and streams the requested file as numbered chunks of at most 384 bytes on `smarthome/log/data`, with a short pause between chunks; the page re-requests from the first missing offset if a chunk is lost. Both logins may pull logs. A **Download log** button on the Health view collects the files, shows progress, and saves one `.txt` (gzip-compressed with the browser's built-in compression when available).
- **Safe by construction:** a log that cannot be written never blocks the sensors, buttons or MQTT; a half-written last line after a power cut is dropped when reading; the log can never fill the flash (the settings file keeps its space); unknown or oversize requests are ignored.

### Reconnect guide (web)

Shown when status is `offline`, or when no `health` message arrived for 3 minutes while status says online (a hung board). Steps: powered? last seen time; same Wi-Fi? hold D1 for 5 s until the fast blink; join `SmartHome-Setup` and choose the new network; the page watches for the board and shows "Connected". A board that is online also gets a **Restart into setup mode** button (`smarthome/cmd/setup`, not retained) with a confirmation.

### Web UI

New look, mobile first, light and dark themes: status header, temperature and presence cards, lights and Away, Health card, issue messages, a Settings view, the guide as a step-by-step screen. Still a static page, MQTT.js, no build step. Pure logic stays in `web/logic.js` with node tests. Mockups first, shown in the visual companion.

### Access rules (EMQX Authorization)

- `board`: publish `smarthome/#` except `smarthome/cmd/#`; subscribe `smarthome/cmd/#`.
- Person accounts: subscribe `smarthome/#`; publish only `smarthome/cmd/#`.
- The weak `solo` login is deleted after the board moves to `board`.

## Constraints

- ESP8266 (RAM 38.7 percent, flash 48.1 percent used today); OTA updates stay working; keep-alive 30 s stays.
- Logic that can be tested on the PC goes in `lib/logic/` with native Unity tests first (health rules, settings clamp, LED pattern picker). Hardware steps are verified with the board and the cloud watch script.
- Existing topics and behaviour (`temp`, `presence`, `alert`, `state/*`, `cmd/*`) do not change.

## Left to the builder

Exact LED timings, JSON field order, settings storage format (LittleFS file or EEPROM), page layout details after the mockups are approved, and the wording of the issue messages.

## Calls I made (change any of these)

1. The yellow LED is the status LED only (owner decision after the first hardware test); lights are middle and right.
2. The six issue rules and their thresholds above.
3. Three settings only (hot threshold, presence hold, status LED switch).
4. Settings and "restart into setup" are open to both logins; the board validates every value.
5. A hung board is detected by a missing `health` heartbeat, not by status alone.
6. Mockups before the UI build.
7. Log files are plain text, 64 KB each, newest 3 kept, and not compressed on the board. Reasons: the board has about 15 KB of free memory while connected (too little to compress safely), text events are tiny so flash is not the limit, and the phone compresses for free at download. The owner suggested 200 KB x 3 with zip: 3 x 200 KB would fit the 1 MB file system but leaves little room; the constant can be raised.
8. Logs travel over MQTT in chunks because the board is only reachable through the cloud broker; a direct web server on the board would only work at home.
9. The self-test no longer blinks all three LEDs; only the yellow LED shows the pattern.
