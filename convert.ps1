Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile("C:\Users\david\Desktop\tucacas\global_green_tucacas\public\logos\alcaldia.jpg")
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$g.Dispose()

for ($x = 0; $x -lt $bmp.Width; $x++) {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        $pixel = $bmp.GetPixel($x, $y)
        if ($pixel.R -lt 15 -and $pixel.G -lt 15 -and $pixel.B -lt 15) {
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::White)
        }
    }
}
$bmp.Save("C:\Users\david\Desktop\tucacas\global_green_tucacas\public\logos\alcaldia_white.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
$img.Dispose()
