param(
  [switch]$Submit,
  [switch]$Async,
  [switch]$Json,
  [switch]$IgnoreWarnings,
  [string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX')
)
$ErrorActionPreference = 'Stop'
$taskReleaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCli = Join-Path $HBuilderXPath 'cli.exe'
$taskKeytool = Join-Path $HBuilderXPath 'plugins\amazon-corretto\bin\keytool.exe'
if (!(Test-Path -LiteralPath $taskCli) -or !(Test-Path -LiteralPath $taskKeytool)) { throw 'HBuilderX 或 Java 签名工具不存在，请指定安装目录。' }
$env:ANDROID_KEYTOOL = $taskKeytool
Push-Location -LiteralPath $taskReleaseRoot
try {
  & node (Join-Path $PSScriptRoot 'setup-android-signing.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Android 签名检查失败。' }
  & node (Join-Path $PSScriptRoot 'check-android-release.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Android 打包配置检查失败。' }
  if (!$Submit) {
    Write-Output '配置检查完成，未提交云打包。登录 HBuilderX 后使用 -Submit 生成 APK。'
    return
  }
  Write-Output '提交 Android 正式 APK 云打包：项目编译资源将发送至 DCloud，使用已核验的签名配置。'
  $taskPackArgs = @('pack', '--config', (Join-Path $taskReleaseRoot '.local\android-cloud-pack.json'))
  if ($Async) { $taskPackArgs += @('--async', 'true') }
  if ($Json) { $taskPackArgs += @('--json', 'true') }
  if ($IgnoreWarnings) { $taskPackArgs += @('--ignoreWarnings', 'true') }
  $taskSubmitted = $false
  & $taskCli @taskPackArgs | ForEach-Object {
    $taskLine = [string]$_
    if ($taskLine -match '(\{.*\})') {
      try { $taskReply = $Matches[1] | ConvertFrom-Json; if ($taskReply.code -eq 1001 -and $taskReply.body.packages.ticket) { $taskSubmitted = $true } } catch {}
    }
    $taskLine -replace '([?&]token=)[^&\s)]+', '$1[REDACTED]'
  }
  if ($LASTEXITCODE -ne 0) { throw 'HBuilderX 云打包命令失败，请检查 IDE 是否已启动、登录并导入此项目。' }
  if ($Async -and $Json -and !$taskSubmitted) { throw '未收到新的云打包 ticket。已有任务进行中时请等待完成，不视为新版本已提交。' }
} finally { Pop-Location }
