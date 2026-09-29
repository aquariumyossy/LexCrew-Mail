using System;

namespace KuruOutlook
{
    public static class MailParty
    {
        public static string PersonName(params string[] candidates)
        {
            if (candidates == null)
            {
                return "";
            }
            for (int i = 0; i < candidates.Length; i++)
            {
                string name = Clean(candidates[i]);
                if (name.Length == 0 || IsAddress(name))
                {
                    continue;
                }
                return name;
            }
            return "";
        }

        public static string SmtpAddress(params string[] candidates)
        {
            if (candidates == null)
            {
                return "";
            }
            for (int i = 0; i < candidates.Length; i++)
            {
                string value = candidates[i];
                if (string.IsNullOrWhiteSpace(value))
                {
                    continue;
                }
                string text = value.Trim();
                if (text.IndexOf('@') < 0 || text.StartsWith("/"))
                {
                    continue;
                }
                return text.ToLowerInvariant();
            }
            return "";
        }

        public static string Clean(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            string text = value.Trim();
            text = StripAngle(text);
            text = StripParenEmail(text, '（', '）');
            text = StripParenEmail(text, '(', ')');
            text = text.Trim().Trim('"');
            if (text.StartsWith("「") && text.EndsWith("」") && text.Length > 2)
            {
                text = text.Substring(1, text.Length - 2).Trim();
            }
            return text.Trim();
        }

        public static bool IsAddress(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return false;
            }
            string text = value.Trim();
            if (text.IndexOf('@') >= 0)
            {
                return true;
            }
            if (text.StartsWith("/"))
            {
                return true;
            }
            return text.IndexOf("/o=", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        static string StripAngle(string text)
        {
            int open = text.LastIndexOf('<');
            int close = text.LastIndexOf('>');
            if (open <= 0 || close < open || text.IndexOf('@', open) < 0)
            {
                return text;
            }
            return text.Substring(0, open).Trim();
        }

        static string StripParenEmail(string text, char open, char close)
        {
            int end = text.LastIndexOf(close);
            int start = end > 0 ? text.LastIndexOf(open, end) : -1;
            if (start <= 0 || end < 0)
            {
                return text;
            }
            string inside = text.Substring(start + 1, end - start - 1);
            if (inside.IndexOf('@') < 0)
            {
                return text;
            }
            return (text.Substring(0, start) + text.Substring(end + 1)).Trim();
        }
    }
}
