Unicode true

; 32-bit のセットアップから System32 の powershell.exe を呼ぶと WOW64 で 32-bit になり、
; COM 登録が 64-bit Outlook から見えなくなる。Sysnative の 64-bit PowerShell を使う。

!include MUI2.nsh
!include LogicLib.nsh

!ifndef VERSION
  !error "VERSION is required"
!endif
!ifndef OUTFILE
  !error "OUTFILE is required"
!endif
!ifndef PAYLOAD
  !error "PAYLOAD is required"
!endif
!ifndef ICON
  !error "ICON is required"
!endif
!ifndef BITNESS
  !define BITNESS "x64"
!endif

Name "LexCrew Mail"
Caption "LexCrew Mail セットアップ"
BrandingText "LexCrew Mail"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\KURU"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "LexCrew Mail のインストール"
!define MUI_WELCOMEPAGE_TEXT "LexCrew Mail を現在のユーザーにインストールします。管理者権限は不要です。$\r$\n$\r$\nOutlook が起動している場合は、先に終了してください。"
!insertmacro MUI_PAGE_WELCOME

!define MUI_STARTMENUPAGE_REGISTRY_ROOT "HKCU"
!define MUI_STARTMENUPAGE_REGISTRY_KEY "Software\KURU"
!define MUI_STARTMENUPAGE_REGISTRY_VALUENAME "Start Menu Folder"
!define MUI_STARTMENUPAGE_DEFAULTFOLDER "LexCrew Mail"
Var AppStartMenuFolder
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "インストールの完了"
!define MUI_FINISHPAGE_TEXT "LexCrew Mail をインストールしました。$\r$\n$\r$\nOutlook を起動すると、メールのリボンに LexCrew が出ます。"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "デスクトップショートカットを作成する"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "LexCrew Mail を起動する"
!define MUI_FINISHPAGE_RUN_FUNCTION RunTray
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Japanese"

Var PowerShell

Function .onInit
  SetShellVarContext current
  ReadRegStr $0 HKCU "Software\KURU" "Start Menu Folder"
  ${If} $0 == "KURU"
    WriteRegStr HKCU "Software\KURU" "Start Menu Folder" "LexCrew Mail"
  ${EndIf}
FunctionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Function CreateDesktopShortcut
  SetShellVarContext current
  Delete "$DESKTOP\KURU.lnk"
  CreateShortCut "$DESKTOP\LexCrew Mail.lnk" "$INSTDIR\KuruTray.exe" "" "$INSTDIR\lexcrew.ico" 0
FunctionEnd

Function RunTray
  Exec '"$INSTDIR\KuruTray.exe"'
FunctionEnd

Function ExplainInstallFailure
  ${If} $0 = 2
    MessageBox MB_ICONEXCLAMATION "Outlook を終了してから、もう一度インストールしてください。"
  ${ElseIf} $0 = 3
    !if "${BITNESS}" == "x86"
    MessageBox MB_ICONSTOP "この Outlook は 64 ビット版です。このパッケージは 32 ビット版の Outlook 用です。"
    !else
    MessageBox MB_ICONSTOP "この Outlook は 32 ビット版です。LexCrew Mail は 64 ビット版の Outlook にだけ対応しています。"
    !endif
  ${ElseIf} $0 = 4
    MessageBox MB_ICONEXCLAMATION "WebView2 ランタイムが見つかりません。LexCrew Mail の画面を出すには、次から入れてから、もう一度インストールしてください。$\n$\nhttps://developer.microsoft.com/microsoft-edge/webview2/"
  ${ElseIf} $0 = 5
    MessageBox MB_ICONSTOP "RegAsm.exe が見つかりません。"
  ${ElseIf} $0 = 6
    MessageBox MB_ICONSTOP "COM 登録ファイルを作成できませんでした。"
  ${ElseIf} $0 = 7
    MessageBox MB_ICONSTOP "COM 登録に失敗しました。"
  ${ElseIf} $0 = 8
    MessageBox MB_ICONSTOP "ファイルをコピーできませんでした。"
  ${Else}
    MessageBox MB_ICONSTOP "インストールに失敗しました。終了コード $0"
  ${EndIf}
FunctionEnd

Function FindPowerShell
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" ps_found ps_missing
  ps_found:
    StrCpy $PowerShell "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
    Return
  ps_missing:
    MessageBox MB_ICONSTOP "64 ビットの PowerShell が見つかりません。LexCrew Mail は 64 ビットの Windows が必要です。"
    Abort
FunctionEnd

Section "Install"
  SetShellVarContext current
  Call FindPowerShell

  InitPluginsDir
  SetOutPath "$PLUGINSDIR\payload"
  File /r "${PAYLOAD}\*.*"

  DetailPrint "インストールしています..."
  ExecWait '"$PowerShell" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\payload\install.ps1" -NonInteractive' $0
  ${If} $0 <> 0
    Call ExplainInstallFailure
    Abort
  ${EndIf}

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "DisplayName" "LexCrew Mail"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "Publisher" "LexCrew"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU" "NoRepair" 1

  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    Delete "$SMPROGRAMS\$AppStartMenuFolder\KURU.lnk"
    CreateShortCut "$SMPROGRAMS\$AppStartMenuFolder\LexCrew Mail.lnk" "$INSTDIR\KuruTray.exe" "" "$INSTDIR\lexcrew.ico" 0
    ${If} $AppStartMenuFolder != "KURU"
      Delete "$SMPROGRAMS\KURU\KURU.lnk"
      RMDir "$SMPROGRAMS\KURU"
    ${EndIf}
  !insertmacro MUI_STARTMENU_WRITE_END
  Delete "$SMPROGRAMS\KURU\KURU.lnk"
  RMDir "$SMPROGRAMS\KURU"
  IfFileExists "$DESKTOP\KURU.lnk" 0 desktop_lex
    Delete "$DESKTOP\KURU.lnk"
    CreateShortCut "$DESKTOP\LexCrew Mail.lnk" "$INSTDIR\KuruTray.exe" "" "$INSTDIR\lexcrew.ico" 0
    Goto desktop_done
  desktop_lex:
  IfFileExists "$DESKTOP\LexCrew Mail.lnk" 0 desktop_done
    Delete "$DESKTOP\LexCrew Mail.lnk"
    CreateShortCut "$DESKTOP\LexCrew Mail.lnk" "$INSTDIR\KuruTray.exe" "" "$INSTDIR\lexcrew.ico" 0
  desktop_done:
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Call un.FindPowerShell

  DetailPrint "登録を解除しています..."
  ExecWait '"$PowerShell" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\uninstall.ps1" -NonInteractive' $0
  ${If} $0 = 2
    MessageBox MB_ICONEXCLAMATION "Outlook を終了してから、もう一度アンインストールしてください。"
    Abort
  ${ElseIf} $0 <> 0
    MessageBox MB_ICONSTOP "アンインストールに失敗しました。終了コード $0"
    Abort
  ${EndIf}

  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  ${If} $AppStartMenuFolder != ""
    Delete "$SMPROGRAMS\$AppStartMenuFolder\KURU.lnk"
    Delete "$SMPROGRAMS\$AppStartMenuFolder\LexCrew Mail.lnk"
    RMDir "$SMPROGRAMS\$AppStartMenuFolder"
  ${EndIf}
  Delete "$SMPROGRAMS\KURU\KURU.lnk"
  RMDir "$SMPROGRAMS\KURU"
  Delete "$DESKTOP\KURU.lnk"
  Delete "$DESKTOP\LexCrew Mail.lnk"

  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KURU"
  DeleteRegKey HKCU "Software\KURU"
SectionEnd

Function un.FindPowerShell
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" un_ps_found un_ps_missing
  un_ps_found:
    StrCpy $PowerShell "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
    Return
  un_ps_missing:
    MessageBox MB_ICONSTOP "64 ビットの PowerShell が見つかりません。LexCrew Mail は 64 ビットの Windows が必要です。"
    Abort
FunctionEnd
