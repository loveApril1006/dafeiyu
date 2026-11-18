"""Reversible storage optimization for the bundled, inference-only voice runtime.

No model conversion, CUDA removal or account/config access. Archive the optional
PyTorch C++ development SDK before removing its original files. Compress only
existing large runtime/model files using classic NTFS compression (no WOF links).
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import time
import zipfile

SDK_PREFIX = "runtime/Lib/site-packages/torch/"
SDK_DIRS = (SDK_PREFIX + "include/", SDK_PREFIX + "share/cmake/")
COMPRESS_SUFFIXES = {".dll", ".pyd", ".bin", ".onnx", ".pth", ".ckpt"}


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked(root, relative):
    """Reject junctions, symlinks, absolute paths and traversal at every level."""
    if not isinstance(relative, str) or "\\" in relative or ":" in relative:
        raise ValueError("Invalid relative path")
    parts = relative.split("/")
    if not parts or any(p in ("", ".", "..") for p in parts):
        raise ValueError("Invalid relative path")
    candidate = root.joinpath(*parts)
    for item in [root, *[root.joinpath(*parts[:n]) for n in range(1, len(parts) + 1)]]:
        if item.exists() or item.is_symlink():
            info = item.lstat()
            if item.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
                raise ValueError("Linked path is not supported: " + str(item))
    # Check ancestors above root, too: resolving root first could hide a junction.
    for item in root.parents:
        if item.is_symlink() or item.exists() and getattr(item.lstat(), "st_file_attributes", 0) & 0x400:
            raise ValueError("Linked ancestor is not supported")
    return candidate


def is_sdk(relative):
    return (relative.startswith(SDK_DIRS) or
            relative.startswith(SDK_PREFIX + "lib/") and
            "/" not in relative[len(SDK_PREFIX + "lib/"):] and
            relative.endswith(".lib"))


def files(root):
    stack = [root]
    while stack:
        current = stack.pop()
        for item in current.iterdir():
            info = item.lstat()
            if item.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
                continue
            if stat.S_ISDIR(info.st_mode):
                stack.append(item)
            elif stat.S_ISREG(info.st_mode):
                yield item


def sdk_rows(root):
    torch = checked(root, SDK_PREFIX.rstrip("/"))
    return [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size,
             "sha256": digest(p)} for p in files(torch)
            if is_sdk(p.relative_to(root).as_posix())]


def validate_archive(archive):
    with zipfile.ZipFile(archive) as package:
        rows = json.loads(package.read("voice-sdk-manifest.json"))["files"]
        names = [row["path"] for row in rows]
        if len(names) != len(set(names)) or set(package.namelist()) != set(names) | {"voice-sdk-manifest.json"}:
            raise ValueError("Unexpected archive entries")
        for row in rows:
            if not is_sdk(row["path"]):
                raise ValueError("Archive contains a non-SDK file")
            if any(p in ("", ".", "..") for p in row["path"].split("/")) or "\\" in row["path"] or ":" in row["path"]:
                raise ValueError("Invalid archive path")
            with package.open(row["path"]) as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != row["sha256"]:
                    raise ValueError("SDK archive checksum mismatch")
            if package.getinfo(row["path"]).file_size != row["bytes"]:
                raise ValueError("SDK archive size mismatch")
    return rows


def archive_sdk(root, archive):
    checked(archive.parent, archive.name)
    rows = sdk_rows(root)
    backup_created = not archive.exists()
    if archive.exists():
        stored = validate_archive(archive)
        lookup = {r["path"]: r for r in stored}
        if any(lookup.get(r["path"]) != r for r in rows):
            raise ValueError("A different SDK already exists in this archive; choose a new archive")
    else:
        if not rows:
            raise ValueError("No SDK files to archive")
        archive.parent.mkdir(parents=True, exist_ok=True)
        temporary = archive.with_suffix(".building")
        with temporary.open("xb") as output:
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=7) as package:
                for row in rows:
                    package.write(checked(root, row["path"]), row["path"])
                package.writestr("voice-sdk-manifest.json", json.dumps({"version": 1, "files": rows}))
        validate_archive(temporary)
        if archive.exists():
            raise ValueError("Archive appeared during operation")
        temporary.rename(archive)
    # Validate the entire backup and all originals before the first removal.
    validate_archive(archive)
    for row in rows:
        original = checked(root, row["path"])
        if original.stat().st_nlink > 1 or digest(original) != row["sha256"]:
            raise ValueError("Original SDK changed or has hardlinks; nothing removed")
    removed = 0
    for row in rows:
        original = checked(root, row["path"])
        if digest(original) != row["sha256"]:
            raise ValueError("SDK changed during removal; remaining originals preserved")
        original.unlink()
        removed += row["bytes"]
    return {"files": len(rows), "removedBytes": removed, "backupBytes": archive.stat().st_size,
            "backupCreated": backup_created,
            "netSavedBytes": removed - (archive.stat().st_size if backup_created else 0)}


def restore_sdk(root, archive):
    checked(archive.parent, archive.name)
    rows = validate_archive(archive)
    for row in rows:
        target = checked(root, row["path"])
        if target.exists() and digest(target) != row["sha256"]:
            raise ValueError("Refusing to overwrite a changed SDK file")
    with zipfile.ZipFile(archive) as package:
        for row in rows:
            target = checked(root, row["path"])
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            checked(root, row["path"])
            with package.open(row["path"]) as source, target.open("xb") as out:
                while data := source.read(4 * 1024 * 1024):
                    out.write(data)
            if digest(target) != row["sha256"]:
                raise ValueError("Restored SDK checksum mismatch")
    return {"files": len(rows), "restoredBytes": sum(row["bytes"] for row in rows)}


def allocated(file):
    if os.name != "nt":
        return file.stat().st_size
    api = ctypes.WinDLL("kernel32", use_last_error=True).GetCompressedFileSizeW
    api.argtypes = [ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_ulong)]
    api.restype = ctypes.c_ulong
    high = ctypes.c_ulong(0)
    ctypes.set_last_error(0)
    low = api(str(file), ctypes.byref(high))
    if low == 0xFFFFFFFF and ctypes.get_last_error():
        raise ctypes.WinError(ctypes.get_last_error())
    return (high.value << 32) | low


def compression_candidates(root):
    return [p for base in ("runtime", "GPT_SoVITS")
            for p in files(checked(root, base))
            if p.suffix.lower() in COMPRESS_SUFFIXES and p.stat().st_size >= 1024 * 1024
            and p.stat().st_nlink == 1]


def compress(root, decompress=False):
    if os.name != "nt":
        raise ValueError("NTFS compression requires Windows")
    rows = []
    for index, file in enumerate(compression_candidates(root)):
        relative = file.relative_to(root).as_posix()
        checked(root, relative)
        before_hash, before = digest(file), allocated(file)
        # Classic NTFS compression deliberately avoids /EXE and WOF reparse points.
        result = subprocess.run([str(Path(os.environ["SystemRoot"]) / "System32/compact.exe"),
                                 "/U" if decompress else "/C", "/I", "/Q", str(file)],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        after_hash, after = digest(file), allocated(file)
        if before_hash != after_hash:
            raise ValueError("Unexpected content change: " + relative)
        rows.append({"path": relative, "sha256": after_hash, "beforeBytes": before,
                     "afterBytes": after, "exitCode": result.returncode,
                     "compressedAfter": bool(file.lstat().st_file_attributes & 0x800)})
        if index % 10 == 0:
            print(json.dumps({"verifiedCompressedFiles": index + 1}), flush=True)
    return {"files": rows, "beforeBytes": sum(r["beforeBytes"] for r in rows),
            "afterBytes": sum(r["afterBytes"] for r in rows),
            "failed": [r["path"] for r in rows if r["exitCode"] != 0 or r["compressedAfter"] == decompress]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(Path(__file__).absolute().parents[2] / "GPT-SoVITS"))
    parser.add_argument("--archive", required=True)
    parser.add_argument("--action", choices=["plan", "archive-sdk", "restore-sdk", "compress", "decompress"], default="plan")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report")
    args = parser.parse_args()
    root, archive = Path(os.path.abspath(args.root)), Path(os.path.abspath(args.archive))
    checked(root, "pet_server.py")
    # A separate archive prevents future installer/runtime operations from deleting it.
    if archive == root or root in archive.parents:
        raise ValueError("Keep SDK archive outside the active voice runtime")
    started = time.monotonic()
    if args.action == "plan":
        rows = sdk_rows(root)
        result = {"sdkFiles": len(rows), "sdkBytes": sum(r["bytes"] for r in rows),
                  "compressibleFiles": len(compression_candidates(root))}
    elif not args.apply:
        raise ValueError("Mutation requires --apply")
    elif args.action == "archive-sdk":
        result = archive_sdk(root, archive)
    elif args.action == "restore-sdk":
        result = restore_sdk(root, archive)
    else:
        result = compress(root, args.action == "decompress")
    result.update(action=args.action, root=str(root), seconds=round(time.monotonic() - started, 2))
    if args.report:
        report = Path(args.report)
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "files"}, ensure_ascii=False))
