#include <unity.h>
#include "timing.h"
using namespace logic;

static void test_debouncer_ignores_short_blip() {
  Debouncer d(30);
  TEST_ASSERT_FALSE(d.update(false, 0));
  TEST_ASSERT_FALSE(d.update(true, 100));
  TEST_ASSERT_FALSE(d.update(true, 110));   // only 10 ms stable
  TEST_ASSERT_FALSE(d.update(false, 111));  // blip over
  TEST_ASSERT_FALSE(d.update(false, 500));
}
static void test_debouncer_accepts_stable_change() {
  Debouncer d(30);
  d.update(false, 0);
  TEST_ASSERT_FALSE(d.update(true, 200));
  TEST_ASSERT_FALSE(d.update(true, 229));
  TEST_ASSERT_TRUE(d.update(true, 230));
  TEST_ASSERT_TRUE(d.update(false, 231));   // low not yet stable: still reads high
  TEST_ASSERT_FALSE(d.update(false, 262));  // 31 ms stable low
}
static void test_presence_hold_boundaries() {
  PresenceHold h(5000);
  TEST_ASSERT_FALSE(h.update(false, 0));    // never seen
  TEST_ASSERT_TRUE(h.update(true, 1000));
  TEST_ASSERT_TRUE(h.update(false, 5999));  // 4999 ms after last detection
  TEST_ASSERT_FALSE(h.update(false, 6000)); // 5000 ms
}
static void test_presence_hold_set_hold_changes_expiry() {
  PresenceHold h(5000);
  TEST_ASSERT_TRUE(h.update(true, 1000));
  h.setHoldMs(2000);
  TEST_ASSERT_TRUE(h.update(false, 2999));
  TEST_ASSERT_FALSE(h.update(false, 3000));
}
static void test_longpress_fires_once_then_rearms_on_release() {
  LongPress p(5000);
  TEST_ASSERT_FALSE(p.update(true, 0));
  TEST_ASSERT_FALSE(p.update(true, 4999));
  TEST_ASSERT_TRUE(p.update(true, 5000));
  TEST_ASSERT_FALSE(p.update(true, 6000));  // still held: no second fire
  TEST_ASSERT_FALSE(p.update(false, 6100)); // release
  TEST_ASSERT_FALSE(p.update(true, 7000));
  TEST_ASSERT_FALSE(p.update(true, 11999));
  TEST_ASSERT_TRUE(p.update(true, 12000));
}

void run_timing_tests() {
  RUN_TEST(test_debouncer_ignores_short_blip);
  RUN_TEST(test_debouncer_accepts_stable_change);
  RUN_TEST(test_presence_hold_boundaries);
  RUN_TEST(test_presence_hold_set_hold_changes_expiry);
  RUN_TEST(test_longpress_fires_once_then_rearms_on_release);
}
