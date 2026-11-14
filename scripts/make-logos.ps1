Add-Type -AssemblyName System.Drawing
$destDir = "D:\Downloads\Windows Files\THOGAI\public\logos"

function Make-SquareLogo($srcPath, $outPath, $bgColorHex) {
    $src = [System.Drawing.Bitmap]::FromFile($srcPath)
    $dim = [Math]::Max($src.Width, $src.Height)
    $square = New-Object System.Drawing.Bitmap $dim, $dim, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($square)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $bg = [System.Drawing.ColorTranslator]::FromHtml($bgColorHex)
    $g.Clear($bg)
    $x = [int](($dim - $src.Width) / 2)
    $y = [int](($dim - $src.Height) / 2)
    $g.DrawImage($src, $x, $y, $src.Width, $src.Height)
    $g.Dispose()
    $src.Dispose()
    $square.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $square.Dispose()
    Write-Host ("Created " + $outPath)
}

# Theme 1: Deep Navy & Gold (Dark)
Make-SquareLogo "$destDir\icon-navy.jpg" "$destDir\logo-navy.jpg" "#022A68"

# Theme 2: Midnight Liquid (Light)
# User specifically requested: 2nd - Light mode type!
# We can make a beautiful light mode squircle from card-liquid-light or render light squircle:
# In the light version, background is clean #FEFEFC / #FAF8FF with crisp purple 'TF' logo
# Let's crop just the 'TF' logo from card-liquid-light:
# In card-liquid-light (w=196, h=108), the mark is on the left side: x ~ 10 to 80, y ~ 15 to 90
Make-SquareLogo "$destDir\icon-liquid.jpg" "$destDir\logo-liquid-dark.jpg" "#1A0944"
# For light mode logo-liquid.jpg:
# Let's crop the purple TF mark and place it on light squircle
$srcCard = [System.Drawing.Bitmap]::FromFile("$destDir\card-liquid-light.jpg")
$markCrop = New-Object System.Drawing.Bitmap 148, 144, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($markCrop)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#FEFEFC"))
# Draw mark portion (first ~80px of card) centered
$g.DrawImage($srcCard, (New-Object System.Drawing.Rectangle 34, 18, 80, 108), (New-Object System.Drawing.Rectangle 10, 0, 80, 108), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$srcCard.Dispose()
$markCrop.Save("$destDir\icon-liquid-light.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$markCrop.Dispose()
Make-SquareLogo "$destDir\icon-liquid-light.jpg" "$destDir\logo-liquid.jpg" "#FEFEFC"

# Theme 3: Cream Clay (Light)
# User requested: 3rd - Light mode type
Make-SquareLogo "$destDir\icon-cream.jpg" "$destDir\logo-cream.jpg" "#FBEEDD"

# Theme 4: Green Midnight (Dark)
# User requested: 4th - Dark mode type
Make-SquareLogo "$destDir\icon-midnight.jpg" "$destDir\logo-midnight.jpg" "#036045"

# Theme 5: Graphite Cyan (Dark)
# User requested: 5th - Dark mode type
Make-SquareLogo "$destDir\icon-cyan.jpg" "$destDir\logo-cyan.jpg" "#1C2434"

# Default logo
Copy-Item -Path "$destDir\logo-navy.jpg" -Destination "$destDir\logo-default.jpg" -Force
Write-Host "Updated all logo-*.jpg"
