param(
  [switch]$Submit,
  [switch]$Async,
  [switch]$Json,
  [switch]$IgnoreWarnings,
  [switch]$Publish,
  [string]$Notes,
  [ValidateRange(1,120)][int]$TimeoutMinutes = 40,
  [ValidateRange(1,60)][int]$PollSeconds = 20,
  [string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX')
)
$ErrorActionPreference = 'Stop'
if ($Publish -and !$Submit) { throw '-Publish 必须配合 -Submit；发布已完成的云任务请使用 publish-apk-update.ps1。' }
if ($Publish) { $Async = $true; $Json = $true }
$taskReleaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCli = Join-Path $HBuilderXPath 'cli.exe'
$taskKeytool = Join-Path $HBuilderXPath 'plugins\amazon-corretto\bin\keytool.exe'
if (!(Test-Path -LiteralPath $taskCli) -or !(Test-Path -LiteralPath $taskKeytool)) { throw 'HBuilderX 或 Java 签名工具不存在，请指定安装目录。' }
$env:ANDROID_KEYTOOL = $taskKeytool
$taskPreviousEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Push-Location -LiteralPath $taskReleaseRoot
try {
  if ($Publish) {
    $taskPreflightArgs = @((Join-Path $PSScriptRoot 'publish-apk-update.mjs'), '--preflight', '--hbuilder', $HBuilderXPath)
    if ($Notes) { $taskPreflightArgs += @('--notes', $Notes) }
    & node @taskPreflightArgs
    if ($LASTEXITCODE -ne 0) { throw '自动发布预检失败，未提交云打包。' }
  }
  $taskSourceSha = (& git rev-parse HEAD | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw '无法读取源码提交。' }
  $taskSourceClean = ((& git status --porcelain --untracked-files=normal | Out-String).Trim().Length -eq 0)
  if ($LASTEXITCODE -ne 0) { throw '无法核验源码工作区状态。' }
  if ($Publish) {
    $taskPlan = Get-Content -LiteralPath (Join-Path $taskReleaseRoot '.local\apk-publish-plan.json') -Raw | ConvertFrom-Json
    if ($taskPlan.sourceSha -ne $taskSourceSha) { throw '自动发布预检后源码提交已改变，请重新运行。' }
  }
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
  $taskTicket = ''
  & $taskCli @taskPackArgs | ForEach-Object {
    $taskLine = [string]$_
    if ($taskLine -match '(\{.*\})') {
      try {
        $taskReply = $Matches[1] | ConvertFrom-Json
        $taskPackages = @($taskReply.body.packages | Where-Object { $_.platform -like 'ANDROID*' -and $_.ticket })
        if ($taskReply.code -eq 1001 -and $taskPackages.Count -eq 1) { $taskSubmitted = $true; $taskTicket = $taskPackages[0].ticket }
      } catch {}
    }
    $taskLine -replace '([?&]token=)[^&\s)]+', '$1[REDACTED]'
  }
  if ($LASTEXITCODE -ne 0) { throw 'HBuilderX 云打包命令失败，请检查 IDE 是否已启动、登录并导入此项目。' }
  if ($Async -and $Json -and !$taskSubmitted) { throw '未收到新的云打包 ticket。已有任务进行中时请等待完成，不视为新版本已提交。' }
  if ($taskTicket) {
    $taskManifest = Get-Content -LiteralPath (Join-Path $taskReleaseRoot 'manifest.json') -Raw | ConvertFrom-Json
    @{ticket=$taskTicket;sourceSha=$taskSourceSha;sourceClean=$taskSourceClean;versionName=$taskManifest.versionName;versionCode=[int]$taskManifest.versionCode} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskReleaseRoot '.local\android-cloud-last-task.json') -Encoding utf8
  }
  if ($Publish) {
    $taskPublishArgs = @{Ticket=$taskTicket;SourceSha=$taskSourceSha;HBuilderXPath=$HBuilderXPath;TimeoutMinutes=$TimeoutMinutes;PollSeconds=$PollSeconds}
    if ($Notes) { $taskPublishArgs.Notes = $Notes }
    & (Join-Path $PSScriptRoot 'publish-apk-update.ps1') @taskPublishArgs
  }
} finally { Pop-Location; [Console]::OutputEncoding = $taskPreviousEncoding }
