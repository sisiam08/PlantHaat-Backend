$backend = "E:\Development\Projects\PlantHaat\backend"
$health = "http://localhost:5000/api/v1/health"
try {
  $response = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -eq 200) { Write-Output "API already healthy"; exit 0 }
} catch {}
$dir = Join-Path $env:TEMP "opencode"
$empty = Join-Path $dir "ph-empty-stdin.txt"
New-Item -ItemType Directory -Force $dir | Out-Null
if (-not (Test-Path $empty)) { New-Item -ItemType File -Path $empty | Out-Null }
Start-Process -FilePath node `
  -ArgumentList "scripts/serve-supervised.mjs" `
  -WorkingDirectory $backend `
  -RedirectStandardInput $empty `
  -RedirectStandardOutput (Join-Path $dir "ph-api-supervisor.log") `
  -RedirectStandardError (Join-Path $dir "ph-api-supervisor.err.log") `
  -WindowStyle Hidden
Write-Output "Started supervised API"
