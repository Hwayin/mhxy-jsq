param(
  [Parameter(Mandatory=$true)][string]$Keystore,
  [string]$HBuilderXPath = (Join-Path $env:USERPROFILE 'Desktop\HBuilderX')
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskKeytool = Join-Path $HBuilderXPath 'plugins\amazon-corretto\bin\keytool.exe'
$taskCertificate = (Resolve-Path -LiteralPath $Keystore).Path
$taskIdentity = Get-Content -LiteralPath (Join-Path $taskRoot 'release\android-update-identity.json') -Raw | ConvertFrom-Json
$taskPassword = Read-Host 'Enter the ORIGINAL cloud keystore password (hidden)' -AsSecureString
$taskPreviousPassword = $env:MHXY_OFFLINE_KEYSTORE_PASSWORD
$taskPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword)
try {
  $env:MHXY_OFFLINE_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPasswordPointer)
  $taskOutput = (& $taskKeytool '-J-Duser.language=en' '-J-Duser.country=US' '-list' '-v' '-keystore' $taskCertificate '-storepass:env' 'MHXY_OFFLINE_KEYSTORE_PASSWORD' 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Cannot open keystore. Check the certificate file and password. No signing configuration changed.' }
  $taskAliases = [regex]::Matches($taskOutput,'Alias name:\s*([^\r\n]+)')
  $taskHashes = [regex]::Matches($taskOutput,'SHA256:\s*([A-Fa-f0-9:]+)')
  if ($taskAliases.Count -ne 1 -or $taskHashes.Count -ne 1 -or $taskOutput -notmatch 'Entry type: PrivateKeyEntry') { throw 'Expected exactly one original private signing key.' }
  $taskFingerprint = $taskHashes[0].Groups[1].Value.Replace(':','').ToLowerInvariant()
  if ($taskFingerprint -ne $taskIdentity.sha256) { throw 'Certificate does not match the installed app. No signing configuration changed.' }
  $taskSigningDir = Join-Path $taskRoot '.local\signing'
  New-Item -ItemType Directory -Path $taskSigningDir -Force | Out-Null
  $taskStoredCertificate = Join-Path $taskSigningDir 'cloud-original.keystore'
  if ($taskCertificate -ne $taskStoredCertificate) { Copy-Item -LiteralPath $taskCertificate -Destination $taskStoredCertificate }
  $taskProtectedPassword = ConvertFrom-SecureString -SecureString $taskPassword
  $taskConfig = [ordered]@{
    storeFile = $taskStoredCertificate
    keyAlias = $taskAliases[0].Groups[1].Value.Trim()
    storePasswordProtected = $taskProtectedPassword
    keyPasswordProtected = $taskProtectedPassword
    certificateSha256 = $taskFingerprint
    packageName = $taskIdentity.packageName
  }
  $taskConfig | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot '.local\android-offline-signing.json') -Encoding UTF8
  Write-Output 'Original certificate verified. Password protected with Windows DPAPI for this user; signing configuration saved under ignored .local.'
  Write-Output ('Certificate SHA-256: ' + $taskFingerprint)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPasswordPointer)
  $env:MHXY_OFFLINE_KEYSTORE_PASSWORD = $taskPreviousPassword
}
