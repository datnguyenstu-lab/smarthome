#pragma once
namespace logic {

constexpr const char* T_STATUS = "smarthome/status";
constexpr const char* T_TEMP = "smarthome/temp";
constexpr const char* T_PRESENCE = "smarthome/presence";
constexpr const char* T_PRESENCE_CHANGED = "smarthome/presence_changed";
constexpr const char* T_STATE_AWAY = "smarthome/state/away";
constexpr const char* T_CMD_AWAY = "smarthome/cmd/away";
constexpr const char* T_ALERT = "smarthome/alert";
constexpr const char* T_CMD_ALL = "smarthome/cmd/#";

// Exact lowercase "on" / "off" only. `on` is left untouched when parsing fails.
bool parseOnOff(const char* payload, unsigned len, bool& on);

// 1..3 for smarthome/cmd/led1..3, else 0.
int ledFromCmdTopic(const char* topic);

// smarthome/state/led1..3 for led 1..3, else nullptr.
const char* ledStateTopic(int led);

}  // namespace logic
