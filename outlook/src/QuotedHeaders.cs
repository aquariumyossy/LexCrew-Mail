using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace KuruOutlook
{
    public static class QuotedHeaders
    {
        public const int SourceCap = 400000;

        static readonly Regex Mailbox = new Regex(
            @"[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        static readonly Regex LongToken = new Regex(@"[A-Za-z0-9+/]{200,}={0,2}", RegexOptions.Compiled);
        static readonly Regex Breaks = new Regex(@"<br\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        static readonly Regex Blocks = new Regex(@"</(?:p|div|tr|li|h[1-6]|table|blockquote|td|th)\s*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        static readonly Regex HexEntity = new Regex(@"&#x([0-9a-fA-F]+);?", RegexOptions.Compiled);
        static readonly Regex DecEntity = new Regex(@"&#(\d+);?", RegexOptions.Compiled);
        static readonly Regex Angle = new Regex(@"<\s*([^<>\s]+@[^<>\s]+)\s*>", RegexOptions.Compiled);
        static readonly Regex WideAngle = new Regex(@"＜\s*([^＜＞\s]+@[^＜＞\s]+)\s*＞", RegexOptions.Compiled);
        static readonly Regex Tags = new Regex(@"<[^>]*>", RegexOptions.Compiled);

        struct Label
        {
            public string Name;
            public string Role;
        }

        static readonly Label[] Labels = new Label[]
        {
            new Label { Name = "reply-to", Role = "replyTo" },
            new Label { Name = "返信先", Role = "replyTo" },
            new Label { Name = "送信日時", Role = "skip" },
            new Label { Name = "差出人", Role = "from" },
            new Label { Name = "送信者", Role = "sender" },
            new Label { Name = "subject", Role = "skip" },
            new Label { Name = "sender", Role = "sender" },
            new Label { Name = "from", Role = "from" },
            new Label { Name = "date", Role = "skip" },
            new Label { Name = "sent", Role = "skip" },
            new Label { Name = "bcc", Role = "skip" },
            new Label { Name = "件名", Role = "skip" },
            new Label { Name = "日付", Role = "skip" },
            new Label { Name = "宛先", Role = "to" },
            new Label { Name = "cc", Role = "cc" },
            new Label { Name = "to", Role = "to" }
        };

        public static string Clip(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            string text = LongToken.Replace(value, " ");
            if (text.Length > SourceCap) text = text.Substring(0, SourceCap);
            return text;
        }

        public static string[] Addresses(string source)
        {
            string text = HeaderText(source);
            var hits = new List<Hit>();
            int index = 0;
            while (index < text.Length)
            {
                int end;
                string role = MatchHeader(text, index, out end);
                if (role == null)
                {
                    index++;
                    continue;
                }
                hits.Add(new Hit { Role = role, End = end, Index = index });
                index = end;
            }
            var found = new List<string>();
            for (int i = 0; i < hits.Count; i++)
            {
                if (hits[i].Role == "skip") continue;
                int stop = i + 1 < hits.Count ? hits[i + 1].Index : text.Length;
                int newline = text.IndexOf('\n', hits[i].End);
                if (newline >= 0 && newline < stop) stop = newline;
                int period = text.IndexOf('。', hits[i].End);
                if (period >= 0 && period < stop) stop = period;
                string value = text.Substring(hits[i].End, Math.Max(0, stop - hits[i].End));
                foreach (Match match in Mailbox.Matches(value))
                {
                    string smtp = match.Value.ToLowerInvariant();
                    if (!IsMailbox(smtp) || found.Contains(smtp)) continue;
                    found.Add(smtp);
                }
            }
            return found.ToArray();
        }

        struct Hit
        {
            public string Role;
            public int End;
            public int Index;
        }

        static string HeaderText(string source)
        {
            string text = (source ?? "").Replace("\0", "").Replace("\r\n", "\n").Replace("\r", "\n");
            text = Clip(text);
            text = Breaks.Replace(text, "\n");
            text = Blocks.Replace(text, "\n");
            text = Decode(text);
            text = Angle.Replace(text, " $1 ");
            text = WideAngle.Replace(text, " $1 ");
            text = Tags.Replace(text, " ");
            return Fold(text);
        }

        static string MatchHeader(string text, int index, out int end)
        {
            end = index;
            if (!Boundary(text, index)) return null;
            string lower = text.ToLowerInvariant();
            string bestRole = null;
            int bestEnd = index;
            int bestLength = -1;
            for (int i = 0; i < Labels.Length; i++)
            {
                string name = Labels[i].Name;
                if (index + name.Length > text.Length) continue;
                string slice = name.Length > 0 && name[0] >= 'a' && name[0] <= 'z'
                    ? lower.Substring(index, name.Length)
                    : text.Substring(index, name.Length);
                if (slice != name) continue;
                int cursor = index + name.Length;
                while (cursor < text.Length && (text[cursor] == ' ' || text[cursor] == '\t')) cursor++;
                if (cursor >= text.Length || text[cursor] != ':') continue;
                if (name.Length > bestLength)
                {
                    bestRole = Labels[i].Role;
                    bestEnd = cursor + 1;
                    bestLength = name.Length;
                }
            }
            end = bestEnd;
            return bestRole;
        }

        static bool Boundary(string text, int index)
        {
            if (index == 0) return true;
            char prev = text[index - 1];
            if ((prev >= 'A' && prev <= 'Z') || (prev >= 'a' && prev <= 'z') || (prev >= '0' && prev <= '9') || prev == '_' || prev == '-')
            {
                return false;
            }
            return true;
        }

        static string Fold(string text)
        {
            var builder = new StringBuilder(text.Length);
            for (int i = 0; i < text.Length; i++)
            {
                char ch = text[i];
                int code = ch;
                if (code == 0xff1a) builder.Append(':');
                else if (code >= 0xff21 && code <= 0xff3a) builder.Append((char)(code - 0xff21 + 'A'));
                else if (code >= 0xff41 && code <= 0xff5a) builder.Append((char)(code - 0xff41 + 'a'));
                else builder.Append(ch);
            }
            return builder.ToString();
        }

        static string Decode(string text)
        {
            string decoded = HexEntity.Replace(text, Hex);
            decoded = DecEntity.Replace(decoded, Dec);
            decoded = Regex.Replace(decoded, "&nbsp;", " ", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&quot;", "\"", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&apos;", "'", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&#39;", "'", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&lt;", "<", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&gt;", ">", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&amp;", "&", RegexOptions.IgnoreCase);
            return decoded;
        }

        static string Hex(Match match)
        {
            int code;
            if (!int.TryParse(match.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out code)) return "";
            return FromCode(code);
        }

        static string Dec(Match match)
        {
            int code;
            if (!int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out code)) return "";
            return FromCode(code);
        }

        static string FromCode(int code)
        {
            if (code < 0 || code > 0x10ffff) return "";
            if (code <= 0x1f && code != 0x09 && code != 0x0a && code != 0x0d) return "";
            try
            {
                return char.ConvertFromUtf32(code);
            }
            catch
            {
                return "";
            }
        }

        static bool IsMailbox(string smtp)
        {
            if (string.IsNullOrEmpty(smtp) || smtp.Length > 254) return false;
            return Mailbox.IsMatch(smtp) && smtp.IndexOf('@') > 0;
        }
    }
}
