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

using System.Threading.Tasks;

using Avalonia;
using Avalonia.Browser;

namespace ICSharpCode.ILSpy.Browser
{
	internal sealed class Program
	{
		// Started by main.js via runMain; Avalonia renders into the <div id="out"> element
		// declared in wwwroot/index.html.
		public static Task Main(string[] args)
			=> BuildAvaloniaApp().StartBrowserAppAsync("out");

		public static AppBuilder BuildAvaloniaApp()
			=> AppBuilder.Configure<App>()
				// The browser has no system font collection; ship Inter as the default UI font.
				.WithInterFont();
	}
}
