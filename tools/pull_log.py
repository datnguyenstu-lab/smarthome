"""Pull the board's event log over MQTT: python tools/pull_log.py [output.txt]
Needs: pip install paho-mqtt. Uses include/secrets.h; MQTT_USER / MQTT_PASS env vars override.
Asks for the file list, then every file from offset 0; re-requests the first missing offset after 3 s of
silence (so a lost chunk does not hang it); writes the joined text and prints the line count."""
import json, os, re, sys, time
from pathlib import Path
import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / "include" / "secrets.h").read_text()
g = lambda k: re.search(r'#define %s\s+"?([^"\r\n]+?)"?\s*$' % k, s, re.M).group(1)
host, port = g("MQTT_HOST"), int(g("MQTT_PORT"))
user, pw = os.environ.get("MQTT_USER", g("MQTT_USER")), os.environ.get("MQTT_PASS", g("MQTT_PASS"))
out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "smarthome-log.txt"

index = None
chunks = {}      # seq -> bytearray
totals = {}      # seq -> total bytes
last_rx = time.time()

def on_message(cl, u, m):
    global index, last_rx
    if m.topic == "smarthome/log/index":
        index = json.loads(m.payload.decode())
    elif m.topic == "smarthome/log/data":
        nl = m.payload.find(b"\n")
        if nl < 0:
            return
        try:
            seq, off, total = (int(x) for x in m.payload[:nl].decode().split(":"))
        except ValueError:
            return
        data = m.payload[nl + 1:]
        buf = chunks.setdefault(seq, bytearray())
        totals[seq] = total
        if off == len(buf) and data:       # in order; duplicates and gaps are ignored
            buf.extend(data)
        last_rx = time.time()

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="pc-pull-log")
c.username_pw_set(user, pw)
c.tls_set(ca_certs=str(ROOT / "cert" / "emqxsl-ca.crt"))
c.on_message = on_message
c.connect(host, port)
c.subscribe("smarthome/log/#")
c.loop_start()
time.sleep(1)

c.publish("smarthome/cmd/log", '{"list":1}')
t0 = time.time()
while index is None and time.time() - t0 < 10:
    time.sleep(0.2)
if index is None:
    sys.exit("no answer from the board (is it online?)")
files = index["files"]
print("index:", ", ".join(f"log_{f['seq']}={f['bytes']} B" for f in files), f"(max {index['max_file_bytes']} B per file)")

text = bytearray()
for f in files:                              # oldest first
    seq, want = f["seq"], f["bytes"]
    chunks[seq] = bytearray()
    c.publish("smarthome/cmd/log", json.dumps({"get": seq, "offset": 0}))
    last_rx = time.time()
    retries = 0
    while len(chunks[seq]) < want:
        time.sleep(0.1)
        if time.time() - last_rx > 3:
            retries += 1
            if retries > 3:
                sys.exit(f"gave up on file {seq} at offset {len(chunks[seq])} of {want}")
            c.publish("smarthome/cmd/log", json.dumps({"get": seq, "offset": len(chunks[seq])}))
            last_rx = time.time()
    text.extend(chunks[seq])
c.loop_stop()
out_path.write_bytes(bytes(text))
lines = text.count(b"\n")
print(f"wrote {out_path} ({len(text)} bytes, {lines} lines)")
