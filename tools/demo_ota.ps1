# Sends a prebuilt demo image to the board over Wi-Fi (OTA), then prints the version the board reports.
#   powershell -File tools\demo_ota.ps1 -Version 2.1.0-demo
#   powershell -File tools\demo_ota.ps1 -Version 2.0.0        (back to the first image)
# The computer must be on the same network as the board. Uses OTA_PASS from include\secrets.h.
param([Parameter(Mandatory = $true)][string]$Version, [string]$Board = 'smarthome-node.local')
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$image = "demo\firmware-$Version.bin"
if (-not (Test-Path $image)) { throw "$image not found. Build it first: powershell -File tools\build_demo.ps1 -Versions $Version" }
$pass = (Select-String -Path include\secrets.h -Pattern 'OTA_PASS\s+"([^"]*)"').Matches[0].Groups[1].Value
$espota = "$env:USERPROFILE\.platformio\packages\framework-arduinoespressif8266\tools\espota.py"
if (-not (Test-Path $espota)) { throw "espota.py not found at $espota (build once with PlatformIO to install it)" }
Write-Host "Sending $image to $Board ..."
python $espota -i $Board -p 8266 "--auth=$pass" -f $image
if ($LASTEXITCODE -ne 0) { throw 'OTA upload failed (wrong password, or the board is not on this network)' }
Write-Host 'Uploaded. Waiting for the board to restart and report ...'
Start-Sleep 32
$line = python tools\watch.py 4 2>&1 | Select-String '"fw":"([^"]*)"' | Select-Object -First 1
if ($line) { Write-Host ("Board now reports firmware: " + $line.Matches[0].Groups[1].Value) } else { Write-Host 'No health message yet. Check the page in a few seconds.' }
