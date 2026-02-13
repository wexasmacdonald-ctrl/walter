$ErrorActionPreference = 'Stop'

$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$androidHome = 'C:\Android\android-sdk'

if (-not (Test-Path $javaHome)) {
  throw "JAVA_HOME path not found: $javaHome"
}

if (-not (Test-Path $androidHome)) {
  throw "ANDROID_HOME path not found: $androidHome"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome

$prepend = @(
  "$env:JAVA_HOME\bin",
  "$env:ANDROID_HOME\platform-tools",
  "$env:ANDROID_HOME\emulator"
)

$currentPath = ($env:Path -split ';') | Where-Object { $_ -and $_.Trim().Length -gt 0 }
$pathSet = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $currentPath) {
  [void]$pathSet.Add($entry)
}

$finalPath = @()
foreach ($entry in $prepend) {
  if ($pathSet.Add($entry)) {
    $finalPath += $entry
  }
}
$finalPath += $currentPath
$env:Path = ($finalPath -join ';')

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
java -version
adb version

npx expo run:android @args
