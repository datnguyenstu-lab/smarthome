#include <unity.h>
#include <cstring>
#include "logfmt.h"
using namespace logic;

static void test_line_uses_epoch_when_clock_is_set() {
  char b[100];
  size_t n = formatLogLine(b, sizeof(b), 1794656893, 5, "boot", "reset=power fw=2.0.0");
  TEST_ASSERT_EQUAL_STRING("1794656893 boot reset=power fw=2.0.0\n", b);
  TEST_ASSERT_EQUAL_UINT32(strlen(b), n);
}
static void test_line_uses_uptime_before_clock() {
  char b[100];
  formatLogLine(b, sizeof(b), 0, 7, "wifi", "up");
  TEST_ASSERT_EQUAL_STRING("+7 wifi up\n", b);
  formatLogLine(b, sizeof(b), 1699999999, 12, "wifi", "up");  // still before the clock threshold
  TEST_ASSERT_EQUAL_STRING("+12 wifi up\n", b);
}
static void test_line_empty_detail_has_no_trailing_space() {
  char b[100];
  formatLogLine(b, sizeof(b), 1794656893, 0, "selftest", "");
  TEST_ASSERT_EQUAL_STRING("1794656893 selftest\n", b);
  formatLogLine(b, sizeof(b), 1794656893, 0, "selftest", nullptr);
  TEST_ASSERT_EQUAL_STRING("1794656893 selftest\n", b);
}
static void test_line_newlines_in_detail_become_spaces() {
  char b[100];
  formatLogLine(b, sizeof(b), 0, 1, "x", "a\nb\r\nc");
  TEST_ASSERT_EQUAL_STRING("+1 x a b  c\n", b);
}
static void test_line_long_detail_is_cut_and_still_ends_with_newline() {
  char b[40];
  const char* longd = "0123456789012345678901234567890123456789012345678901234567890123456789";
  size_t n = formatLogLine(b, sizeof(b), 0, 1, "code", longd);
  TEST_ASSERT_EQUAL_UINT32(strlen(b), n);
  TEST_ASSERT_TRUE(n <= 39);
  TEST_ASSERT_EQUAL_CHAR('\n', b[n - 1]);
  TEST_ASSERT_NULL(memchr(b, '\n', n - 1));  // exactly one newline, at the end
}
static void test_line_returns_zero_when_buffer_tiny() {
  char b[10];
  TEST_ASSERT_EQUAL_UINT32(0, formatLogLine(b, sizeof(b), 0, 1, "boot", "x"));
}

static void test_rotate_when_next_line_would_exceed() {
  LogRotation r{100, 3};
  TEST_ASSERT_FALSE(r.needRotate(50, 50));
  TEST_ASSERT_TRUE(r.needRotate(50, 51));
}
static void test_no_rotate_on_empty_file_even_if_line_is_big() {
  LogRotation r{100, 3};
  TEST_ASSERT_FALSE(r.needRotate(0, 500));
}
static void test_delete_seq_is_new_minus_keep() {
  LogRotation r{100, 3};
  uint32_t out = 0;
  TEST_ASSERT_TRUE(r.seqToDelete(4, out));
  TEST_ASSERT_EQUAL_UINT32(1, out);
  TEST_ASSERT_TRUE(r.seqToDelete(10, out));
  TEST_ASSERT_EQUAL_UINT32(7, out);
}
static void test_no_delete_while_fewer_than_keep() {
  LogRotation r{100, 3};
  uint32_t out = 99;
  TEST_ASSERT_FALSE(r.seqToDelete(3, out));
  TEST_ASSERT_FALSE(r.seqToDelete(1, out));
  TEST_ASSERT_EQUAL_UINT32(99, out);
}

static void test_trim_drops_partial_last_line() {
  const char* s = "aaa\nbbb\ncc";
  TEST_ASSERT_EQUAL_UINT32(8, trimToLastLine(s, strlen(s)));
}
static void test_trim_keeps_complete_lines() {
  const char* s = "aaa\nbbb\n";
  TEST_ASSERT_EQUAL_UINT32(8, trimToLastLine(s, strlen(s)));
}
static void test_trim_no_newline_is_zero() {
  TEST_ASSERT_EQUAL_UINT32(0, trimToLastLine("abc", 3));
  TEST_ASSERT_EQUAL_UINT32(0, trimToLastLine("", 0));
}

static void test_chunk_header_exact_string() {
  char b[40];
  size_t n = formatChunkHeader(b, sizeof(b), 3, 768, 65000);
  TEST_ASSERT_EQUAL_STRING("3:768:65000\n", b);
  TEST_ASSERT_EQUAL_UINT32(12, n);
  TEST_ASSERT_EQUAL_UINT32(0, formatChunkHeader(b, 5, 3, 768, 65000));
}

void run_logfmt_tests() {
  RUN_TEST(test_line_uses_epoch_when_clock_is_set);
  RUN_TEST(test_line_uses_uptime_before_clock);
  RUN_TEST(test_line_empty_detail_has_no_trailing_space);
  RUN_TEST(test_line_newlines_in_detail_become_spaces);
  RUN_TEST(test_line_long_detail_is_cut_and_still_ends_with_newline);
  RUN_TEST(test_line_returns_zero_when_buffer_tiny);
  RUN_TEST(test_rotate_when_next_line_would_exceed);
  RUN_TEST(test_no_rotate_on_empty_file_even_if_line_is_big);
  RUN_TEST(test_delete_seq_is_new_minus_keep);
  RUN_TEST(test_no_delete_while_fewer_than_keep);
  RUN_TEST(test_trim_drops_partial_last_line);
  RUN_TEST(test_trim_keeps_complete_lines);
  RUN_TEST(test_trim_no_newline_is_zero);
  RUN_TEST(test_chunk_header_exact_string);
}
