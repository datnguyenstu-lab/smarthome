#pragma once
#include <cstddef>
#include <cstdint>
namespace logic {

// "<epoch> <code> <detail>\n", or "+<uptimeS> <code> <detail>\n" while the clock is not set yet
// (epoch below 1700000000). \r and \n inside `detail` become spaces; `detail` is cut to fit; an empty or
// null detail leaves no trailing space. Returns the length (the line always ends with one '\n'), or 0 when
// `cap` is under 24.
size_t formatLogLine(char* buf, size_t cap, uint32_t epoch, uint32_t uptimeS, const char* code, const char* detail);

// Start a new file when the next line would not fit (never on an empty file).
struct LogRotation {
  uint32_t maxBytes;
  int keep;
  bool needRotate(uint32_t currentBytes, uint32_t lineLen) const { return currentBytes > 0 && currentBytes + lineLen > maxBytes; }
  // The oldest file number to delete once file `newSeq` is started (false while there are not `keep` files yet).
  bool seqToDelete(uint32_t newSeq, uint32_t& out) const {
    if (keep <= 0 || newSeq <= (uint32_t)keep) return false;
    out = newSeq - (uint32_t)keep;
    return true;
  }
};

// Length up to and including the last '\n'; 0 when there is none (drops a half-written last line).
size_t trimToLastLine(const char* buf, size_t len);

// "<seq>:<offset>:<total>\n"; returns its length, or 0 when it does not fit in `cap`.
size_t formatChunkHeader(char* buf, size_t cap, uint32_t seq, uint32_t offset, uint32_t total);

}  // namespace logic
