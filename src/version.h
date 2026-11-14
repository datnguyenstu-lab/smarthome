#pragma once
// Firmware version shown on the Health page and in the log. A demo build overrides it:
//   PLATFORMIO_BUILD_FLAGS='-DFW_VERSION=\"2.1.0-demo\"' pio run -e nodemcuv2
#ifndef FW_VERSION
#define FW_VERSION "2.0.0"
#endif
