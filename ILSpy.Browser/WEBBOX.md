# Hosting ILSpy.Browser in Ref12/webbox at `/ilspy/`

ILSpy (Avalonia) running in the browser on .NET WebAssembly, built workload-free and staged as a static site.

- **Fork / ref to pin:** `ljcollins25/ILSpy` at `f83873649e14fba7034f0cc0447069b7366445d5` (the commit that adds `build-static.sh`; bump it deliberately).
- **Build command** (ubuntu-latest, .NET 10 SDK >= 10.0.400, node 22; no workload):
  `ILSpy.Browser/build-static.sh <outdir> --target=pages` (or `--target=cloudflare`)
- **Output folder:** `<outdir>`: the site root (`index.html`, `staging.json`, hashed `main.*.js`, `_framework/`, `samples/`, `vendor/`).
  Copy its *contents* to `_site/ilspy/`. About 90 MiB on disk for Pages (70 MiB for Workers); largest file 10.7 MB (limit 25 MiB).
- **Time:** about 3 min on a cold runner (NuGet packs ~ 1 min of it), ~1.5 min with the NuGet cache. Default is relink; `--aot` is opt-in (15-20 min) and not needed.
- **Subpath:** every URL is relative (`<base href="./">`, relative imports), so it works at `/ilspy/` and `/webbox/ilspy/`. There is no service worker.
- **Pages:** no Content-Encoding available, so `--target=pages` keeps `.br` siblings of the `.wasm/.dll/.dat` files and `main.js` decodes them in the page (same idea as `csharp/`; `vendor/` holds the brotli-dec-wasm decoder, MIT OR Apache-2.0); the decoded files are cached in the Cache API. `staging.json` tells the page which mode it is in; app files are content-hashed.
- **Cloudflare:** `--target=cloudflare` ships no `.br`/`.gz` (edge compresses), fails if any file is over 25 MiB (a file over the limit would ship as `.br` only, decoded in the page), and `--headers=<_headers file>` appends this app's rules (no-cache for the entry files, immutable for hashed files, `application/wasm` for `*.wasm` so the edge compresses them). No COOP/COEP needed (no threads).

## Measured (headless Chromium, Pages-like server under `/webbox/ilspy/`, `tools/e2e.mjs`)

| | Pages (.br decoded in page) |
|---|---|
| Cold download to first decompile | 19.6 MiB, 275 requests |
| Cold time to first decompile (unthrottled, localhost) | 5.9 s |
| Warm (same browser profile) | 307 bytes, 4.6 s |
| Console errors / 4xx | 0 / 0 |

Run it yourself: `cd ILSpy.Browser/tools && npm ci && npx playwright install chromium && node e2e.mjs <outdir> --prefix=/webbox/ilspy`.

## Ready-to-paste: `pages.yml`

In the `deploy` job, before "Stage the site" (after the other builds):

```yaml
      # --- ILSpy (ILSpy in the browser, .NET WebAssembly): built from a pinned commit of the fork, no workload ---
      - name: Check out ILSpy
        uses: actions/checkout@v4
        with:
          repository: ljcollins25/ILSpy
          ref: f83873649e14fba7034f0cc0447069b7366445d5
          path: ilspy-src
      - name: Build ILSpy
        run: |
          ilspy-src/ILSpy.Browser/build-static.sh "$PWD/_ilspy_pages" --target=pages
          ilspy-src/ILSpy.Browser/build-static.sh "$PWD/_ilspy_cf" --target=cloudflare --base=/ilspy --headers="$PWD/_ilspy_headers"
      # --- end ILSpy ---
```

(The two builds share the restore and the compile; for a faster workflow publish once and stage twice: run `dotnet publish` via the script once and call `node ilspy-src/ILSpy.Browser/tools/stage.mjs ilspy-src/ILSpy.Browser/bin/Release/publish-static/wwwroot <out> --target=...` for the second target.)

The checkout is inside the workspace, so exclude it from the rsync copies of the repo: add `--exclude '/ilspy-src' --exclude '/_ilspy_pages' --exclude '/_ilspy_cf'` to both `rsync` lines. The NuGet cache key can stay as is (the packs come from the same SDK-bundled runtime version).

## Ready-to-paste: staging lines

In "Stage the site" (Pages):

```bash
          mkdir -p _site/ilspy && cp -r _ilspy_pages/. _site/ilspy/
```

In "Stage the Cloudflare site":

```bash
          mkdir -p _cf_site/ilspy && cp -r _ilspy_cf/. _cf_site/ilspy/
          cat _ilspy_headers >> _cf_site/_headers    # after the csharp/ and sharplab/ stage steps wrote _headers
```

Note: `stage.mjs` of `csharp/` writes `_cf_site/_headers` with `parts.join` (overwrites): keep the `cat >>` after it. Add an `ilspy/` card to the index page.
