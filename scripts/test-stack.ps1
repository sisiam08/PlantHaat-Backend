param(
  [ValidateSet("start", "stop", "status", "seed")]
  [string]$Action = "status"
)

$backend = "E:\Development\Projects\PlantHaat\backend"
$frontend = "E:\Development\Projects\PlantHaat\frontend"
$logDir = Join-Path $env:TEMP "opencode"
New-Item -ItemType Directory -Force $logDir | Out-Null
$empty = Join-Path $logDir "ph-empty-stdin.txt"
if (-not (Test-Path $empty)) { New-Item -ItemType File -Path $empty | Out-Null }

function Stop-Port([int]$port) {
  $conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
  foreach ($conn in $conns) {
    try { taskkill /PID $conn.OwningProcess /T /F | Out-Null } catch {}
  }
}

function Wait-Health([string]$url, [int]$seconds = 90) {
  for ($i = 0; $i -lt $seconds; $i += 5) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Seconds 5
  }
  return $false
}

switch ($Action) {
  "seed" {
    Push-Location $backend
    try { & npm.cmd run db:seed:test-stack } finally { Pop-Location }
  }
  "start" {
    # Production builds first: the specs must not wait on compile-on-demand.
    Push-Location $backend
    try {
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) { Write-Output "Backend build failed"; exit 1 }
      & npm.cmd run db:seed:test-stack
      if ($LASTEXITCODE -ne 0) { Write-Output "Test seed failed"; exit 1 }
    } finally { Pop-Location }
    Push-Location $frontend
    try {
      & node scripts/run-test-frontend.mjs build
      if ($LASTEXITCODE -ne 0) { Write-Output "Frontend build failed"; exit 1 }
    } finally { Pop-Location }

    Stop-Port 5001
    Stop-Port 3002
    Start-Sleep -Seconds 2
    Start-Process -FilePath node -ArgumentList "--import", "tsx", "scripts/run-test-api.mjs" -WorkingDirectory $backend `
      -RedirectStandardInput $empty -RedirectStandardOutput (Join-Path $logDir "ph-test-api.log") `
      -RedirectStandardError (Join-Path $logDir "ph-test-api.err.log") -WindowStyle Hidden
    if (-not (Wait-Health "http://127.0.0.1:5001/api/v1/health" 120)) {
      Write-Output "Test API did not become healthy; see ph-test-api.err.log"
      exit 1
    }
    Start-Process -FilePath node -ArgumentList "scripts/run-test-frontend.mjs", "start" -WorkingDirectory $frontend `
      -RedirectStandardInput $empty -RedirectStandardOutput (Join-Path $logDir "ph-test-web.log") `
      -RedirectStandardError (Join-Path $logDir "ph-test-web.err.log") -WindowStyle Hidden
    for ($i = 0; $i -lt 24; $i += 2) {
      try {
        $response = Invoke-WebRequest -Uri "http://localhost:3002/" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) { Write-Output "Test stack ready: API :5001, production frontend :3002."; exit 0 }
      } catch {}
      Start-Sleep -Seconds 2
    }
    Write-Output "Test frontend did not become healthy; see ph-test-web.err.log"
    exit 1
  }
  "stop" {
    Stop-Port 5001
    Stop-Port 3002
    Write-Output "Test stack stopped (:5001, :3002)."
  }
  "status" {
    foreach ($port in 5001, 3002) {
      $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port } | Select-Object -First 1
      if ($conn) { Write-Output "$port listening pid=$($conn.OwningProcess)" } else { Write-Output "$port down" }
    }
  }
}
