#include "topics.h"
#include <cstring>

namespace logic {

bool parseOnOff(const char* payload, unsigned len, bool& on) {
  if (len == 2 && memcmp(payload, "on", 2) == 0) { on = true; return true; }
  if (len == 3 && memcmp(payload, "off", 3) == 0) { on = false; return true; }
  return false;
}

int ledFromCmdTopic(const char* topic) {
  static const char prefix[] = "smarthome/cmd/led";
  const size_t n = sizeof(prefix) - 1;
  if (strncmp(topic, prefix, n) != 0) return 0;
  char d = topic[n];
  if (d < '1' || d > '3' || topic[n + 1] != '\0') return 0;
  return d - '0';
}

const char* ledStateTopic(int led) {
  static const char* const t[] = {"smarthome/state/led1", "smarthome/state/led2", "smarthome/state/led3"};
  return (led >= 1 && led <= 3) ? t[led - 1] : nullptr;
}

}  // namespace logic
