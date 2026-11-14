#pragma once
#include <cstddef>
#include <cstdint>
namespace logic {

enum class LogLevel { Info, Warn, Error };

// One log line: "<time> <LEVEL> <component> <message>" ending in a single newline, for example
//   2026-11-14T11:48:13Z INFO  boot     reset=power fw=2.0.0
//   2026-11-14T11:48:20Z WARN  wifi     connection lost
// The time is ISO 8601 UTC. While the clock is not set yet (epoch below 1700000000) it is the time since boot,
// "T+hh:mm:ss". LEVEL is padded to 5 characters and the component to 8. A newline or carriage return inside
// `message` becomes a space and the message is cut to fit. An empty or null message leaves no trailing space.
// Returns the length, or 0 when `cap` is under 48.
size_t formatLogLine(char* buf, size_t cap, uint32_t epoch, uint32_t uptimeS, LogLevel level, const char* component,
                     const char* message);

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
