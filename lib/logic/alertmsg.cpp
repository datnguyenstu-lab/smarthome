#include "alertmsg.h"
#include <cstdio>
#include <cstring>

namespace logic {

size_t formatAlertEvent(char* buf, size_t cap, Alert a, float tempC) {
  char t[16];
  if (tempValid(tempC)) snprintf(t, sizeof(t), "%.1f", (double)tempC);
  else strcpy(t, "--");

  char text[200];
  switch (a) {
    case Alert::DoorOpen:
      snprintf(text, sizeof(text), "🚪 Cold storage: door open too long / Kho lạnh: cửa mở quá lâu (%s °C)", t);
      break;
    case Alert::Hot:
      snprintf(text, sizeof(text), "🌡 Cold storage too warm: %s °C / Kho lạnh quá nóng: %s °C", t, t);
      break;
    case Alert::Intruder:
      snprintf(text, sizeof(text), "🚨 Cold storage: door opened while locked up / Kho lạnh: cửa mở khi đã khóa kho");
      break;
    case Alert::TempFault:
      snprintf(text, sizeof(text), "⚠ Cold storage: temperature sensor not responding / Kho lạnh: cảm biến nhiệt độ không phản hồi");
      break;
    default:
      snprintf(text, sizeof(text), "✅ Cold storage back to normal / Kho lạnh đã trở lại bình thường (%s °C)", t);
      break;
  }
  int n = snprintf(buf, cap, "{\"alert\":\"%s\",\"text\":\"%s\"}", alertName(a), text);
  return (n < 0 || (size_t)n >= cap) ? 0 : (size_t)n;
}

}  // namespace logic
