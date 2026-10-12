param(
  [ValidateSet('web', 'android')][string]$Platform = 'web',
  [string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX')
)
$ErrorActionPreference = 'Stop'
$taskProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCompiler = Join-Path $HBuilderXPath 'plugins\uniapp-cli-vite\node_modules\@dcloudio\vite-plugin-uni\bin\uni.js'
$taskNode = Join-Path $HBuilderXPath 'plugins\node\node.exe'
if (!(Test-Path -LiteralPath $taskCompiler) -or !(Test-Path -LiteralPath $taskNode)) { throw '请指定安装了 uni-app 编译插件的 HBuilderX 路径。' }
$env:HX_APP_ROOT = $HBuilderXPath
$env:UNI_INPUT_DIR = $taskProject
$env:UNI_OUTPUT_DIR = Join-Path $taskProject ('unpackage\dist\build\' + $Platform)
$env:UNI_APP_X = 'true'
if ($Platform -eq 'android') {
  $env:UNI_PLATFORM = 'app'
  $env:UNI_APP_PLATFORM = 'android'
  $env:UNI_APP_X_DOM2 = 'true'
  $env:UNI_APP_X_VAPOR_RENDER_TARGET = 'bytecode'
} else {
  $env:UNI_PLATFORM = 'h5'
  Remove-Item Env:\UNI_APP_PLATFORM -ErrorAction SilentlyContinue
  Remove-Item Env:\UNI_APP_X_DOM2 -ErrorAction SilentlyContinue
}
$taskLogDir = Join-Path $taskProject 'unpackage\logs'
New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
$taskLog = Join-Path $taskLogDir ($Platform + '-build.log')
& $taskNode $taskCompiler build -p $env:UNI_PLATFORM *> $taskLog
$taskExit = $LASTEXITCODE
Get-Content -LiteralPath $taskLog -Tail 35
Write-Output ('完整日志：' + $taskLog)
exit $taskExit
