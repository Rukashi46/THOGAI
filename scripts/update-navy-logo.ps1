Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Varun\.gemini\antigravity\brain\9fe25812-404a-4311-806b-7557191d459f\.user_uploaded\media_1794660413995_48f7316e.png"
$destNavy = "D:\Downloads\Windows Files\THOGAI\public\logos\logo-navy.jpg"
$destDefault = "D:\Downloads\Windows Files\THOGAI\public\logos\logo-default.jpg"

$img = [System.Drawing.Bitmap]::FromFile($src)
$img.Save($destNavy, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$img.Save($destDefault, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$img.Dispose()

Write-Host "Saved new logo to logo-navy.jpg and logo-default.jpg"
