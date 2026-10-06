import { dotnet } from './_framework/dotnet.js';

// Delivery settings written by tools/stage.mjs (absent in the dev server and in a plain publish
// output: then everything is fetched as is and the host is expected to honour the precompressed
// .br/.gz files itself). { build, brotli, only }: when `brotli` is set the host cannot send
// Content-Encoding (GitHub Pages) or a file is over the host's size limit (Cloudflare Workers,
// 25 MiB), so the big binaries are fetched as <file>.br and decoded here (see br.js).
// `only` (or null) lists the files that exist solely as .br.
const staging = await fetch('staging.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);

const BINARY = /\.(wasm|dll|dat)$/;
function wantsBrotli(url) {
    if (!staging?.brotli) {
        return false;
    }
    const path = new URL(url, location.href).pathname;
    return BINARY.test(path) && (!staging.only || staging.only.some(f => path.endsWith('/' + f)));
}

// The dev server (WasmAppHost) sporadically answers 404 for a few assets while the boot
// loader downloads hundreds of them in parallel; retry with backoff instead of failing the
// whole boot on the first flaky response.
async function fetchWithRetry(url, integrity, attempts = 10) {
    for (let attempt = 0; ; attempt++) {
        try {
            // Default cache mode: assets are fingerprinted and served with long-lived
            // immutable caching, so repeat visits load from the browser cache.
            const response = await fetch(url, { integrity: integrity || undefined });
            if (response.ok || attempt >= attempts - 1) {
                return response;
            }
        } catch (error) {
            // A 404 body also fails the subresource-integrity check, which makes fetch
            // throw rather than return a non-ok response; retry those too.
            if (attempt >= attempts - 1) {
                throw error;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
}

// Decoded binaries are kept in the Cache API (keyed by their fingerprinted URL, namespaced by
// build) so a repeat visit needs neither the network nor the decoder.
const cachePromise = (async () => {
    if (!staging?.brotli || !('caches' in globalThis)) {
        return null;
    }
    const name = 'ilspy-' + staging.build;
    for (const key of await caches.keys()) {
        if (key.startsWith('ilspy-') && key !== name) {
            await caches.delete(key);
        }
    }
    return caches.open(name);
})().catch(() => null);

async function fetchBinary(url, integrity) {
    if (!wantsBrotli(url)) {
        return fetchWithRetry(url, integrity);
    }
    const cache = await cachePromise;
    const absolute = new URL(url, location.href).href;
    const hit = await cache?.match(absolute);
    if (hit) {
        return hit;
    }
    try {
        const packed = await fetchWithRetry(absolute + '.br', undefined, 1);
        if (!packed.ok) {
            throw new Error('HTTP ' + packed.status);
        }
        const { brotliDecode } = await import('./br.js');
        const bytes = await brotliDecode(new Uint8Array(await packed.arrayBuffer()));
        const headers = { 'Content-Type': absolute.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' };
        await cache?.put(absolute, new Response(bytes, { headers }));
        return new Response(bytes, { headers });
    } catch (error) {
        // No .br (or it does not decode): fall back to the plain file unless it was removed.
        if (staging.only?.length) {
            throw error;
        }
        console.warn('Falling back to the uncompressed file for ' + url, error);
        return fetchWithRetry(url, integrity);
    }
}

const dotnetRuntime = await dotnet
    .withDiagnosticTracing(false)
    .withResourceLoader((type, name, defaultUri, integrity, behavior) => {
        if (type === 'dotnetjs') {
            return defaultUri;
        }
        return fetchBinary(defaultUri, integrity);
    })
    .create();

document.getElementById('splash')?.remove();

const config = dotnetRuntime.getConfig();

// Download the sample assembly (a static web asset, see ILSpy.Browser.csproj) into the
// emscripten virtual file system so ILSpy can open it like a file on disk. Positional
// command-line arguments are ILSpy's AssembliesToLoad.
const sampleVfsPath = '/samples/ICSharpCode.Decompiler.dll';
const args = [];
try {
    const response = await fetchBinary('samples/ICSharpCode.Decompiler.dll');
    if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        const fs = dotnetRuntime.Module.FS;
        fs.mkdirTree('/samples');
        fs.writeFile(sampleVfsPath, bytes);
        args.push(sampleVfsPath);
    }
} catch (error) {
    console.warn('Could not stage the sample assembly; starting with an empty list.', error);
}

// Drag & drop: Avalonia's browser backend has no drag-and-drop support, so handle the
// HTML5 events here — stage each dropped file into the virtual file system (uniquifying
// the name so a re-drop doesn't clobber an already-loaded assembly) and hand the paths
// to the exported BrowserInterop.OpenFiles, which funnels into the normal open path.
const interopExports = await dotnetRuntime.getAssemblyExports(config.mainAssemblyName);
const vfs = dotnetRuntime.Module.FS;

function uniqueUploadPath(name) {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let path = '/uploads/' + name;
    for (let i = 2; vfs.analyzePath(path).exists; i++) {
        path = `/uploads/${stem} (${i})${ext}`;
    }
    return path;
}

// Both dragenter and dragover must be cancelled for the browser to treat the page as a
// valid drop target for OS file drags; dropEffect drives the cursor.
document.addEventListener('dragenter', event => event.preventDefault());
document.addEventListener('dragover', event => {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
});
document.addEventListener('drop', async event => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) {
        return;
    }
    try {
        vfs.mkdirTree('/uploads');
        const paths = [];
        for (const file of files) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const path = uniqueUploadPath(file.name);
            vfs.writeFile(path, bytes);
            paths.push(path);
        }
        interopExports.ICSharpCode.ILSpy.Browser.BrowserInterop.OpenFiles(paths);
    } catch (error) {
        console.error('Failed to open dropped files.', error);
    }
});

await dotnetRuntime.runMain(config.mainAssemblyName, args);
