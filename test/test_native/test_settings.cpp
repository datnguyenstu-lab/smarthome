#include <unity.h>
#include <cmath>
#include <cstring>
#include "settings.h"
using namespace logic;

static void test_defaults_are_8_10_true() {
  Settings s;
  TEST_ASSERT_EQUAL_FLOAT(8.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(10, s.doorOpenS);
  TEST_ASSERT_TRUE(s.statusLed);
}
static void test_clamp_warm_low_to_minus_25() { Settings s; s.hotOnC = -50; TEST_ASSERT_EQUAL_FLOAT(-25.0f, clampSettings(s).hotOnC); }
static void test_clamp_warm_high_to_30() { Settings s; s.hotOnC = 99; TEST_ASSERT_EQUAL_FLOAT(30.0f, clampSettings(s).hotOnC); }
static void test_clamp_nan_warm_to_default() { Settings s; s.hotOnC = NAN; TEST_ASSERT_EQUAL_FLOAT(8.0f, clampSettings(s).hotOnC); }
static void test_clamp_keeps_negative_freezer_value() { Settings s; s.hotOnC = -15; TEST_ASSERT_EQUAL_FLOAT(-15.0f, clampSettings(s).hotOnC); }
static void test_clamp_door_high_to_600() { Settings s; s.doorOpenS = 6000; TEST_ASSERT_EQUAL_UINT32(600, clampSettings(s).doorOpenS); }
static void test_door_zero_is_allowed() { Settings s; s.doorOpenS = 0; TEST_ASSERT_EQUAL_UINT32(0, clampSettings(s).doorOpenS); }

static bool parse(const char* j, Settings& s) { return parseSettings(j, (unsigned)strlen(j), s); }

static void test_parse_full_object_sets_all_three() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":-18,\"door_open_s\":30,\"status_led\":false}", s));
  TEST_ASSERT_EQUAL_FLOAT(-18.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(30, s.doorOpenS);
  TEST_ASSERT_FALSE(s.statusLed);
}
static void test_parse_missing_keys_keep_current() {
  Settings s; s.hotOnC = 4; s.doorOpenS = 9; s.statusLed = false;
  TEST_ASSERT_TRUE(parse("{\"door_open_s\":3}", s));
  TEST_ASSERT_EQUAL_FLOAT(4.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(3, s.doorOpenS);
  TEST_ASSERT_FALSE(s.statusLed);
}
static void test_parse_wrong_type_ignored() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":\"warm\",\"door_open_s\":7}", s));
  TEST_ASSERT_EQUAL_FLOAT(8.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(7, s.doorOpenS);
}
static void test_parse_out_of_range_is_clamped() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":500,\"door_open_s\":99999}", s));
  TEST_ASSERT_EQUAL_FLOAT(30.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(600, s.doorOpenS);
  TEST_ASSERT_TRUE(parse("{\"door_open_s\":-5}", s));
  TEST_ASSERT_EQUAL_UINT32(0, s.doorOpenS);
}
static void test_parse_old_keys_alone_are_not_recognised() {
  // the retained settings from before the cold-storage change: presence_hold_s is gone
  Settings s; s.hotOnC = 5;
  TEST_ASSERT_FALSE(parse("{\"presence_hold_s\":5}", s));
  TEST_ASSERT_EQUAL_FLOAT(5.0f, s.hotOnC);
}
static void test_parse_old_object_still_takes_the_keys_that_remain() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":6,\"presence_hold_s\":5,\"status_led\":true}", s));
  TEST_ASSERT_EQUAL_FLOAT(6.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(10, s.doorOpenS);   // untouched default
}
static void test_parse_garbage_returns_false_and_leaves_untouched() {
  const char* bad[] = {"", "nope", "[1]", "{}", "{\"hot_on_c\":"};
  for (const char* j : bad) {
    Settings s; s.hotOnC = 3; s.doorOpenS = 12; s.statusLed = false;
    TEST_ASSERT_FALSE_MESSAGE(parse(j, s), j);
    TEST_ASSERT_EQUAL_FLOAT(3.0f, s.hotOnC);
    TEST_ASSERT_EQUAL_UINT32(12, s.doorOpenS);
    TEST_ASSERT_FALSE(s.statusLed);
  }
}
static void test_parse_tolerates_whitespace() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{ \"hot_on_c\" : 4.5 , \"status_led\" : true }", s));
  TEST_ASSERT_EQUAL_FLOAT(4.5f, s.hotOnC);
  TEST_ASSERT_TRUE(s.statusLed);
}
static void test_format_roundtrips_through_parse() {
  Settings a; a.hotOnC = -18.5f; a.doorOpenS = 45; a.statusLed = false;
  char buf[96];
  size_t n = formatSettings(a, buf, sizeof(buf));
  TEST_ASSERT_GREATER_THAN(0, (int)n);
  Settings b;
  TEST_ASSERT_TRUE(parseSettings(buf, (unsigned)n, b));
  TEST_ASSERT_EQUAL_FLOAT(-18.5f, b.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(45, b.doorOpenS);
  TEST_ASSERT_FALSE(b.statusLed);
}
static void test_format_default_exact_string() {
  char buf[96];
  Settings s;
  formatSettings(s, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("{\"hot_on_c\":8.0,\"door_open_s\":10,\"status_led\":true}", buf);
}
static void test_format_returns_zero_when_buffer_too_small() {
  char buf[10];
  TEST_ASSERT_EQUAL_UINT32(0, formatSettings(Settings(), buf, sizeof(buf)));
}

void run_settings_tests() {
  RUN_TEST(test_defaults_are_8_10_true);
  RUN_TEST(test_clamp_warm_low_to_minus_25);
  RUN_TEST(test_clamp_warm_high_to_30);
  RUN_TEST(test_clamp_nan_warm_to_default);
  RUN_TEST(test_clamp_keeps_negative_freezer_value);
  RUN_TEST(test_clamp_door_high_to_600);
  RUN_TEST(test_door_zero_is_allowed);
  RUN_TEST(test_parse_full_object_sets_all_three);
  RUN_TEST(test_parse_missing_keys_keep_current);
  RUN_TEST(test_parse_wrong_type_ignored);
  RUN_TEST(test_parse_out_of_range_is_clamped);
  RUN_TEST(test_parse_old_keys_alone_are_not_recognised);
  RUN_TEST(test_parse_old_object_still_takes_the_keys_that_remain);
  RUN_TEST(test_parse_garbage_returns_false_and_leaves_untouched);
  RUN_TEST(test_parse_tolerates_whitespace);
  RUN_TEST(test_format_roundtrips_through_parse);
  RUN_TEST(test_format_default_exact_string);
  RUN_TEST(test_format_returns_zero_when_buffer_too_small);
}
