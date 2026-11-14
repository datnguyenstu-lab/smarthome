#include <unity.h>
#include <cmath>
#include <cstring>
#include "alerts.h"
using namespace logic;

#define ASSERT_ALERT(expected, actual) TEST_ASSERT_EQUAL_INT((int)(expected), (int)(actual))

static void test_tempValid_rejects_faults() {
  TEST_ASSERT_FALSE(tempValid(-127.0f));
  TEST_ASSERT_FALSE(tempValid(85.0f));
  TEST_ASSERT_FALSE(tempValid(NAN));
}
static void test_tempValid_accepts_real_readings() {
  TEST_ASSERT_TRUE(tempValid(33.3f));
  TEST_ASSERT_TRUE(tempValid(-5.0f));
}
static void test_hot_starts_at_35() {
  ASSERT_ALERT(Alert::Hot, evalAlert(35.0f, false, false, Alert::None));
  ASSERT_ALERT(Alert::None, evalAlert(34.9f, false, false, Alert::None));
}
static void test_hot_hysteresis() {
  ASSERT_ALERT(Alert::Hot, evalAlert(34.5f, false, false, Alert::Hot));
  ASSERT_ALERT(Alert::None, evalAlert(34.5f, false, false, Alert::None));
  ASSERT_ALERT(Alert::None, evalAlert(33.9f, false, false, Alert::Hot));
}
static void test_faulty_reading_is_fault_never_hot() {
  ASSERT_ALERT(Alert::TempFault, evalAlert(85.0f, false, false, Alert::None));
  ASSERT_ALERT(Alert::TempFault, evalAlert(-127.0f, false, false, Alert::Hot));
}
static void test_intruder_needs_away_and_presence() {
  ASSERT_ALERT(Alert::Intruder, evalAlert(20.0f, true, true, Alert::None));
  ASSERT_ALERT(Alert::None, evalAlert(20.0f, false, true, Alert::Intruder));
  ASSERT_ALERT(Alert::None, evalAlert(20.0f, true, false, Alert::Intruder));
}
static void test_priority_intruder_over_fault_over_hot() {
  ASSERT_ALERT(Alert::Intruder, evalAlert(-127.0f, true, true, Alert::None));
  ASSERT_ALERT(Alert::Intruder, evalAlert(40.0f, true, true, Alert::None));
}
static void test_hot_threshold_parameter_moves_on_and_off_points() {
  ASSERT_ALERT(Alert::None, evalAlert(39.9f, false, false, Alert::None, 40.0f));
  ASSERT_ALERT(Alert::Hot, evalAlert(40.0f, false, false, Alert::None, 40.0f));
  ASSERT_ALERT(Alert::Hot, evalAlert(39.5f, false, false, Alert::Hot, 40.0f));
  ASSERT_ALERT(Alert::None, evalAlert(38.9f, false, false, Alert::Hot, 40.0f));
}
static void test_alert_names() {
  TEST_ASSERT_EQUAL_STRING("none", alertName(Alert::None));
  TEST_ASSERT_EQUAL_STRING("hot", alertName(Alert::Hot));
  TEST_ASSERT_EQUAL_STRING("intruder", alertName(Alert::Intruder));
  TEST_ASSERT_EQUAL_STRING("temp_fault", alertName(Alert::TempFault));
}

void run_alerts_tests() {
  RUN_TEST(test_tempValid_rejects_faults);
  RUN_TEST(test_tempValid_accepts_real_readings);
  RUN_TEST(test_hot_starts_at_35);
  RUN_TEST(test_hot_hysteresis);
  RUN_TEST(test_faulty_reading_is_fault_never_hot);
  RUN_TEST(test_intruder_needs_away_and_presence);
  RUN_TEST(test_priority_intruder_over_fault_over_hot);
  RUN_TEST(test_hot_threshold_parameter_moves_on_and_off_points);
  RUN_TEST(test_alert_names);
}
