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

await dotnetRuntime.runMain(config.mainAssemblyName, args);
