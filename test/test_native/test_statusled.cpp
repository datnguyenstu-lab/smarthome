#include <unity.h>
#include "statusled.h"
using namespace logic;

#define ASSERT_PATTERN(expected, actual) TEST_ASSERT_EQUAL_INT((int)(expected), (int)(actual))

static void test_setup_beats_everything() {
  ASSERT_PATTERN(Pattern::SetupFast, pickPattern(true, false, false, 0xFF, true));
}
static void test_no_wifi_beats_cloud_down() {
  ASSERT_PATTERN(Pattern::NoWifi, pickPattern(false, false, false, 1, true));
}
static void test_cloud_down_beats_issue() {
  ASSERT_PATTERN(Pattern::CloudDown, pickPattern(false, true, false, 1, true));
}
static void test_issue_when_only_issues() {
  ASSERT_PATTERN(Pattern::Issue, pickPattern(false, true, true, 4, true));
}
static void test_none_when_all_ok() {
  ASSERT_PATTERN(Pattern::None, pickPattern(false, true, true, 0, true));
}
static void test_disabled_hides_all_but_setup() {
  ASSERT_PATTERN(Pattern::None, pickPattern(false, false, false, 1, false));
  ASSERT_PATTERN(Pattern::None, pickPattern(false, true, true, 1, false));
  ASSERT_PATTERN(Pattern::SetupFast, pickPattern(true, false, false, 0, false));
}
static void test_setup_fast_on_at_0_off_at_150() {
  TEST_ASSERT_TRUE(patternLevel(Pattern::SetupFast, 0));
  TEST_ASSERT_TRUE(patternLevel(Pattern::SetupFast, 149));
  TEST_ASSERT_FALSE(patternLevel(Pattern::SetupFast, 150));
  TEST_ASSERT_TRUE(patternLevel(Pattern::SetupFast, 300));
}
static void test_no_wifi_double_blink_levels() {
  TEST_ASSERT_TRUE(patternLevel(Pattern::NoWifi, 50));
  TEST_ASSERT_FALSE(patternLevel(Pattern::NoWifi, 200));
  TEST_ASSERT_TRUE(patternLevel(Pattern::NoWifi, 300));
  TEST_ASSERT_FALSE(patternLevel(Pattern::NoWifi, 1000));
}
static void test_cloud_down_slow_blink_levels() {
  TEST_ASSERT_TRUE(patternLevel(Pattern::CloudDown, 500));
  TEST_ASSERT_FALSE(patternLevel(Pattern::CloudDown, 1500));
}
static void test_issue_triple_blink_levels() {
  TEST_ASSERT_TRUE(patternLevel(Pattern::Issue, 50));
  TEST_ASSERT_FALSE(patternLevel(Pattern::Issue, 150));
  TEST_ASSERT_TRUE(patternLevel(Pattern::Issue, 300));
  TEST_ASSERT_FALSE(patternLevel(Pattern::Issue, 400));
  TEST_ASSERT_TRUE(patternLevel(Pattern::Issue, 550));
  TEST_ASSERT_FALSE(patternLevel(Pattern::Issue, 1000));
}
static void test_none_pattern_level_is_off() {
  TEST_ASSERT_FALSE(patternLevel(Pattern::None, 0));
  TEST_ASSERT_FALSE(patternLevel(Pattern::None, 4294967295UL));
}
static void test_pattern_level_defined_at_millis_wrap() {
  // 4294967295 % 300 = 195 (off for SetupFast); the next tick after the wrap is 0 (on)
  TEST_ASSERT_FALSE(patternLevel(Pattern::SetupFast, 4294967295UL));
  TEST_ASSERT_TRUE(patternLevel(Pattern::SetupFast, 0));
}

static void test_self_test_beats_wifi_cloud_and_issue() {
  ASSERT_PATTERN(Pattern::SelfTest, pickPattern(false, false, false, 1, true, true));
  ASSERT_PATTERN(Pattern::SelfTest, pickPattern(false, true, false, 1, true, true));
  ASSERT_PATTERN(Pattern::SelfTest, pickPattern(false, true, true, 1, true, true));
}
static void test_setup_beats_self_test() {
  ASSERT_PATTERN(Pattern::SetupFast, pickPattern(true, true, true, 0, true, true));
}
static void test_self_test_shows_even_when_disabled() {
  ASSERT_PATTERN(Pattern::SelfTest, pickPattern(false, true, true, 0, false, true));
}
static void test_self_test_levels() {
  TEST_ASSERT_TRUE(patternLevel(Pattern::SelfTest, 250));
  TEST_ASSERT_FALSE(patternLevel(Pattern::SelfTest, 550));
  TEST_ASSERT_TRUE(patternLevel(Pattern::SelfTest, 650));
  TEST_ASSERT_FALSE(patternLevel(Pattern::SelfTest, 750));
  TEST_ASSERT_TRUE(patternLevel(Pattern::SelfTest, 800));
}

void run_statusled_tests() {
  RUN_TEST(test_self_test_beats_wifi_cloud_and_issue);
  RUN_TEST(test_setup_beats_self_test);
  RUN_TEST(test_self_test_shows_even_when_disabled);
  RUN_TEST(test_self_test_levels);
  RUN_TEST(test_setup_beats_everything);
  RUN_TEST(test_no_wifi_beats_cloud_down);
  RUN_TEST(test_cloud_down_beats_issue);
  RUN_TEST(test_issue_when_only_issues);
  RUN_TEST(test_none_when_all_ok);
  RUN_TEST(test_disabled_hides_all_but_setup);
  RUN_TEST(test_setup_fast_on_at_0_off_at_150);
  RUN_TEST(test_no_wifi_double_blink_levels);
  RUN_TEST(test_cloud_down_slow_blink_levels);
  RUN_TEST(test_issue_triple_blink_levels);
  RUN_TEST(test_none_pattern_level_is_off);
  RUN_TEST(test_pattern_level_defined_at_millis_wrap);
}
