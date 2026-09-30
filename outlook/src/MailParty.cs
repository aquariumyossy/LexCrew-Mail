using System;
using System.Collections.Generic;
using System.Text;

namespace KuruOutlook
{
    public static class MailParty
    {
        public const int HeaderPartyMax = 30;
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

        public static string PartyLabel(string name, string smtp)
        {
            string person = PersonName(name);
            string address = ExtractSmtp(smtp);
            if (address.Length == 0)
            {
                address = ExtractSmtp(name);
            }
            if (person.Length > 0 && address.Length > 0)
            {
                return person + " <" + address + ">";
            }
            if (address.Length > 0)
            {
                return address;
            }
            return person;
        }

        public static string LabelFromDisplay(string part)
        {
            return PartyLabel(part, "");
        }

        public static string[] LabelsFromDisplayList(string value)
        {
            string[] parts = SplitDisplayList(value);
            var labels = new List<string>();
            for (int i = 0; i < parts.Length; i++)
            {
                string label = LabelFromDisplay(parts[i]);
                if (label.Length > 0)
                {
                    labels.Add(label);
                }
            }
            return labels.ToArray();
        }

        public static string[] SplitDisplayList(string value)
        {
            var parts = new List<string>();
            if (string.IsNullOrWhiteSpace(value))
            {
                return new string[0];
            }
            var current = new StringBuilder();
            int depth = 0;
            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];
                if (c == '<')
                {
                    depth++;
                }
                else if (c == '>' && depth > 0)
                {
                    depth--;
                }
                if (c == ';' && depth == 0)
                {
                    PushPart(parts, current);
                    continue;
                }
                current.Append(c);
            }
            PushPart(parts, current);
            return parts.ToArray();
        }

        public static string[] CapParties(IList<string> labels)
        {
            var clean = new List<string>();
            var seen = new HashSet<string>();
            if (labels != null)
            {
                for (int i = 0; i < labels.Count; i++)
                {
                    string text = (labels[i] ?? "").Trim();
                    if (text.Length == 0 || !seen.Add(text))
                    {
                        continue;
                    }
                    clean.Add(text);
                }
            }
            if (clean.Count <= HeaderPartyMax)
            {
                return clean.ToArray();
            }
            var capped = new string[HeaderPartyMax + 1];
            for (int i = 0; i < HeaderPartyMax; i++)
            {
                capped[i] = clean[i];
            }
            capped[HeaderPartyMax] = "ほか " + (clean.Count - HeaderPartyMax) + " 人";
            return capped;
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

        static void PushPart(List<string> parts, StringBuilder current)
        {
            string text = current.ToString().Trim();
            current.Length = 0;
            if (text.Length > 0)
            {
                parts.Add(text);
            }
        }

        static string ExtractSmtp(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            string text = value.Trim();
            string angled = AcceptSmtp(Inside(text, '<', '>'));
            if (angled.Length > 0)
            {
                return angled;
            }
            string full = AcceptSmtp(Inside(text, '（', '）'));
            if (full.Length > 0)
            {
                return full;
            }
            string paren = AcceptSmtp(Inside(text, '(', ')'));
            if (paren.Length > 0)
            {
                return paren;
            }
            return AcceptSmtp(text);
        }

        static string Inside(string text, char open, char close)
        {
            int end = text.LastIndexOf(close);
            int start = end > 0 ? text.LastIndexOf(open, end) : -1;
            if (start < 0 || end < 0)
            {
                return "";
            }
            return text.Substring(start + 1, end - start - 1).Trim();
        }

        static string AcceptSmtp(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            string text = value.Trim();
            if (text.IndexOf(' ') >= 0 || text.StartsWith("/"))
            {
                return "";
            }
            if (text.IndexOf("/o=", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "";
            }
            int at = text.IndexOf('@');
            if (at <= 0 || at >= text.Length - 1 || text.IndexOf('@', at + 1) >= 0)
            {
                return "";
            }
            return text.ToLowerInvariant();
        }
    }
}
