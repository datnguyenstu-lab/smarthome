# Builds prebuilt demo firmware images into demo\firmware-<version>.bin so a demo needs no compile wait.
#   powershell -File tools\build_demo.ps1                      (builds 2.0.0 and 2.1.0-demo)
#   powershell -File tools\build_demo.ps1 -Versions 2.0.0,2.2.0
# The images contain include\secrets.h as it is now (broker login, OTA password): keep demo\ out of git.
param([string[]]$Versions = @('2.0.0', '2.1.0-demo'))
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$pio = (Get-Command pio -ErrorAction SilentlyContinue).Source
if (-not $pio) { $pio = "$env:LOCALAPPDATA\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\Scripts\pio.exe" }
New-Item -ItemType Directory -Force demo | Out-Null
foreach ($v in $Versions) {
  Write-Host "Building $v ..."
  $env:PLATFORMIO_BUILD_FLAGS = '-DFW_VERSION=\"' + $v + '\"'
  & $pio run -e nodemcuv2 | Out-Null
  if ($LASTEXITCODE -ne 0) { Remove-Item Env:PLATFORMIO_BUILD_FLAGS; throw "build failed for $v" }
  Copy-Item .pio\build\nodemcuv2\firmware.bin "demo\firmware-$v.bin" -Force
  Write-Host ("  demo\firmware-{0}.bin ({1:N0} bytes)" -f $v, (Get-Item "demo\firmware-$v.bin").Length)
}
Remove-Item Env:PLATFORMIO_BUILD_FLAGS -ErrorAction SilentlyContinue
