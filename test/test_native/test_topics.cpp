#include <unity.h>
#include <cstring>
#include "topics.h"
using namespace logic;

static void test_parseOnOff_accepts_exact_lowercase() {
  bool on = false;
  TEST_ASSERT_TRUE(parseOnOff("on", 2, on));
  TEST_ASSERT_TRUE(on);
  TEST_ASSERT_TRUE(parseOnOff("off", 3, on));
  TEST_ASSERT_FALSE(on);
}
static void test_parseOnOff_rejects_garbage_and_leaves_value() {
  bool on = true;
  TEST_ASSERT_FALSE(parseOnOff("ON", 2, on));
  TEST_ASSERT_FALSE(parseOnOff("1", 1, on));
  TEST_ASSERT_FALSE(parseOnOff("", 0, on));
  TEST_ASSERT_FALSE(parseOnOff("on ", 3, on));
  TEST_ASSERT_FALSE(parseOnOff("onx", 3, on));
  char big[200];
  memset(big, 'o', sizeof(big));
  TEST_ASSERT_FALSE(parseOnOff(big, sizeof(big), on));
  TEST_ASSERT_TRUE(on);  // unchanged on failure
}
static void test_ledFromCmdTopic() {
  TEST_ASSERT_EQUAL_INT(1, ledFromCmdTopic("smarthome/cmd/led1"));
  TEST_ASSERT_EQUAL_INT(3, ledFromCmdTopic("smarthome/cmd/led3"));
  TEST_ASSERT_EQUAL_INT(0, ledFromCmdTopic("smarthome/cmd/led9"));
  TEST_ASSERT_EQUAL_INT(0, ledFromCmdTopic("smarthome/cmd/led0"));
  TEST_ASSERT_EQUAL_INT(0, ledFromCmdTopic("smarthome/cmd/led"));
  TEST_ASSERT_EQUAL_INT(0, ledFromCmdTopic("smarthome/cmd/led12"));
  TEST_ASSERT_EQUAL_INT(0, ledFromCmdTopic("smarthome/cmd/away"));
  TEST_ASSERT_EQUAL_INT(0, ledFromCmdTopic(""));
}
static void test_ledStateTopic() {
  TEST_ASSERT_EQUAL_STRING("smarthome/state/led1", ledStateTopic(1));
  TEST_ASSERT_EQUAL_STRING("smarthome/state/led3", ledStateTopic(3));
  TEST_ASSERT_NULL(ledStateTopic(0));
  TEST_ASSERT_NULL(ledStateTopic(4));
}

void run_topics_tests() {
  RUN_TEST(test_parseOnOff_accepts_exact_lowercase);
  RUN_TEST(test_parseOnOff_rejects_garbage_and_leaves_value);
  RUN_TEST(test_ledFromCmdTopic);
  RUN_TEST(test_ledStateTopic);
}
