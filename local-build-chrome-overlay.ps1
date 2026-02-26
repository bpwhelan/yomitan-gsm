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
if ($ManifestVersion -notmatch "^\d+(\.\d+){0,3}$") {
    throw "Latest tag '$LatestTag' cannot be converted to a valid extension version."
}
$ManifestDisplayName = "Yomitan for GSM Overlay"

Write-Host "Building Chrome package..."
Push-Location $RepoRoot
try {
    npm run build -- --target chrome --version $ManifestVersion
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
        Remove-Item -LiteralPath $TempExtractPath -Recurse -Force
    }
}

Write-Host "Done. Chrome build files were copied to $DestinationPath"
