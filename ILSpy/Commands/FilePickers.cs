// Copyright (c) 2026 AlphaSierraPapa for the SharpDevelop Team
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

using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

using global::Avalonia.Controls.ApplicationLifetimes;
using global::Avalonia.Platform.Storage;

using ICSharpCode.ILSpy.AppEnv;

namespace ICSharpCode.ILSpy.Commands
{
	/// <summary>
	/// Helpers around <see cref="IStorageProvider"/> for save dialogs. Mirrors the WPF
	/// SaveFileDialog Filter API ("Display|*.ext;*.ext|...") so callers can keep the existing
	/// strings.
	/// </summary>
	public static class FilePickers
	{
		/// <summary>
		/// Shows a save-file picker. <paramref name="filter"/> uses WPF SaveFileDialog syntax —
		/// pairs of <c>display|patterns</c> joined by <c>|</c>. <paramref name="defaultFileName"/>
		/// pre-fills the file name (no path). Returns the selected absolute path, or <c>null</c>
		/// if the user cancelled.
		/// </summary>
		public static async Task<string?> SaveAsync(
			string filter,
			string? defaultFileName = null,
			string? title = null)
		{
			var owner = UiContext.MainWindow;
			if (owner == null)
				return null;

			var fileTypes = ParseFilter(filter);
			var suggested = defaultFileName != null
				? Path.GetFileName(defaultFileName)
				: null;

			var file = await owner.StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions {
				Title = title,
				FileTypeChoices = fileTypes,
				SuggestedFileName = suggested,
				DefaultExtension = fileTypes.Count > 0 ? GuessExtension(fileTypes[0]) : null,
			});

			return file?.TryGetLocalPath();
		}

		/// <summary>
		/// Shows an open-file picker for a single file. <paramref name="filter"/> uses the same
		/// WPF-style <c>display|patterns</c> syntax as <see cref="SaveAsync"/>. Returns the selected
		/// absolute path, or <c>null</c> if the user cancelled.
		/// </summary>
		public static async Task<string?> OpenAsync(string filter, string? title = null)
		{
			var owner = UiContext.MainWindow;
			if (owner == null)
				return null;

			var files = await owner.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions {
				Title = title,
				AllowMultiple = false,
				FileTypeFilter = ParseFilter(filter),
			});
			return files.Count == 0 ? null : files[0].TryGetLocalPath();
		}

		/// <summary>
		/// Shows a folder-picker dialog. <paramref name="title"/> appears in the dialog
		/// chrome. Returns the selected folder's absolute path, or <c>null</c> if the user
		/// cancelled or the storage provider refused to give a local path (e.g. cloud
		/// folder).
		/// </summary>
		public static async Task<string?> PickFolderAsync(string? title = null)
		{
			var owner = UiContext.MainWindow;
			if (owner == null)
				return null;

			var folders = await owner.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions {
				Title = title,
				AllowMultiple = false,
			});
			if (folders.Count == 0)
				return null;
			return folders[0].TryGetLocalPath();
		}

		/// <summary>
		/// Resolves a picked file to a path the assembly loaders can <see cref="File.OpenRead"/>.
		/// On desktop that is the file's own local path. On hosts whose picked files are
		/// stream-only (browser/WebAssembly), the content is copied into an uploads directory
		/// in the in-memory virtual file system and that path is returned. Returns null when
		/// the file has no local path and its content cannot be read.
		/// </summary>
		public static async Task<string?> GetOpenablePathAsync(IStorageFile file)
		{
			if (file.TryGetLocalPath() is { } localPath)
				return localPath;

			try
			{
				const string uploadsDirectory = "/uploads";
				Directory.CreateDirectory(uploadsDirectory);
				// Uniquify instead of overwriting: the same-named file may already be open in
				// the assembly list, and its loaded metadata maps the old content.
				var target = Path.Combine(uploadsDirectory, file.Name);
				for (int i = 2; File.Exists(target); i++)
				{
					target = Path.Combine(uploadsDirectory,
						$"{Path.GetFileNameWithoutExtension(file.Name)} ({i}){Path.GetExtension(file.Name)}");
				}

				await using (var source = await file.OpenReadAsync())
				await using (var destination = File.Create(target))
				{
					await source.CopyToAsync(destination);
				}
				return target;
			}
			catch (System.Exception)
			{
				return null;
			}
		}

		/// <summary>"PNG (*.png)|*.png|All files|*.*" → two file types.</summary>
		internal static IReadOnlyList<FilePickerFileType> ParseFilter(string filter)
		{
			var result = new List<FilePickerFileType>();
			var parts = filter.Split('|');
			for (int i = 0; i + 1 < parts.Length; i += 2)
			{
				var display = parts[i];
				var patterns = parts[i + 1].Split(';');
				result.Add(new FilePickerFileType(display) { Patterns = patterns });
			}
			return result;
		}

		static string? GuessExtension(FilePickerFileType type)
		{
			if (type.Patterns is null)
				return null;
			foreach (var p in type.Patterns)
			{
				// "*.ext" → "ext"; bare "*" or "*.*" yields no useful extension.
				if (p.StartsWith("*.", System.StringComparison.Ordinal) && p.Length > 2 && p[2] != '*')
					return p[2..];
			}
			return null;
		}
	}
}
