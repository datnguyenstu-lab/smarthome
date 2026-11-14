#include <unity.h>
#include <cmath>
#include <cstring>
#include "settings.h"
using namespace logic;

static void test_defaults_are_35_5_true() {
  Settings s;
  TEST_ASSERT_EQUAL_FLOAT(35.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(5, s.presenceHoldS);
  TEST_ASSERT_TRUE(s.statusLed);
}
static void test_clamp_hot_low_to_20() { Settings s; s.hotOnC = 5; TEST_ASSERT_EQUAL_FLOAT(20.0f, clampSettings(s).hotOnC); }
static void test_clamp_hot_high_to_60() { Settings s; s.hotOnC = 99; TEST_ASSERT_EQUAL_FLOAT(60.0f, clampSettings(s).hotOnC); }
static void test_clamp_nan_hot_to_default() { Settings s; s.hotOnC = NAN; TEST_ASSERT_EQUAL_FLOAT(35.0f, clampSettings(s).hotOnC); }
static void test_clamp_hold_zero_to_1() { Settings s; s.presenceHoldS = 0; TEST_ASSERT_EQUAL_UINT32(1, clampSettings(s).presenceHoldS); }
static void test_clamp_hold_high_to_60() { Settings s; s.presenceHoldS = 600; TEST_ASSERT_EQUAL_UINT32(60, clampSettings(s).presenceHoldS); }

static bool parse(const char* j, Settings& s) { return parseSettings(j, (unsigned)strlen(j), s); }

static void test_parse_full_object_sets_all_three() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":40,\"presence_hold_s\":10,\"status_led\":false}", s));
  TEST_ASSERT_EQUAL_FLOAT(40.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(10, s.presenceHoldS);
  TEST_ASSERT_FALSE(s.statusLed);
}
static void test_parse_missing_keys_keep_current() {
  Settings s; s.hotOnC = 42; s.presenceHoldS = 9; s.statusLed = false;
  TEST_ASSERT_TRUE(parse("{\"presence_hold_s\":3}", s));
  TEST_ASSERT_EQUAL_FLOAT(42.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(3, s.presenceHoldS);
  TEST_ASSERT_FALSE(s.statusLed);
}
static void test_parse_wrong_type_ignored() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":\"hot\",\"presence_hold_s\":7}", s));
  TEST_ASSERT_EQUAL_FLOAT(35.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(7, s.presenceHoldS);
}
static void test_parse_out_of_range_is_clamped() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{\"hot_on_c\":500,\"presence_hold_s\":0}", s));
  TEST_ASSERT_EQUAL_FLOAT(60.0f, s.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(1, s.presenceHoldS);
}
static void test_parse_garbage_returns_false_and_leaves_untouched() {
  const char* bad[] = {"", "nope", "[1]", "{}", "{\"hot_on_c\":"};
  for (const char* j : bad) {
    Settings s; s.hotOnC = 44; s.presenceHoldS = 12; s.statusLed = false;
    TEST_ASSERT_FALSE_MESSAGE(parse(j, s), j);
    TEST_ASSERT_EQUAL_FLOAT(44.0f, s.hotOnC);
    TEST_ASSERT_EQUAL_UINT32(12, s.presenceHoldS);
    TEST_ASSERT_FALSE(s.statusLed);
  }
}
static void test_parse_tolerates_whitespace() {
  Settings s;
  TEST_ASSERT_TRUE(parse("{ \"hot_on_c\" : 41.5 , \"status_led\" : true }", s));
  TEST_ASSERT_EQUAL_FLOAT(41.5f, s.hotOnC);
  TEST_ASSERT_TRUE(s.statusLed);
}
static void test_format_roundtrips_through_parse() {
  Settings a; a.hotOnC = 38.5f; a.presenceHoldS = 12; a.statusLed = false;
  char buf[96];
  size_t n = formatSettings(a, buf, sizeof(buf));
  TEST_ASSERT_GREATER_THAN(0, (int)n);
  Settings b;
  TEST_ASSERT_TRUE(parseSettings(buf, (unsigned)n, b));
  TEST_ASSERT_EQUAL_FLOAT(38.5f, b.hotOnC);
  TEST_ASSERT_EQUAL_UINT32(12, b.presenceHoldS);
  TEST_ASSERT_FALSE(b.statusLed);
}
static void test_format_default_exact_string() {
  char buf[96];
  Settings s;
  formatSettings(s, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("{\"hot_on_c\":35.0,\"presence_hold_s\":5,\"status_led\":true}", buf);
}
static void test_format_returns_zero_when_buffer_too_small() {
  char buf[10];
  TEST_ASSERT_EQUAL_UINT32(0, formatSettings(Settings(), buf, sizeof(buf)));
}

void run_settings_tests() {
  RUN_TEST(test_defaults_are_35_5_true);
  RUN_TEST(test_clamp_hot_low_to_20);
  RUN_TEST(test_clamp_hot_high_to_60);
  RUN_TEST(test_clamp_nan_hot_to_default);
  RUN_TEST(test_clamp_hold_zero_to_1);
  RUN_TEST(test_clamp_hold_high_to_60);
  RUN_TEST(test_parse_full_object_sets_all_three);
  RUN_TEST(test_parse_missing_keys_keep_current);
  RUN_TEST(test_parse_wrong_type_ignored);
  RUN_TEST(test_parse_out_of_range_is_clamped);
  RUN_TEST(test_parse_garbage_returns_false_and_leaves_untouched);
  RUN_TEST(test_parse_tolerates_whitespace);
  RUN_TEST(test_format_roundtrips_through_parse);
  RUN_TEST(test_format_default_exact_string);
  RUN_TEST(test_format_returns_zero_when_buffer_too_small);
}
