$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildZipPath = Join-Path $RepoRoot "builds\yomitan-chrome.zip"
$DestinationPath = "C:\Users\Beangate\GSM\GameSentenceMiner\GSM_Overlay\yomitan"
$TempExtractPath = Join-Path ([System.IO.Path]::GetTempPath()) ("yomitan-chrome-build-" + [System.Guid]::NewGuid().ToString("N"))
$LatestReleaseApi = "https://api.github.com/repos/yomidevs/yomitan/releases/latest"

Write-Host "Fetching latest Yomitan release tag..."
$LatestRelease = Invoke-RestMethod -Uri $LatestReleaseApi -Headers @{
    Accept = "application/vnd.github+json"
    "User-Agent" = "yomitan-gsm-local-build-script"
}
$LatestTag = $LatestRelease.tag_name
if ([string]::IsNullOrWhiteSpace($LatestTag)) {
    throw "Unable to determine latest release tag from $LatestReleaseApi"
}

$ManifestVersion = $LatestTag -replace "^[^\d]*", ""
# $ManifestVersion = "0.0.0.0"
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
    if ((Resolve-Path -LiteralPath $DestinationPath).Path -ne "C:\Users\Beangate\GSM\GameSentenceMiner\GSM_Overlay\yomitan") { throw "Unexpected vendor destination" }
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
