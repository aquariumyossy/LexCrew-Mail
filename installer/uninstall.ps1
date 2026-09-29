param(
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$target = $PSScriptRoot
if (-not (Test-Path (Join-Path $target "KuruTray.exe"))) {
  $target = Join-Path $env:LOCALAPPDATA "Programs\KURU"
}

Write-Host "LexCrew Mail をアンインストールします。"
if (Get-Process OUTLOOK -ErrorAction SilentlyContinue) {
  if ($NonInteractive) {
    Write-Host "Outlook を終了してから、もう一度アンインストールしてください。" -ForegroundColor Red
    exit 2
  }
  while (Get-Process OUTLOOK -ErrorAction SilentlyContinue) {
    $answer = Read-Host "Outlook を終了してから Enter を押してください (中止は q)"
    if ($answer -eq "q") { exit 1 }
  }
}

$node = Join-Path $target "node\node.exe"
$tray = Join-Path $target "KuruTray.exe"
$dll = Join-Path $target "addin\KuruOutlook.dll"
$regasm = Join-Path ${env:WINDIR} "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -eq $node } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process KuruTray -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
if ((Test-Path $regasm) -and (Test-Path $dll)) {
  cmd /c "`"$regasm`" /unregister `"$dll`" >nul 2>&1"
}

$keys = @(
  "HKCU:\Software\Microsoft\Office\16.0\Outlook\Addins\Kuru.Connect",
  "HKCU:\Software\Microsoft\Office\Outlook\AddinsData\Kuru.Connect",
  "HKCU:\Software\Microsoft\Office\Outlook\Addins\Kuru.Connect",
  "HKCU:\Software\Classes\CLSID\{A7B3C1D2-4E5F-4A6B-8C9D-0E1F2A3B4C5D}",
  "HKCU:\Software\Classes\CLSID\{B8C4D2E3-5F60-4B7C-9D0E-1F2A3B4C5D6E}",
  "HKCU:\Software\Classes\Kuru.Connect",
  "HKCU:\Software\Classes\Kuru.Pane",
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU"
)
foreach ($key in $keys) {
  if (Test-Path $key) { Remove-Item $key -Recurse -Force }
}
foreach ($ver in @("16.0", "15.0")) {
  Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Office\$ver\Outlook\Resiliency\DoNotDisableAddinList" -Name "Kuru.Connect" -ErrorAction SilentlyContinue
}
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "KURU" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "LexCrew Mail" -ErrorAction SilentlyContinue

$programs = [Environment]::GetFolderPath("Programs")
$desktop = [Environment]::GetFolderPath("Desktop")
foreach ($folderName in @("KURU", "LexCrew Mail")) {
  $startFolder = Join-Path $programs $folderName
  foreach ($linkName in @("KURU.lnk", "LexCrew Mail.lnk")) {
    $startLink = Join-Path $startFolder $linkName
    if (Test-Path $startLink) { Remove-Item $startLink -Force }
  }
  if (Test-Path $startFolder) {
    $left = @(Get-ChildItem $startFolder -Force -ErrorAction SilentlyContinue)
    if ($left.Count -eq 0) { Remove-Item $startFolder -Force }
  }
}
foreach ($linkName in @("KURU.lnk", "LexCrew Mail.lnk")) {
  $desktopLink = Join-Path $desktop $linkName
  if (Test-Path $desktopLink) { Remove-Item $desktopLink -Force }
}

# セットアップ exe のアンインストールは NSIS が Programs\KURU を消す。ここでの遅延削除は対話実行だけ。
if (-not $NonInteractive) {
  Start-Process cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$target`"" -WindowStyle Hidden
  Write-Host "アンインストールしました。メール履歴 ($env:APPDATA\KURU) は残しています。" -ForegroundColor Green
  Read-Host "Enter で閉じます"
} else {
  Write-Host "登録を解除しました。メール履歴 ($env:APPDATA\KURU) は残しています。"
}
