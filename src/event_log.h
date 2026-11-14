#pragma once
#include <cstdint>

// Event log kept in the board's flash: plain-text lines in rotating files /log_<n>.txt (newest 3 kept),
// pulled by the web page through smarthome/cmd/log in small chunks. Logging never blocks the rest of the
// board: if the flash is full or a write fails, lines are dropped.
namespace eventLog {
void begin();                                             // mounts the file system, finds the newest file
void add(const char* code, const char* detail);           // one event line (RAM first, flushed in batches)
void flush();                                             // write buffered lines now (before a restart)
void tick(uint32_t nowMs);                                // batched flush and chunk streaming; call every loop
void handleCommand(const char* payload, unsigned len);    // {"list":1} or {"get":<seq>,"offset":<bytes>}
}  // namespace eventLog
