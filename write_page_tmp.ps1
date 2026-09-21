$target = "C:\Users\david\Desktop\tucacas\global_green_tucacas\src\app\(admin)\admin\caja\conciliacion\page.tsx"
$content = Get-Content "C:\Users\david\Desktop\tucacas\global_green_tucacas\conciliacion_src.txt" -Raw
Set-Content -Path $target -Value $content -Encoding UTF8
Write-Host "Escrito OK"
