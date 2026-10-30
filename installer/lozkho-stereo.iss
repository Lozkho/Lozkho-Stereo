; ===========================================================================
; Lozkho Stereo — Script de instalador Inno Setup
; ===========================================================================
; Genera un instalador .exe para Windows 10 que:
;   - Copia la PWA estática a "C:\Program Files\LozkhoStereo"
;   - Crea accesos directos en Escritorio y Menú Inicio
;   - Crea una entrada en "Agregar o quitar programas"
;   - El ejecutable "LozkhoStereo.exe" abre la PWA en el navegador por defecto
;
; Requisitos:
;   - Inno Setup 6.x (https://jrsoftware.org/isdl.php)
;   - Haber generado ./out con `bun run build` previamente
;
; Uso (Windows, con Inno Setup instalado y en PATH):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\lozkho-stereo.iss
;
; Uso (Linux/macOS para cross-compile, requiere `iscc` vía wine o dotnet):
;   wine "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\lozkho-stereo.iss
;
; Salida:
;   dist/LozkhoStereo-Windows-installer.exe
; ===========================================================================

#define MyAppName        "Lozkho Stereo"
#define MyAppVersion     "0.2.1"
#define MyAppPublisher   "Lozkho Stereo"
#define MyAppExeName     "LozkhoStereo.exe"
#define MyAppURL         "https://github.com/USER/lozkho-stereo"

[Setup]
AppId={{8F4B2C9A-3D5E-4F6A-9B7C-1A2B3C4D5E6F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=LozkhoStereo-Windows-installer
SetupIconFile=..\public\icon-512.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64compatible
PrivilegesRequired=admin
UninstallDisplayName=Lozkho Stereo

; Idiomas soportados por el instalador
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el &Escritorio"; GroupDescription: "Accesos directos:"
Name: "startmenu"; Description: "Crear entrada en el &Menú Inicio"; GroupDescription: "Accesos directos:"

[Files]
; Toda la PWA estática generada por `next build`
Source: "..\out\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Menú inicio
Name: "{group}\Lozkho Stereo"; Filename: "{app}\LozkhoStereo.bat"; IconFilename: "{app}\icon-512.ico"; Comment: "Abrir Lozkho Stereo"
Name: "{group}\Desinstalar Lozkho Stereo"; Filename: "{uninstallexe}"

; Escritorio (opcional)
Name: "{commondesktop}\Lozkho Stereo"; Filename: "{app}\LozkhoStereo.bat"; IconFilename: "{app}\icon-512.ico"; Tasks: desktopicon; Comment: "Abrir Lozkho Stereo"

[Run]
; Abrir la app al finalizar la instalación
Filename: "{app}\LozkhoStereo.bat"; Description: "Abrir Lozkho Stereo ahora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Limpiar cache del service worker al desinstalar (opcional)
Type: filesandordirs; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
