# Icon & Favicon Mapping

The Expo config already points each platform to specific assets. Use the table below whenever you update icons so the correct files get replaced.

| Target                          | Path                                        | Current Size | Notes |
|---------------------------------|---------------------------------------------|--------------|-------|
| Expo / iOS / default icon       | `assets/images/icon.png`                    | 1024×1024    | Main app icon (source: `blow-grid logo.png`). |
| Android adaptive foreground     | `assets/images/android-icon-foreground.png` | 1024×1024    | Foreground layer (transparent padding). |
| Android adaptive background     | `assets/images/android-icon-background.png` | 1024×1024    | Flat background color. |
| Android adaptive monochrome     | `assets/images/android-icon-monochrome.png` | 1024×1024    | Used for themed icons on Android 13+. |
| Web favicon (default `<link>`)  | `assets/images/favicon.png`                 | 64×64        | Referenced by `expo.web.favicon`. |
| PWA icon (192)                  | `assets/images/favicon-192.png`             | 192×192      | Listed in `expo.web.manifest.icons`. |
| PWA icon (512)                  | `assets/images/favicon-512.png`             | 512×512      | Listed in `expo.web.manifest.icons`. |
| Apple touch icon                | `assets/images/apple-touch-icon.png`        | 180×180      | Used for iOS Safari pinned icons. |

## Verifying sizes

Use PowerShell/.NET to confirm dimensions without opening a GUI:

```powershell
Add-Type -AssemblyName System.Drawing
$root = "C:\path\to\repo\assets\images"
$files = "icon.png","android-icon-foreground.png","android-icon-background.png","android-icon-monochrome.png","favicon.png","favicon-192.png","favicon-512.png","apple-touch-icon.png"
foreach ($file in $files) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $root $file))
  "{0}`t{1}x{2}" -f $file,$img.Width,$img.Height
  $img.Dispose()
}
```

Run that after swapping in new artwork to ensure nothing regresses.
