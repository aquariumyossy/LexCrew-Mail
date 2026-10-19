using System;

namespace KuruOutlook
{
    public static class TaskPaneNavigation
    {
        public const string TaskHost = "127.0.0.1";
        public const int TaskPort = 28770;

        public static bool Allow(string uri)
        {
            if (string.IsNullOrEmpty(uri)) return false;
            if (string.Equals(uri, "about:blank", StringComparison.OrdinalIgnoreCase)) return true;
            Uri parsed;
            if (!Uri.TryCreate(uri, UriKind.Absolute, out parsed)) return false;
            return string.Equals(parsed.Scheme, "https", StringComparison.OrdinalIgnoreCase)
                && string.Equals(parsed.Host, TaskHost, StringComparison.OrdinalIgnoreCase)
                && parsed.Port == TaskPort;
        }
    }
}
