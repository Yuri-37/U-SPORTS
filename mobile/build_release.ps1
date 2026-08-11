# Build the production release APK.
#
# WHY THIS SCRIPT EXISTS
# ----------------------
# lib/config/env.dart reads SUPABASE_URL / SUPABASE_ANON_KEY / API_URL via
# String.fromEnvironment(), which are COMPILE-TIME values. A plain
# `flutter build apk --release` (no --dart-define) does not fail -- it compiles
# them to empty strings, main() then throws on its first line, and the Dart
# tree-shaker removes the whole app as unreachable. The result installs fine
# but crashes instantly, and the only visible symptom is a suspiciously small
# APK (libapp.so drops from ~7.4MB to ~2MB).
#
# That exact mistake shipped as v1.3.3-rc1. This script exists so the release
# build can only be produced with the defines present, and verifies the output
# before handing it to you.
#
# USAGE
#   .\build_release.ps1
#
# Reads values from .env.production.local (gitignored via the .env.*.local rule).
# Copy .env.production.local.example and fill it in if you don't have one.

param(
    [string]$EnvPath = ".env.production.local"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path $EnvPath)) {
    throw "Missing $EnvPath. Copy .env.production.local.example to $EnvPath and fill in the production values."
}

$map = @{}
Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or $line -eq '') { return }
    if ($line -match '^([^=]+)=(.*)$') { $map[$matches[1].Trim()] = $matches[2].Trim() }
}

$required = @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_URL')
$missing = $required | Where-Object { -not $map.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($map[$_]) }
if ($missing.Count -gt 0) {
    throw "Missing in ${EnvPath}: $($missing -join ', ')"
}

# A localhost/LAN address here would produce an APK that only works on your
# desk -- release builds must point at the deployed services.
foreach ($key in @('SUPABASE_URL', 'API_URL')) {
    if ($map[$key] -match '127\.0\.0\.1|localhost|10\.0\.2\.2|192\.168\.') {
        throw "$key looks like a local address ($($map[$key])). A release APK needs the deployed URL."
    }
}

Write-Host "SUPABASE_URL = $($map['SUPABASE_URL'])"
Write-Host "API_URL      = $($map['API_URL'])"
Write-Host "ANON_KEY     = $($map['SUPABASE_ANON_KEY'].Substring(0, 12))... ($($map['SUPABASE_ANON_KEY'].Length) chars)"
Write-Host ""

$defines = $required | ForEach-Object { "--dart-define=$_=$($map[$_])" }

flutter build apk --release @defines
if ($LASTEXITCODE -ne 0) { throw "flutter build apk failed with exit code $LASTEXITCODE" }

$apk = "build\app\outputs\flutter-apk\app-release.apk"
if (-not (Test-Path $apk)) { throw "Build reported success but $apk is missing." }

# Verification: a stub build (defines missing / app tree-shaken away) yields a
# libapp.so around 2MB with none of the app's own strings. Check the real thing
# is in there rather than trusting the exit code.
$sizeMB = [math]::Round((Get-Item $apk).Length / 1MB, 1)

# Windows PowerShell 5.1 does not load this assembly by default -- without it,
# [System.IO.Compression.ZipFile] fails to resolve and the check below throws
# immediately after an otherwise successful build.
Add-Type -AssemblyName System.IO.Compression.FileSystem

$libappBytes = 0
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $apk).Path)
try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'lib/arm64-v8a/libapp.so' }
    if (-not $entry) { throw "libapp.so (arm64-v8a) missing from the APK." }
    $libappBytes = $entry.Length
} finally {
    $zip.Dispose()
}
$libappMB = [math]::Round($libappBytes / 1MB, 1)

Write-Host ""
Write-Host "APK        : $sizeMB MB"
Write-Host "libapp.so  : $libappMB MB (arm64-v8a)"

if ($libappBytes -lt 4MB) {
    throw "libapp.so is only $libappMB MB -- the app code was tree-shaken away, meaning the --dart-define values did not reach the compiler. This APK would install but crash on launch. Do not ship it."
}

$out = "build\app\outputs\flutter-apk\U-Sports.apk"
Copy-Item $apk $out -Force
Write-Host ""
Write-Host "OK -> $out" -ForegroundColor Green
