param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$archiveRoot = Split-Path -Parent $PSScriptRoot
$archivePort = if ($env:PAPER_ARCHIVE_PORT) { $env:PAPER_ARCHIVE_PORT } else { '4317' }
if ($archivePort -notmatch '^[1-9][0-9]{0,4}$' -or [int]$archivePort -gt 65535) {
    throw 'PAPER_ARCHIVE_PORT must be between 1 and 65535.'
}
$archiveUrl = "http://127.0.0.1:${archivePort}/"
$archiveData = Join-Path $archiveRoot '.local-data'
$hash = [System.Security.Cryptography.SHA256]::Create()
try {
    $instance = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($archiveRoot.ToLowerInvariant()))).Replace('-', '').ToLowerInvariant()
} finally { $hash.Dispose() }

function Test-ArchiveHealth {
    try {
        $health = Invoke-RestMethod -Uri ($archiveUrl + 'api/health') -TimeoutSec 2
        return $health.app -eq 'paper-archive-local' -and $health.instance -eq $instance
    } catch {
        return $false
    }
}

if (-not (Test-ArchiveHealth)) {
    if (Get-NetTCPConnection -LocalPort ([int]$archivePort) -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $archivePort is already occupied. Set PAPER_ARCHIVE_PORT to another port."
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $archiveRoot 'dist-local\index.html'))) {
        Push-Location -LiteralPath $archiveRoot
        try {
            if (-not (Test-Path -LiteralPath (Join-Path $archiveRoot 'node_modules\vite\package.json'))) {
                npm.cmd ci
                if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
            }
            npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Local build failed.' }
        } finally { Pop-Location }
    }

    New-Item -ItemType Directory -Force -Path $archiveData | Out-Null
    $process = Start-Process -FilePath $node -ArgumentList '--disable-warning=ExperimentalWarning', 'local/server.mjs' `
        -WorkingDirectory $archiveRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $archiveData 'server.log') `
        -RedirectStandardError (Join-Path $archiveData 'server-error.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 25 -and -not $process.HasExited; $attempt++) {
        if (Test-ArchiveHealth) { $ready = $true; break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) {
        throw 'The local server did not start. Check .local-data\server-error.log.'
    }
}

Write-Output $archiveUrl
if (-not $NoBrowser) { Start-Process $archiveUrl }
