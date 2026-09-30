using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KuruOutlook
{
    [ComVisible(true)]
    [Guid("A7B3C1D2-4E5F-4A6B-8C9D-0E1F2A3B4C5D")]
    [ProgId("Kuru.Connect")]
    [ClassInterface(ClassInterfaceType.None)]
    [ComDefaultInterface(typeof(IKuruRibbon))]
    public class Connect : IKuruRibbon, IDTExtensibility2, IRibbonExtensibility, ICustomTaskPaneConsumer
    {
        static Connect()
        {
            Log("type init");
        }

        public Connect()
        {
            Log("ctor");
        }

        object _app;
        ICTPFactory _factory;
        readonly Dictionary<long, object> _panes = new Dictionary<long, object>();

        public void CTPFactoryAvailable(object factory)
        {
            Log("CTPFactoryAvailable");
            _factory = factory as ICTPFactory;
        }

        public string GetCustomUI(string ribbonId)
        {
            Log("GetCustomUI " + ribbonId);
            try
            {
                return RibbonXml(ribbonId);
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
                return null;
            }
        }

        string RibbonXml(string ribbonId)
        {
            string tab = "TabMail";
            string group = "kuruExplorer";
            string button = "kuruExplorerBtn";
            if (ribbonId == "Microsoft.Outlook.Mail.Read")
            {
                tab = "TabReadMessage";
                group = "kuruRead";
                button = "kuruReadBtn";
            }
            else if (ribbonId == "Microsoft.Outlook.Mail.Compose")
            {
                tab = "TabNewMailMessage";
                group = "kuruCompose";
                button = "kuruComposeBtn";
            }
            else if (ribbonId != "Microsoft.Outlook.Explorer")
            {
                return null;
            }
            return
                "<customUI xmlns=\"http://schemas.microsoft.com/office/2009/07/customui\">" +
                "<ribbon><tabs><tab idMso=\"" + tab + "\">" +
                "<group id=\"" + group + "\" label=\"LexCrew\">" +
                "<button id=\"" + button + "\" label=\"LexCrew\" size=\"large\" imageMso=\"NewMail\" onAction=\"OnKuruClick\"/>" +
                "</group></tab></tabs></ribbon></customUI>";
        }

        public void OnKuruClick(object control)
        {
            Log("OnKuruClick");
            try
            {
                if (_factory == null) throw new InvalidOperationException("作業ウィンドウの準備ができていません。");
                dynamic app = _app;
                dynamic ribbonControl = control;
                object parent = app.ActiveInspector() ?? app.ActiveExplorer();
                if (parent == null) parent = ribbonControl.Context;
                if (parent == null) throw new InvalidOperationException("表示中の Outlook ウィンドウが見つかりません。");
                long key = WindowKey(parent);
                object existing;
                if (_panes.TryGetValue(key, out existing))
                {
                    ((dynamic)existing).Visible = true;
                    KuruPane.Reload(key);
                    Log("pane reloaded");
                    return;
                }
                KuruPane.PendingWindow = parent;
                object ctp = _factory.CreateCTP("Kuru.Pane", "LexCrew", parent);
                dynamic pane = ctp;
                pane.DockPosition = 2;
                pane.Width = 380;
                pane.Visible = true;
                _panes[key] = ctp;
                Log("pane shown");
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
            }
        }

        static long WindowKey(object window)
        {
            IntPtr unk = Marshal.GetIUnknownForObject(window);
            long key = unk.ToInt64();
            Marshal.Release(unk);
            return key;
        }

        public void OnConnection(object application, ext_ConnectMode connectMode, object addInInst, ref Array custom)
        {
            Log("OnConnection " + connectMode);
            _app = application;
            try
            {
                Sidecar.Start();
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
            }
        }

        static void Log(string text)
        {
            try
            {
                File.AppendAllText(Path.Combine(Path.GetTempPath(), "kuru-addin.log"), DateTime.Now.ToString("HH:mm:ss ") + text + Environment.NewLine);
            }
            catch
            {
            }
        }
        public void OnDisconnection(ext_DisconnectMode removeMode, ref Array custom) { Log("OnDisconnection"); Sidecar.Stop(); }
        public void OnAddInsUpdate(ref Array custom) { Log("OnAddInsUpdate"); }
        public void OnStartupComplete(ref Array custom) { Log("OnStartupComplete"); }
        public void OnBeginShutdown(ref Array custom) { Log("OnBeginShutdown"); Sidecar.Stop(); }
    }

    [ComVisible(true)]
    [Guid("B8C4D2E3-5F60-4B7C-9D0E-1F2A3B4C5D6E")]
    [ProgId("Kuru.Pane")]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class KuruPane : UserControl
    {
        public static object PendingWindow;
        static readonly Dictionary<long, KuruPane> Live = new Dictionary<long, KuruPane>();
        const string HostScript =
            "window.kuru={getContext:function(){return chrome.webview.hostObjects.sync.bridge.GetContext();}," +
            "readItem:function(){return chrome.webview.hostObjects.sync.bridge.ReadItem();}," +
            "readParties:function(){return chrome.webview.hostObjects.sync.bridge.ReadParties();}," +
            "readHeader:function(){return chrome.webview.hostObjects.sync.bridge.ReadHeader();}," +
            "writeDraft:function(json){return chrome.webview.hostObjects.sync.bridge.WriteDraft(json);}," +
            "readCalendar:function(json){return chrome.webview.hostObjects.sync.bridge.ReadCalendar(json);}," +
            "listMailFiles:function(){return chrome.webview.hostObjects.sync.bridge.ListMailFiles();}," +
            "readMailFile:function(index){return chrome.webview.hostObjects.bridge.ReadMailFile(index);}," +
            "searchSent:function(json){return chrome.webview.hostObjects.bridge.SearchSent(json);}};";
        readonly object _window;
        readonly WebView2 _web = new WebView2();

        public static void Reload(long key)
        {
            KuruPane pane;
            if (Live.TryGetValue(key, out pane)) pane.NavigateFresh();
        }

        public KuruPane()
        {
            _window = PendingWindow;
            PendingWindow = null;
            _web.Dock = DockStyle.Fill;
            Controls.Add(_web);
            Load += OnLoad;
        }

        async void OnLoad(object sender, EventArgs e)
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KURU", "WebView2");
            Directory.CreateDirectory(folder);
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, folder);
            await _web.EnsureCoreWebView2Async(env);
            _web.CoreWebView2.AddHostObjectToScript("bridge", new MailBridge(_window));
            await _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(HostScript);
            _web.CoreWebView2.NavigationCompleted += async (s, args) =>
            {
                if (!args.IsSuccess || _web.CoreWebView2 == null) return;
                try
                {
                    await _web.CoreWebView2.ExecuteScriptAsync(HostScript);
                }
                catch (Exception ex)
                {
                    Log(ex.Message);
                }
            };
            _web.CoreWebView2.ServerCertificateErrorDetected += (s, args) =>
            {
                string subject = args.ServerCertificate == null ? "" : args.ServerCertificate.Subject;
                string uri = args.RequestUri ?? "";
                if (uri.IndexOf("127.0.0.1", StringComparison.OrdinalIgnoreCase) >= 0 && subject.IndexOf("127.0.0.1", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    args.Action = CoreWebView2ServerCertificateErrorAction.AlwaysAllow;
                }
            };
            try
            {
                await _web.CoreWebView2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
            }
            catch (Exception ex)
            {
                Log(ex.Message);
            }
            try
            {
                await _web.CoreWebView2.CallDevToolsProtocolMethodAsync("Network.setCacheDisabled", "{\"cacheDisabled\":true}");
            }
            catch (Exception ex)
            {
                Log(ex.Message);
            }
            long key = WindowKey(_window);
            if (key != 0) Live[key] = this;
            if (!await Sidecar.Ready) Log("sidecar not ready");
            NavigateFresh();
        }

        void NavigateFresh()
        {
            if (_web.CoreWebView2 == null) return;
            _web.CoreWebView2.Navigate("https://127.0.0.1:28770/taskpane.html?v=" + DateTime.UtcNow.Ticks);
        }

        static long WindowKey(object window)
        {
            if (window == null) return 0;
            IntPtr unk = Marshal.GetIUnknownForObject(window);
            long key = unk.ToInt64();
            Marshal.Release(unk);
            return key;
        }

        static void Log(string text)
        {
            try
            {
                File.AppendAllText(Path.Combine(Path.GetTempPath(), "kuru-addin.log"), DateTime.Now.ToString("HH:mm:ss ") + text + Environment.NewLine);
            }
            catch
            {
            }
        }
    }
}
