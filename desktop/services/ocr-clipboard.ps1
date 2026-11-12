$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public static class MathStudyLogOcrClipboard {
    [DllImport("user32.dll")]
    private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")]
    private static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll")]
    private static extern bool CloseClipboard();
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EmptyClipboard();
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetClipboardData(uint format, IntPtr handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowEx(int exStyle, string className, string name, int style,
        int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll")]
    private static extern bool DestroyWindow(IntPtr window);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GlobalLock(IntPtr handle);
    [DllImport("kernel32.dll")]
    private static extern bool GlobalUnlock(IntPtr handle);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GlobalFree(IntPtr handle);

    public static string Stamp() {
        uint sequence = GetClipboardSequenceNumber();
        if (sequence == 0) throw new InvalidOperationException("Clipboard sequence is unavailable.");
        return sequence.ToString(CultureInfo.InvariantCulture) + ":" +
            GetClipboardOwner().ToInt64().ToString(CultureInfo.InvariantCulture);
    }

    public static string WriteIfUnchanged(string expected, byte[] answer) {
        const uint moveable = 2;
        const uint unicodeText = 13;
        var memory = GlobalAlloc(moveable, new UIntPtr((uint)answer.Length));
        if (memory == IntPtr.Zero) throw new Win32Exception();
        IntPtr window = IntPtr.Zero;
        try {
            var bytes = GlobalLock(memory);
            if (bytes == IntPtr.Zero) throw new Win32Exception();
            try { Marshal.Copy(answer, 0, bytes, answer.Length); }
            finally { GlobalUnlock(memory); }

            // EmptyClipboard needs a real owner for SetClipboardData to work.
            // A message-only window is never visible to the user.
            window = CreateWindowEx(0, "STATIC", "", 0, 0, 0, 0, 0,
                new IntPtr(-3), IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
            if (window == IntPtr.Zero) throw new Win32Exception();
            for (int attempt = 0; !OpenClipboard(window); attempt++) {
                if (attempt == 5) throw new Win32Exception();
                Thread.Sleep(20);
            }
            try {
                // The lock covers the check and both clipboard mutations.
                if (Stamp() != expected) return "changed";
                if (!EmptyClipboard() || SetClipboardData(unicodeText, memory) == IntPtr.Zero) {
                    throw new Win32Exception();
                }
                memory = IntPtr.Zero; // Windows now owns the memory.
                return "written";
            } finally {
                CloseClipboard();
            }
        } finally {
            if (window != IntPtr.Zero) DestroyWindow(window);
            if (memory != IntPtr.Zero) GlobalFree(memory);
        }
    }
}
'@

if ($env:MATH_STUDY_LOG_OCR_STAMP) {
    $answer = [Convert]::FromBase64String($env:MATH_STUDY_LOG_OCR_ANSWER)
    [Console]::Write([MathStudyLogOcrClipboard]::WriteIfUnchanged($env:MATH_STUDY_LOG_OCR_STAMP, $answer))
} else {
    [Console]::Write([MathStudyLogOcrClipboard]::Stamp())
}
