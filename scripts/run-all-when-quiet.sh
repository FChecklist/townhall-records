#!/bin/bash
# Waits (checking every 5 minutes, up to ~3 hours) until the laptop has at least 900 MB free, then runs typecheck and every test file ONE AT A TIME under the 20% RAM guard.
# Corporate Tambola has first right to memory, so this never forces its way in. Output: /tmp/aoa-all.txt
cd /c/ct/aoa-rwa || exit 1
out=/tmp/aoa-all.txt; : > $out
for i in $(seq 1 36); do
  free=$(powershell -NoProfile -Command "[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)" | tr -d '\r')
  if [ "$free" -ge 900 ]; then break; fi
  echo "waiting: $free MB free (try $i)" >> $out; sleep 300
done
echo "== typecheck" >> $out; powershell -NoProfile -File scripts/ram-guard.ps1 -Command "bun run typecheck" 2>&1 | grep -E "error|finished|NOT" >> $out
echo "== verifier bundle" >> $out; powershell -NoProfile -File scripts/ram-guard.ps1 -Command "bun scripts/build-verifier.ts" 2>&1 | tail -1 >> $out
echo "== engine" >> $out; powershell -NoProfile -File scripts/ram-guard.ps1 -Command "bun test --isolate --timeout 60000 packages/engine" 2>&1 | grep -E "^ *[0-9]+ (pass|fail)|^\(fail\)|NOT STARTED|finished" >> $out
for f in apps/api/test/*.test.ts; do echo "== $f" >> $out; powershell -NoProfile -File scripts/ram-guard.ps1 -Command "bun test --isolate --timeout 90000 $f" 2>&1 | grep -E "^ *[0-9]+ (pass|fail)|^\(fail\)|NOT STARTED|finished" >> $out; done
echo "== DONE" >> $out
