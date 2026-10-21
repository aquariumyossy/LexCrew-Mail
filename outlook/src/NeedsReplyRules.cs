using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace KuruOutlook
{
    public static class NeedsReplyRules
    {
        public const int MinDays = 1;
        public const int MaxDays = 30;
        public const int DefaultTake = 12;
        public const int MaxTake = 20;
        public const int DefaultBudgetMs = 350;
        public const int MaxBudgetMs = 800;
        public const int HardPass = 500;
        public const int BodyChars = 2000;
        public const int ReplyToSender = 102;
        public const int ReplyToAll = 103;
        public const int RepliedIcon = 261;

        public static int ClampInt(int value, int min, int max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        public static string RestrictSince(string field, DateTime start)
        {
            return field + " >= '" + start.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture) + "'";
        }

        /// <summary>reset always starts over. A later batch continues only when it is the same scan.</summary>
        public static string NextSession(bool reset, bool hasSession, bool sameIdentity)
        {
            if (reset) return "restart";
            if (hasSession && sameIdentity) return "continue";
            return "stale";
        }

        static readonly Regex SmtpPattern = new Regex(
            @"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        /// <summary>SMTP addresses on one unfolded header, such as List-Post or Reply-To.</summary>
        public static List<string> HeaderSmtps(string headers, string field)
        {
            var found = new List<string>();
            if (string.IsNullOrEmpty(headers) || string.IsNullOrEmpty(field)) return found;
            string[] lines = headers.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            var value = new System.Text.StringBuilder();
            bool capture = false;
            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i] ?? "";
                if (line.StartsWith(" ") || line.StartsWith("\t"))
                {
                    if (capture) value.Append(' ').Append(line.Trim());
                    continue;
                }
                if (capture)
                {
                    TakeSmtps(value.ToString(), found);
                    capture = false;
                    value.Length = 0;
                }
                int colon = line.IndexOf(':');
                if (colon <= 0) continue;
                string name = line.Substring(0, colon).Trim();
                if (!name.Equals(field, StringComparison.OrdinalIgnoreCase)) continue;
                capture = true;
                value.Append(line.Substring(colon + 1).Trim());
            }
            if (capture) TakeSmtps(value.ToString(), found);
            return found;
        }

        static void TakeSmtps(string value, List<string> found)
        {
            if (string.IsNullOrEmpty(value)) return;
            MatchCollection matches = SmtpPattern.Matches(value);
            for (int i = 0; i < matches.Count; i++)
            {
                string smtp = matches[i].Value.ToLowerInvariant();
                if (!found.Contains(smtp)) found.Add(smtp);
            }
        }

        public static bool IsReplyVerb(int verb)
        {
            return verb == ReplyToSender || verb == ReplyToAll;
        }

        public static bool IsRepliedIcon(int icon)
        {
            return icon == RepliedIcon;
        }

        public static string Cap(string text, int max)
        {
            if (string.IsNullOrEmpty(text) || text.Length <= max) return text ?? "";
            return text.Substring(0, max);
        }
    }
}
