#include <unity.h>
#include <cmath>
#include <cstring>
#include "alerts.h"
using namespace logic;

#define ASSERT_ALERT(expected, actual) TEST_ASSERT_EQUAL_INT((int)(expected), (int)(actual))

// evalAlert(tempC, away, doorOpen, doorOpenMs, prev, hotOnC = 33, doorGraceMs = 10000)

static void test_tempValid_rejects_faults() {
  TEST_ASSERT_FALSE(tempValid(-127.0f));
  TEST_ASSERT_FALSE(tempValid(85.0f));
  TEST_ASSERT_FALSE(tempValid(NAN));
}
static void test_tempValid_accepts_real_readings() {
  TEST_ASSERT_TRUE(tempValid(33.3f));
  TEST_ASSERT_TRUE(tempValid(-5.0f));
  TEST_ASSERT_TRUE(tempValid(-18.0f));   // a freezer is a normal reading
}
static void test_warm_starts_at_33() {
  ASSERT_ALERT(Alert::Hot, evalAlert(33.0f, false, false, 0, Alert::None));
  ASSERT_ALERT(Alert::None, evalAlert(32.9f, false, false, 0, Alert::None));
}
static void test_warm_hysteresis() {
  ASSERT_ALERT(Alert::Hot, evalAlert(32.5f, false, false, 0, Alert::Hot));
  ASSERT_ALERT(Alert::None, evalAlert(32.5f, false, false, 0, Alert::None));
  ASSERT_ALERT(Alert::None, evalAlert(31.9f, false, false, 0, Alert::Hot));
}
static void test_threshold_parameter_moves_on_and_off_points_including_below_zero() {
  ASSERT_ALERT(Alert::None, evalAlert(-15.1f, false, false, 0, Alert::None, -15.0f));
  ASSERT_ALERT(Alert::Hot, evalAlert(-15.0f, false, false, 0, Alert::None, -15.0f));
  ASSERT_ALERT(Alert::Hot, evalAlert(-15.9f, false, false, 0, Alert::Hot, -15.0f));
  ASSERT_ALERT(Alert::None, evalAlert(-16.1f, false, false, 0, Alert::Hot, -15.0f));
}
static void test_faulty_reading_is_fault_never_warm() {
  ASSERT_ALERT(Alert::TempFault, evalAlert(85.0f, false, false, 0, Alert::None));
  ASSERT_ALERT(Alert::TempFault, evalAlert(-127.0f, false, false, 0, Alert::Hot));
}
static void test_door_open_under_grace_is_no_alert() {
  ASSERT_ALERT(Alert::None, evalAlert(5.0f, false, true, 9999, Alert::None));
}
static void test_door_open_at_grace_raises_door_open() {
  ASSERT_ALERT(Alert::DoorOpen, evalAlert(5.0f, false, true, 10000, Alert::None));
  ASSERT_ALERT(Alert::DoorOpen, evalAlert(5.0f, false, true, 600000, Alert::DoorOpen));
}
static void test_grace_zero_means_at_once() {
  ASSERT_ALERT(Alert::DoorOpen, evalAlert(5.0f, false, true, 0, Alert::None, 33.0f, 0));
  ASSERT_ALERT(Alert::None, evalAlert(5.0f, false, true, 4999, Alert::None, 33.0f, 5000));
}
static void test_door_closed_clears_the_alert_whatever_the_old_open_time() {
  ASSERT_ALERT(Alert::None, evalAlert(5.0f, false, false, 600000, Alert::DoorOpen));
}
static void test_lock_up_mode_raises_intruder_at_once() {
  ASSERT_ALERT(Alert::Intruder, evalAlert(5.0f, true, true, 0, Alert::None));
  ASSERT_ALERT(Alert::None, evalAlert(5.0f, true, false, 0, Alert::Intruder));
  ASSERT_ALERT(Alert::None, evalAlert(5.0f, false, true, 0, Alert::Intruder));  // not locked up, still in grace
}
static void test_priority_intruder_over_door_over_fault_over_warm() {
  ASSERT_ALERT(Alert::Intruder, evalAlert(-127.0f, true, true, 99999, Alert::None));
  ASSERT_ALERT(Alert::DoorOpen, evalAlert(-127.0f, false, true, 99999, Alert::None));
  ASSERT_ALERT(Alert::DoorOpen, evalAlert(40.0f, false, true, 99999, Alert::None));
  ASSERT_ALERT(Alert::TempFault, evalAlert(85.0f, false, false, 0, Alert::None));
  ASSERT_ALERT(Alert::Hot, evalAlert(40.0f, false, false, 0, Alert::None));
}
static void test_alert_names() {
  TEST_ASSERT_EQUAL_STRING("none", alertName(Alert::None));
  TEST_ASSERT_EQUAL_STRING("hot", alertName(Alert::Hot));
  TEST_ASSERT_EQUAL_STRING("intruder", alertName(Alert::Intruder));
  TEST_ASSERT_EQUAL_STRING("temp_fault", alertName(Alert::TempFault));
  TEST_ASSERT_EQUAL_STRING("door_open", alertName(Alert::DoorOpen));
}

void run_alerts_tests() {
  RUN_TEST(test_tempValid_rejects_faults);
  RUN_TEST(test_tempValid_accepts_real_readings);
  RUN_TEST(test_warm_starts_at_33);
  RUN_TEST(test_warm_hysteresis);
  RUN_TEST(test_threshold_parameter_moves_on_and_off_points_including_below_zero);
  RUN_TEST(test_faulty_reading_is_fault_never_warm);
  RUN_TEST(test_door_open_under_grace_is_no_alert);
  RUN_TEST(test_door_open_at_grace_raises_door_open);
  RUN_TEST(test_grace_zero_means_at_once);
  RUN_TEST(test_door_closed_clears_the_alert_whatever_the_old_open_time);
  RUN_TEST(test_lock_up_mode_raises_intruder_at_once);
  RUN_TEST(test_priority_intruder_over_door_over_fault_over_warm);
  RUN_TEST(test_alert_names);
}
