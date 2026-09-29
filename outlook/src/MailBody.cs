using System;
using System.Text.RegularExpressions;

namespace KuruOutlook
{
    public static class MailBody
    {
        public static string VisibleText(string html)
        {
            if (string.IsNullOrEmpty(html))
            {
                return "";
            }
            string text = html;
            text = StripBlock(text, "head");
            text = StripBlock(text, "style");
            text = StripBlock(text, "script");
            text = Regex.Replace(text, "<[^>]+>", " ");
            text = text.Replace("&nbsp;", " ");
            text = text.Replace("&amp;", "&");
            text = text.Replace("&lt;", "<");
            text = text.Replace("&gt;", ">");
            text = Regex.Replace(text, @"\s+", " ");
            return text.Trim();
        }

        public static string SplicePreface(string html, string preface, MailFont font)
        {
            if (html == null)
            {
                html = "";
            }
            string fragment = FormatPreface(preface, font);
            int bodyOpen = IndexOf(html, "<body", 0);
            if (bodyOpen < 0)
            {
                return fragment;
            }
            int contentStart = html.IndexOf('>', bodyOpen);
            if (contentStart < 0)
            {
                return fragment;
            }
            contentStart += 1;
            int signature = TagStart(html, contentStart, "id=\"Signature\"");
            int quote = EarliestQuote(html, contentStart);
            int cut = -1;
            if (signature >= 0 && (quote < 0 || signature < quote))
            {
                cut = signature;
            }
            else if (quote >= 0)
            {
                cut = quote;
            }
            if (cut < 0)
            {
                int bodyClose = IndexOf(html, "</body>", contentStart);
                if (bodyClose < 0)
                {
                    return html.Substring(0, contentStart) + fragment;
                }
                return html.Substring(0, contentStart) + fragment + html.Substring(bodyClose);
            }
            return html.Substring(0, contentStart) + fragment + html.Substring(cut);
        }

        static readonly Regex StyledTag = new Regex(
            @"<(p|div|li|span|td|th|a|b|strong|em|i|u|font|h[1-6])(\s[^>]*)?>",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        static readonly Regex FontSizeFace = new Regex(
            "\\s(face|size)\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        static readonly string[] CompetingFont = {
            "font",
            "font-size",
            "font-family",
            "mso-ascii-font-family",
            "mso-hansi-font-family",
            "mso-bidi-font-family",
            "mso-fareast-font-family",
            "mso-ascii-theme-font",
            "mso-hansi-theme-font",
            "mso-bidi-theme-font",
            "mso-fareast-theme-font"
        };

        static string FormatPreface(string preface, MailFont font)
        {
            string inner;
            if (string.IsNullOrEmpty(preface))
            {
                inner = "<p></p>";
            }
            else if (Regex.IsMatch(preface, @"<[A-Za-z/!]"))
            {
                inner = preface;
            }
            else
            {
                string escaped = preface.Replace("&", "&amp;").Replace("<", "&lt;");
                escaped = escaped.Replace("\r\n", "\n").Replace("\n", "<br>");
                inner = "<p>" + escaped + "</p>";
            }
            return Stamp("<div>" + inner + "</div>", font);
        }

        public static string PrefaceDocument(string preface, MailFont font)
        {
            return "<html><head><meta charset=\"utf-8\"></head><body>" + FormatPreface(preface, font) + "</body></html>";
        }

        public static int PreserveFrom(int signatureStart, int quoteStart)
        {
            if (signatureStart >= 0 && (quoteStart < 0 || signatureStart < quoteStart))
            {
                return signatureStart;
            }
            if (quoteStart >= 0)
            {
                return quoteStart;
            }
            return -1;
        }

        static string Stamp(string html, MailFont font)
        {
            string css = font.Css();
            return StyledTag.Replace(html, match =>
            {
                string tag = match.Groups[1].Value;
                string attrs = match.Groups[2].Success ? match.Groups[2].Value : "";
                if (string.Equals(tag, "font", StringComparison.OrdinalIgnoreCase))
                {
                    attrs = FontSizeFace.Replace(attrs, "");
                }
                Match style = Regex.Match(attrs, "style\\s*=\\s*(\"[^\"]*\"|'[^']*')", RegexOptions.IgnoreCase);
                if (!style.Success)
                {
                    return "<" + tag + attrs + " style='" + css + "'>";
                }
                string quoted = style.Groups[1].Value;
                string kept = KeepNonFont(quoted.Substring(1, quoted.Length - 2));
                string merged = "style='" + kept + css + "'";
                string replaced = attrs.Substring(0, style.Index) + merged + attrs.Substring(style.Index + style.Length);
                return "<" + tag + replaced + ">";
            });
        }

        static string KeepNonFont(string declarations)
        {
            var kept = new System.Collections.Generic.List<string>();
            foreach (string declaration in SplitDeclarations(declarations))
            {
                string trimmed = declaration.Trim();
                if (trimmed.Length == 0)
                {
                    continue;
                }
                int colon = trimmed.IndexOf(':');
                string name = (colon < 0 ? trimmed : trimmed.Substring(0, colon)).Trim();
                if (Array.Exists(CompetingFont, p => string.Equals(p, name, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }
                kept.Add(trimmed);
            }
            return kept.Count == 0 ? "" : string.Join(";", kept) + ";";
        }

        static System.Collections.Generic.List<string> SplitDeclarations(string declarations)
        {
            var parts = new System.Collections.Generic.List<string>();
            char quote = '\0';
            int depth = 0;
            int start = 0;
            for (int i = 0; i < declarations.Length; i++)
            {
                char c = declarations[i];
                if (quote != '\0')
                {
                    if (c == '\\')
                    {
                        i++;
                    }
                    else if (c == quote)
                    {
                        quote = '\0';
                    }
                }
                else if (c == '"' || c == '\'')
                {
                    quote = c;
                }
                else if (c == '(')
                {
                    depth++;
                }
                else if (c == ')' && depth > 0)
                {
                    depth--;
                }
                else if (c == ';' && depth == 0)
                {
                    parts.Add(declarations.Substring(start, i - start));
                    start = i + 1;
                }
            }
            parts.Add(declarations.Substring(start));
            return parts;
        }

        public static int QuoteStart(string html)
        {
            if (string.IsNullOrEmpty(html))
            {
                return -1;
            }
            return EarliestQuote(html, BodyContentStart(html));
        }

        public static int PrefaceEnd(string html)
        {
            if (string.IsNullOrEmpty(html))
            {
                return 0;
            }
            int from = BodyContentStart(html);
            int signature = TagStart(html, from, "id=\"Signature\"");
            int quote = EarliestQuote(html, from);
            if (signature >= 0 && (quote < 0 || signature < quote))
            {
                return signature;
            }
            if (quote >= 0)
            {
                return quote;
            }
            return html.Length;
        }

        static int BodyContentStart(string html)
        {
            int body = IndexOf(html, "<body", 0);
            if (body < 0)
            {
                return 0;
            }
            int content = html.IndexOf('>', body);
            if (content < 0)
            {
                return 0;
            }
            return content + 1;
        }

        static int EarliestQuote(string html, int from)
        {
            int best = -1;
            string[] markers = {
                "name=\"_MailOriginal\"",
                "id=\"divRplyFwdMsg\"",
                "border-top:solid #E1E1E1"
            };
            for (int i = 0; i < markers.Length; i++)
            {
                int tag = TagStart(html, from, markers[i]);
                if (tag >= 0 && (best < 0 || tag < best))
                {
                    best = tag;
                }
            }
            return best;
        }

        static int TagStart(string html, int from, string marker)
        {
            int at = IndexOf(html, marker, from);
            if (at < 0)
            {
                return -1;
            }
            int tag = html.LastIndexOf('<', at);
            if (tag < from)
            {
                return -1;
            }
            return tag;
        }

        static string StripBlock(string html, string tag)
        {
            return Regex.Replace(
                html,
                "<" + tag + "\\b[^>]*>.*?</" + tag + ">",
                " ",
                RegexOptions.IgnoreCase | RegexOptions.Singleline);
        }

        static int IndexOf(string html, string needle, int from)
        {
            return html.IndexOf(needle, from, StringComparison.OrdinalIgnoreCase);
        }
    }
}
