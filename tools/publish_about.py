"""Publish the About details (include/about.json) as the retained message smarthome/about, so the page shows
them after login without having them in the public page source.

    python tools/publish_about.py            publish (or update)
    python tools/publish_about.py --clear    remove the message from the broker

Uses the board's login from include/secrets.h (it may publish under smarthome/ except smarthome/cmd/).
Needs: pip install paho-mqtt."""
import json, re, sys, time
from pathlib import Path
import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / "include" / "secrets.h").read_text(encoding="utf-8")
g = lambda k: re.search(r'#define %s\s+"?([^"\r\n]+?)"?\s*$' % k, s, re.M).group(1)

clear = "--clear" in sys.argv
payload = b""
if not clear:
    data = json.loads((ROOT / "include" / "about.json").read_text(encoding="utf-8"))
    allowed = {"name", "student_id", "class", "year", "supervisor"}
    unknown = set(data) - allowed
    if unknown:
        sys.exit(f"about.json has unknown keys: {sorted(unknown)} (allowed: {sorted(allowed)})")
    payload = json.dumps({k: str(v) for k, v in data.items()}, ensure_ascii=False).encode("utf-8")

result = {}
c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="pc-publish-about")
c.username_pw_set(g("MQTT_USER"), g("MQTT_PASS"))
c.tls_set(ca_certs=str(ROOT / "cert" / "emqxsl-ca.crt"))
c.on_connect = lambda cl, u, f, rc, p: result.update(rc=str(rc))
c.connect(g("MQTT_HOST"), int(g("MQTT_PORT")))
c.loop_start()
t0 = time.time()
while "rc" not in result and time.time() - t0 < 10:
    time.sleep(0.1)
if result.get("rc") != "Success":
    sys.exit(f"could not connect as {g('MQTT_USER')}: {result.get('rc', 'no answer')}")
info = c.publish("smarthome/about", payload, retain=True, qos=1)
info.wait_for_publish(timeout=10)
c.loop_stop()
print("cleared smarthome/about" if clear else f"published smarthome/about ({len(payload)} bytes)")
