# Android emulator — hosted Supabase from .env, API via 10.0.2.2 (host machine).

Set-Location $PSScriptRoot
. .\scripts\dart_defines.ps1

$defines = Get-MobileDartDefines -EnvPath ".env" -ApiUrlOverride "http://10.0.2.2:3001/api"
Write-Host "Launching for Android emulator (API_URL=10.0.2.2:3001)..."
flutter run @defines
