# Set base path
$basepath = ($MyInvocation.MyCommand.Path).substring(0, $MyInvocation.MyCommand.Path.length - $MyInvocation.MyCommand.name.length)

# Set correct path
cd  $basepath

# Build Tauri
npm run tauri build

# Get latest .msi package with matching name that Tauri generated
$packagename = (get-childitem "..\src-tauri\target\release\bundle\msi\OpenSpace Video Creator*?*x64_sv-SE.msi" | sort lastwritetime -Descending )[0].name

# Get version number
$parts = $packagename -split "_"
$version;

forEach ($p in $parts) {
  if ($p -match '^(\d+\.)?(\d+\.)?(\*|\d+)$') {
    $version = $p
    break
  }
}

$fullname = "OpenSpace_Video_Creator_" + $version + "_release.msi";

# Copy file and set correct name
Copy-Item "..\src-tauri\target\release\bundle\msi\$packagename" ".\$fullname"

# Create zip (good to have if you ever want to package something else other than just the .msi file)
Get-ChildItem -Path ".\$fullname" | Compress-Archive -DestinationPath .\OSVC_installer.zip -Force