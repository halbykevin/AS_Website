; Installer hooks. ASDesk 0.3–0.5 ("Company Remote") was an Electron app with its own installer; replace it
; cleanly and keep this computer's ID. 0.3–0.4 kept it in %APPDATA%\Company Remote, 0.5 in
; %APPDATA%\ASDesk; the app adopts either on first run (src-tauri/src/identity.rs).
!define ELECTRON_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\d40bef01-72a3-5fe8-8548-f79d4afc2688"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKCU "${ELECTRON_UNINSTALL_KEY}" "QuietUninstallString"
  ${If} $R0 != ""
    DetailPrint "Removing the previous version (Company Remote)"
    ; Its executable has a different name from this app's, so close it explicitly.
    nsExec::Exec 'taskkill /F /IM "Company Remote.exe"'
    ; A copy the new app adopts if the old uninstaller ever clears the folder.
    ${If} ${FileExists} "$APPDATA\Company Remote\identity.json"
      CreateDirectory "$LOCALAPPDATA\com.companyremote.desktop\legacy"
      CopyFiles /SILENT "$APPDATA\Company Remote\identity.json" "$LOCALAPPDATA\com.companyremote.desktop\legacy"
      CopyFiles /SILENT "$APPDATA\Company Remote\Local State" "$LOCALAPPDATA\com.companyremote.desktop\legacy"
      CopyFiles /SILENT "$APPDATA\Company Remote\recent.json" "$LOCALAPPDATA\com.companyremote.desktop\legacy"
      CopyFiles /SILENT "$APPDATA\Company Remote\settings.json" "$LOCALAPPDATA\com.companyremote.desktop\legacy"
    ${EndIf}
    ; --updated tells the old uninstaller to keep app data.
    ExecWait '$R0 --updated'
  ${EndIf}

  ; ASDesk: earlier ASDesk builds (0.6.x) installed per user, so their uninstall entry is under HKCU.
  ; This per-machine installer only checks HKLM, so remove any per-user copy here — otherwise the old
  ; one lingers alongside the new one. The device ID lives in the data dir, which the uninstaller keeps,
  ; so it carries over. This runs at most once (the entry is gone afterwards); per-machine upgrades,
  ; which write only to HKLM, never trigger it.
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
  ${If} $R1 != ""
    DetailPrint "Removing the previous per-user ${PRODUCTNAME}"
    nsExec::Exec 'taskkill /F /IM "${MAINBINARYNAME}.exe"'
    ExecWait '$R1 /S'
  ${EndIf}
!macroend

; ASDesk: register the LocalSystem elevation service so an accepted session has full access to the
; client PC (elevated apps, UAC prompt, lock screen). The installer runs elevated (per-machine), so
; the app registers the service as itself; it is idempotent, so upgrades re-register cleanly.
!macro NSIS_HOOK_POSTINSTALL
  !if "${ASDESK_EDITION}" != "win7"
    ; Replacing the Windows 7 edition (Windows was upgraded): its private WebView2 is no longer used.
    FindFirst $R2 $R3 "$INSTDIR\Microsoft.WebView2.FixedVersionRuntime.*"
    ${DoWhile} $R3 != ""
      RMDir /r "$INSTDIR\$R3"
      FindNext $R2 $R3
    ${Loop}
    FindClose $R2
  !endif
  DetailPrint "Registering the ASDesk elevation service"
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --install-service'
!macroend

; ASDesk: remove the service before the files are deleted (the exe still exists here).
!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing the ASDesk elevation service"
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall-service'
!macroend

; ── Windows editions ────────────────────────────────────────────────────────────────────────────
; The standard installer (WebView2 from Microsoft, Windows 10 and 11) and the Windows 7 edition
; (tools/desktop.mjs package --win7: a private WebView2 109 runtime, the last that supports Windows 7
; and 8) are built from this template. Each stops before installing anything on a Windows it
; cannot run on, and says which installer to use instead. edition.nsh, written by tools/desktop.mjs
; for each build, defines ASDESK_EDITION ("standard" or "win7") and ASDESK_DOWNLOADS (the server's
; download folder, when one is configured).
!include /NONFATAL "${__FILEDIR__}\edition.nsh"
!ifndef ASDESK_EDITION
  !define ASDESK_EDITION "standard"
!endif
!ifdef ASDESK_DOWNLOADS
  !define ASDESK_WIN7_X64 "${ASDESK_DOWNLOADS}/ASDesk-Setup-win7-x64.exe"
  !define ASDESK_WIN7_X86 "${ASDESK_DOWNLOADS}/ASDesk-Setup-win7-x86.exe"
!else
  !define ASDESK_WIN7_X64 ""
  !define ASDESK_WIN7_X86 ""
!endif

; Shows why this installer cannot continue, offers to open the right download, and quits.
!macro ASDESK_REFUSE MESSAGE URL
  !ifdef ASDESK_DOWNLOADS
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "${MESSAGE}$\r$\n$\r$\nDownload it now?" /SD IDNO IDNO +2
    ExecShell "open" "${URL}"
  !else
    MessageBox MB_OK|MB_ICONEXCLAMATION "${MESSAGE}$\r$\n$\r$\nAsk your administrator for that installer." /SD IDOK
  !endif
  SetErrorLevel 1150 ; ERROR_OLD_WIN_VERSION
  Quit
!macroend

!macro ASDESK_CHECK_WINDOWS
  !if "${ASDESK_EDITION}" == "win7"
    ; Windows 7 edition: Windows 7 SP1 or later (WebView2 109 and the app need SP1).
    ${IfNot} ${AtLeastWin7}
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCTNAME} needs Windows 7 Service Pack 1 or later." /SD IDOK
      SetErrorLevel 1150
      Quit
    ${EndIf}
    ${If} ${IsWin7}
    ${AndIf} ${AtMostServicePack} 0
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCTNAME} needs Windows 7 Service Pack 1. Install it from Windows Update, then run this installer again." /SD IDOK
      SetErrorLevel 1150
      Quit
    ${EndIf}
    !if "${ARCH}" == "x86"
      ; 32-bit edition on 64-bit Windows 7/8: works, but the 64-bit one is the better fit.
      ${If} ${RunningX64}
      ${AndIfNot} ${AtLeastWin10}
      ${AndIfNot} ${Silent}
        !ifdef ASDESK_DOWNLOADS
          MessageBox MB_YESNO|MB_ICONQUESTION "This is the 32-bit edition of ${PRODUCTNAME}, and this computer runs 64-bit Windows.$\r$\n$\r$\nContinue with the 32-bit edition? (Choose No to download the 64-bit one.)" IDYES +3
          ExecShell "open" "${ASDESK_WIN7_X64}"
          Quit
        !endif
      ${EndIf}
    !endif
    ; On 64-bit Windows 10 and 11 the standard installer is the right one: its WebView2 keeps getting
    ; security updates, this edition's cannot. (32-bit Windows 10 has only this edition.)
    ${If} ${AtLeastWin10}
    ${AndIf} ${RunningX64}
    ${AndIfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION "This edition of ${PRODUCTNAME} is made for Windows 7 and 8. On this computer the standard installer is recommended, because it keeps the embedded browser up to date.$\r$\n$\r$\nInstall this edition anyway?" /SD IDYES IDYES +2
      Quit
    ${EndIf}
  !else
    ; Standard edition: Windows 10 or later, and (for the x64 build) 64-bit Windows.
    ${IfNot} ${AtLeastWin10}
      ${If} ${RunningX64}
        !insertmacro ASDESK_REFUSE "This installer needs Windows 10 or 11. For Windows 7 and 8, use the Windows 7 edition of ${PRODUCTNAME}." "${ASDESK_WIN7_X64}"
      ${Else}
        !insertmacro ASDESK_REFUSE "This installer needs Windows 10 or 11. For Windows 7 and 8, use the Windows 7 edition of ${PRODUCTNAME}." "${ASDESK_WIN7_X86}"
      ${EndIf}
    ${EndIf}
    !if "${ARCH}" == "x64"
      ${IfNot} ${RunningX64}
        !insertmacro ASDESK_REFUSE "This installer is for 64-bit Windows, and this computer runs 32-bit Windows. Use the 32-bit edition of ${PRODUCTNAME} instead." "${ASDESK_WIN7_X86}"
      ${EndIf}
    !endif
  !endif
!macroend
