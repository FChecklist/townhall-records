# Townhall deploy to Cloudflare Pages (+ D1 + cron worker). NOT RUN BY ANYONE WITHOUT THE OWNER'S GO (see docs/DEPLOY-NOTES.md).
# Method (same as the other products): gates first, deploy to the .pages.dev address, smoke test, then click-test the live site.
# Secrets never come from this repo: the Cloudflare token is read from C:\ct\ct\.env.local into the process only; app secrets are generated here and sent straight to Cloudflare, and the signing key is also written to a git-ignored file for the OFF-MACHINE backup the owner must make.
# Usage:  powershell -File scripts/deploy-pages.ps1 -Step check|d1|secrets|deploy|cron|smoke   (one step at a time; `check` changes nothing)
param([Parameter(Mandatory = $true)][ValidateSet("check", "d1", "secrets", "deploy", "cron", "smoke")][string]$Step, [string]$Project = "aoa-rwa", [string]$Branch = "main")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
foreach ($l in Get-Content 'C:\ct\ct\.env.local') { if ($l -match '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"'), 'Process') } }
$env:PATH = (Join-Path $env:USERPROFILE 'AppData\Roaming\npm\node_modules\bun\node_modules\@oven\bun-windows-x64-baseline\bin') + ';' + $env:PATH
$wr = 'C:\ct\tools\wrangler3\node_modules\.bin\wrangler'
if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ACCOUNT_ID) { throw "Cloudflare token or account id not found in C:\ct\ct\.env.local" }
Set-Location (Join-Path $root "apps\api")
switch ($Step) {
  "check" {
    # gates: release file, TEST_MODE must not ship, the page rules and no secret-looking text in public files
    $rel = Get-Content ..\api\public\release.json -Raw | ConvertFrom-Json; Write-Host "release $($rel.version) $($rel.date)"
    if ((Get-Content public\config.json -Raw) -match '"testMode"\s*:\s*true') { Write-Host "NOTE: public/config.json has testMode true; the deploy step ships a production copy with testMode false." }
    $hits = Select-String -Path public\* -Pattern 'BEGIN (RSA|PRIVATE)|CLOUDFLARE_API_TOKEN|re_[A-Za-z0-9]{20,}' -Recurse -ErrorAction SilentlyContinue; if ($hits) { throw "secret-looking text in public files" } else { Write-Host "no secret-looking text in public/" }
    & $wr --version
  }
  "d1" {
    & $wr d1 create aoa-rwa
    Write-Host "Copy the database_id above into apps/api/wrangler.toml, then run: -Step d1 again is NOT needed; run migrations with the next line."
    & $wr d1 migrations apply aoa-rwa --remote
  }
  "secrets" {
    # fresh production secrets, piped straight to Cloudflare Pages (never printed, never in the repo)
    function Rand([int]$n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    $out = (& bun (Join-Path $root "scripts\gen-dev-vars.ts") --print-signing-key 2>$null)
    throw "Not automated yet: the owner must confirm (1) the signing-key backup place, (2) the Resend sender and key, (3) the Turnstile site and secret keys. See docs/DEPLOY-NOTES.md 'Secrets'."
  }
  "deploy" {
    $stage = Join-Path $env:TEMP "townhall-public"; if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    Copy-Item -Recurse public $stage
    $cfg = Get-Content public\config.json -Raw | ConvertFrom-Json; $cfg.testMode = $false; ($cfg | ConvertTo-Json) | Set-Content -Encoding utf8 (Join-Path $stage "config.json")
    & $wr pages deploy $stage --project-name $Project --branch $Branch --commit-dirty=true
  }
  "cron" { Set-Location ..\cron; & $wr deploy }
  "smoke" {
    $base = "https://$Project.pages.dev"
    foreach ($p in @("/api/health", "/release.json", "/", "/start/", "/verify/", "/privacy/")) { $r = Invoke-WebRequest -UseBasicParsing "$base$p"; Write-Host "$p $($r.StatusCode)" }
  }
}
