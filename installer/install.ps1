param(
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$source = $PSScriptRoot
$target = Join-Path $env:LOCALAPPDATA "Programs\KURU"
$version = (Get-Content (Join-Path $source "version.txt") -Raw).Trim()
$webviewUrl = "https://developer.microsoft.com/microsoft-edge/webview2/"
$packageBitness = "x64"
$marker = Join-Path $source "addin\bitness.txt"
if (Test-Path $marker) { $packageBitness = (Get-Content $marker -Raw).Trim() }

function Fail([string]$text, [int]$code = 1) {
  Write-Host ""
  Write-Host $text -ForegroundColor Red
  if (-not $NonInteractive) { Read-Host "Enter で閉じます" }
  exit $code
}

Write-Host "LexCrew Mail $version をインストールします。"
Write-Host "インストール先: $target"

if (Get-Process OUTLOOK -ErrorAction SilentlyContinue) {
  if ($NonInteractive) {
    Fail "Outlook を終了してから、もう一度インストールしてください。" 2
  }
  while (Get-Process OUTLOOK -ErrorAction SilentlyContinue) {
    $answer = Read-Host "Outlook を終了してから Enter を押してください (中止は q)"
    if ($answer -eq "q") { exit 1 }
  }
}

$bitness = $null
foreach ($key in @("HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration")) {
  $platform = (Get-ItemProperty $key -ErrorAction SilentlyContinue).Platform
  if ($platform) { $bitness = $platform }
}
foreach ($ver in @("16.0", "15.0")) {
  $b = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Office\$ver\Outlook" -ErrorAction SilentlyContinue).Bitness
  if ($b) { $bitness = $b }
}
if ($packageBitness -ne "x64" -and $packageBitness -ne "x86") {
  Fail "bitness.txt が不正です。" 1
}
if ($packageBitness -eq "x86") {
  if ($bitness -match "64") {
    Fail "この Outlook は 64 ビット版です。このパッケージは 32 ビット版の Outlook 用です。" 3
  }
  $regasm = Join-Path ${env:WINDIR} "Microsoft.NET\Framework\v4.0.30319\RegAsm.exe"
  $classesPrefix = "HKEY_CURRENT_USER\Software\Classes\Wow6432Node\"
} else {
  if ($bitness -and $bitness -notmatch "64") {
    Fail "この Outlook は 32 ビット版です。LexCrew Mail は 64 ビット版の Outlook にだけ対応しています。" 3
  }
  $regasm = Join-Path ${env:WINDIR} "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
  $classesPrefix = "HKEY_CURRENT_USER\Software\Classes\"
}

$webview = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
) | Where-Object { (Get-ItemProperty $_ -ErrorAction SilentlyContinue).pv } | Select-Object -First 1
if (-not $webview) {
  if ($NonInteractive) {
    Fail "WebView2 ランタイムが見つかりません。LexCrew Mail の画面を出すには次から入れてください。 $webviewUrl" 4
  }
  Write-Host "WebView2 ランタイムが見つかりません。LexCrew Mail の画面を出すには次から入れてください。" -ForegroundColor Yellow
  Write-Host $webviewUrl -ForegroundColor Yellow
}

$node = Join-Path $target "node\node.exe"
$tray = Join-Path $target "KuruTray.exe"
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -eq $node } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process KuruTray -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

try {
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  $names = @("addin", "app", "node", "KuruTray.exe", "version.txt", "uninstall.ps1", "uninstall.cmd")
  if (Test-Path (Join-Path $source "lexcrew.ico")) { $names += "lexcrew.ico" }
  foreach ($name in $names) {
    Copy-Item (Join-Path $source $name) $target -Recurse -Force
  }
} catch {
  Fail "ファイルをコピーできませんでした: $($_.Exception.Message)" 8
}

$dll = Join-Path $target "addin\KuruOutlook.dll"
$regFile = Join-Path $env:TEMP "kuru-install.reg"
if (-not (Test-Path $regasm)) { Fail "RegAsm.exe が見つかりません。" 5 }
# 64bit 側と 32bit 側の両方を消す。ビット幅を入れ替えて入れ直したとき、古い InprocServer32 を残さない。
$classNames = @(
  "CLSID\{A7B3C1D2-4E5F-4A6B-8C9D-0E1F2A3B4C5D}",
  "CLSID\{B8C4D2E3-5F60-4B7C-9D0E-1F2A3B4C5D6E}",
  "Kuru.Connect",
  "Kuru.Pane"
)
foreach ($view in @("HKCU:\Software\Classes", "HKCU:\Software\Classes\Wow6432Node")) {
  foreach ($name in $classNames) {
    $key = Join-Path $view $name
    if (Test-Path $key) { Remove-Item $key -Recurse -Force }
  }
}
# RegAsm と reg は正常時も標準エラーに書くため、PowerShell の例外にならないよう cmd 経由で呼ぶ
cmd /c "`"$regasm`" /unregister `"$dll`" >nul 2>&1"
cmd /c "`"$regasm`" /regfile:`"$regFile`" /codebase `"$dll`" >nul 2>&1"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $regFile)) {
  Fail "COM 登録ファイルを作成できませんでした。" 6
}
# HKEY_CLASSES_ROOT のままだと、HKCU に既存キーが無いとき HKLM へ書こうとして管理者権限が要る。
# x86 パッケージは 32bit Outlook が見る Wow6432Node へ書く。64bit の reg import はそのパスをそのまま書く。
$regText = [IO.File]::ReadAllText($regFile, [Text.Encoding]::Default)
if ($packageBitness -eq "x86") {
  $regText = $regText.Replace("[HKEY_CLASSES_ROOT\Wow6432Node\", "[HKEY_CURRENT_USER\Software\Classes\Wow6432Node\")
}
[IO.File]::WriteAllText($regFile, $regText.Replace("[HKEY_CLASSES_ROOT\", "[$classesPrefix"), [Text.Encoding]::Default)
cmd /c "reg import `"$regFile`" >nul 2>&1"
if ($LASTEXITCODE -ne 0) { Fail "COM 登録に失敗しました。" 7 }
Remove-Item $regFile -Force -ErrorAction SilentlyContinue

foreach ($key in @(
  "HKCU:\Software\Microsoft\Office\16.0\Outlook\Addins\Kuru.Connect",
  "HKCU:\Software\Microsoft\Office\Outlook\AddinsData\Kuru.Connect",
  "HKCU:\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems",
  "HKCU:\Software\Microsoft\Office\16.0\Outlook\Resiliency\CrashingAddinList",
  "HKCU:\Software\Microsoft\Office\16.0\Outlook\Resiliency\NotificationReminderAddinData"
)) {
  if (Test-Path $key) { Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue }
}

$addin = "HKCU:\Software\Microsoft\Office\Outlook\Addins\Kuru.Connect"
New-Item -Path $addin -Force | Out-Null
New-ItemProperty -Path $addin -Name FriendlyName -Value "LexCrew Mail" -Force | Out-Null
New-ItemProperty -Path $addin -Name Description -Value "メールの下書きと推敲" -Force | Out-Null
New-ItemProperty -Path $addin -Name LoadBehavior -Value 3 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $addin -Name CommandLineSafe -Value 0 -PropertyType DWord -Force | Out-Null

foreach ($ver in @("16.0", "15.0")) {
  $resiliency = "HKCU:\Software\Microsoft\Office\$ver\Outlook\Resiliency\DoNotDisableAddinList"
  New-Item -Path $resiliency -Force | Out-Null
  New-ItemProperty -Path $resiliency -Name "Kuru.Connect" -Value 1 -PropertyType DWord -Force | Out-Null
}

if (-not $NonInteractive) {
  $uninstall = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU"
  New-Item -Path $uninstall -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name DisplayName -Value "LexCrew Mail" -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name DisplayVersion -Value $version -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name Publisher -Value "LexCrew" -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name InstallLocation -Value $target -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name UninstallString -Value "`"$(Join-Path $target 'uninstall.cmd')`"" -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $uninstall -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
}

$run = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $run -Name "LexCrew Mail" -Value "`"$tray`"" -PropertyType String -Force | Out-Null
Remove-ItemProperty -Path $run -Name "KURU" -ErrorAction SilentlyContinue
if (-not $NonInteractive) { Start-Process $tray -WindowStyle Hidden }

Write-Host ""
Write-Host "インストールしました。" -ForegroundColor Green
Write-Host "Outlook を起動すると、メールのリボンに LexCrew が出ます。" -ForegroundColor Green
if (-not $NonInteractive) {
  Write-Host "タスクバーに LexCrew Mail が表示されます。" -ForegroundColor Green
  Read-Host "Enter で閉じます"
}
