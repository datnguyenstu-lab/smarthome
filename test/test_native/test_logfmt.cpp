#include <unity.h>
#include <cstring>
#include "logfmt.h"
using namespace logic;

// Line format: "<time> <LEVEL> <component> <message>\n"; time is ISO 8601 UTC, or T+hh:mm:ss since boot
// while the clock is not set. LEVEL is padded to 5 and the component to 8 characters.

static void test_line_has_iso_utc_time_level_component_and_message() {
  char b[120];
  size_t n = formatLogLine(b, sizeof(b), 1794656893, 5, LogLevel::Info, "boot", "reset=power fw=2.0.0");
  TEST_ASSERT_EQUAL_STRING("2026-11-14T11:48:13Z INFO  boot     reset=power fw=2.0.0\n", b);
  TEST_ASSERT_EQUAL_UINT32(strlen(b), n);
}
static void test_levels_are_padded_to_five() {
  char b[120];
  formatLogLine(b, sizeof(b), 1794656893, 0, LogLevel::Warn, "wifi", "connection lost");
  TEST_ASSERT_EQUAL_STRING("2026-11-14T11:48:13Z WARN  wifi     connection lost\n", b);
  formatLogLine(b, sizeof(b), 1794656893, 0, LogLevel::Error, "ota", "update failed code=4");
  TEST_ASSERT_EQUAL_STRING("2026-11-14T11:48:13Z ERROR ota      update failed code=4\n", b);
}
static void test_iso_time_edges() {
  char b[120];
  formatLogLine(b, sizeof(b), 1700000000, 0, LogLevel::Info, "x", "y");
  TEST_ASSERT_EQUAL_STRING_LEN("2023-11-14T22:13:20Z", b, 20);
  formatLogLine(b, sizeof(b), 1709164800, 0, LogLevel::Info, "x", "y");   // leap day
  TEST_ASSERT_EQUAL_STRING_LEN("2024-02-29T00:00:00Z", b, 20);
  formatLogLine(b, sizeof(b), 1735689599, 0, LogLevel::Info, "x", "y");   // last second of a year
  TEST_ASSERT_EQUAL_STRING_LEN("2024-12-31T23:59:59Z", b, 20);
  formatLogLine(b, sizeof(b), 1735689600, 0, LogLevel::Info, "x", "y");
  TEST_ASSERT_EQUAL_STRING_LEN("2025-01-01T00:00:00Z", b, 20);
}
static void test_uptime_form_before_the_clock_is_set() {
  char b[120];
  formatLogLine(b, sizeof(b), 0, 7, LogLevel::Info, "wifi", "connected");
  TEST_ASSERT_EQUAL_STRING("T+00:00:07 INFO  wifi     connected\n", b);
  formatLogLine(b, sizeof(b), 0, 3725, LogLevel::Info, "wifi", "connected");   // 1 h 2 min 5 s
  TEST_ASSERT_EQUAL_STRING_LEN("T+01:02:05 ", b, 11);
  formatLogLine(b, sizeof(b), 1699999999, 12, LogLevel::Info, "wifi", "connected");   // below the clock threshold
  TEST_ASSERT_EQUAL_STRING_LEN("T+00:00:12 ", b, 11);
  formatLogLine(b, sizeof(b), 0, 360000, LogLevel::Info, "wifi", "connected");   // 100 hours: grows, never wraps
  TEST_ASSERT_EQUAL_STRING_LEN("T+100:00:00 ", b, 12);
}
static void test_line_empty_detail_has_no_trailing_space() {
  char b[120];
  formatLogLine(b, sizeof(b), 1794656893, 0, LogLevel::Info, "selftest", "");
  TEST_ASSERT_EQUAL_STRING("2026-11-14T11:48:13Z INFO  selftest\n", b);
  formatLogLine(b, sizeof(b), 1794656893, 0, LogLevel::Info, "door", nullptr);
  TEST_ASSERT_EQUAL_STRING("2026-11-14T11:48:13Z INFO  door\n", b);
}
static void test_line_newlines_in_detail_become_spaces() {
  char b[120];
  formatLogLine(b, sizeof(b), 0, 1, LogLevel::Info, "x", "a\nb\r\nc");
  TEST_ASSERT_EQUAL_STRING("T+00:00:01 INFO  x        a b  c\n", b);
}
static void test_line_long_detail_is_cut_and_still_ends_with_newline() {
  char b[64];
  const char* longd = "0123456789012345678901234567890123456789012345678901234567890123456789";
  size_t n = formatLogLine(b, sizeof(b), 0, 1, LogLevel::Info, "code", longd);
  TEST_ASSERT_EQUAL_UINT32(strlen(b), n);
  TEST_ASSERT_TRUE(n <= 63);
  TEST_ASSERT_EQUAL_CHAR('\n', b[n - 1]);
  TEST_ASSERT_NULL(memchr(b, '\n', n - 1));  // exactly one newline, at the end
}
static void test_line_returns_zero_when_buffer_tiny() {
  char b[30];
  TEST_ASSERT_EQUAL_UINT32(0, formatLogLine(b, sizeof(b), 0, 1, LogLevel::Info, "boot", "x"));
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
  RUN_TEST(test_line_has_iso_utc_time_level_component_and_message);
  RUN_TEST(test_levels_are_padded_to_five);
  RUN_TEST(test_iso_time_edges);
  RUN_TEST(test_uptime_form_before_the_clock_is_set);
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
