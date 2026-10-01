using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace KuruOutlook
{
    static class Sidecar
    {
        public const string TrayMutexName = "Global\\KURU.TrayHost";
        const string Host = "127.0.0.1";
        const int Port = 28770;

        static Process _process;
        static Task<bool> _ready = Task.FromResult(true);

        public static Task<bool> Ready { get { return _ready; } }

        public static bool TrayActive
        {
            get
            {
                try
                {
                    using (Mutex.OpenExisting(TrayMutexName)) { return true; }
                }
                catch
                {
                    return false;
                }
            }
        }

        public static string InstallRootFrom(string codeBasePath)
        {
            if (!string.IsNullOrEmpty(codeBasePath))
            {
                string dir = Path.GetDirectoryName(new Uri(codeBasePath).LocalPath);
                if (Path.GetFileName(dir) == "addin") return Path.GetDirectoryName(dir);
            }
            string self = new Uri(Assembly.GetExecutingAssembly().CodeBase).LocalPath;
            string root = Path.GetDirectoryName(self);
            if (Path.GetFileName(root) == "addin") return Path.GetDirectoryName(root);
            return root;
        }

        /// <summary>トレイ常駐 exe から呼ぶ。node を起動する。</summary>
        public static void StartFromTray()
        {
            string root = InstallRootFrom(null);
            string node = Path.Combine(root, "node", "node.exe");
            string script = Path.Combine(root, "app", "server.js");
            if (!File.Exists(node) || !File.Exists(script)) return;
            _ready = Task.Run(() => LaunchOrThrow(node, script));
        }

        /// <summary>Outlook から呼ぶ。トレイ常駐中は起動だけ待ち、終了時は node を止めない。</summary>
        public static void Start()
        {
            string addinDir = Path.GetDirectoryName(new Uri(Assembly.GetExecutingAssembly().CodeBase).LocalPath);
            string root = InstallRootFrom(addinDir);
            string node = Path.Combine(root, "node", "node.exe");
            string script = Path.Combine(root, "app", "server.js");
            if (!File.Exists(node) || !File.Exists(script))
            {
                _ready = Task.FromResult(Listening());
                return;
            }
            _ready = Task.Run(() => EnsureRunning(node, script, false));
        }

        public static void Stop()
        {
            if (TrayActive) return;
            StopServer(false);
        }

        public static void StopServer(bool force)
        {
            Process process = _process;
            _process = null;
            if (process != null)
            {
                try
                {
                    if (!process.HasExited) process.Kill();
                }
                catch
                {
                }
            }
            if (!force) return;
            string root = InstallRootFrom(null);
            string node = Path.Combine(root, "node", "node.exe");
            foreach (Process p in Process.GetProcessesByName("node"))
            {
                try
                {
                    if (p.MainModule == null) continue;
                    if (!string.Equals(p.MainModule.FileName, node, StringComparison.OrdinalIgnoreCase)) continue;
                    p.Kill();
                }
                catch
                {
                }
            }
        }

        static bool EnsureRunning(string node, string script, bool forceStart)
        {
            try
            {
                if (Listening()) return true;
                if (TrayActive && !forceStart)
                {
                    for (int i = 0; i < 100; i++)
                    {
                        if (Listening()) return true;
                        Thread.Sleep(100);
                    }
                    return false;
                }
                return LaunchOrThrow(node, script);
            }
            catch
            {
                return false;
            }
        }

        static bool LaunchOrThrow(string node, string script)
        {
            if (Listening()) return true;
            var info = new ProcessStartInfo(node, "\"" + script + "\"")
            {
                WorkingDirectory = Path.GetDirectoryName(script),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            _process = Process.Start(info);
            for (int i = 0; i < 100; i++)
            {
                if (Listening()) return true;
                if (_process.HasExited) return Listening();
                Thread.Sleep(100);
            }
            return false;
        }

        public static bool Listening()
        {
            using (var client = new TcpClient())
            {
                try
                {
                    return client.ConnectAsync(Host, Port).Wait(300) && client.Connected;
                }
                catch
                {
                    return false;
                }
            }
        }
    }
}
