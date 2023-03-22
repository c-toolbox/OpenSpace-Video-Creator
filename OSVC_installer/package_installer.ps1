# Set base path
$basepath = ($MyInvocation.MyCommand.Path).substring(0, $MyInvocation.MyCommand.Path.length - $MyInvocation.MyCommand.name.length)

# Set correct path
cd  $basepath

# Build Tauri
npm run tauri build

# Get latest .msi package with matching name that Tauri generated
$videoname = (get-childitem "..\src-tauri\target\release\bundle\msi\OpenSpace Video Creator*?*x64_sv-SE.msi" | sort lastwritetime -Descending )[0].name

# Copy file and set correct name
Copy-Item ("..\src-tauri\target\release\bundle\msi\" + $videoname) .\OpenSpace_Video_Creator.msi

# Create zip
Get-ChildItem -Path .\OpenSpace_Video_Creator.msi, .\RUN_AS_ADMIN.bat |
  Compress-Archive -DestinationPath .\OSVC_installer.zip -Force