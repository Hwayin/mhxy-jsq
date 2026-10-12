param([string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX'))
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOldJava = $env:JAVA_HOME
Push-Location -LiteralPath $taskRoot
try {
  & node (Join-Path $PSScriptRoot 'offline-android-tools.mjs') --setup
  if ($LASTEXITCODE -ne 0) { throw 'Offline toolchain download failed.' }
  $taskTools = Get-Content -LiteralPath (Join-Path $taskRoot 'unpackage\android-toolchain\toolchain.json') -Raw | ConvertFrom-Json
  $env:JAVA_HOME = $taskTools.javaHome
  $taskSdk = Join-Path $taskRoot 'unpackage\android-toolchain\android-sdk'
  $taskManager = Join-Path $taskSdk 'cmdline-tools\19.0\bin\sdkmanager.bat'
  $taskAnswers = (1..30 | ForEach-Object { 'y' })
  $taskAnswers | & $taskManager ('--sdk_root=' + $taskSdk) 'platforms;android-36' 'build-tools;36.0.0'
  if ($LASTEXITCODE -ne 0) { throw 'Android SDK packages installation failed.' }
  Write-Output 'Offline Android toolchain ready: HBuilderX 5.26 Vapor / Gradle 9.2.1 / Android API 36.'
} finally { $env:JAVA_HOME = $taskOldJava; Pop-Location }
