$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$version = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
$release = Join-Path $root "release"
$stage = Join-Path $release "KURU"
$zip = Join-Path $release "LexCrew-Mail-$version.zip"
$setup = Join-Path $release "LexCrew-Mail-Setup-$version.exe"
$framework = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$webview = Join-Path $root "outlook\packages\Microsoft.Web.WebView2.1.0.2903.40"

function Step($text) { Write-Host "== $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed ($LASTEXITCODE)" } }

if (Test-Path $stage) { Get-ChildItem $stage -Force | Remove-Item -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
if (Test-Path $setup) { Remove-Item $setup -Force }
New-Item -ItemType Directory -Force -Path "$stage\addin", "$stage\app\node_modules", "$stage\node" | Out-Null

Step "test"
npx vitest run
Check "vitest"

Step "taskpane (webpack production)"
npx webpack --mode production --devtool false
Check "webpack"
Copy-Item dist "$stage\app\dist" -Recurse

Step "server (esbuild)"
npx esbuild src/server.release.ts --bundle --platform=node --target=node22 --external:better-sqlite3 --outfile="$stage\app\server.js" --log-level=warning
Check "esbuild"

Step "native modules"
foreach ($name in @("better-sqlite3", "bindings", "file-uri-to-path")) {
  $from = Join-Path $root "node_modules\$name"
  $to = Join-Path $stage "app\node_modules\$name"
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  Get-ChildItem $from -File | Copy-Item -Destination $to
  if ($name -eq "better-sqlite3") {
    Copy-Item "$from\lib" $to -Recurse
    New-Item -ItemType Directory -Force -Path "$to\build\Release" | Out-Null
    Copy-Item "$from\build\Release\better_sqlite3.node" "$to\build\Release"
  }
}

Step "node runtime"
$node = (Get-Command node).Source
Copy-Item $node "$stage\node\node.exe"

Step "outlook add-in (csc)"
$dllSources = Get-ChildItem outlook\src -Recurse -Filter *.cs | Where-Object {
  $_.Name -notlike "*.test.cs" -and $_.Name -ne "LoadProbe.cs" -and $_.Name -ne "TrayHost.cs"
} | ForEach-Object { $_.FullName }
& "$framework\csc.exe" /nologo /target:library /platform:x64 /optimize+ "/out:$stage\addin\KuruOutlook.dll" `
  /r:System.dll /r:System.Core.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:Microsoft.CSharp.dll `
  "/r:$framework\System.Web.Extensions.dll" `
  "/r:$webview\lib\net462\Microsoft.Web.WebView2.Core.dll" `
  "/r:$webview\lib\net462\Microsoft.Web.WebView2.WinForms.dll" `
  $dllSources
Check "csc dll"
Copy-Item "$webview\lib\net462\Microsoft.Web.WebView2.Core.dll", "$webview\lib\net462\Microsoft.Web.WebView2.WinForms.dll" "$stage\addin"
Copy-Item "$webview\runtimes\win-x64\native\WebView2Loader.dll" "$stage\addin"

Step "icon"
if (-not ("KuruIco" -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class KuruIco {
    public static void Write(string dest, string assetsDir) {
        int[] sizes = { 16, 32, 48, 64, 128, 256 };
        var frames = new byte[sizes.Length][];
        using (var s16 = new Bitmap(Path.Combine(assetsDir, "icon-16.png")))
        using (var s32 = new Bitmap(Path.Combine(assetsDir, "icon-32.png")))
        using (var s64 = new Bitmap(Path.Combine(assetsDir, "icon-64.png")))
        using (var s128 = new Bitmap(Path.Combine(assetsDir, "icon-128.png"))) {
            for (int i = 0; i < sizes.Length; i++) {
                using (var frame = Frame(sizes[i], s16, s32, s64, s128)) frames[i] = Dib(frame);
            }
        }
        int offset = 6 + 16 * sizes.Length;
        using (var stream = File.Create(dest))
        using (var writer = new BinaryWriter(stream)) {
            writer.Write((ushort)0);
            writer.Write((ushort)1);
            writer.Write((ushort)sizes.Length);
            for (int i = 0; i < sizes.Length; i++) {
                byte dim = (byte)(sizes[i] >= 256 ? 0 : sizes[i]);
                writer.Write(dim);
                writer.Write(dim);
                writer.Write((byte)0);
                writer.Write((byte)0);
                writer.Write((ushort)1);
                writer.Write((ushort)32);
                writer.Write(frames[i].Length);
                writer.Write(offset);
                offset += frames[i].Length;
            }
            for (int i = 0; i < frames.Length; i++) writer.Write(frames[i]);
        }
    }

    static Bitmap SourceFor(int size, Bitmap s16, Bitmap s32, Bitmap s64, Bitmap s128) {
        if (size <= 16) return s16;
        if (size <= 32) return s32;
        if (size <= 64) return s64;
        return s128;
    }

    static Bitmap Frame(int size, Bitmap s16, Bitmap s32, Bitmap s64, Bitmap s128) {
        Bitmap src = SourceFor(size, s16, s32, s64, s128);
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) {
            g.CompositingMode = CompositingMode.SourceCopy;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.InterpolationMode = src.Width == size ? InterpolationMode.NearestNeighbor : InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.DrawImage(src, new Rectangle(0, 0, size, size));
        }
        return bmp;
    }

    static byte[] Dib(Bitmap bmp) {
        int w = bmp.Width, h = bmp.Height;
        var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try {
            int xorLen = w * h * 4;
            int maskStride = ((w + 31) / 32) * 4;
            int maskLen = maskStride * h;
            var dib = new byte[40 + xorLen + maskLen];
            WriteInt(dib, 0, 40);
            WriteInt(dib, 4, w);
            WriteInt(dib, 8, h * 2);
            WriteShort(dib, 12, 1);
            WriteShort(dib, 14, 32);
            WriteInt(dib, 20, xorLen + maskLen);
            int stride = data.Stride;
            var raw = new byte[stride * h];
            Marshal.Copy(data.Scan0, raw, 0, raw.Length);
            for (int y = 0; y < h; y++) {
                int srcY = h - 1 - y;
                for (int x = 0; x < w; x++) {
                    int src = srcY * stride + x * 4;
                    int dst = 40 + (y * w + x) * 4;
                    dib[dst] = raw[src];
                    dib[dst + 1] = raw[src + 1];
                    dib[dst + 2] = raw[src + 2];
                    dib[dst + 3] = raw[src + 3];
                    if (raw[src + 3] == 0) {
                        dib[40 + xorLen + y * maskStride + (x / 8)] |= (byte)(0x80 >> (x % 8));
                    }
                }
            }
            return dib;
        } finally {
            bmp.UnlockBits(data);
        }
    }

    static void WriteInt(byte[] buf, int offset, int value) {
        buf[offset] = (byte)value;
        buf[offset + 1] = (byte)(value >> 8);
        buf[offset + 2] = (byte)(value >> 16);
        buf[offset + 3] = (byte)(value >> 24);
    }

    static void WriteShort(byte[] buf, int offset, short value) {
        buf[offset] = (byte)value;
        buf[offset + 1] = (byte)(value >> 8);
    }
}
'@
}
$ico = Join-Path $root "installer\lexcrew.ico"
[KuruIco]::Write($ico, (Join-Path $root "assets"))
$oldIco = Join-Path $root "installer\kuru.ico"
if (Test-Path $oldIco) { Remove-Item $oldIco -Force }
Copy-Item $ico (Join-Path $stage "lexcrew.ico")
Add-Type -AssemblyName System.Drawing
$check = New-Object System.Drawing.Icon $ico
try { $checkBmp = $check.ToBitmap(); $checkBmp.Dispose() } finally { $check.Dispose() }

Step "tray host (csc)"
$traySources = @(
  (Join-Path $root "outlook\src\TrayHost.cs"),
  (Join-Path $root "outlook\src\Sidecar.cs")
)
& "$framework\csc.exe" /nologo /target:winexe /platform:x64 /optimize+ "/out:$stage\KuruTray.exe" "/win32icon:$ico" `
  /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll `
  $traySources
Check "csc tray"

Step "installer"
$bom = New-Object System.Text.UTF8Encoding $true
foreach ($name in @("install.ps1", "uninstall.ps1", "install.cmd", "uninstall.cmd")) {
  $file = Get-Item (Join-Path $root "installer\$name")
  $text = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
  if ($file.Extension -eq ".ps1") {
    [IO.File]::WriteAllText((Join-Path $stage $file.Name), $text, $bom)
  } else {
    [IO.File]::WriteAllText((Join-Path $stage $file.Name), $text.Replace("`r`n", "`n").Replace("`n", "`r`n"), [Text.Encoding]::ASCII)
  }
}
Set-Content -Path "$stage\version.txt" -Value $version -Encoding ASCII

$makensis = $null
$found = Get-Command makensis -ErrorAction SilentlyContinue
if ($found) { $makensis = $found.Source }
elseif (Test-Path "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe") {
  $makensis = "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe"
}
if (-not $makensis) {
  throw "makensis が見つかりません。NSIS 3 を PATH に入れるか、%LOCALAPPDATA%\tauri\NSIS を用意してください。"
}
$nsi = Join-Path $root "installer\setup.nsi"
$nsiText = [IO.File]::ReadAllText($nsi, [Text.Encoding]::UTF8)
[IO.File]::WriteAllText($nsi, $nsiText, $bom)
& $makensis /INPUTCHARSET UTF8 `
  "/DVERSION=$version" `
  "/DOUTFILE=$($setup.Replace('\','/'))" `
  "/DPAYLOAD=$($stage.Replace('\','/'))" `
  "/DICON=$($ico.Replace('\','/'))" `
  $nsi
Check "makensis"

Step "zip"
$zipDir = Join-Path $release "_zip"
if (Test-Path $zipDir) { Remove-Item $zipDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $zipDir | Out-Null
Copy-Item $setup (Join-Path $zipDir (Split-Path $setup -Leaf))
$guide = ([IO.File]::ReadAllText((Join-Path $root "scripts\install-guide.ja.txt"), [Text.Encoding]::UTF8)).Replace("{VERSION}", $version)
[IO.File]::WriteAllText((Join-Path $zipDir "INSTALL.txt"), $guide, $bom)
Compress-Archive -Path (Join-Path $zipDir "*") -DestinationPath $zip
Remove-Item $zipDir -Recurse -Force
Write-Host ""
Write-Host "created $setup" -ForegroundColor Green
Write-Host "created $zip" -ForegroundColor Green
