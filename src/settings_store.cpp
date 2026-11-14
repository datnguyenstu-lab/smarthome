#include "settings_store.h"
#include <Arduino.h>
#include <LittleFS.h>

namespace settingsStore {

static const char* PATH = "/settings.json";

static bool mount() {
  static bool ok = false;
  if (!ok) ok = LittleFS.begin();  // formats a blank flash on first use
  return ok;
}

logic::Settings load() {
  logic::Settings s;
  if (!mount()) return s;
  File f = LittleFS.open(PATH, "r");
  if (!f) return s;
  char b[128];
  size_t n = f.readBytes(b, sizeof(b) - 1);
  f.close();
  logic::parseSettings(b, (unsigned)n, s);  // keeps the defaults if the file is garbage
  return s;
}

bool save(const logic::Settings& s) {
  if (!mount()) return false;
  char b[96];
  size_t n = logic::formatSettings(s, b, sizeof(b));
  if (!n) return false;
  File f = LittleFS.open(PATH, "w");
  if (!f) return false;
  size_t w = f.write((const uint8_t*)b, n);
  f.close();
  return w == n;
}

}  // namespace settingsStore
