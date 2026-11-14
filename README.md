# Smart Home node (ESP8266)

A NodeMCU ESP8266 board with a temperature sensor, a presence (IR) sensor, two lights, two buttons and a status light. It talks to a cloud MQTT broker (EMQX Cloud Serverless) over TLS, so two people can watch it and switch the lights from a phone anywhere, using a static web page on GitHub Pages.

## What you get

- **Dashboard:** room temperature on a dial with the heat-alert mark, presence ("Someone there / Nobody there"), two light switches, Away mode.
- **Alerts:** too hot (default 35 °C), presence while Away is on, temperature sensor fault.
- **Health and self-test:** signal, memory, uptime, last restart, problems found, and a self-test you can start from the page.
- **Settings from the page:** heat threshold, presence hold time, status light on or off. Saved on the board.
- **Event log on the board** (restarts, Wi-Fi drops, problems, setting changes) that you can download from the page.
- **Reconnect guide** on the page when the board is offline, and a "Restart into setup mode" button for moving to a new Wi-Fi.
- **Updates over Wi-Fi (OTA).**

## Hardware

| Part | Board pin | Notes |
|---|---|---|
| IR obstacle sensor (OUT) | D0 | reads LOW when it detects something |
| Button 1 | D1 | toggles the middle light; hold 5 s for setup mode |
| DS18B20 temperature sensor (DATA) | D2 | 3.3 V, GND, and a 4.7 kΩ resistor from DATA to 3.3 V (not needed on a module with one) |
| Button 2 | D4 | toggles the right light; must not be held LOW while booting |
| LED 1, yellow (left) | D7 | the status light, not a light you control |
| LED 2, middle | D6 | "Bed light" on the page |
| LED 3, right | D5 | "Living room" on the page |

Buttons: one leg to the pin, the diagonal leg to GND (the board's pull-up does the rest). Each LED has a resistor in series to GND. Rename the lights in `LIGHTS` at the top of `web/app.js`.

## Build and flash (USB)

1. Install PlatformIO (`pip install platformio`).
2. Copy `include/secrets.example.h` to `include/secrets.h` and fill it in.
3. Put your broker's CA certificate in `cert/` and generate `include/ca_cert.h` from it (the file is a `const char CA_CERT[] PROGMEM` string holding the PEM).
4. Flash: `pio run -e nodemcuv2 -t upload --upload-port COM3` (use your port).

If the upload times out ("Timed out waiting for packet header"): try another USB cable or a port directly on the computer, and as a last resort hold the **FLASH** button while the upload starts, then release it. Release FLASH before reading the serial output, or the board stays in download mode.

## Update over Wi-Fi (OTA)

With the board online on the same network as the computer:

```
PLATFORMIO_UPLOAD_FLAGS="--auth=<OTA_PASS>" pio run -e ota -t upload
```

A wrong password is refused. The log records `ota start` and `ota end`. Only the firmware can be updated this way; changing the flash layout needs USB.

## Demo: show a version change over Wi-Fi

Prepare the images once (about 2 minutes; they hold your `secrets.h`, so `demo/` is git-ignored):

```
powershell -File tools\build_demo.ps1                 # builds demo\firmware-2.0.0.bin and demo\firmware-2.1.0-demo.bin
```

On the day, with the computer on the board's network and the page open on Health (the **Firmware** row):

```
powershell -File tools\demo_ota.ps1 -Version 2.1.0-demo   # about 45 s, then the page shows 2.1.0-demo
powershell -File tools\demo_ota.ps1 -Version 2.0.0        # back to the first image
```

The About screen (Home, bottom row) shows the page and board versions, the firmware build time, chip, core and flash size, and warns when the board runs a different release than the page, which is what you will see during the demo (page 2.0.0, board 2.1.0-demo). The Health page, the `health` message (`fw`) and the event log (`boot ... fw=<version>`, plus `ota start` and `ota end`) all show the change. Over-the-air updates work only from the computer on the same network; there is no update from the web page (see the design notes for why).

## Private files and moving to a new computer

Two files are never committed in plain form (they are git-ignored): `include/secrets.h` (passwords) and `include/about.json` (the student details shown on the About screen). They are kept in the repository only **encrypted** in `private/`, so a clone on a new computer can restore them.

- **Lock** (after you change either file): `python tools/vault.py lock`, enter a long passphrase (12+ characters, not reused), then commit `private/*.enc`.
- **New computer:** clone the repository, `pip install cryptography paho-mqtt platformio`, run `python tools/vault.py unlock` and type the passphrase. Then build and flash as above.
- **About details:** `python tools/publish_about.py` publishes them as the retained message `smarthome/about`. The page shows them only after login, so they are not in the public page source.
- **Keep the passphrase safe.** Without it the encrypted files cannot be opened; with a weak one, anyone can try passphrases against a public repository.

## Wi-Fi setup mode

- **From the board:** hold button 1 (D1) for 5 seconds. The yellow light fast-blinks.
- **From the page:** Settings, then "Restart into setup mode".
- **Automatically:** if the board cannot join any network at boot.

Join the **SmartHome-Setup** network (password `SETUP_AP_PASS` from `secrets.h`), open `192.168.4.1` if the page does not appear, choose your 2.4 GHz network and save. The portal closes after 3 minutes and the board reboots.

## Status light (yellow LED)

| Pattern | Meaning |
|---|---|
| fast blink | setup mode |
| long, short, short | self-test running (at start-up and on command) |
| double blink | no Wi-Fi |
| slow blink | Wi-Fi up, cloud not reachable |
| triple blink | a problem was found (see Health on the page) |
| dark | all is well |

The status light setting turns everything except setup mode and the self-test off.

## Accounts and access

The board and each person have their own broker login in EMQX (Access Control, Authentication, built-in database). The page asks for a person's login and keeps it in memory only.

| Login | May subscribe | May publish |
|---|---|---|
| board | `smarthome/cmd/#` | `smarthome/#` except `smarthome/cmd/#` |
| each person | `smarthome/#` | `smarthome/cmd/#` only |

Set the deployment's authorization to deny anything not allowed. Never reuse the board's login for a person.

## The web page

`web/` is a static page (no build step; MQTT.js from a CDN). Publish it on GitHub Pages from a `gh-pages` branch:

```
git subtree push --prefix web origin gh-pages
```

then in the repository settings choose Pages, branch `gh-pages`, folder `/ (root)`. The broker address is in `web/app.js`. The page holds no secrets.

## Event log

The board keeps the newest 3 log files of up to 64 KB in its flash (`LOG_MAX_BYTES` in `src/event_log.cpp`). Download them from Health, **Download log** (saved as a compressed text file), or from the PC:

```
python tools/pull_log.py log.txt
```

Lines look like `1794669920 ota start`. A time starting with `+` means the clock was not set yet (seconds since boot).

## MQTT topics (prefix `smarthome/`)

| Topic | Direction | Notes |
|---|---|---|
| `status` | board | `online`, or `offline` (last will), retained |
| `temp`, `presence`, `presence_changed`, `alert` | board | retained |
| `state/led2`, `state/led3`, `state/away` | board | retained |
| `health`, `selftest`, `settings` | board | retained JSON |
| `cmd/led2`, `cmd/led3` | to board | `on` or `off`, not retained |
| `cmd/away` | to board | `on` or `off`, retained |
| `cmd/settings` | to board | JSON, retained; the board checks and clamps every value |
| `cmd/selftest`, `cmd/setup` | to board | not retained |
| `cmd/log` | to board | `{"list":1}` or `{"get":<file>,"offset":<bytes>}` |
| `log/index`, `log/data` | board | log file list and chunks |

## Tools and tests

- `python tools/watch.py SECONDS [topic=payload ...]` shows the topics and can publish (prefix a topic with `!` to retain). Needs `pip install paho-mqtt`. `MQTT_USER` and `MQTT_PASS` environment variables override `secrets.h`.
- `pio test -e native` runs the firmware logic tests on the PC (needs a C++ compiler such as MinGW on the path).
- `node --test "web/test/*.test.mjs"` runs the page's logic tests.

## Layout

- `src/` board firmware; `lib/logic/` pure logic tested on the PC (alerts, settings, health, status patterns, log format).
- `web/` the page; `test/` and `web/test/` the tests; `docs/superpowers/` the design and plan documents.
