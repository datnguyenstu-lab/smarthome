#include <unity.h>
#include "logic.h"

void run_alerts_tests();
void run_timing_tests();
void run_topics_tests();
void run_settings_tests();
void run_health_tests();
void run_statusled_tests();
void run_logfmt_tests();
void run_alertmsg_tests();

void setUp() {}
void tearDown() {}

static void test_harness_runs() { TEST_ASSERT_EQUAL_INT(1, logic::version()); }

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_harness_runs);
  run_alerts_tests();
  run_timing_tests();
  run_topics_tests();
  run_settings_tests();
  run_health_tests();
  run_statusled_tests();
  run_logfmt_tests();
  run_alertmsg_tests();
  return UNITY_END();
}
