// Copyright (c) 2026 Kirill Osenkov
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files (the "Software"), to deal in the Software
// without restriction, including without limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
// to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or
// substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
// PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
// FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

using Avalonia.Threading;

using ICSharpCode.ILSpy.AppEnv;
using ICSharpCode.ILSpy.AssemblyTree;
using ICSharpCode.ILSpy.Docking;
using ICSharpCode.ILSpy.TextView;

namespace ICSharpCode.ILSpy.Browser
{
	/// <summary>
	/// Methods exported to the hosting JavaScript. Avalonia's browser backend has no
	/// drag-and-drop support, so main.js listens for the HTML5 drop events itself, stages
	/// the dropped files into the virtual file system, and hands the staged paths over here.
	/// </summary>
	[SupportedOSPlatform("browser")]
	public static partial class BrowserInterop
	{
		/// <summary>
		/// Opens the given virtual-file-system paths in the assembly list, exactly like the
		/// Open command. A drop that arrives before the app finished composing is ignored.
		/// </summary>
		[JSExport]
		public static void OpenFiles(string[] paths)
		{
			Dispatcher.UIThread.Post(() => {
				AppComposition.TryGetExport<AssemblyTreeModel>()?.OpenFiles(paths);
			});
		}

		/// <summary>
		/// The text of the active decompiler tab, or an empty string. Avalonia paints the editor
		/// into a canvas, so the page cannot read the decompiled code from the DOM; the browser
		/// smoke test (tools/e2e.mjs) uses this to check what was decompiled.
		/// </summary>
		[JSExport]
		public static string GetDecompiledText()
		{
			var content = AppComposition.TryGetExport<DockWorkspace>()?.ActiveContentTabPage?.Content;
			return (content as DecompilerTabPageModel)?.Text ?? string.Empty;
		}
	}
}
