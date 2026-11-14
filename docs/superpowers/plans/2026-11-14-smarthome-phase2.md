# Smart Home Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline, native execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-test and health reporting, settings kept on the board and edited from the web page, a status-light pattern on the yellow LED, a redesigned web UI, and a reconnect guide.

**Architecture:** Pure logic (settings clamp and parse, health rules, LED pattern picker) lives in `lib/logic/` and is tested natively first. `src/` wires it to the board (flash storage, MQTT topics, LEDs). `web/logic.js` holds the page's pure logic (node tests); the page is a static file set on GitHub Pages.

**Tech Stack:** PlatformIO (espressif8266, Arduino, PubSubClient, WiFiManager, LittleFS), Unity native tests, MQTT.js 5.3.4, plain HTML/CSS/JS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-smarthome-phase2-design.md` (Phase 1 spec: `2026-11-14-smarthome-design.md`)

**Execution order:** 1 to 8, then 12 (self-test pattern), then 9 (web UI), then 11 (event log, firmware and download button), then 10 (accounts and release). Tasks 11 and 12 were added at the owner's request after the first plan.

## Global Constraints

- Event log: plain text lines, rotating files `/log_<n>.txt`, `LOG_MAX_BYTES` 65536 per file (a constant, a test build may lower it), newest 3 files kept, never compressed on the board; log chunks at most 384 bytes of data per MQTT message; topics `smarthome/cmd/log` (not retained), `smarthome/log/index` and `smarthome/log/data` (not retained).
- Self-test pattern on the yellow LED: 800 ms period, on 0-500, off 500-600, on 600-700, off 700-800; shown for about 2 s at boot and about 3 s on `cmd/selftest`; shows even when `status_led` is off.

- Existing topics and behaviour do not change: `temp`, `presence`, `presence_changed`, `alert`, `status`, `state/led1..3`, `state/away`, `cmd/led1..3`, `cmd/away`.
- Pins (do not change): IR D0, BTN1 D1 (toggles Light 2), DS18B20 D2, BTN2 D4 (toggles Light 3), LEDs `{D7, D6, D5}` = led1 yellow (status LED only, not controllable), led2 middle (button D1), led3 right (button D4).
- MQTT keep-alive 30 s; TLS to `hff38f13.ala.asia-southeast1.emqxsl.com:8883`; OTA hostname `smarthome-node` stays working.
- Settings defaults and clamps: `hot_on_c` 35 (20..60), `presence_hold_s` 5 (1..60), `status_led` true. Hot hysteresis is 1.0 degree (off = on - 1).
- Issue thresholds: IR stuck 30 min with Away off; RSSI below -80 dBm; more than 3 reconnects in 10 min; free heap below 10000 bytes.
- Health topic `smarthome/health` is retained, JSON, republished every 60 s. Settings echo `smarthome/settings` is retained. `cmd/settings` is retained; `cmd/selftest` and `cmd/setup` are not.
- No secret in `web/`. `include/secrets.h` stays git-ignored. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- PC tests: `pio test -e native` (MinGW `C:\MinGW\bin` on PATH) and `node --test "web/test/*.test.mjs"`. pio path: `C:\Users\Admin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\Scripts\pio.exe`.

## Review Focus

1. Garbled, oversize, wrong-type, missing-field or out-of-range settings JSON must never crash, brick or persist junk: expected, the board clamps or ignores and echoes what it really holds.
2. A retained `cmd/settings` is applied once per delivery and saved to flash only when a value actually changed (flash wear, no write loop from the echo).
3. When a status pattern ends the yellow status LED goes dark, and commands for led 1 are ignored.
4. A retained `health` message from hours ago must not make the page think the board is alive: staleness uses the message's own `ts`.
5. Counters and windows survive the `millis()` wrap (about 49 days) without false issues.
6. The event log can never fill the flash (settings keep their space), a half-written last line after a power cut is not served, a failed log write never stalls sensors, buttons or MQTT, and flapping Wi-Fi cannot write the flash on every event (batched flushes).
7. Log download survives a lost or duplicated chunk, a second `get` while one is streaming, and an unknown file number, without hanging the board or the page.

---

### Task 1: Settings logic

**Files:**
- Create: `lib/logic/settings.h`, `lib/logic/settings.cpp`, `test/test_native/test_settings.cpp`
- Modify: `lib/logic/alerts.h`, `lib/logic/alerts.cpp` (hot threshold parameter), `lib/logic/timing.h`, `lib/logic/timing.cpp` (settable hold), `lib/logic/topics.h` (new constants), `test/test_native/test_main.cpp`

**Interfaces:**
- Produces:
  - `struct logic::Settings { float hotOnC = 35.0f; uint32_t presenceHoldS = 5; bool statusLed = true; };`
  - `Settings logic::clampSettings(Settings s)` (NaN or out of range goes to the nearest clamp; NaN goes to the default).
  - `bool logic::parseSettings(const char* json, unsigned len, Settings& inOut)`: flat JSON with keys `hot_on_c`, `presence_hold_s`, `status_led`; missing or wrong-type keys leave `inOut` unchanged for that field; result is clamped; returns false when `json` is not an object or has no recognised key (and leaves `inOut` untouched).
  - `size_t logic::formatSettings(const Settings& s, char* buf, size_t cap)` writes `{"hot_on_c":35.0,"presence_hold_s":5,"status_led":true}`, returns length, or 0 when it does not fit.
  - `Alert logic::evalAlert(float tempC, bool away, bool presence, Alert prev, float hotOnC = HOT_ON_C)` (off threshold is `hotOnC - 1.0f`).
  - `void logic::PresenceHold::setHoldMs(uint32_t)`.
  - Topic constants: `T_HEALTH "smarthome/health"`, `T_SELFTEST "smarthome/selftest"`, `T_SETTINGS "smarthome/settings"`, `T_CMD_SETTINGS "smarthome/cmd/settings"`, `T_CMD_SELFTEST "smarthome/cmd/selftest"`, `T_CMD_SETUP "smarthome/cmd/setup"`.

- [ ] **Step 1: Write failing tests** in `test_settings.cpp` (`run_settings_tests()` registered in `test_main.cpp`), one test per line:
  - `defaults_are_35_5_true`
  - `clamp_hot_low_to_20`, `clamp_hot_high_to_60`, `clamp_nan_hot_to_default`
  - `clamp_hold_zero_to_1`, `clamp_hold_high_to_60`
  - `parse_full_object_sets_all_three`
  - `parse_missing_keys_keep_current`
  - `parse_wrong_type_ignored` (`{"hot_on_c":"hot"}` leaves 35)
  - `parse_out_of_range_is_clamped` (`{"hot_on_c":500}` gives 60)
  - `parse_garbage_returns_false_and_leaves_untouched` (`""`, `"nope"`, `"[1]"`, `"{}"`, unterminated `{"hot_on_c":`)
  - `parse_tolerates_whitespace`
  - `format_roundtrips_through_parse`
  - `format_returns_zero_when_buffer_too_small`
  - In `test_alerts.cpp`: `hot_threshold_parameter_moves_on_and_off_points` (on at 40 with `hotOnC` 40, stays on at 39.5, off below 39).
  - In `test_timing.cpp`: `presence_hold_set_hold_changes_expiry`.

- [ ] **Step 2: Run** `pio test -e native`. Expected: build fails or the new tests FAIL (functions missing).

- [ ] **Step 3: Implement** the signatures above. Hand-written flat parser (no JSON library); find `"key"` then `:` then number or `true`/`false`.

- [ ] **Step 4: Run** `pio test -e native`. Expected: all tests PASS (17 existing plus the new ones).

- [ ] **Step 5: Commit** `feat: settings logic with clamp, parse and format`.

### Task 2: Health logic

**Files:**
- Create: `lib/logic/health.h`, `lib/logic/health.cpp`, `test/test_native/test_health.cpp`
- Modify: `test/test_native/test_main.cpp`

**Interfaces:**
- Produces:
  - `enum Issue : uint8_t { ISSUE_TEMP_FAULT=1, ISSUE_IR_STUCK=2, ISSUE_WIFI_WEAK=4, ISSUE_WIFI_UNSTABLE=8, ISSUE_LOW_MEMORY=16, ISSUE_CRASH_REBOOT=32 };`
  - `struct HealthInputs { bool tempOk; bool away; uint32_t presenceHeldMs; int rssi; uint32_t heap; int reconnectsIn10Min; bool crashRecent; };`
  - `uint8_t evalIssues(const HealthInputs&)`; `const char* issueName(uint8_t bit)` returns `temp_fault`, `ir_stuck`, `wifi_weak`, `wifi_unstable`, `low_memory`, `crash_reboot`, else `nullptr`.
  - `class EventWindow { explicit EventWindow(uint32_t windowMs); void add(uint32_t nowMs); int count(uint32_t nowMs) const; }` keeps the last 8 events, wrap-safe (uses `now - t`).
  - `struct HealthReport { uint32_t ts; int rssi; uint32_t heap; uint32_t uptimeS; const char* reset; int wifiRc; int mqttRc; const char* fw; uint8_t issues; };`
  - `size_t formatHealth(const HealthReport&, char* buf, size_t cap)` writes `{"ts":1,"rssi":-60,"heap":30000,"uptime_s":5,"reset":"power","wifi_rc":0,"mqtt_rc":1,"fw":"2.0.0","issues":["temp_fault","wifi_weak"]}`; returns 0 when it does not fit.

- [ ] **Step 1: Write failing tests** (`run_health_tests()`):
  - `no_issues_when_all_good`
  - `temp_fault_when_temp_not_ok`
  - `ir_stuck_after_30_min_with_away_off`, `ir_not_stuck_just_under_30_min`, `ir_not_stuck_when_away_on`
  - `wifi_weak_below_minus_80`, `wifi_not_weak_at_minus_80`
  - `wifi_unstable_above_3_reconnects`, `wifi_not_unstable_at_3`
  - `low_memory_below_10000`, `memory_ok_at_10000`
  - `crash_reboot_when_crash_recent`
  - `issues_combine_as_bits`
  - `window_counts_events_inside_window_only`
  - `window_survives_millis_wrap` (events at 4294960000, now 100 count correctly)
  - `window_keeps_only_last_eight`
  - `format_health_exact_string` (the sample above) and `format_health_empty_issues_is_empty_array`, `format_health_returns_zero_when_too_small`.

- [ ] **Step 2: Run** `pio test -e native`. Expected: FAIL (missing symbols).
- [ ] **Step 3: Implement** the signatures above.
- [ ] **Step 4: Run** `pio test -e native`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: health rules, event window and health JSON`.

### Task 3: Status light pattern logic

**Files:**
- Create: `lib/logic/statusled.h`, `lib/logic/statusled.cpp`, `test/test_native/test_statusled.cpp`
- Modify: `test/test_native/test_main.cpp`

**Interfaces:**
- Produces:
  - `enum class Pattern { None, SetupFast, NoWifi, CloudDown, Issue };`
  - `Pattern pickPattern(bool setupMode, bool wifiUp, bool mqttUp, uint8_t issues, bool statusLedEnabled)`: priority SetupFast > NoWifi > CloudDown > Issue; setup mode always shows; with `statusLedEnabled` false everything but SetupFast is `None`.
  - `bool patternLevel(Pattern p, uint32_t nowMs)` (true = LED on; `None` returns false and callers ignore it). Timings (period): SetupFast 300 ms (150 on, 150 off); NoWifi 2000 ms (on 0-100, off 100-250, on 250-350, off rest); CloudDown 2000 ms (1000 on, 1000 off); Issue 3000 ms (on 0-100, 250-350, 500-600, off rest).

- [ ] **Step 1: Write failing tests** (`run_statusled_tests()`):
  - `setup_beats_everything`, `no_wifi_beats_cloud_down`, `cloud_down_beats_issue`, `issue_when_only_issues`, `none_when_all_ok`
  - `disabled_hides_all_but_setup`
  - `setup_fast_on_at_0_off_at_150`
  - `no_wifi_double_blink_levels` (on at 50, off at 200, on at 300, off at 1000)
  - `cloud_down_slow_blink_levels` (on at 500, off at 1500)
  - `issue_triple_blink_levels` (on at 50, 300, 550; off at 150, 400, 1000)
  - `pattern_level_wraps_with_millis` (the same level at `t` and `t + 4294967296 % period` is not required; test that `nowMs` 4294967295 gives a defined value and no crash).

- [ ] **Step 2: Run** `pio test -e native`. Expected: FAIL.
- [ ] **Step 3: Implement** with `nowMs % period`.
- [ ] **Step 4: Run** `pio test -e native`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: status light pattern picker`.

### Task 4: Firmware settings, setup command and watch tool

**Files:**
- Create: `src/settings_store.h`, `src/settings_store.cpp`, `tools/watch.py`
- Modify: `src/net.cpp` (MQTT buffer 512, relay buffer 256), `src/main.cpp`, `src/wifi_setup.cpp` (nothing yet), `platformio.ini` (`board_build.filesystem = littlefs`)
- Move: copy the scratchpad `watch.py` (reads `include/secrets.h`, subscribes `smarthome/#`, prints non-retained and retained messages, publishes `topic=payload` args, accepts a seconds argument) into `tools/watch.py`.

**Interfaces:**
- Consumes: Task 1 (`Settings`, `parseSettings`, `formatSettings`, `evalAlert(..., hotOnC)`, `PresenceHold::setHoldMs`, topic constants).
- Produces: `namespace settingsStore { logic::Settings load(); bool save(const logic::Settings&); }` (LittleFS file `/settings.json`; `load()` returns defaults on a missing or corrupt file).

- [ ] **Step 1: Write the owner-visible check first** (hardware TDD): `tools/watch.py 20 'smarthome/cmd/settings={"hot_on_c":40,"presence_hold_s":10,"status_led":true}'` must today print no `smarthome/settings` echo. Run it and record that it does not. Expected: no echo.
- [ ] **Step 2: Implement.** On boot: `settingsStore::load()`, apply (`presenceHold.setHoldMs`, hot threshold into `evalAlert`). In `onConnected`: publish the current settings to `T_SETTINGS` (retained). On `cmd/settings`: `parseSettings` onto a copy of the current settings; apply; if changed from the previous values, `save()` once; always publish the echo; ignore (no save, no change) when parse returns false. On `cmd/setup`: call `wifiSetup::startPortal()`. Raise the PubSubClient buffer to 512 and the relay buffer to 256; payloads at or above the relay buffer size are still dropped.
- [ ] **Step 3: Compile** `pio run -e nodemcuv2`. Expected: SUCCESS, RAM and flash printed (both under 70 percent).
- [ ] **Step 4: Flash and verify on the board** (owner holds FLASH only if the upload fails). Then:
  - the same `watch.py` command prints `smarthome/settings = {"hot_on_c":40.0,"presence_hold_s":10,"status_led":true}`;
  - reboot the board (RST): the echo shows the same saved values (survived reboot);
  - send `{"hot_on_c":500}`: echo shows `hot_on_c` 60.0; send `garbage`: no change and no new write;
  - send `smarthome/cmd/setup=1`: the board opens `SmartHome-Setup` (owner joins with `smart1234`, then power-cycles or lets it time out after 180 s).
- [ ] **Step 5: Commit** `feat: settings stored on the board, setup command, watch tool`.

### Task 5: Firmware health and self-test

**Files:**
- Create: `src/health_monitor.h`, `src/health_monitor.cpp`
- Modify: `src/main.cpp`, `src/net.cpp` (count Wi-Fi and MQTT reconnects via `EventWindow` and counters), `src/leds.h`, `src/leds.cpp`

**Interfaces:**
- Consumes: Task 2 (all), Task 4 (`net`, `settings`).
- Produces: `namespace healthMonitor { void begin(); void tick(uint32_t nowMs); void publishNow(); void runSelfTest(); }`; `leds::drive(int led, bool level)` (physical output only, does not change `get()` state; used by Task 6).

- [ ] **Step 1: Watch it missing:** `tools/watch.py 15`. Expected: no `smarthome/health` topic.
- [ ] **Step 2: Implement.** Every 60 s and on any change of the issues bitmask publish `smarthome/health` (retained) built with `formatHealth` (`ts` from `time(nullptr)`, `reset` from `ESP.getResetInfoPtr()->reason` mapped to `power`, `watchdog`, `exception`, `soft`, `external`, `deep_sleep`; `fw` constant `"2.0.0"`). Track IR held-presence time from `presenceHold`, the Wi-Fi/MQTT reconnect windows, and `crashRecent` (reset reason watchdog or exception, cleared after one clean hour). On `cmd/selftest`: read the temperature sensor, check `tempValid`, blink the three LEDs one after another with `leds::drive`, restore each LED to `leds::get`, and publish `smarthome/selftest` (retained) as `{"ts":..,"checks":[{"name":"temp","ok":true},{"name":"ir","ok":true},{"name":"leds","ok":true},{"name":"wifi","ok":true},{"name":"cloud","ok":true}]}` (`ir` is ok when the pin reads a stable level; a stuck-on IR fails). Run the short self-test once at boot, publishing after the first MQTT connect. Expose the issues bitmask to `alert` logic unchanged.
- [ ] **Step 3: Compile** `pio run -e nodemcuv2`. Expected: SUCCESS.
- [ ] **Step 4: Flash and verify:** `watch.py 70` shows a `health` message with plausible `rssi`, `heap` above 10000 and `issues: []`. Pull the DS18B20 data wire: within 60 s `health` shows `["temp_fault"]`. Replug it: `[]` again. `watch.py 15 smarthome/cmd/selftest=1` prints a `selftest` JSON and the owner sees the three LEDs blink in turn and return to their previous states.
- [ ] **Step 5: Commit** `feat: health reporting and self-test`.

### Task 6: Firmware status light

**Files:**
- Modify: `src/main.cpp`, `src/wifi_setup.cpp`, `src/wifi_setup.h`

**Interfaces:**
- Consumes: Task 3 (`pickPattern`, `patternLevel`), Task 5 (`leds::drive`, issues bitmask), Task 4 (`statusLed` setting).

- [ ] **Step 1: Define done:** with Wi-Fi off the yellow LED shows a double blink; today it does nothing. Owner confirms current behaviour (no pattern).
- [ ] **Step 2: Implement.** Each loop: `Pattern p = pickPattern(setupMode, WiFi connected, MQTT connected, issues, settings.statusLed)`. If `p != None` write `patternLevel(p, now)` to the yellow LED with `leds::drive(1, ...)` (the yellow LED is led 1); when the pattern returns to `None`, drive it dark. Make the setup portal non-blocking (`setConfigPortalBlocking(false)` plus a `process()` loop that keeps running the LED tick; the 180 s timeout and reboot stay), so the fast blink shows while the portal is open.
- [ ] **Step 3: Compile.** Expected: SUCCESS.
- [ ] **Step 4: Flash and verify (owner watches):** normal state: yellow dark; turn the phone hotspot or router off: double blink; back on: cloud-down slow blink while MQTT reconnects, then dark; pull the DS18B20 wire: triple blink; hold D1 for 5 s: fast blink while `SmartHome-Setup` is open; `status_led:false` setting hides all but the fast blink; after any pattern ends the yellow LED is dark, and `cmd/led1` does nothing.
- [ ] **Step 5: Commit** `feat: yellow LED status patterns`.

### Task 7: Web logic

**Files:**
- Modify: `web/logic.js`, `web/test/logic.test.mjs`

**Interfaces:**
- Produces (all pure):
  - `describeIssues(codes: string[]) -> {code, level, text, fix}[]` for the six codes; unknown codes become a generic warning.
  - `isStale(nowSec, healthTs, status) -> boolean`: true when `status !== 'online'`, or `healthTs` missing, or `nowSec - healthTs > 180`.
  - `guideState({status, healthTs, nowSec, lastSeenSec}) -> 'ok' | 'offline' | 'hung'`.
  - `validateSettings({hot_on_c, presence_hold_s, status_led}) -> {ok, errors, value}` with the spec's ranges; strings of digits are accepted as numbers.
  - `settingsMessage(value) -> string` (JSON for `cmd/settings`).
  - `lastSeenText(nowSec, thenSec)` reusing `ageText`.

- [ ] **Step 1: Write failing tests**, one per line, in `logic.test.mjs`: `describeIssues maps each known code with a fix`, `describeIssues unknown code is a warning`, `isStale offline`, `isStale fresh health`, `isStale health older than 180 s`, `isStale missing ts`, `guideState hung when online but silent`, `guideState ok`, `guideState offline`, `validateSettings accepts defaults`, `validateSettings rejects hot 10 and 70`, `validateSettings rejects hold 0 and 61`, `validateSettings accepts numeric strings`, `validateSettings rejects NaN`, `settingsMessage is valid JSON with the three keys`.
- [ ] **Step 2: Run** `node --test "web/test/*.test.mjs"`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the signatures above in `web/logic.js`.
- [ ] **Step 4: Run** `node --test "web/test/*.test.mjs"`. Expected: all PASS (7 existing plus new).
- [ ] **Step 5: Commit** `feat(web): issue, staleness and settings logic`.

### Task 8: UI mockups and design approval

**Files:**
- Create: mockups in `.superpowers/brainstorm/` (git-ignored), then the owner's chosen direction recorded in the ledger.

- [ ] **Step 1:** Invoke `frontend-design:frontend-design`. Using the visual companion (restart only if it is stopped), show 3 distinct mockups of the same screens: main dashboard (header with status, temperature and presence cards, three lights and Away, Health card with issue messages), Settings view, and the reconnect guide. Each mockup shows both light and dark themes. Mobile width first.
- [ ] **Step 2:** The owner picks one (or says what to change); iterate until approved. Expected: an explicit "approved" from the owner. Record the chosen direction (palette, type, layout names) as a ledger line `Task 8: owner approved mockup <name>`.

### Task 9: Web UI build

**Files:**
- Modify: `web/index.html`; Create: `web/app.css`, `web/app.js` (split from the inline script; `logic.js` keeps the pure parts)

**Interfaces:**
- Consumes: Task 7 (all), Task 8 (approved design), firmware topics from Tasks 4 to 6 (`health`, `selftest`, `settings`, `cmd/settings`, `cmd/selftest`, `cmd/setup`).

- [ ] **Step 1: Write the failing check:** add to `web/test/logic.test.mjs` any pure helper the new page needs that is not yet covered (for example `formatUptime(seconds)` with tests `formatUptime shows minutes, hours, days`); run `node --test "web/test/*.test.mjs"`. Expected: FAIL, then PASS after implementing.
- [ ] **Step 2: Implement the page** per the approved mockup: login; dashboard; Health card from `smarthome/health` (rssi as a plain-language signal quality, heap, uptime, last restart, issue list from `describeIssues`) with a **Run self-test** button publishing `smarthome/cmd/selftest` and showing the `selftest` result; Settings view (inputs validated with `validateSettings`, publish `smarthome/cmd/settings` with `retain: true`, shows "Applied" only when the echoed `smarthome/settings` equals the sent values, **Reset to defaults** button); reconnect guide screen shown when `guideState` is not `ok`, five steps from the spec, auto-dismiss with "Connected" when the board returns; **Restart into setup mode** button (confirm dialog, publishes `smarthome/cmd/setup`) only when online. Credentials stay in memory only; no secrets in the files; works at 360 px width; keyboard focus visible; dark mode from the system setting.
- [ ] **Step 3: Verify without the owner:** `node --test "web/test/*.test.mjs"` PASS; headless browser load of `http://localhost:8080` shows login first, a wrong password shows "Login failed", no console errors, no `localStorage` use.
- [ ] **Step 4: Verify with the board (owner at phone, over mobile data after publishing, or localhost before):** values update live; run self-test button works; change `hot_on_c` on the page and see the echo and "Applied"; turn off the board's Wi-Fi source and see the guide; restart-into-setup button opens `SmartHome-Setup`.
- [ ] **Step 5: Commit** `feat(web): redesigned UI with health, settings and reconnect guide`.

### Task 10: Accounts, board login, publish, README

**Files:**
- Modify: `include/secrets.h` (already holds `board` and its new password; git-ignored), create `README.md`

- [ ] **Step 1 (owner):** in the EMQX console create the user `board` (password from `secrets.h`) and the two person logins; add the Authorization rules from the spec (board publishes `smarthome/#` except `smarthome/cmd/#`, subscribes `smarthome/cmd/#`; people subscribe `smarthome/#`, publish only `smarthome/cmd/#`). Expected: the owner confirms the users exist.
- [ ] **Step 2:** flash the board (`pio run -e nodemcuv2 -t upload --upload-port COM3`); `tools/watch.py` must connect with a person login and show `status = online`. Owner deletes the old `solo` user; afterwards a login with `solo`/`1` must fail on the page and in `watch.py`.
- [ ] **Step 3:** negative check: with a person login, publishing to `smarthome/temp` (via `tools/watch.py` with the person credentials) must be refused or have no effect.
- [ ] **Step 4:** OTA check: `PLATFORMIO_UPLOAD_FLAGS="--auth=<OTA_PASS>" pio run -e ota -t upload` succeeds with the board on Wi-Fi; a wrong password is refused.
- [ ] **Step 5:** write `README.md`: what it is, wiring table, flashing by USB (Step 0 findings: hold FLASH only if the upload times out), OTA, setup mode, accounts and ACLs, settings, health and issues, hosting on GitHub Pages (`git subtree push --prefix web origin gh-pages`). Then, **after the owner says yes (this publishes)**, push `main` and update `gh-pages`.
- [ ] **Step 6: Commit** `docs: README and release of Phase 2`.

### Task 11: Event log on the board and download from the page

**Files:**
- Create: `lib/logic/logfmt.h`, `lib/logic/logfmt.cpp`, `test/test_native/test_logfmt.cpp`, `src/event_log.h`, `src/event_log.cpp`, `web/logsync.js`, `web/test/logsync.test.mjs`, `tools/pull_log.py`
- Modify: `lib/logic/topics.h`, `test/test_native/test_main.cpp`, `src/main.cpp`, `src/net.cpp`, `src/health_monitor.cpp`, `src/wifi_setup.cpp`, `web/app.js` and `web/index.html` (Download log button on the Health view, after Task 9)

**Interfaces:**
- Produces (`lib/logic/logfmt.h`, namespace `logic`):
  - `size_t formatLogLine(char* buf, size_t cap, uint32_t epoch, uint32_t uptimeS, const char* code, const char* detail)`: `"<epoch> <code> <detail>\n"` when `epoch >= 1700000000`, else `"+<uptimeS> <code> <detail>\n"`; `\r` and `\n` inside `detail` become spaces; `detail` is cut to fit; an empty detail gives `"<ts> <code>\n"`; returns 0 when `cap` is under 24.
  - `struct LogRotation { uint32_t maxBytes; int keep; bool needRotate(uint32_t currentBytes, uint32_t lineLen) const; bool seqToDelete(uint32_t newSeq, uint32_t& out) const; }` (`needRotate` true when `currentBytes + lineLen > maxBytes` and `currentBytes > 0`; `seqToDelete` gives `newSeq - keep` when `newSeq >= keep`, else false).
  - `size_t trimToLastLine(const char* buf, size_t len)`: length up to and including the last `\n`, 0 when none.
  - `size_t formatChunkHeader(char* buf, size_t cap, uint32_t seq, uint32_t offset, uint32_t total)`: `"<seq>:<offset>:<total>\n"`.
  - Topic constants `T_CMD_LOG "smarthome/cmd/log"`, `T_LOG_INDEX "smarthome/log/index"`, `T_LOG_DATA "smarthome/log/data"`.
- Produces (`src/event_log.h`): `namespace eventLog { void begin(); void add(const char* code, const char* detail); void tick(uint32_t nowMs); void handleCommand(const char* payload, unsigned len); }`.
- Produces (`web/logsync.js`): `parseChunk(text) -> {seq, offset, total, data} | null`; `class LogAssembler { constructor(total); accept(chunk) -> boolean (true when new data was added); nextOffset() -> number; done() -> boolean; text() -> string }` (accepts duplicates harmlessly, ignores a chunk that does not start at `nextOffset()` and reports the gap through `nextOffset()`); `requestMessage(kind, seq?, offset?) -> string` giving `{"list":1}` or `{"get":<seq>,"offset":<n>}`.

- [ ] **Step 1: Write failing native tests** (`run_logfmt_tests()`):
  - `line_uses_epoch_when_clock_is_set`, `line_uses_uptime_before_clock`, `line_empty_detail_has_no_trailing_space`, `line_newlines_in_detail_become_spaces`, `line_long_detail_is_cut_and_still_ends_with_newline`, `line_returns_zero_when_buffer_tiny`
  - `rotate_when_next_line_would_exceed`, `no_rotate_on_empty_file_even_if_line_is_big`, `delete_seq_is_new_minus_keep`, `no_delete_while_fewer_than_keep`
  - `trim_drops_partial_last_line`, `trim_keeps_complete_lines`, `trim_no_newline_is_zero`
  - `chunk_header_exact_string` (`"3:768:65000\n"`).
- [ ] **Step 2: Write failing web tests** (`logsync.test.mjs`): `parseChunk reads header and data`, `parseChunk rejects garbage`, `assembler joins in-order chunks and reports done`, `assembler ignores duplicate chunk`, `assembler reports the gap and nextOffset stays at the gap`, `assembler recovers when the missing chunk arrives`, `assembler handles multi-byte characters by byte offsets` (offsets count UTF-8 bytes), `requestMessage list and get`.
- [ ] **Step 3: Run** `pio test -e native` and `node --test "web/test/*.test.mjs"`. Expected: FAIL (missing symbols).
- [ ] **Step 4: Implement** `logfmt` and `logsync.js`. Run both suites. Expected: all PASS.
- [ ] **Step 5: Implement the firmware.** `eventLog` keeps files `/log_<n>.txt` on LittleFS: at boot it finds the highest `n` (creating `/log_1.txt` when none), appends lines through a RAM buffer of 512 bytes flushed at most every 5 s (immediately for `boot` and `crash` codes), rotates with `LogRotation{LOG_MAX_BYTES, 3}`, deletes the oldest file, and skips writing when LittleFS free space is under 32 KB. `handleCommand`: `{"list":1}` publishes `smarthome/log/index` as `{"files":[{"seq":2,"bytes":12345},...],"max_file_bytes":65536}` (oldest first); `{"get":<seq>,"offset":<n>}` starts one stream (a new `get` replaces the old one; an unknown seq or an offset beyond the end publishes an empty-data chunk header so the page can stop); `tick` sends one chunk of at most 384 data bytes every 25 ms, never serving the partial last line of the newest file (`trimToLastLine`). Add `eventLog::add` calls: boot (reset reason and fw), Wi-Fi lost and regained, MQTT lost and regained, issue raised and cleared (names from `issueName`), settings changed (the echoed JSON), self-test result (pass or the failing check names), setup mode entered and left, OTA start and end. In `main.cpp` route `cmd/log` to `eventLog::handleCommand` and call `eventLog::tick` every loop.
- [ ] **Step 6: Write `tools/pull_log.py`**: asks for `list`, then `get`s every file from offset 0, re-requests the first missing offset after 3 s of silence, writes the joined text to a file and prints the line count. Compile `pio run -e nodemcuv2`. Expected: SUCCESS.
- [ ] **Step 7: Flash and verify on the board:** `python tools/pull_log.py` returns a text file whose first lines show the boot line and the Wi-Fi and MQTT connect lines; change a setting (`watch.py`) and run `cmd/selftest`: the next pull shows a `settings` line and a `selftest` line; pull while the file is growing returns only complete lines. **Rotation test:** build once with `-DLOG_MAX_BYTES=2048`, flash, send `cmd/selftest` about 60 times, pull: the index shows exactly 3 files, sequence numbers increase, the oldest is gone, and total size is under 3 x 2048 plus one line; then reflash the normal build. **Power cut:** unplug USB during a burst of events, replug: the log still downloads and has no partial last line.
- [ ] **Step 8: Add the Download log button** (Health view): collects the index, requests files oldest to newest with the retry rule, shows progress ("2 of 3 files"), joins the text, gzips with `CompressionStream` when the browser has it, otherwise saves plain text, names the file `smarthome-log-<yyyymmdd-hhmm>.txt(.gz)`, and shows a plain error with a Try again button after 3 failed retries. Verify with the headless browser against `localhost` (button present, disabled while offline) and with the owner at the phone.
- [ ] **Step 9: Commit** `feat: event log on the board with chunked download`.

### Task 12: Self-test pattern on the yellow LED

**Files:**
- Modify: `lib/logic/statusled.h`, `lib/logic/statusled.cpp`, `test/test_native/test_statusled.cpp`, `src/health_monitor.h`, `src/health_monitor.cpp`, `src/main.cpp`

**Interfaces:**
- Produces: `Pattern::SelfTest`; `Pattern pickPattern(bool setupMode, bool wifiUp, bool mqttUp, uint8_t issues, bool statusLedEnabled, bool selfTestRunning = false)` (priority: SetupFast > SelfTest > NoWifi > CloudDown > Issue; SelfTest shows even when `statusLedEnabled` is false); `healthMonitor::selfTestAtBoot()` (runs the checks and the pattern for about 2 s; the result is published after the first MQTT connect) and `healthMonitor::runSelfTest(uint32_t patternMs)` (replaces `runSelfTest(bool)`; about 3000 from the command; publishes at once); `healthMonitor::selfTestRunning()`; `healthMonitor::onTick(void (*cb)())` called while a self-test blocks, so the LED keeps blinking.

- [ ] **Step 1: Write failing tests** in `test_statusled.cpp`: `self_test_beats_wifi_cloud_and_issue`, `setup_beats_self_test`, `self_test_shows_even_when_disabled`, `self_test_levels` (on at 250, off at 550, on at 650, off at 750, on at 800), and the existing tests stay unchanged (default argument).
- [ ] **Step 2: Run** `pio test -e native`. Expected: FAIL.
- [ ] **Step 3: Implement** the enum value, `pickPattern` parameter and `patternLevel` case (`nowMs % 800`). Run `pio test -e native`. Expected: all PASS.
- [ ] **Step 4: Firmware.** Remove the three-LED blink and the `leds` check from the self-test JSON (checks become `temp`, `ir`, `wifi`, `cloud`). `selfTestAtBoot()` is called in `setup()` before `net::begin()`: it reads the temperature, runs the pattern for about 2 s through `onTick`, and stores the result for publishing after the first connect. `cmd/selftest` runs `runSelfTest(3000)` (still ignored within 3 s after an MQTT connect). `driveStatusLed` passes `healthMonitor::selfTestRunning()` to `pickPattern`.
- [ ] **Step 5: Compile** `pio run -e nodemcuv2`. Expected: SUCCESS.
- [ ] **Step 6: Flash and verify with the owner at the board:** after power-up the yellow LED shows the long-short pattern for about 2 s, then dark or the normal status pattern; `tools/watch.py 8 'smarthome/cmd/selftest=1'` shows the same pattern for about 3 s and a `selftest` result with four checks; with `status_led` set to false the self-test pattern still shows; the yellow LED is dark afterwards.
- [ ] **Step 7: Commit** `feat: self-test pattern on the yellow LED at boot and on command`.
