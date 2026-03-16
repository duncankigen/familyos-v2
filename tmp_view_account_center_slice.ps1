$lines = Get-Content -Path 'js/core/app.js'
for ($i = 774; $i -le 1080; $i++) {
  if ($i -le $lines.Length) {
    Write-Output ("{0}:{1}" -f $i, $lines[$i - 1])
  }
}
