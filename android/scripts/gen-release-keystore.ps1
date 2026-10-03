# Run in an interactive PowerShell window (Cursor terminal). You will be prompted for passwords and certificate fields.
# Keystore stays outside the repo: D:\RV\keys\ezzyerp-release.keystore

$ErrorActionPreference = "Stop"
$jdk = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
if (-not (Test-Path $jdk)) {
  Write-Error "JDK 21 not found at $jdk. Install Microsoft JDK 21 or edit this script."
}
$env:JAVA_HOME = $jdk
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$keysDir = "D:\RV\keys"
$keystore = Join-Path $keysDir "ezzyerp-release.keystore"
if (-not (Test-Path $keysDir)) {
  New-Item -ItemType Directory -Path $keysDir -Force | Out-Null
}
if (Test-Path $keystore) {
  Write-Error "Keystore already exists: $keystore. Back it up instead of overwriting."
}

& keytool -genkey -v `
  -keystore $keystore `
  -alias ezzyerp `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000

Write-Host ""
Write-Host "Done. Next: set storePassword and keyPassword in android\keystore.properties (same as you entered above)."
