Add-Type -AssemblyName System.Drawing

$srcLogo = "D:\Downloads\Windows Files\THOGAI\public\logos\logo-navy.jpg"
$resDir = "D:\Downloads\Windows Files\THOGAI\android\app\src\main\res"
$publicDir = "D:\Downloads\Windows Files\THOGAI\public"

function Resize-Image {
    param($srcPath, $destPath, $width, $height, [switch]$isRound, [switch]$isForeground, [switch]$isSplash)
    $src = [System.Drawing.Image]::FromFile($srcPath)
    $dest = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($isSplash) {
        $bgColor = [System.Drawing.ColorTranslator]::FromHtml("#0c0c13")
        $g.Clear($bgColor)
        # Scale logo to ~40% of the smaller dimension
        $minDim = [Math]::Min($width, $height)
        $logoSize = [int]($minDim * 0.45)
        if ($logoSize -lt 96) { $logoSize = 96 }
        if ($logoSize -gt $minDim) { $logoSize = $minDim }
        $x = [int](($width - $logoSize) / 2)
        $y = [int](($height - $logoSize) / 2)
        $g.DrawImage($src, $x, $y, $logoSize, $logoSize)
    } elseif ($isForeground) {
        $g.Clear([System.Drawing.Color]::Transparent)
        # Safe zone for adaptive icon is central 72dp out of 108dp (66.6%)
        $logoSize = [int]($width * 0.70)
        $x = [int](($width - $logoSize) / 2)
        $y = [int](($height - $logoSize) / 2)
        $g.DrawImage($src, $x, $y, $logoSize, $logoSize)
    } elseif ($isRound) {
        $g.Clear([System.Drawing.Color]::Transparent)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $width, $height)
        $g.SetClip($path)
        $g.DrawImage($src, 0, 0, $width, $height)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($src, 0, 0, $width, $height)
    }

    $g.Dispose()
    $src.Dispose()

    # Ensure dest directory exists
    $dir = [System.IO.Path]::GetDirectoryName($destPath)
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dest.Dispose()
    Write-Host "Generated: $destPath ($width x $height)"
}

# 1. Android Mipmap launcher icons
$densities = @(
    @{ Name = "mipmap-mdpi"; Size = 48; FgSize = 108 },
    @{ Name = "mipmap-hdpi"; Size = 72; FgSize = 162 },
    @{ Name = "mipmap-xhdpi"; Size = 96; FgSize = 216 },
    @{ Name = "mipmap-xxhdpi"; Size = 144; FgSize = 324 },
    @{ Name = "mipmap-xxxhdpi"; Size = 192; FgSize = 432 }
)

foreach ($d in $densities) {
    $folder = Join-Path $resDir $d.Name
    Resize-Image $srcLogo (Join-Path $folder "ic_launcher.png") $d.Size $d.Size
    Resize-Image $srcLogo (Join-Path $folder "ic_launcher_round.png") $d.Size $d.Size -isRound
    Resize-Image $srcLogo (Join-Path $folder "ic_launcher_foreground.png") $d.FgSize $d.FgSize -isForeground
}

# 2. Android Splash screens
$splashes = @(
    @{ Path = "drawable\splash.png"; W = 480; H = 320 },
    @{ Path = "drawable-land-hdpi\splash.png"; W = 800; H = 480 },
    @{ Path = "drawable-land-mdpi\splash.png"; W = 480; H = 320 },
    @{ Path = "drawable-land-xhdpi\splash.png"; W = 1280; H = 720 },
    @{ Path = "drawable-land-xxhdpi\splash.png"; W = 1600; H = 960 },
    @{ Path = "drawable-land-xxxhdpi\splash.png"; W = 1920; H = 1280 },
    @{ Path = "drawable-port-hdpi\splash.png"; W = 480; H = 800 },
    @{ Path = "drawable-port-mdpi\splash.png"; W = 320; H = 480 },
    @{ Path = "drawable-port-xhdpi\splash.png"; W = 720; H = 1280 },
    @{ Path = "drawable-port-xxhdpi\splash.png"; W = 960; H = 1600 },
    @{ Path = "drawable-port-xxxhdpi\splash.png"; W = 1280; H = 1920 }
)

foreach ($s in $splashes) {
    $dest = Join-Path $resDir $s.Path
    Resize-Image $srcLogo $dest $s.W $s.H -isSplash
}

# 3. Web & PWA icons
Resize-Image $srcLogo (Join-Path $publicDir "apple-touch-icon.png") 180 180
Resize-Image $srcLogo (Join-Path $publicDir "icon-192.png") 192 192
Resize-Image $srcLogo (Join-Path $publicDir "icon-512.png") 512 512

Write-Host "All icons and splash screens generated successfully!"

