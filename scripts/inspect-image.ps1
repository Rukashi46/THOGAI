Add-Type -AssemblyName System.Drawing
$imgPath = 'C:\Users\Varun\.gemini\antigravity\brain\9fe25812-404a-4311-806b-7557191d459f\.user_uploaded\media_1794657667453_4ef9a86b.jpg'
$img = [System.Drawing.Bitmap]::FromFile($imgPath)

# Check the mark in Card 1 (x=220 to 280, y=470 to 520)
Write-Host "Card 1 (Liquid Light) mark sample:"
for ($y = 480; $y -lt 510; $y += 5) {
    for ($x = 230; $x -lt 275; $x += 5) {
        $p = $img.GetPixel($x, $y)
        if ($p.R -lt 150 -and $p.B -gt 100) {
            Write-Host ("  Mark pixel at " + $x + "," + $y + ": #" + $p.R.ToString("X2") + $p.G.ToString("X2") + $p.B.ToString("X2"))
        }
    }
}

$img.Dispose()
