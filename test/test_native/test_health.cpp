#include <unity.h>
#include <cstring>
#include "health.h"
using namespace logic;

static HealthInputs good() {
  HealthInputs h;
  h.tempOk = true; h.away = false; h.presenceHeldMs = 0; h.rssi = -55;
  h.heap = 30000; h.reconnectsIn10Min = 0; h.crashRecent = false;
  return h;
}

static void test_no_issues_when_all_good() { TEST_ASSERT_EQUAL_UINT8(0, evalIssues(good())); }
static void test_temp_fault_when_temp_not_ok() {
  HealthInputs h = good(); h.tempOk = false;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_TEMP_FAULT, evalIssues(h));
}
static void test_ir_stuck_after_30_min_with_away_off() {
  HealthInputs h = good(); h.presenceHeldMs = 30UL * 60 * 1000;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_IR_STUCK, evalIssues(h));
}
static void test_ir_not_stuck_just_under_30_min() {
  HealthInputs h = good(); h.presenceHeldMs = 30UL * 60 * 1000 - 1;
  TEST_ASSERT_EQUAL_UINT8(0, evalIssues(h));
}
static void test_ir_not_stuck_when_away_on() {
  HealthInputs h = good(); h.presenceHeldMs = 60UL * 60 * 1000; h.away = true;
  TEST_ASSERT_EQUAL_UINT8(0, evalIssues(h));
}
static void test_wifi_weak_below_minus_80() {
  HealthInputs h = good(); h.rssi = -81;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_WIFI_WEAK, evalIssues(h));
}
static void test_wifi_not_weak_at_minus_80() {
  HealthInputs h = good(); h.rssi = -80;
  TEST_ASSERT_EQUAL_UINT8(0, evalIssues(h));
}
static void test_wifi_unstable_above_3_reconnects() {
  HealthInputs h = good(); h.reconnectsIn10Min = 4;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_WIFI_UNSTABLE, evalIssues(h));
}
static void test_wifi_not_unstable_at_3() {
  HealthInputs h = good(); h.reconnectsIn10Min = 3;
  TEST_ASSERT_EQUAL_UINT8(0, evalIssues(h));
}
static void test_low_memory_below_10000() {
  HealthInputs h = good(); h.heap = 9999;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_LOW_MEMORY, evalIssues(h));
}
static void test_memory_ok_at_10000() {
  HealthInputs h = good(); h.heap = 10000;
  TEST_ASSERT_EQUAL_UINT8(0, evalIssues(h));
}
static void test_crash_reboot_when_crash_recent() {
  HealthInputs h = good(); h.crashRecent = true;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_CRASH_REBOOT, evalIssues(h));
}
static void test_issues_combine_as_bits() {
  HealthInputs h = good(); h.tempOk = false; h.rssi = -90; h.heap = 100;
  TEST_ASSERT_EQUAL_UINT8(ISSUE_TEMP_FAULT | ISSUE_WIFI_WEAK | ISSUE_LOW_MEMORY, evalIssues(h));
}
static void test_issue_names() {
  TEST_ASSERT_EQUAL_STRING("temp_fault", issueName(ISSUE_TEMP_FAULT));
  TEST_ASSERT_EQUAL_STRING("ir_stuck", issueName(ISSUE_IR_STUCK));
  TEST_ASSERT_EQUAL_STRING("wifi_weak", issueName(ISSUE_WIFI_WEAK));
  TEST_ASSERT_EQUAL_STRING("wifi_unstable", issueName(ISSUE_WIFI_UNSTABLE));
  TEST_ASSERT_EQUAL_STRING("low_memory", issueName(ISSUE_LOW_MEMORY));
  TEST_ASSERT_EQUAL_STRING("crash_reboot", issueName(ISSUE_CRASH_REBOOT));
  TEST_ASSERT_NULL(issueName(64));
}

static void test_window_counts_events_inside_window_only() {
  EventWindow w(1000);
  w.add(0); w.add(500); w.add(900);
  TEST_ASSERT_EQUAL_INT(3, w.count(999));
  TEST_ASSERT_EQUAL_INT(2, w.count(1000));  // event at 0 is exactly 1000 ms old: outside
  TEST_ASSERT_EQUAL_INT(0, w.count(5000));
}
static void test_window_survives_millis_wrap() {
  EventWindow w(600000);
  w.add(4294960000UL); w.add(4294966000UL);
  TEST_ASSERT_EQUAL_INT(2, w.count(100));  // 100 ms after the wrap
}
static void test_window_keeps_only_last_eight() {
  EventWindow w(100000);
  for (uint32_t i = 0; i < 10; i++) w.add(i * 10);
  TEST_ASSERT_EQUAL_INT(8, w.count(100));
}

static HealthReport sample() {
  HealthReport r;
  r.ts = 1; r.rssi = -60; r.heap = 30000; r.uptimeS = 5; r.reset = "power";
  r.wifiRc = 0; r.mqttRc = 1; r.fw = "2.0.0"; r.issues = ISSUE_TEMP_FAULT | ISSUE_WIFI_WEAK;
  return r;
}
static void test_format_health_exact_string() {
  char buf[200];
  size_t n = formatHealth(sample(), buf, sizeof(buf));
  const char* want = "{\"ts\":1,\"rssi\":-60,\"heap\":30000,\"uptime_s\":5,\"reset\":\"power\",\"wifi_rc\":0,\"mqtt_rc\":1,\"fw\":\"2.0.0\",\"issues\":[\"temp_fault\",\"wifi_weak\"]}";
  TEST_ASSERT_EQUAL_UINT32(strlen(want), n);
  TEST_ASSERT_EQUAL_STRING(want, buf);
}
static void test_format_health_empty_issues_is_empty_array() {
  char buf[200];
  HealthReport r = sample(); r.issues = 0;
  formatHealth(r, buf, sizeof(buf));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"issues\":[]"));
}
static void test_format_health_returns_zero_when_too_small() {
  char buf[40];
  TEST_ASSERT_EQUAL_UINT32(0, formatHealth(sample(), buf, sizeof(buf)));
}

void run_health_tests() {
  RUN_TEST(test_no_issues_when_all_good);
  RUN_TEST(test_temp_fault_when_temp_not_ok);
  RUN_TEST(test_ir_stuck_after_30_min_with_away_off);
  RUN_TEST(test_ir_not_stuck_just_under_30_min);
  RUN_TEST(test_ir_not_stuck_when_away_on);
  RUN_TEST(test_wifi_weak_below_minus_80);
  RUN_TEST(test_wifi_not_weak_at_minus_80);
  RUN_TEST(test_wifi_unstable_above_3_reconnects);
  RUN_TEST(test_wifi_not_unstable_at_3);
  RUN_TEST(test_low_memory_below_10000);
  RUN_TEST(test_memory_ok_at_10000);
  RUN_TEST(test_crash_reboot_when_crash_recent);
  RUN_TEST(test_issues_combine_as_bits);
  RUN_TEST(test_issue_names);
  RUN_TEST(test_window_counts_events_inside_window_only);
  RUN_TEST(test_window_survives_millis_wrap);
  RUN_TEST(test_window_keeps_only_last_eight);
  RUN_TEST(test_format_health_exact_string);
  RUN_TEST(test_format_health_empty_issues_is_empty_array);
  RUN_TEST(test_format_health_returns_zero_when_too_small);
}
