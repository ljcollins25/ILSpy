#!/usr/bin/env bash
# Builds ILSpy.Browser as a self-contained static site, without the wasm-tools workload
# (build/NoWorkloadWasm.props fetches the WebAssembly toolchain packs from NuGet instead).
#   ILSpy.Browser/build-static.sh <outdir> [--target=pages|cloudflare] [--aot] [--base=/ilspy] [--headers=<file>]
# <outdir> receives the site root (index.html, _framework/, ...); upload its contents under any path.
#   --target   delivery (see tools/stage.mjs): pages (default; .br binaries decoded in the page) or cloudflare
#   --aot      opt-in ahead-of-time compilation (15-20 minutes on CI; the default is a relink build, ~3 minutes)
#   --base     URL path the site is served under, used only for the Cloudflare _headers rules (default /<outdir name>)
#   --headers  Workers _headers file to append this app's rules to (cloudflare target)
# Needs the .NET 10 SDK, node 20+ and network access (NuGet, npm). Runs on ubuntu-latest as is.
set -euo pipefail

if [ $# -lt 1 ] || [[ "$1" == --* ]]; then sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2; fi
out="$1"; shift
target=pages; aot=false; stage_args=()
for a in "$@"; do
  case "$a" in
    --target=*) target="${a#--target=}" ;;
    --aot) aot=true ;;
    --base=*|--headers=*) stage_args+=("$a") ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$out"; out="$(cd "$out" && pwd)"
case "$out" in "$here"|"$here"/*) echo "outdir must be outside ILSpy.Browser/" >&2; exit 2 ;; esac
cd "$here"

# The sample assembly (see StageSampleAssembly in the csproj) must exist before the project is
# evaluated: static web assets are discovered at evaluation time.
dotnet build ../ICSharpCode.Decompiler/ICSharpCode.Decompiler.csproj -c Release -f netstandard2.0 -v:q -nologo
mkdir -p wwwroot/samples
cp ../ICSharpCode.Decompiler/bin/Release/netstandard2.0/ICSharpCode.Decompiler.dll wwwroot/samples/

(cd tools && npm ci --no-audit --no-fund)

pub="$here/bin/Release/publish-static"
rm -rf "$pub"
if $aot; then
  dotnet publish ILSpy.Browser.csproj -c Release -p:NoWorkloadWasmAot=true -p:TreatWarningsAsErrors=false -p:IntermediateOutputPath=obj/aot/ -o "$pub"
else
  dotnet publish ILSpy.Browser.csproj -c Release -o "$pub"
fi

node tools/stage.mjs "$pub/wwwroot" "$out" --target="$target" ${stage_args[@]+"${stage_args[@]}"}
echo "Static site ready: $out"
