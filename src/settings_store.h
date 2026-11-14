#pragma once
#include "settings.h"

namespace settingsStore {
logic::Settings load();                       // defaults when the file is missing or corrupt
bool save(const logic::Settings& s);          // true when written
}  // namespace settingsStore
