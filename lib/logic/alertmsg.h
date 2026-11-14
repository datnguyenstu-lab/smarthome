#pragma once
#include <cstddef>
#include "alerts.h"
namespace logic {

// The message published on smarthome/event/alert each time the alert really changes (not on a reconnect):
//   {"alert":"door_open","text":"🚪 Cold storage: door open too long / Kho lạnh: cửa mở quá lâu (29.5 °C)"}
// `text` is a ready-made English / Vietnamese sentence, so the broker only has to forward it (for example to a
// Telegram chat). An unusable temperature (NaN, -127, 85) is shown as "--". The text never contains a quote or a
// backslash, so the JSON is always valid. Returns the length, or 0 when `cap` is too small.
size_t formatAlertEvent(char* buf, size_t cap, Alert a, float tempC);

}  // namespace logic
