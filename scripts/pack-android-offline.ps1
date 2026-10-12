param(
  [switch]$Publish,
  [switch]$SkipExport,
  [string]$Notes,
  [string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX')
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskKeys = @('JAVA_HOME','MHXY_OFFLINE_STORE_FILE','MHXY_OFFLINE_STORE_PASSWORD','MHXY_OFFLINE_KEY_ALIAS','MHXY_OFFLINE_KEY_PASSWORD')
$taskOldEnv = @{}
foreach ($taskKey in $taskKeys) { $taskOldEnv[$taskKey] = [Environment]::GetEnvironmentVariable($taskKey,'Process') }
$taskPreviousEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Push-Location -LiteralPath $taskRoot
try {
  if ($Publish -and $SkipExport) { throw 'Publishing requires a fresh HBuilderX resource export. Remove -SkipExport.' }
  $taskSigningFile = Join-Path $taskRoot '.local\android-offline-signing.json'
  if (!(Test-Path -LiteralPath $taskSigningFile)) { throw 'Run configure-offline-signing.ps1 with the original cloud certificate first.' }
  $taskSigning = Get-Content -LiteralPath $taskSigningFile -Raw | ConvertFrom-Json
  $taskIdentity = Get-Content -LiteralPath (Join-Path $taskRoot 'release\android-update-identity.json') -Raw | ConvertFrom-Json
  if ($taskSigning.certificateSha256 -ne $taskIdentity.sha256 -or $taskSigning.packageName -ne $taskIdentity.packageName) { throw 'Offline signing identity does not match the installed app.' }
  if ($Publish) {
    $taskPreflightArgs = @((Join-Path $PSScriptRoot 'publish-apk-update.mjs'),'--preflight','--hbuilder',$HBuilderXPath)
    if ($Notes) { $taskPreflightArgs += @('--notes',$Notes) }
    & node @taskPreflightArgs
    if ($LASTEXITCODE -ne 0) { throw 'Publication preflight failed; no local build started.' }
  }
  $taskSourceSha = (& git rev-parse HEAD | Out-String).Trim()
  if (!$SkipExport) {
    $taskExportStarted = [DateTime]::UtcNow.AddSeconds(-2)
    & (Join-Path $HBuilderXPath 'cli.exe') publish app-android --type appResource --project $taskRoot
    if ($LASTEXITCODE -ne 0) { throw 'HBuilderX resource export failed.' }
    $taskProjectManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'manifest.json') -Raw | ConvertFrom-Json
    $taskExportManifest = Join-Path $taskRoot ('unpackage\resources\app-android\' + $taskProjectManifest.appid + '\www\manifest.json')
    if (!(Test-Path -LiteralPath $taskExportManifest) -or (Get-Item -LiteralPath $taskExportManifest).LastWriteTimeUtc -lt $taskExportStarted) { throw 'HBuilderX did not produce fresh resources. Check its compiler log.' }
  }
  & node (Join-Path $PSScriptRoot 'offline-android-tools.mjs') --prepare
  if ($LASTEXITCODE -ne 0) { throw 'Offline resources validation failed.' }
  $taskTools = Get-Content -LiteralPath (Join-Path $taskRoot 'unpackage\android-toolchain\toolchain.json') -Raw | ConvertFrom-Json
  $env:JAVA_HOME = $taskTools.javaHome
  $env:MHXY_OFFLINE_STORE_FILE = $taskSigning.storeFile
  $env:MHXY_OFFLINE_KEY_ALIAS = $taskSigning.keyAlias
  foreach ($taskPasswordKind in @('STORE','KEY')) {
    $taskProtected = if ($taskPasswordKind -eq 'STORE') { $taskSigning.storePasswordProtected } else { $taskSigning.keyPasswordProtected }
    $taskSecure = ConvertTo-SecureString $taskProtected
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
    try { [Environment]::SetEnvironmentVariable(('MHXY_OFFLINE_' + $taskPasswordKind + '_PASSWORD'),[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer),'Process') }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
  }
  $taskGradle = Join-Path $taskRoot 'unpackage\android-toolchain\gradle-9.2.1\bin\gradle.bat'
  & $taskGradle -p (Join-Path $taskRoot 'android-offline') :app:assembleRelease --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'Local APK build failed.' }
  $taskApk = Join-Path $taskRoot 'android-offline\app\build\outputs\apk\release\app-release.apk'
  $taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'manifest.json') -Raw | ConvertFrom-Json
  $taskNotesFile = if ($Notes) { $Notes } else { Join-Path $taskRoot ('release\notes-v' + $taskManifest.versionName + '.md') }
  $taskPrepareArgs = @((Join-Path $PSScriptRoot 'prepare-update-release.mjs'),'--apk',$taskApk,'--hbuilder',$HBuilderXPath)
  if (Test-Path -LiteralPath $taskNotesFile) { $taskPrepareArgs += @('--notes',$taskNotesFile) }
  & node @taskPrepareArgs
  if ($LASTEXITCODE -ne 0) { throw 'APK version, original signature or integrity verification failed.' }
  Write-Output ('Verified local APK: ' + $taskApk)
  if ($Publish) {
    $taskPublishOptions = @{ Apk=$taskApk; SourceSha=$taskSourceSha; HBuilderXPath=$HBuilderXPath }
    if (Test-Path -LiteralPath $taskNotesFile) { $taskPublishOptions.Notes=$taskNotesFile }
    & (Join-Path $PSScriptRoot 'publish-apk-update.ps1') @taskPublishOptions
  }
} finally {
  foreach ($taskKey in $taskKeys) { [Environment]::SetEnvironmentVariable($taskKey,$taskOldEnv[$taskKey],'Process') }
  [Console]::OutputEncoding = $taskPreviousEncoding
  Pop-Location
}
