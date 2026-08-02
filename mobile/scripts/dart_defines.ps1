# Parse mobile/.env into flutter --dart-define arguments.

function Get-MobileDartDefines {
    param(
        [string]$EnvPath = ".env",
        [string]$ApiUrlOverride = ""
    )

    $map = @{}
    if (Test-Path $EnvPath) {
        Get-Content $EnvPath | ForEach-Object {
            $line = $_.Trim()
            if ($line -match '^\s*#' -or $line -eq '') { return }
            if ($line -match '^([^=]+)=(.*)$') {
                $map[$matches[1].Trim()] = $matches[2].Trim()
            }
        }
    }

    if ($ApiUrlOverride) {
        $map['API_URL'] = $ApiUrlOverride
    }

    $required = @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_URL')
    $missing = $required | Where-Object { -not $map.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($map[$_]) }
    if ($missing.Count -gt 0) {
        throw "Missing in ${EnvPath}: $($missing -join ', '). Copy .env.example to .env and fill values."
    }

    # Phone/emulator cannot use 127.0.0.1 — map Supabase to the same reachable host as API_URL.
    if ($map['API_URL'] -match '^https?://([^:/]+)') {
        $apiHost = $matches[1]
        $supaLocal = $map['SUPABASE_URL'] -match '127\.0\.0\.1|localhost'
        if ($supaLocal -and $apiHost -eq '10.0.2.2') {
            $map['SUPABASE_URL'] = 'http://10.0.2.2:54321'
        } elseif ($supaLocal -and $apiHost -notmatch '127\.0\.0\.1|localhost') {
            $map['SUPABASE_URL'] = "http://${apiHost}:54321"
        }
    }

    Write-Host "SUPABASE_URL=$($map['SUPABASE_URL'])"
    Write-Host "API_URL=$($map['API_URL'])"

    $defines = @()
    foreach ($key in $required) {
        $val = $map[$key]
        $defines += "--dart-define=$key=$val"
    }
    return ,$defines
}
