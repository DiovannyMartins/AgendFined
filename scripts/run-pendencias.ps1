# Executa as validações pendentes no Windows e grava um relatório em
# .backup-local\pendencias\relatorio.txt (pasta ignorada pelo Git;
# test-results é apagada pelo Playwright a cada execução).
#
# Uso (PowerShell, na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\run-pendencias.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\run-pendencias.ps1 -RemoteWrites
#
# -RemoteWrites também roda os testes de integração e o E2E de reserva, que
# ESCREVEM no Supabase configurado em .env.local. Use somente se esse projeto
# NÃO for a produção.
param([switch]$RemoteWrites, [switch]$OnlyBooking)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$node22 = "C:\Users\Diovanny\AppData\Roaming\fnm\node-versions\v22.12.0\installation"
if (Test-Path "$node22\node.exe") { $env:PATH = "$node22;" + $env:PATH }

$outDir = Join-Path $root ".backup-local\pendencias"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$report = Join-Path $outDir "relatorio.txt"
"Relatório de pendências — $(Get-Date -Format s)" | Set-Content $report
"node $(node -v)" | Add-Content $report

function Get-TestServers {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match "next(\.js)?\S*\s+(start|dev)\s+--port\s+3100" }
}

function Invoke-Step([string]$name, [string]$command) {
  $log = Join-Path $outDir ("$name.log")
  $sw = [Diagnostics.Stopwatch]::StartNew()
  cmd /c "$command > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  $sw.Stop()
  $summary = (Select-String -Path $log -Pattern "passed|failed|skipped|Test Files|Tests |✓|✗|PASS|FAIL|WARN" |
    Select-Object -Last 8 | ForEach-Object { $_.Line.Trim() }) -join " | "
  "[$name] exit=$code tempo=$([int]$sw.Elapsed.TotalSeconds)s :: $summary" | Add-Content $report
  return $code
}

if (-not $OnlyBooking) {
$nodeBefore = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'").Count
"processos node antes: $nodeBefore" | Add-Content $report

Invoke-Step "build" "npm run build" | Out-Null

$specs = "tests/e2e/landing.spec.ts tests/e2e/seo.spec.ts tests/e2e/public.spec.ts"
foreach ($i in 1, 2) {
  $log = Join-Path $outDir "playwright-$i.log"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx playwright test $specs --project=chromium --workers=1 > `"$log`" 2>&1" -NoNewWindow -PassThru
  $null = $p.Handle  # keeps ExitCode available after exit
  if (-not $p.WaitForExit(600000)) {
    "[playwright-$i] TRAVOU: não terminou em 10 min; encerrando apenas a árvore deste processo (PID $($p.Id))" | Add-Content $report
    taskkill /PID $p.Id /T /F | Out-Null
  } else {
    $summary = (Select-String -Path $log -Pattern "passed|failed|skipped|Error" | Select-Object -Last 6 | ForEach-Object { $_.Line.Trim() }) -join " | "
    "[playwright-$i] exit=$($p.ExitCode) tempo=$([int]$sw.Elapsed.TotalSeconds)s :: $summary" | Add-Content $report
  }
  Start-Sleep -Seconds 3
  $servers = @(Get-TestServers).Count
  $port = @(Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue).Count
  $nodeNow = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'").Count
  "  depois da execução ${i}: servidores de teste=$servers, porta 3100 ouvindo=$port, processos node=$nodeNow (antes=$nodeBefore)" | Add-Content $report
}

Invoke-Step "check-launch-production" "npm run check:launch -- --production" | Out-Null
}

if ($RemoteWrites -or $OnlyBooking) {
  $supabaseHost = ([Uri]((Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=').Line.Split('=', 2)[1].Trim('"'))).Host
  $env:ALLOW_REMOTE_E2E_WRITES = "true"
  $env:E2E_ALLOWED_SUPABASE_HOSTS = $supabaseHost
  if (-not $OnlyBooking) { Invoke-Step "integration" "node node_modules\vitest\vitest.mjs run --project integration" | Out-Null }
  # O fluxo de reserva usa `next dev`: em build de produção o Turnstile é
  # fail-closed e o ambiente local não tem as chaves.
  $env:E2E_SERVER = "dev"
  Invoke-Step "e2e-booking" "npx playwright test tests/e2e/booking.spec.ts --project=chromium --workers=1" | Out-Null
} else {
  "[integration] e [e2e-booking] não executados (sem -RemoteWrites)" | Add-Content $report
}

"Fim — $(Get-Date -Format s)" | Add-Content $report
Get-Content $report
