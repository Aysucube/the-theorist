# Starts The Theorist on a Windows computer. Run it through "Start The Theorist.cmd".
#
# Works on a computer that has never run the app (e.g. from a ZIP downloaded
# from GitHub):
# - No Node.js? It downloads a private copy from nodejs.org into the .runtime
#   folder, checked against nodejs.org's published SHA-256. Nothing is
#   installed system-wide and no admin rights are needed.
# - Installs packages and builds the app only when needed (first run, or after
#   the code changed), so later starts take seconds.
# - Uses port 3000, or the next free one if another program has it.
# Keep this file plain ASCII: Windows PowerShell 5.1 misreads other characters.

$ErrorActionPreference = 'Stop'
# Invoke-WebRequest is very slow while it draws a progress bar.
$ProgressPreference = 'SilentlyContinue'
# Older Windows 10 builds don't offer TLS 1.2 to websites by default.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
# Next.js otherwise sends anonymous usage data to Vercel.
$env:NEXT_TELEMETRY_DISABLED = '1'

$MinNode = [version]'20.9.0'
# The Node.js release line to download when a computer has none.
$NodeLine = 'latest-v24.x'
$Runtime = Join-Path $root '.runtime'

function Fail([string]$message) {
  Write-Host ''
  Write-Host $message -ForegroundColor Red
  exit 1
}

function Get-NodeVersion([string]$exe) {
  try {
    $text = & $exe -v 2>$null
    if ($text -match '^v(\d+\.\d+\.\d+)') { return [version]$Matches[1] }
  } catch {}
  return $null
}

function Install-PortableNode {
  $arch = $null
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }
  elseif ([Environment]::Is64BitOperatingSystem) { $arch = 'x64' }
  if (-not $arch) { Fail 'This computer runs 32-bit Windows, which current Node.js no longer supports, so the app cannot run here.' }

  Write-Host 'Node.js is not installed, so downloading a private copy for this app from nodejs.org.'
  Write-Host 'This is about 35 MB and only happens once...'
  $base = "https://nodejs.org/dist/$NodeLine"
  try {
    $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
  } catch {
    Fail "Could not reach nodejs.org to download Node.js. Check the internet connection and try again. ($($_.Exception.Message))"
  }
  $match = [regex]::Match($sums, "(?m)^([0-9a-f]{64})\s+(node-v[0-9.]+-win-$arch\.zip)\s*$")
  if (-not $match.Success) { Fail "nodejs.org has no Node.js download for Windows ($arch)." }
  $hash = $match.Groups[1].Value
  $file = $match.Groups[2].Value

  New-Item -ItemType Directory -Force $Runtime | Out-Null
  $zip = Join-Path $Runtime $file
  try {
    Invoke-WebRequest "$base/$file" -OutFile $zip -UseBasicParsing
  } catch {
    Fail "Downloading Node.js failed. Check the internet connection and try again. ($($_.Exception.Message))"
  }
  # -ne ignores case, and Get-FileHash writes the hash in capitals.
  if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $hash) {
    Remove-Item $zip -Force
    Fail 'The Node.js download did not match the checksum nodejs.org publishes, so it was not used. Try again.'
  }

  Write-Host 'Unpacking Node.js...'
  # Windows 10 and 11 include tar, which unpacks far faster than Expand-Archive.
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path $tar) {
    & $tar -xf $zip -C $Runtime
    if ($LASTEXITCODE -ne 0) { Fail 'Unpacking Node.js failed.' }
  } else {
    Expand-Archive $zip -DestinationPath $Runtime -Force
  }
  Remove-Item $zip -Force
  $dir = Join-Path $Runtime ($file -replace '\.zip$', '')
  if (-not (Test-Path (Join-Path $dir 'node.exe'))) { Fail 'Node.js was downloaded but node.exe is missing. Delete the .runtime folder and try again.' }
  return $dir
}

function Find-Node {
  # 1. A Node.js installed on this computer, if it's new enough.
  $installed = @()
  $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($onPath) { $installed += $onPath.Source }
  # (It may have been installed after Windows Explorer started, so PATH lacks it.)
  $installed += Join-Path $env:ProgramFiles 'nodejs\node.exe'
  # PRIVATE_NODE=1 skips an installed Node.js, e.g. to try the first-run download.
  if ($env:PRIVATE_NODE -eq '1') { $installed = @() }
  foreach ($exe in $installed) {
    if (Test-Path $exe) {
      $version = Get-NodeVersion $exe
      if ($version -and $version -ge $MinNode) { return Split-Path $exe }
    }
  }
  # 2. A private copy this launcher downloaded before.
  $copies = Get-ChildItem $Runtime -Directory -Filter 'node-v*' -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') }
  if ($copies) { return ($copies | Select-Object -First 1).FullName }
  # 3. Download one.
  return Install-PortableNode
}

function Test-PortFree([int]$port) {
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    return -not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  }
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) { $listener.Stop() }
  }
}

# --- Node.js -------------------------------------------------------------------

$nodeDir = Find-Node
$env:Path = "$nodeDir;$env:Path"
$npm = Join-Path $nodeDir 'npm.cmd'
Write-Host "Using Node.js $(& (Join-Path $nodeDir 'node.exe') -v) from $nodeDir"

# --- Packages ------------------------------------------------------------------

$lock = Join-Path $root 'package-lock.json'
$installedLock = Join-Path $root 'node_modules\.package-lock.json'
$installed = $false
if (-not (Test-Path $installedLock) -or (Get-Item $lock).LastWriteTime -gt (Get-Item $installedLock).LastWriteTime) {
  Write-Host ''
  Write-Host 'Installing packages (first run, or after an update). This takes a few minutes...'
  & $npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'Installing packages failed. Check the internet connection and try again.' }
  $installed = $true
}

# --- Build ---------------------------------------------------------------------

# Rebuild only when something the build reads is newer than the last build.
$buildId = Join-Path $root '.next\BUILD_ID'
$needBuild = $installed -or -not (Test-Path $buildId)
if (-not $needBuild) {
  $builtAt = (Get-Item $buildId).LastWriteTime
  $inputs = @()
  foreach ($folder in 'src', 'public') {
    $inputs += Get-ChildItem (Join-Path $root $folder) -Recurse -File -ErrorAction SilentlyContinue
  }
  $inputs += Get-ChildItem $root -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(package\.json|package-lock\.json|next\.config\.\w+|tsconfig\.json|postcss\.config\.\w+|\.env.*)$' }
  $needBuild = [bool]($inputs | Where-Object { $_.LastWriteTime -gt $builtAt } | Select-Object -First 1)
}
if ($needBuild) {
  Write-Host ''
  Write-Host 'Preparing the app. The first time takes a minute or two...'
  & $npm run build
  if ($LASTEXITCODE -ne 0) { Fail 'Preparing the app failed. Read the messages above.' }
}

# --- Start ---------------------------------------------------------------------

$port = 3000..3010 | Where-Object { Test-PortFree $_ } | Select-Object -First 1
if (-not $port) { Fail 'Ports 3000 to 3010 are all in use. Close other local servers and try again.' }
$url = "http://localhost:$port"

Write-Host ''
Write-Host "The Theorist is starting at $url" -ForegroundColor Green
Write-Host 'Keep this window open while you use it. Close it to stop the app.'
Write-Host ''

# Open the browser once the app answers, from a hidden helper so the server can start here.
if (-not $env:NO_BROWSER) {
  $opener = "for (`$i = 0; `$i -lt 240; `$i++) { try { Invoke-WebRequest '$url' -UseBasicParsing -TimeoutSec 5 | Out-Null; Start-Process '$url'; break } catch { Start-Sleep -Milliseconds 500 } }"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($opener))
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -EncodedCommand $encoded"
}

& $npm start -- -p $port
exit $LASTEXITCODE
