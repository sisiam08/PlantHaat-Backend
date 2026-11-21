param(
  [switch]$KeepAssets
)

# Verifies the Part 3 payment-proof upload through Cloudinary in the isolated
# test folder. Never touches the dev database or the dev Cloudinary folder.
# Reads secrets from backend/.env and writes them only into the temporary
# .env.test copy (restored in finally). Never prints secret values.

$backend = "E:\Development\Projects\PlantHaat\backend"
$testEnv = Join-Path $backend ".env.test"
$backup = Join-Path $env:TEMP "opencode/env.test.proof.backup"
$prefix = "planthaat/teststack"

Set-Location $backend
if (-not (Test-Path $testEnv)) { throw "backend/.env.test is missing" }
$testUrl = (Get-Content $testEnv | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
if ($testUrl -notmatch 'test') { throw "Refusing: .env.test DATABASE_URL does not look like a test database" }

$dev = @{}
foreach ($line in Get-Content ".env") {
  if ($line -match '^(CLOUDINARY_CLOUD_NAME|CLOUDINARY_API_KEY|CLOUDINARY_API_SECRET)=(.*)$') {
    $dev[$Matches[1]] = $Matches[2]
  }
}
foreach ($key in "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET") {
  if (-not $dev[$key]) { throw "Cloudinary credentials are missing in backend/.env" }
}

New-Item -ItemType Directory -Force (Split-Path $backup) | Out-Null
Copy-Item $testEnv $backup -Force
try {
  $lines = Get-Content $testEnv | Where-Object {
    $_ -notmatch '^(STORAGE_DRIVER|CLOUDINARY_CLOUD_NAME|CLOUDINARY_API_KEY|CLOUDINARY_API_SECRET|CLOUDINARY_FOLDER)='
  }
  $lines += "STORAGE_DRIVER=cloudinary"
  $lines += "CLOUDINARY_CLOUD_NAME=$($dev['CLOUDINARY_CLOUD_NAME'])"
  $lines += "CLOUDINARY_API_KEY=$($dev['CLOUDINARY_API_KEY'])"
  $lines += "CLOUDINARY_API_SECRET=$($dev['CLOUDINARY_API_SECRET'])"
  $lines += "CLOUDINARY_FOLDER=$prefix"
  Set-Content -Path $testEnv -Value $lines -Encoding UTF8

  npm.cmd run test:e2e -- --runTestsByPath test/advance-payments.e2e-spec.ts -t "accepts only payment proofs"
  if ($LASTEXITCODE -ne 0) { throw "proof upload test failed" }
}
finally {
  Copy-Item $backup $testEnv -Force
}

if (-not $KeepAssets) {
  @'
import { readFileSync } from "node:fs";
import { v2 as cloudinary } from "cloudinary";
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});
const result = await cloudinary.api.delete_resources_by_prefix("planthaat/teststack/");
console.log("test-prefix assets deleted:", Object.keys(result.deleted ?? {}).length);
'@ | Set-Content "tmp-clean-proof-assets.mjs"
  try { node tmp-clean-proof-assets.mjs } finally { Remove-Item "tmp-clean-proof-assets.mjs" -Force -ErrorAction SilentlyContinue }
}
Write-Output "Proof upload verified through the Cloudinary test prefix; .env.test restored."