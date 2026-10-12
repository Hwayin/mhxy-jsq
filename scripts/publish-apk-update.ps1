param(
  [string]$Ticket,
  [string]$Apk,
  [string]$Notes,
  [string]$SourceSha,
  [switch]$DryRun,
  [int]$TimeoutMinutes = 40,
  [ValidateRange(1,60)][int]$PollSeconds = 20,
  [string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX')
)
$ErrorActionPreference = 'Stop'
$taskPublishArgs = @((Join-Path $PSScriptRoot 'publish-apk-update.mjs'), '--hbuilder', $HBuilderXPath, '--timeout-minutes', [string]$TimeoutMinutes, '--poll-seconds', [string]$PollSeconds)
if ($Ticket) { $taskPublishArgs += @('--ticket', $Ticket) }
if ($Apk) { $taskPublishArgs += @('--apk', $Apk) }
if ($Notes) { $taskPublishArgs += @('--notes', $Notes) }
if ($SourceSha) { $taskPublishArgs += @('--source-sha', $SourceSha) }
if ($DryRun) { $taskPublishArgs += '--dry-run' }
$taskPreviousEncoding = [Console]::OutputEncoding
try {
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  & node @taskPublishArgs
  if ($LASTEXITCODE -ne 0) { throw 'APK 自动发布未完成，请按上方错误处理后重试。' }
} finally { [Console]::OutputEncoding = $taskPreviousEncoding }
