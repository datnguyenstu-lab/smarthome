#include <unity.h>
#include <cmath>
#include <cstring>
#include "alertmsg.h"
using namespace logic;

static bool contains(const char* hay, const char* needle) { return strstr(hay, needle) != nullptr; }

static void test_door_open_message_names_the_alert_and_both_languages() {
  char b[400];
  size_t n = formatAlertEvent(b, sizeof(b), Alert::DoorOpen, 29.5f);
  TEST_ASSERT_EQUAL_UINT32(strlen(b), n);
  TEST_ASSERT_TRUE(contains(b, "\"alert\":\"door_open\""));
  TEST_ASSERT_TRUE(contains(b, "door open too long"));
  TEST_ASSERT_TRUE(contains(b, "cửa mở quá lâu"));
  TEST_ASSERT_TRUE(contains(b, "29.5"));
}
static void test_warm_message_shows_the_temperature() {
  char b[400];
  formatAlertEvent(b, sizeof(b), Alert::Hot, 34.24f);
  TEST_ASSERT_TRUE(contains(b, "\"alert\":\"hot\""));
  TEST_ASSERT_TRUE(contains(b, "too warm"));
  TEST_ASSERT_TRUE(contains(b, "34.2"));
}
static void test_lock_up_message() {
  char b[400];
  formatAlertEvent(b, sizeof(b), Alert::Intruder, 5.0f);
  TEST_ASSERT_TRUE(contains(b, "\"alert\":\"intruder\""));
  TEST_ASSERT_TRUE(contains(b, "locked up"));
  TEST_ASSERT_TRUE(contains(b, "khóa kho"));
}
static void test_sensor_fault_message_has_no_temperature() {
  char b[400];
  formatAlertEvent(b, sizeof(b), Alert::TempFault, NAN);
  TEST_ASSERT_TRUE(contains(b, "\"alert\":\"temp_fault\""));
  TEST_ASSERT_TRUE(contains(b, "not responding"));
  TEST_ASSERT_FALSE(contains(b, "nan"));
}
static void test_back_to_normal_message() {
  char b[400];
  formatAlertEvent(b, sizeof(b), Alert::None, 6.0f);
  TEST_ASSERT_TRUE(contains(b, "\"alert\":\"none\""));
  TEST_ASSERT_TRUE(contains(b, "back to normal"));
  TEST_ASSERT_TRUE(contains(b, "trở lại bình thường"));
}
static void test_an_unusable_temperature_is_shown_as_dashes() {
  char b[400];
  formatAlertEvent(b, sizeof(b), Alert::DoorOpen, -127.0f);
  TEST_ASSERT_TRUE(contains(b, "--"));
  TEST_ASSERT_FALSE(contains(b, "-127"));
  formatAlertEvent(b, sizeof(b), Alert::DoorOpen, NAN);
  TEST_ASSERT_TRUE(contains(b, "--"));
}
static void test_negative_freezer_temperature_is_kept() {
  char b[400];
  formatAlertEvent(b, sizeof(b), Alert::Hot, -14.5f);
  TEST_ASSERT_TRUE(contains(b, "-14.5"));
}
static void test_json_is_well_formed_for_every_alert() {
  const Alert all[] = {Alert::None, Alert::Hot, Alert::Intruder, Alert::TempFault, Alert::DoorOpen};
  for (Alert a : all) {
    char b[400];
    size_t n = formatAlertEvent(b, sizeof(b), a, 12.3f);
    TEST_ASSERT_GREATER_THAN(20, (int)n);
    TEST_ASSERT_EQUAL_CHAR('{', b[0]);
    TEST_ASSERT_EQUAL_CHAR('}', b[n - 1]);
    // exactly four quotes around "alert" and "text" keys, four around their values: no stray quote or backslash in the text
    int quotes = 0;
    for (size_t i = 0; i < n; i++) { if (b[i] == '"') quotes++; TEST_ASSERT_NOT_EQUAL('\\', b[i]); TEST_ASSERT_TRUE((unsigned char)b[i] >= 0x20); }
    TEST_ASSERT_EQUAL_INT(8, quotes);
  }
}
static void test_returns_zero_when_the_buffer_is_too_small() {
  char b[40];
  TEST_ASSERT_EQUAL_UINT32(0, formatAlertEvent(b, sizeof(b), Alert::DoorOpen, 20.0f));
}

void run_alertmsg_tests() {
  RUN_TEST(test_door_open_message_names_the_alert_and_both_languages);
  RUN_TEST(test_warm_message_shows_the_temperature);
  RUN_TEST(test_lock_up_message);
  RUN_TEST(test_sensor_fault_message_has_no_temperature);
  RUN_TEST(test_back_to_normal_message);
  RUN_TEST(test_an_unusable_temperature_is_shown_as_dashes);
  RUN_TEST(test_negative_freezer_temperature_is_kept);
  RUN_TEST(test_json_is_well_formed_for_every_alert);
  RUN_TEST(test_returns_zero_when_the_buffer_is_too_small);
}
