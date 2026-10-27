# Export application sizes from the supplied logo; preserve the original file.
Add-Type -AssemblyName System.Drawing
$logoDirectory = Join-Path $PSScriptRoot '../public/logo'
$sourceImage = [System.Drawing.Image]::FromFile((Join-Path $logoDirectory 'logo.png'))
try {
    # The provided 2752 x 1536 image has wide white margins around this emblem.
    $emblem = [System.Drawing.Rectangle]::new(738, 120, 1320, 1320)
    foreach ($spec in @(@('icon-192.png', 192, 1.0), @('icon-512.png', 512, 1.0), @('icon-maskable-512.png', 512, 0.72), @('apple-touch-icon.png', 180, 1.0))) {
        $size = [int]$spec[1]
        $bitmap = [System.Drawing.Bitmap]::new($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $edge = [int]($size * [double]$spec[2])
            $inset = [int](($size - $edge) / 2)
            $target = [System.Drawing.Rectangle]::new($inset, $inset, $edge, $edge)
            $graphics.DrawImage($sourceImage, $target, $emblem, [System.Drawing.GraphicsUnit]::Pixel)
            $bitmap.Save((Join-Path $logoDirectory $spec[0]), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $sourceImage.Dispose() }
