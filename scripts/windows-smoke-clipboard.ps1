# The Windows smoke test keeps this process alive while it owns test clipboard
# data. The original formats stay in this process's memory.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;

public static class SmokeClipboard {
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool OpenClipboard(IntPtr owner);
  [DllImport("user32.dll")]
  private static extern bool CloseClipboard();
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool EmptyClipboard();
  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint EnumClipboardFormats(uint format);
  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr GetClipboardData(uint format);
  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr SetClipboardData(uint format, IntPtr handle);
  [DllImport("user32.dll")]
  public static extern uint GetClipboardSequenceNumber();
  [DllImport("kernel32.dll")]
  private static extern UIntPtr GlobalSize(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalLock(IntPtr handle);
  [DllImport("kernel32.dll")]
  private static extern bool GlobalUnlock(IntPtr handle);
  [DllImport("kernel32.dll")]
  private static extern IntPtr GlobalFree(IntPtr handle);

  private const int MaxBytes = 32 * 1024 * 1024;
  private static List<KeyValuePair<uint, byte[]>> snapshot;

  private static void Open(IntPtr owner) {
    for (int retry = 0; retry < 20; retry++) {
      if (OpenClipboard(owner)) return;
      Thread.Sleep(25);
    }
    throw new Win32Exception();
  }

  private static List<KeyValuePair<uint, byte[]>> ReadFormats() {
    var formats = new List<KeyValuePair<uint, byte[]>>();
    int remaining = MaxBytes;
    for (uint format = EnumClipboardFormats(0); format != 0; format = EnumClipboardFormats(format)) {
      // Only clone standard HGLOBAL text formats and opaque registered
      // HGLOBAL formats. GDI handles and private formats must stay untouched.
      if (!(format == 1 || format == 7 || format == 13 || format == 16 || format >= 0xC000)) {
        throw new InvalidOperationException("The clipboard contains a format this smoke test cannot restore.");
      }
      IntPtr handle = GetClipboardData(format);
      ulong size = GlobalSize(handle).ToUInt64();
      if (size == 0 || size > (ulong)remaining) {
        throw new InvalidOperationException("A clipboard format cannot be read within the snapshot limit.");
      }
      IntPtr data = GlobalLock(handle);
      if (data == IntPtr.Zero) throw new Win32Exception();
      try {
        var bytes = new byte[(int)size];
        Marshal.Copy(data, bytes, 0, bytes.Length);
        formats.Add(new KeyValuePair<uint, byte[]>(format, bytes));
        remaining -= bytes.Length;
      } finally {
        GlobalUnlock(handle);
      }
    }
    if (Marshal.GetLastWin32Error() != 0) throw new Win32Exception();
    return formats;
  }

  public static uint Take() {
    Open(IntPtr.Zero);
    try {
      snapshot = ReadFormats();
      return GetClipboardSequenceNumber();
    } finally {
      CloseClipboard();
    }
  }

  public static bool Restore(IntPtr owner, uint expectedSequence) {
    var handles = new IntPtr[snapshot.Count];
    try {
      for (int index = 0; index < handles.Length; index++) {
        byte[] bytes = snapshot[index].Value;
        handles[index] = GlobalAlloc(2, new UIntPtr((uint)bytes.Length));
        if (handles[index] == IntPtr.Zero) throw new Win32Exception();
        IntPtr data = GlobalLock(handles[index]);
        if (data == IntPtr.Zero) throw new Win32Exception();
        try {
          Marshal.Copy(bytes, 0, data, bytes.Length);
        } finally {
          GlobalUnlock(handles[index]);
        }
      }
      Open(owner);
      try {
        if (GetClipboardSequenceNumber() != expectedSequence) return false;
        if (!EmptyClipboard()) throw new Win32Exception();
        for (int index = 0; index < handles.Length; index++) {
          if (SetClipboardData(snapshot[index].Key, handles[index]) == IntPtr.Zero) throw new Win32Exception();
          handles[index] = IntPtr.Zero; // Windows owns the restored handle.
        }
        return true;
      } finally {
        CloseClipboard();
      }
    } finally {
      foreach (IntPtr handle in handles) if (handle != IntPtr.Zero) GlobalFree(handle);
    }
  }
}
'@

try {
  $owner = [Windows.Forms.Form]::new()
  $ownerHandle = $owner.Handle
  [Console]::WriteLine("ready " + [SmokeClipboard]::Take())
  while ($command = [Console]::ReadLine()) {
    if ($command -eq 'sequence') {
      [Console]::WriteLine("sequence " + [SmokeClipboard]::GetClipboardSequenceNumber())
    } elseif ($command -eq 'paste') {
      $field = [Windows.Forms.TextBox]::new()
      try {
        $field.Paste()
        [Console]::WriteLine("pasted " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($field.Text)))
      } finally {
        $field.Dispose()
      }
    } elseif ($command -match '^restore ([0-9]+)$') {
      if ([SmokeClipboard]::Restore($ownerHandle, [uint32]$Matches[1])) {
        [Console]::WriteLine("restored")
      } else {
        [Console]::WriteLine("changed")
      }
      break
    }
  }
} catch {
  [Console]::WriteLine("unavailable")
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($owner) { $owner.Dispose() }
}
