#include <unity.h>
#include "logic.h"

void run_alerts_tests();

void setUp() {}
void tearDown() {}

static void test_harness_runs() { TEST_ASSERT_EQUAL_INT(1, logic::version()); }

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_harness_runs);
  run_alerts_tests();
  return UNITY_END();
}
