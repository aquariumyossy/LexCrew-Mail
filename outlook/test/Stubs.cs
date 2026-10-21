using System;
using System.IO;
using System.Threading.Tasks;

namespace System.Windows.Forms
{
    public enum DockStyle { None = 0, Fill = 5 }
    public class Control
    {
        public DockStyle Dock { get; set; }
        public ControlCollection Controls { get; private set; }
        public Control() { Controls = new ControlCollection(); }
    }
    public class ControlCollection
    {
        public void Add(Control value) { }
    }
    public class UserControl : Control
    {
        public event EventHandler Load;
    }
}

namespace System.Web.Script.Serialization
{
    public class JavaScriptSerializer
    {
        public int MaxJsonLength { get; set; }
        public string Serialize(object value) { return ""; }
        public T Deserialize<T>(string input) { return default(T); }
    }
}

namespace Microsoft.Web.WebView2.Core
{
    public enum CoreWebView2ServerCertificateErrorAction { AlwaysAllow = 0 }
    public enum CoreWebView2BrowsingDataKinds { DiskCache = 1 }
    public enum CoreWebView2WebResourceContext { All = 0 }

    public class CoreWebView2Environment
    {
        public static Task<CoreWebView2Environment> CreateAsync(string browser, string userData)
        {
            return Task.FromResult(new CoreWebView2Environment());
        }
        public Stream CreateWebResourceResponse(Stream content, int status, string reason, string headers)
        {
            return content;
        }
    }

    public class CoreWebView2Certificate { public string Subject { get; set; } }
    public class CoreWebView2Profile
    {
        public Task ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds kinds) { return Task.CompletedTask; }
    }
    public class CoreWebView2HttpRequestHeaders { public void SetHeader(string name, string value) { } }
    public class CoreWebView2WebResourceRequest
    {
        public string Uri { get; set; }
        public CoreWebView2HttpRequestHeaders Headers { get; set; }
    }

    public class CoreWebView2NavigationCompletedEventArgs : EventArgs { public bool IsSuccess { get; set; } }
    public class CoreWebView2ServerCertificateErrorDetectedEventArgs : EventArgs
    {
        public CoreWebView2Certificate ServerCertificate { get; set; }
        public string RequestUri { get; set; }
        public CoreWebView2ServerCertificateErrorAction Action { get; set; }
    }
    public class CoreWebView2NavigationStartingEventArgs : EventArgs
    {
        public string Uri { get; set; }
        public bool Cancel { get; set; }
    }
    public class CoreWebView2NewWindowRequestedEventArgs : EventArgs { public bool Handled { get; set; } }
    public class CoreWebView2WebResourceRequestedEventArgs : EventArgs
    {
        public CoreWebView2WebResourceRequest Request { get; set; }
        public Stream Response { get; set; }
    }

    public class CoreWebView2
    {
        public CoreWebView2Environment Environment { get; set; }
        public CoreWebView2Profile Profile { get; set; }
        public event EventHandler<CoreWebView2NavigationCompletedEventArgs> NavigationCompleted;
        public event EventHandler<CoreWebView2ServerCertificateErrorDetectedEventArgs> ServerCertificateErrorDetected;
        public event EventHandler<CoreWebView2NavigationStartingEventArgs> NavigationStarting;
        public event EventHandler<CoreWebView2NavigationStartingEventArgs> FrameNavigationStarting;
        public event EventHandler<CoreWebView2NewWindowRequestedEventArgs> NewWindowRequested;
        public event EventHandler<CoreWebView2WebResourceRequestedEventArgs> WebResourceRequested;
        public void Navigate(string uri) { }
        public void AddHostObjectToScript(string name, object raw) { }
        public Task<string> ExecuteScriptAsync(string script) { return Task.FromResult(""); }
        public Task<string> AddScriptToExecuteOnDocumentCreatedAsync(string script) { return Task.FromResult(""); }
        public Task<string> CallDevToolsProtocolMethodAsync(string method, string parameters) { return Task.FromResult(""); }
        public void AddWebResourceRequestedFilter(string uri, CoreWebView2WebResourceContext context) { }
    }
}

namespace Microsoft.Web.WebView2.WinForms
{
    public class WebView2 : System.Windows.Forms.Control
    {
        public Microsoft.Web.WebView2.Core.CoreWebView2 CoreWebView2 { get; set; }
        public Task EnsureCoreWebView2Async(Microsoft.Web.WebView2.Core.CoreWebView2Environment environment)
        {
            return Task.CompletedTask;
        }
    }
}
