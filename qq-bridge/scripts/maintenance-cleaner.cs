using System;
using System.IO;

namespace Xiaoge.Maintenance {
    // Called only after the PowerShell plan/ancestor/process checks succeed.
    // Each recursive entry is checked again; links are unlinked, never walked.
    public sealed class TestTreeCleaner {
        public long Files, Directories, Links;
        public void Remove(string directory, string approvedRoot) {
            string current = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar);
            string root = Path.GetFullPath(approvedRoot).TrimEnd(Path.DirectorySeparatorChar);
            if (!current.Equals(root, StringComparison.OrdinalIgnoreCase) &&
                !current.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Cleanup path escaped the approved tree.");
            FileAttributes attrs = File.GetAttributes(current);
            if ((attrs & FileAttributes.ReparsePoint) != 0) {
                if ((attrs & FileAttributes.Directory) != 0) Directory.Delete(current, false);
                else File.Delete(current);
                Links++;
                return;
            }
            foreach (FileSystemInfo entry in new DirectoryInfo(current).EnumerateFileSystemInfos()) {
                if ((entry.Attributes & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) {
                    Remove(entry.FullName, root);
                } else {
                    if ((entry.Attributes & FileAttributes.ReadOnly) != 0)
                        File.SetAttributes(entry.FullName, entry.Attributes & ~FileAttributes.ReadOnly);
                    File.Delete(entry.FullName);
                    Files++;
                }
            }
            if ((attrs & FileAttributes.ReadOnly) != 0)
                File.SetAttributes(current, attrs & ~FileAttributes.ReadOnly);
            Directory.Delete(current, false);
            Directories++;
        }
    }
}
