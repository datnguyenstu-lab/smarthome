#include <unity.h>
#include "logic.h"

void setUp() {}
void tearDown() {}

void test_harness_runs() { TEST_ASSERT_EQUAL_INT(1, logic::version()); }

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_harness_runs);
  return UNITY_END();
}
