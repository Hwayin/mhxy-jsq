param([ValidatePattern('^[a-f0-9]{7,40}$')][string]$BaseRef = '7e26eb5')
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOut = [IO.Path]::GetFullPath((Join-Path $taskRoot 'unpackage\bootstrap-0.7.1'))
$taskArchive = Join-Path $taskRoot 'unpackage\bootstrap-0.7.1.zip'
if (!$taskOut.StartsWith((Join-Path $taskRoot 'unpackage\'), [StringComparison]::OrdinalIgnoreCase)) { throw '修复包路径必须在项目 unpackage 内。' }
Push-Location -LiteralPath $taskRoot
try {
  $taskBaseManifest = (& git show ($BaseRef + ':manifest.json') | Out-String | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $taskBaseManifest.versionName -ne '0.7.0' -or $taskBaseManifest.versionCode -ne '700') { throw '修复包必须从已有 0.7.0 源码提交构建。' }
  & git archive --format=zip ('--output=' + $taskArchive) $BaseRef
  if ($LASTEXITCODE -ne 0) { throw '导出 0.7.0 源码失败。' }
  Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskOut -Force
  foreach ($taskRelative in @('lib/update-model.uts','release/android.json','release/android-update-identity.json','release/notes-v0.7.1.md','scripts/setup-android-signing.mjs','scripts/check-android-release.mjs','scripts/pack-android.ps1','scripts/prepare-update-release.mjs','scripts/apk-metadata.mjs')) {
    Copy-Item -LiteralPath (Join-Path $taskRoot $taskRelative) -Destination (Join-Path $taskOut $taskRelative) -Force
  }
  $taskManifestPath = Join-Path $taskOut 'manifest.json'
  $taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw | ConvertFrom-Json
  $taskManifest.versionName = '0.7.1'; $taskManifest.versionCode = '701'
  $taskManifest | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $taskManifestPath -Encoding utf8
  $taskPackagePath = Join-Path $taskOut 'package.json'
  $taskPackage = Get-Content -LiteralPath $taskPackagePath -Raw | ConvertFrom-Json
  $taskPackage.version = '0.7.1'
  $taskPackage | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $taskPackagePath -Encoding utf8
  & node (Join-Path $taskOut 'scripts\setup-android-signing.mjs')
  if ($LASTEXITCODE -ne 0) { throw '修复包签名配置失败。' }
  Write-Output ('修复包源码：' + $taskOut)
  Write-Output '只修复更新身份识别，仍为原 0.7 界面；快速录入留在 0.8.0 在线更新版本。'
} finally { Pop-Location }
