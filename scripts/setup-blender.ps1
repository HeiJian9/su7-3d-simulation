$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsPath = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolsPath | Out-Null
$baseUrl = 'https://download.blender.org/release/Blender4.5/'
$listing = (Invoke-WebRequest -UseBasicParsing -Uri $baseUrl).Content
$candidates = [regex]::Matches($listing, 'href="(blender-(4\.5\.\d+)-windows-x64\.zip)"') | ForEach-Object {
  [pscustomobject]@{ File = $_.Groups[1].Value; Version = [version]$_.Groups[2].Value }
}
$chosen = $candidates | Sort-Object Version -Descending | Select-Object -First 1
if (!$chosen) { throw 'Official Blender LTS package was not found.' }
$archive = Join-Path $toolsPath $chosen.File
$folder = Join-Path $toolsPath ([IO.Path]::GetFileNameWithoutExtension($chosen.File))
if (!(Test-Path -LiteralPath $archive)) {
  Write-Output "Downloading official Blender $($chosen.Version) LTS"
  Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + $chosen.File) -OutFile $archive
}
$sumFile = "blender-$($chosen.Version).sha256"
$sumText = (Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + $sumFile)).Content
$line = $sumText -split "`n" | Where-Object { $_ -match [regex]::Escape($chosen.File) } | Select-Object -First 1
if (!$line) { throw 'Official checksum was not found.' }
$expected = ($line.Trim() -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expected -ne $actual) { throw 'Blender checksum mismatch.' }
Write-Output "Verified SHA256: $actual"
if (!(Test-Path -LiteralPath (Join-Path $folder 'blender.exe'))) {
  Expand-Archive -LiteralPath $archive -DestinationPath $toolsPath -Force
}
[pscustomobject]@{ version = $chosen.Version.ToString(); url = ($baseUrl + $chosen.File); sha256 = $actual; executable = (Join-Path $folder 'blender.exe') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsPath 'blender-install.json') -Encoding utf8
Write-Output (Join-Path $folder 'blender.exe')
