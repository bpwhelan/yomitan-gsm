param([string]$GsmRoot = (Join-Path $PSScriptRoot '..\GameSentenceMiner'))

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildZipPath = Join-Path $RepoRoot "builds\yomitan-chrome.zip"
$OverlayRoot = (Resolve-Path -LiteralPath (Join-Path $GsmRoot 'GSM_Overlay')).Path
$DestinationPath = Join-Path $OverlayRoot 'yomitan'
if (-not (Test-Path -LiteralPath (Join-Path $DestinationPath 'manifest.json') -PathType Leaf)) {
    throw "Expected an existing GSM extension in $DestinationPath"
}
if ((Get-Item -LiteralPath $DestinationPath).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "Unexpected linked extension destination: $DestinationPath"
}
$TempExtractPath = Join-Path ([System.IO.Path]::GetTempPath()) ("yomitan-chrome-build-" + [System.Guid]::NewGuid().ToString("N"))
$LatestTag = git -C $RepoRoot tag --merged HEAD --list '[0-9]*' --sort=-version:refname | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($LatestTag)) { throw "No upstream release tag found in this checkout" }

$ManifestVersion = $LatestTag -replace "^[^\d]*", ""
if ($ManifestVersion -notmatch "^\d+(\.\d+){0,3}$") {
    throw "Latest tag '$LatestTag' cannot be converted to a valid extension version."
}
$ManifestDisplayName = "Yomitan for GSM Overlay"

Write-Host "Building Chrome package..."
Push-Location $RepoRoot
try {
    npm run build -- --target chrome --version $ManifestVersion
    if ($LASTEXITCODE -ne 0) { throw "Yomitan build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $BuildZipPath)) {
    throw "Expected build zip was not found: $BuildZipPath"
}

Write-Host "Extracting build zip..."
New-Item -ItemType Directory -Path $TempExtractPath | Out-Null
try {
    Expand-Archive -LiteralPath $BuildZipPath -DestinationPath $TempExtractPath -Force
    # GSM serves these fonts on demand. Leave them in the browser extension build.
    foreach ($font in @("data/fonts/kanji-stroke-orders.ttf", "fonts/NotoSansJP-Regular.ttf")) {
        $fontPath = Join-Path $TempExtractPath $font
        if (Test-Path -LiteralPath $fontPath -PathType Leaf) {
            Remove-Item -LiteralPath $fontPath
        }
    }

    Write-Host "Updating destination: $DestinationPath"
    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
    Get-ChildItem -LiteralPath $DestinationPath -Force | Remove-Item -Recurse -Force
    Copy-Item -Path (Join-Path $TempExtractPath "*") -Destination $DestinationPath -Recurse -Force

    $ManifestPath = Join-Path $DestinationPath "manifest.json"
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "Copied build does not contain manifest.json at $ManifestPath"
    }

    Write-Host "Applying GSM manifest name: $ManifestDisplayName"
    $ManifestJson = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $ManifestJson.name = $ManifestDisplayName
    $ManifestJson | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
} finally {
    Write-Host "Cleaning up temp files..."
    if (Test-Path -LiteralPath $TempExtractPath) {
        $ResolvedExtractPath = (Resolve-Path -LiteralPath $TempExtractPath).Path
        $ExpectedTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $ResolvedExtractPath.StartsWith($ExpectedTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $ResolvedExtractPath) -notmatch '^yomitan-chrome-build-[0-9a-f]{32}$') { throw "Unexpected extraction directory" }
        Remove-Item -LiteralPath $TempExtractPath -Recurse -Force
    }
}

Write-Host "Done. Chrome build files were copied to $DestinationPath"
