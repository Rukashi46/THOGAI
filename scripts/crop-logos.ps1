Add-Type -AssemblyName System.Drawing
$imgPath = 'C:\Users\Varun\.gemini\antigravity\brain\9fe25812-404a-4311-806b-7557191d459f\.user_uploaded\media_1794657667453_4ef9a86b.jpg'
$img = [System.Drawing.Bitmap]::FromFile($imgPath)
$destDir = "D:\Downloads\Windows Files\THOGAI\public\logos"

function Crop-Image($x, $y, $w, $h, $outPath) {
    $rect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
    $crop = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($crop)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $crop.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $crop.Dispose()
    Write-Host ("Saved " + $outPath)
}

# 1. Five squircle app icons (row at top: y=231, h=144, w=148)
# Centers: 126, 319, 512, 705, 898 -> x: 52, 245, 438, 631, 824
Crop-Image 52 231 148 144 "$destDir\icon-navy.jpg"
Crop-Image 245 231 148 144 "$destDir\icon-liquid.jpg"
Crop-Image 438 231 148 144 "$destDir\icon-cream.jpg"
Crop-Image 631 231 148 144 "$destDir\icon-midnight.jpg"
Crop-Image 824 231 148 144 "$destDir\icon-cyan.jpg"

# 2. Row 1 Light Cards (y=441, h=108, w=196)
# Cards: x = 7, 209, 411, 613, 815
Crop-Image 7 441 196 108 "$destDir\card-navy-light.jpg"
Crop-Image 209 441 196 108 "$destDir\card-liquid-light.jpg"
Crop-Image 411 441 196 108 "$destDir\card-cream-light.jpg"
Crop-Image 613 441 196 108 "$destDir\card-midnight-light.jpg"
Crop-Image 815 441 196 108 "$destDir\card-cyan-light.jpg"

# 3. Row 2 Dark Cards (y=549, h=98, w=196)
Crop-Image 7 549 196 98 "$destDir\card-navy-dark.jpg"
Crop-Image 209 549 196 98 "$destDir\card-liquid-dark.jpg"
Crop-Image 411 549 196 98 "$destDir\card-cream-dark.jpg"
Crop-Image 613 549 196 98 "$destDir\card-midnight-dark.jpg"
Crop-Image 815 549 196 98 "$destDir\card-cyan-dark.jpg"

# 4. Now generate the active theme logos:
# 1st theme (navy): dark -> card-navy-dark / icon-navy
# 2nd theme (liquid): light -> card-liquid-light / icon-liquid
# 3rd theme (cream): light -> card-cream-light / icon-cream
# 4th theme (midnight): dark -> card-midnight-dark / icon-midnight
# 5th theme (cyan): dark -> card-cyan-dark / icon-cyan

# For the brand header / auth screen brand mark (which uses squircle or logo):
# In THOGAI, getThemeLogo returns /logos/logo-{theme}.jpg
# Let's create:
# logo-navy.jpg -> from icon-navy.jpg (or square version)
# logo-liquid.jpg -> for light mode, let's crop squircle or square light version
# logo-cream.jpg -> squircle icon-cream.jpg
# logo-midnight.jpg -> squircle icon-midnight.jpg
# logo-cyan.jpg -> squircle icon-cyan.jpg
# logo-default.jpg -> icon-navy.jpg

$img.Dispose()
