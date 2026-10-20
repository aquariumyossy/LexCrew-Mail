using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
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
            KuruPane.ClosedPane += DropPane;
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
                dynamic ribbonControl = control;
                object parent = ribbonControl.Context;
                if (parent == null) throw new InvalidOperationException("表示中の Outlook ウィンドウが見つかりません。");
                Log("OnKuruClick parent=" + ParentKind(parent));
                long key = WindowKey(parent);
                HideOtherPanes(key);
                if (TryShowPane(key, parent))
                {
                    return;
                }
                KuruPane.PendingWindow = parent;
                object ctp = _factory.CreateCTP("Kuru.Pane", "LexCrew", parent);
                dynamic pane = ctp;
                pane.DockPosition = 2;
                pane.Width = 380;
                pane.Visible = true;
                _panes[key] = ctp;
                KuruPane.BindCreated(ctp, parent, key);
                Log("pane shown");
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
            }
        }

        void HideOtherPanes(long activeKey)
        {
            var stale = new List<long>();
            foreach (KeyValuePair<long, object> pair in _panes)
            {
                if (pair.Key == activeKey)
                {
                    continue;
                }
                try
                {
                    ((dynamic)pair.Value).Visible = false;
                }
                catch (Exception ex)
                {
                    Log(ex.ToString());
                    stale.Add(pair.Key);
                }
            }
            for (int i = 0; i < stale.Count; i++)
            {
                DropPane(stale[i]);
            }
        }

        bool TryShowPane(long key, object window)
        {
            object existing;
            if (!_panes.TryGetValue(key, out existing))
            {
                return false;
            }
            try
            {
                ((dynamic)existing).Visible = true;
                KuruPane.Rebind(key, existing, window);
                Log("pane reloaded");
                return true;
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
                DropPane(key);
                return false;
            }
        }

        void DropPane(long key)
        {
            _panes.Remove(key);
            KuruPane.Forget(key);
        }

        static string ParentKind(object window)
        {
            try
            {
                int cls = Convert.ToInt32(((dynamic)window).Class);
                if (cls == 34)
                {
                    return "Explorer";
                }
                if (cls == 35)
                {
                    return "Inspector";
                }
                return "Unknown(" + cls + ")";
            }
            catch
            {
                return "Unknown";
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
        public static event Action<long> ClosedPane;
        static readonly Dictionary<long, KuruPane> Live = new Dictionary<long, KuruPane>();
        static KuruPane _constructed;
        static KuruPane _latestInspector;
        static readonly Guid InspectorEvents = new Guid("0006307D-0000-0000-C000-000000000046");
        const int InspectorClose = 0xF008;
        const int InspectorActivate = 0xF001;
        const string HostScript =
            "window.kuru={getContext:function(){return chrome.webview.hostObjects.sync.bridge.GetContext();}," +
            "readItem:function(){return chrome.webview.hostObjects.sync.bridge.ReadItem();}," +
            "readParties:function(){return chrome.webview.hostObjects.sync.bridge.ReadParties();}," +
            "readHeader:function(){return chrome.webview.hostObjects.sync.bridge.ReadHeader();}," +
            "readConversation:function(){return chrome.webview.hostObjects.sync.bridge.ReadConversation();}," +
            "writeDraft:function(json){return chrome.webview.hostObjects.sync.bridge.WriteDraft(json);}," +
            "readCalendar:function(json){return chrome.webview.hostObjects.sync.bridge.ReadCalendar(json);}," +
            "listMailFiles:function(){return chrome.webview.hostObjects.sync.bridge.ListMailFiles();}," +
            "readMailFile:function(index){return chrome.webview.hostObjects.bridge.ReadMailFile(index);}," +
            "searchSent:function(json){return chrome.webview.hostObjects.bridge.SearchSent(json);}};";
        object _host;
        object _ctp;
        object _watched;
        Action _onClose;
        Action _onActivate;
        long _key;
        bool _closed;
        readonly WebView2 _web = new WebView2();
        bool _retryingSidecar;
        bool _scriptReady;
        int _navGate;

        public static void Rebind(long key, object ctp, object window)
        {
            KuruPane pane;
            if (!Live.TryGetValue(key, out pane) || pane == null)
            {
                pane = ControlOf(ctp);
            }
            if (pane != null) pane.Bind(ctp, window, key);
        }

        public static void BindCreated(object ctp, object window, long key)
        {
            KuruPane pane = _constructed ?? ControlOf(ctp);
            _constructed = null;
            if (pane == null && MailTarget.Classify(window) == WindowClass.Inspector)
            {
                pane = _latestInspector;
            }
            if (pane != null) pane.Bind(ctp, window, key);
        }

        static KuruPane ControlOf(object ctp)
        {
            try
            {
                return ((dynamic)ctp).ContentControl as KuruPane;
            }
            catch (Exception)
            {
                return null;
            }
        }

        public static void Forget(long key)
        {
            Live.Remove(key);
        }

        public KuruPane()
        {
            _host = PendingWindow;
            PendingWindow = null;
            _constructed = this;
            _web.Dock = DockStyle.Fill;
            Controls.Add(_web);
            Load += OnLoad;
        }

        public void Bind(object ctp, object window, long key)
        {
            if (_key != 0 && _key != key) Live.Remove(_key);
            _ctp = ctp;
            _host = window;
            _closed = false;
            _key = key;
            if (key != 0) Live[key] = this;
            if (MailTarget.Classify(window) == WindowClass.Inspector) _latestInspector = this;
            Watch(window);
            if (_web.CoreWebView2 != null) NavigateFresh();
        }

        object HostWindow()
        {
            if (_closed) return null;
            if (_host != null) return _host;
            if (_ctp == null) return null;
            try
            {
                return ((dynamic)_ctp).Window;
            }
            catch (Exception)
            {
                return null;
            }
        }

        void Watch(object window)
        {
            Unwatch();
            if (window == null || MailTarget.Classify(window) != WindowClass.Inspector) return;
            _watched = window;
            _onClose = OnHostClosed;
            _onActivate = OnHostActivated;
            try
            {
                ComEventsHelper.Combine(_watched, InspectorEvents, InspectorClose, _onClose);
                ComEventsHelper.Combine(_watched, InspectorEvents, InspectorActivate, _onActivate);
            }
            catch (Exception ex)
            {
                Log(ex.Message);
                _watched = null;
                _onClose = null;
                _onActivate = null;
            }
        }

        void Unwatch()
        {
            if (_watched != null && _onClose != null)
            {
                try
                {
                    ComEventsHelper.Remove(_watched, InspectorEvents, InspectorClose, _onClose);
                }
                catch (Exception)
                {
                }
            }
            if (_watched != null && _onActivate != null)
            {
                try
                {
                    ComEventsHelper.Remove(_watched, InspectorEvents, InspectorActivate, _onActivate);
                }
                catch (Exception)
                {
                }
            }
            _watched = null;
            _onClose = null;
            _onActivate = null;
        }

        void OnHostClosed()
        {
            if (_closed) return;
            _closed = true;
            _host = null;
            long key = _key;
            _key = 0;
            Unwatch();
            if (key != 0)
            {
                Live.Remove(key);
                Action<long> closed = ClosedPane;
                if (closed != null) closed(key);
            }
            try
            {
                if (_web.CoreWebView2 != null) _web.CoreWebView2.Navigate("about:blank");
            }
            catch (Exception ex)
            {
                Log(ex.Message);
            }
        }

        void OnHostActivated()
        {
            if (!_closed) return;
            _closed = false;
            if (_host == null && _ctp != null)
            {
                try
                {
                    _host = ((dynamic)_ctp).Window;
                }
                catch (Exception)
                {
                    _host = null;
                }
            }
            if (_web.CoreWebView2 != null) NavigateFresh();
        }

        async void OnLoad(object sender, EventArgs e)
        {
            try
            {
                string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KURU", "WebView2");
                Directory.CreateDirectory(folder);
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, folder);
                await _web.EnsureCoreWebView2Async(env);
                _web.CoreWebView2.AddHostObjectToScript("bridge", new MailBridge(HostWindow));
                BindTaskPaneGuards();
                _web.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
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
                if (_key == 0)
                {
                    long key = WindowKey(HostWindow());
                    if (key != 0)
                    {
                        _key = key;
                        Live[key] = this;
                    }
                }
                else
                {
                    Live[_key] = this;
                }
                if (!await Sidecar.Ready) Log("sidecar not ready");
                NavigateFresh();
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
            }
        }

        async void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            if (args.IsSuccess && _web.CoreWebView2 != null)
            {
                _retryingSidecar = false;
                try
                {
                    await _web.CoreWebView2.ExecuteScriptAsync(HostScriptNow());
                }
                catch (Exception ex)
                {
                    Log(ex.Message);
                }
                return;
            }
            if (_retryingSidecar)
            {
                return;
            }
            _retryingSidecar = true;
            await WaitSidecarAndNavigateAsync();
        }

        async Task WaitSidecarAndNavigateAsync()
        {
            for (int i = 0; i < 300; i++)
            {
                if (await Task.Run((Func<bool>)Sidecar.Listening))
                {
                    NavigateFresh();
                    return;
                }
                await Task.Delay(100);
            }
            Log("sidecar not ready");
            _retryingSidecar = false;
        }

        async void NavigateFresh()
        {
            if (_web.CoreWebView2 == null) return;
            if (System.Threading.Interlocked.Exchange(ref _navGate, 1) == 1) return;
            try
            {
                if (ReadSessionToken().Length == 0)
                {
                    await WaitForSessionTokenAsync();
                }
                if (_web.CoreWebView2 == null) return;
                if (!_scriptReady)
                {
                    _scriptReady = true;
                    try
                    {
                        await _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(HostScriptNow());
                    }
                    catch (Exception ex)
                    {
                        _scriptReady = false;
                        Log(ex.Message);
                        return;
                    }
                }
                if (_web.CoreWebView2 == null) return;
                _web.CoreWebView2.Navigate("https://127.0.0.1:28770/taskpane.html?v=" + DateTime.UtcNow.Ticks);
            }
            catch (Exception ex)
            {
                Log(ex.Message);
            }
            finally
            {
                System.Threading.Interlocked.Exchange(ref _navGate, 0);
            }
        }

        void BindTaskPaneGuards()
        {
            CoreWebView2 core = _web.CoreWebView2;
            core.NavigationStarting += (s, args) =>
            {
                if (!TaskPaneNavigation.Allow(args.Uri)) args.Cancel = true;
            };
            core.FrameNavigationStarting += (s, args) =>
            {
                if (!TaskPaneNavigation.Allow(args.Uri)) args.Cancel = true;
            };
            core.NewWindowRequested += (s, args) =>
            {
                args.Handled = true;
            };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (s, args) =>
            {
                string uri = args.Request == null ? "" : args.Request.Uri;
                if (!TaskPaneNavigation.Allow(uri))
                {
                    args.Response = core.Environment.CreateWebResourceResponse(new MemoryStream(), 403, "Forbidden", "Content-Type: text/plain\r\n");
                    return;
                }
                string token = ReadSessionToken();
                if (token.Length > 0 && args.Request != null)
                {
                    args.Request.Headers.SetHeader("X-LexCrew-Token", token);
                }
            };
        }

        static string HostScriptNow()
        {
            return "window.kuruToken='" + ReadSessionToken() + "';" + HostScript;
        }

        static async Task WaitForSessionTokenAsync()
        {
            for (int i = 0; i < 300; i++)
            {
                if (ReadSessionToken().Length > 0) return;
                await Task.Delay(100);
            }
            Log("session token missing");
        }

        static string ReadSessionToken()
        {
            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KURU", "session.token");
                if (!File.Exists(path)) return "";
                string token = File.ReadAllText(path).Trim();
                if (token.Length < 32 || token.Length > 128) return "";
                for (int i = 0; i < token.Length; i++)
                {
                    char c = token[i];
                    bool hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
                    if (!hex) return "";
                }
                return token;
            }
            catch
            {
                return "";
            }
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
