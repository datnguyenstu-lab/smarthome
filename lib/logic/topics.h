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
constexpr const char* T_HEALTH = "smarthome/health";
constexpr const char* T_SELFTEST = "smarthome/selftest";
constexpr const char* T_SETTINGS = "smarthome/settings";
constexpr const char* T_CMD_SETTINGS = "smarthome/cmd/settings";
constexpr const char* T_CMD_SELFTEST = "smarthome/cmd/selftest";
constexpr const char* T_CMD_SETUP = "smarthome/cmd/setup";
constexpr const char* T_CMD_LOG = "smarthome/cmd/log";
constexpr const char* T_LOG_INDEX = "smarthome/log/index";
constexpr const char* T_LOG_DATA = "smarthome/log/data";

// Exact lowercase "on" / "off" only. `on` is left untouched when parsing fails.
bool parseOnOff(const char* payload, unsigned len, bool& on);

// 1..3 for smarthome/cmd/led1..3, else 0.
int ledFromCmdTopic(const char* topic);

// smarthome/state/led1..3 for led 1..3, else nullptr.
const char* ledStateTopic(int led);

}  // namespace logic
