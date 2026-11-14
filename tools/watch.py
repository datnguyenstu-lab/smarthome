"""Watch smarthome/# and optionally publish: python tools/watch.py SECONDS [topic=payload ...]
Needs: pip install paho-mqtt. Uses include/secrets.h; MQTT_USER / MQTT_PASS env vars override."""
import os, re, sys, time
from pathlib import Path
import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / "include" / "secrets.h").read_text()
g = lambda k: re.search(r'#define %s\s+"?([^"\r\n]+?)"?\s*$' % k, s, re.M).group(1)
host, port = g("MQTT_HOST"), int(g("MQTT_PORT"))
user = os.environ.get("MQTT_USER", g("MQTT_USER"))  # override to test a person login
pw = os.environ.get("MQTT_PASS", g("MQTT_PASS"))
secs = int(sys.argv[1]) if len(sys.argv) > 1 else 60
pubs = sys.argv[2:]  # topic=payload pairs to publish after connect; prefix the topic with ! to retain

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="pc-watch")
c.username_pw_set(user, pw)
c.tls_set(ca_certs=str(ROOT / "cert" / "emqxsl-ca.crt"))
t0 = time.time()
c.on_message = lambda cl, u, m: print("%5.1fs %s = %s%s" % (time.time() - t0, m.topic, m.payload.decode(), " (retained)" if m.retain else ""), flush=True)
c.connect(host, port)
c.subscribe("smarthome/#")
c.loop_start()
time.sleep(2)
for p in pubs:
    t, v = p.split("=", 1)
    keep = t.startswith("!")
    t = t.lstrip("!")
    c.publish(t, v, retain=keep)
    print("sent", t, v, "(retained)" if keep else "", flush=True)
time.sleep(secs)
