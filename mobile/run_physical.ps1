# Physical Android device — reads mobile/.env (same Supabase as web + server).
# Prereqs: phone on same Wi-Fi/hotspot as PC, API server running on port 3001.

if ($env:USPO_RUN_PHYSICAL_BYPASS -ne '1') {
    $env:USPO_RUN_PHYSICAL_BYPASS = '1'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @args
    exit $LASTEXITCODE
}

Set-Location $PSScriptRoot
. .\scripts\dart_defines.ps1

# Ensure flutter is on PATH (copied to C:\flutter to avoid spaces in username path)
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    $env:PATH = "C:\flutter\bin;" + $env:PATH
}

$defines = Get-MobileDartDefines -EnvPath ".env"

function Get-PhysicalAndroidDevice {
    $json = flutter devices --machine 2>$null | ConvertFrom-Json
    return @($json | Where-Object {
        $_.emulator -eq $false -and $_.targetPlatform -match '^android'
    })
}

$physical = Get-PhysicalAndroidDevice
if ($physical.Count -eq 0) {
    Write-Host "Waiting up to 90s for a physical phone (USB debugging)..."
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline -and $physical.Count -eq 0) {
        Start-Sleep -Seconds 3
        $physical = Get-PhysicalAndroidDevice
        adb devices 2>$null | Select-Object -Skip 1 | ForEach-Object { Write-Host "  $_" }
    }
}
if ($physical.Count -eq 0) {
    Write-Host ""
    Write-Host "No physical Android phone detected." -ForegroundColor Red
    Write-Host "  1. Connect the phone with USB and enable USB debugging"
    Write-Host "  2. Accept the 'Allow USB debugging' prompt on the phone"
    Write-Host "  3. Run: adb devices   (should show your device as 'device', not 'offline')"
    Write-Host "  4. Re-run: .\run_physical.ps1"
    Write-Host ""
    exit 1
}

$deviceId = $physical[0].id
$deviceName = $physical[0].name
Write-Host "Physical device: $deviceName ($deviceId)"
Write-Host "Launching with SUPABASE_URL from .env and API_URL for physical device..."
flutter run -d $deviceId @defines
