using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace KuruOutlook
{
    static class TrayHost
    {
        [STAThread]
        static void Main()
        {
            bool created;
            using (var mutex = new Mutex(true, Sidecar.TrayMutexName, out created))
            {
                if (!created) return;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext(mutex));
            }
        }
    }

    sealed class TrayContext : ApplicationContext
    {
        readonly Mutex _mutex;
        readonly NotifyIcon _icon;
        readonly ToolStripMenuItem _status;
        readonly ToolStripMenuItem _autostart;

        public TrayContext(Mutex mutex)
        {
            _mutex = mutex;
            MigrateAutostart();
            _status = new ToolStripMenuItem("LexCrew Mail 起動中") { Enabled = false };
            _autostart = new ToolStripMenuItem("ログイン時に起動") { Checked = AutostartEnabled() };
            _autostart.Click += OnAutostartClick;

            var menu = new ContextMenuStrip();
            menu.Items.Add(_status);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_autostart);
            menu.Items.Add(new ToolStripSeparator());
            var quit = new ToolStripMenuItem("終了");
            quit.Click += OnQuitClick;
            menu.Items.Add(quit);

            _icon = new NotifyIcon
            {
                Text = "LexCrew Mail",
                Icon = LoadIcon(),
                ContextMenuStrip = menu,
                Visible = true,
            };
            _icon.MouseUp += (s, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    menu.Show(Cursor.Position);
                }
            };

            Sidecar.StartFromTray();
        }

        static Icon LoadIcon()
        {
            string root = Sidecar.InstallRootFrom(null);
            string png = Path.Combine(root, "app", "dist", "assets", "icon-64.png");
            if (File.Exists(png))
            {
                using (var bmp = new Bitmap(png))
                {
                    return Icon.FromHandle(bmp.GetHicon());
                }
            }
            return SystemIcons.Application;
        }

        const string RunValueName = "LexCrew Mail";
        const string LegacyRunValueName = "KURU";

        static bool AutostartEnabled()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    return key != null && (key.GetValue(RunValueName) != null || key.GetValue(LegacyRunValueName) != null);
                }
            }
            catch
            {
                return false;
            }
        }

        static void MigrateAutostart()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key == null) return;
                    object legacy = key.GetValue(LegacyRunValueName);
                    if (legacy == null) return;
                    if (key.GetValue(RunValueName) == null) key.SetValue(RunValueName, legacy);
                    key.DeleteValue(LegacyRunValueName, false);
                }
            }
            catch
            {
            }
        }

        static void SetAutostart(bool enabled)
        {
            string exe = System.Reflection.Assembly.GetExecutingAssembly().Location;
            using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            {
                if (key == null) return;
                if (enabled) key.SetValue(RunValueName, "\"" + exe + "\"");
                else key.DeleteValue(RunValueName, false);
                key.DeleteValue(LegacyRunValueName, false);
            }
        }

        void OnAutostartClick(object sender, EventArgs e)
        {
            bool next = !_autostart.Checked;
            SetAutostart(next);
            _autostart.Checked = next;
        }

        void OnQuitClick(object sender, EventArgs e)
        {
            ExitThread();
        }

        protected override void ExitThreadCore()
        {
            Sidecar.StopServer(true);
            _icon.Visible = false;
            _icon.Dispose();
            try { _mutex.ReleaseMutex(); } catch { }
            base.ExitThreadCore();
        }
    }
}
