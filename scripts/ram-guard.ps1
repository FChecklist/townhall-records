# Runs ONE command under the owner's RAM rules for this laptop (7.8 GB total):
#  * the command and everything it starts may use at most 20% of the RAM (-CapPercent, default 20);
#  * it does not start if free RAM is below -MinFreeMB (Corporate Tambola and the other sessions have first right to memory);
#  * -Heavy runs (full test suite, typecheck, builds) also need the shared lock C:\ct\heavy.lock (mkdir lock, see C:\ct\HEAVY_JOB_PROTOCOL.md):
#    if someone else holds it, this exits with code 3 and does nothing; the lock is released in `finally`, and only if this script created it.
# If the command passes the cap it is killed (whole tree) and this exits with code 4.
# Usage: powershell -File scripts/ram-guard.ps1 -Command "bun test --isolate apps/api/test/team.test.ts" [-Heavy] [-CapPercent 20] [-MinFreeMB 600]
param([Parameter(Mandatory = $true)][string]$Command, [switch]$Heavy, [int]$CapPercent = 20, [int]$MinFreeMB = 600, [string]$WorkDir = (Get-Location).Path)
$ErrorActionPreference = "Stop"
$os = Get-CimInstance Win32_OperatingSystem
$totalMB = [int]($os.TotalVisibleMemorySize / 1KB); $capMB = [int]($totalMB * $CapPercent / 100)
$freeMB = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB)
Write-Host "[ram-guard] total $totalMB MB, cap $capMB MB ($CapPercent%), free now $freeMB MB, command: $Command"
if ($freeMB -lt $MinFreeMB) { Write-Host "[ram-guard] NOT STARTED: only $freeMB MB free (needs $MinFreeMB). Other sessions have first right to memory."; exit 3 }
$lock = "C:\ct\heavy.lock"; $iHoldLock = $false
if ($Heavy) {
  if ($freeMB -lt 1200) { Write-Host "[ram-guard] NOT STARTED: heavy runs need 1200 MB free, have $freeMB."; exit 3 }
  try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $iHoldLock = $true } catch { Write-Host "[ram-guard] NOT STARTED: $lock is held by another session."; exit 3 }
}
$code = 0
try {
  $psi = New-Object System.Diagnostics.ProcessStartInfo; $psi.FileName = "cmd.exe"; $psi.Arguments = "/c $Command"; $psi.WorkingDirectory = $WorkDir
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $false; $psi.RedirectStandardError = $false
  $p = [System.Diagnostics.Process]::Start($psi); $peak = 0
  function Get-TreeMB([int]$root) {
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize
    $ids = New-Object System.Collections.Generic.HashSet[int]; [void]$ids.Add($root); $grew = $true
    while ($grew) { $grew = $false; foreach ($q in $all) { if ($ids.Contains([int]$q.ParentProcessId) -and -not $ids.Contains([int]$q.ProcessId)) { [void]$ids.Add([int]$q.ProcessId); $grew = $true } } }
    $sum = 0; foreach ($q in $all) { if ($ids.Contains([int]$q.ProcessId)) { $sum += $q.WorkingSetSize } }; return [int]($sum / 1MB)
  }
  while (-not $p.HasExited) {
    Start-Sleep -Milliseconds 200; $mb = Get-TreeMB $p.Id; if ($mb -gt $peak) { $peak = $mb }
    if ($mb -gt $capMB) { Write-Host "[ram-guard] OVER THE CAP: $mb MB > $capMB MB - killing the command"; & taskkill /PID $p.Id /T /F | Out-Null; $code = 4; break }
  }
  if ($code -eq 0) { $code = $p.ExitCode }
  Write-Host "[ram-guard] finished with exit code $code; peak memory of the command tree was $peak MB (cap $capMB MB)"
} finally { if ($iHoldLock) { Remove-Item -Recurse -Force $lock -ErrorAction SilentlyContinue } }
exit $code
