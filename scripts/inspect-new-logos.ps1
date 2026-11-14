Add-Type -AssemblyName System.Drawing
$img2Path = "C:\Users\Varun\.gemini\antigravity\brain\9fe25812-404a-4311-806b-7557191d459f\.user_uploaded\media_1794660413995_48f7316e.png"
$b2 = [System.Drawing.Bitmap]::FromFile($img2Path)

Write-Host "Scanning horizontal line at y=400 across x from 300 to 700:"
for ($x = 300; $x -lt 700; $x += 25) {
    $p = $b2.GetPixel($x, 400)
    Write-Host "x=$x Hex=#$($p.R.ToString('X2'))$($p.G.ToString('X2'))$($p.B.ToString('X2'))"
}

Write-Host "`nScanning vertical line at x=450 across y from 300 to 700:"
for ($y = 300; $y -lt 700; $y += 25) {
    $p = $b2.GetPixel(450, $y)
    Write-Host "y=$y Hex=#$($p.R.ToString('X2'))$($p.G.ToString('X2'))$($p.B.ToString('X2'))"
}

$b2.Dispose()
