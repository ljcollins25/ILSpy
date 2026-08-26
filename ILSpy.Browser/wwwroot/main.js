import { dotnet } from './_framework/dotnet.js';

const dotnetRuntime = await dotnet
    .withDiagnosticTracing(false)
    // The dev server (WasmAppHost) sporadically answers 404 for a few assets while the
    // boot loader downloads hundreds of them in parallel; retry with backoff instead of
    // failing the whole boot on the first flaky response.
    .withResourceLoader((type, name, defaultUri, integrity, behavior) => {
        if (type === 'dotnetjs') {
            return defaultUri;
        }
        return (async () => {
            for (let attempt = 0; ; attempt++) {
                try {
                    const response = await fetch(defaultUri, {
                        cache: 'no-cache',
                        integrity: integrity || undefined
                    });
                    if (response.ok || attempt >= 9) {
                        return response;
                    }
                } catch (error) {
                    // A 404 body also fails the subresource-integrity check, which makes
                    // fetch throw rather than return a non-ok response; retry those too.
                    if (attempt >= 9) {
                        throw error;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
            }
        })();
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
    const response = await fetch('samples/ICSharpCode.Decompiler.dll');
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
