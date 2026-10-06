#!/usr/bin/env pwsh
# Publishes the browser app as a self-contained static site.
#   ./publish-browser.ps1         -> interpreter build (fast to produce, larger startup cost)
#   ./publish-browser.ps1 -Aot    -> ahead-of-time compiled (very long build; see csproj notes)
# The deployable directory is printed at the end; upload its CONTENTS to any static host.
# The host needs no server-side logic; serving .wasm as application/wasm and honoring the
# precompressed .br/.gz files is enough. For GitHub Pages the included .nojekyll is required.
param([switch]$Aot)
$ErrorActionPreference = 'Stop'

# No wasm-tools workload is needed: build/NoWorkloadWasm.props fetches the WebAssembly toolchain
# packs from NuGet. (For a static site ready for GitHub Pages / Workers use build-static.sh.)
Set-Location $PSScriptRoot
if ($Aot) {
    dotnet publish ILSpy.Browser.csproj -c Release -p:NoWorkloadWasmAot=true -p:TreatWarningsAsErrors=false -p:IntermediateOutputPath=obj/aot/ -o bin\Release\publish-aot
    $out = Join-Path $PSScriptRoot 'bin\Release\publish-aot\wwwroot'
}
else {
    dotnet publish ILSpy.Browser.csproj -c Release
    $out = Join-Path $PSScriptRoot 'bin\Release\net10.0-browser\publish\wwwroot'
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""
Write-Host "Static site ready: $out"
