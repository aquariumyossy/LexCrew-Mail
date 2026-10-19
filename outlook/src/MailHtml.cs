using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace KuruOutlook
{
    public static class MailHtml
    {
        static readonly Regex SteeringMarks = new Regex(
            "[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]",
            RegexOptions.Compiled);

        public static string Sanitize(string html)
        {
            return Finalize(Walk(html ?? "", false));
        }

        public static string ToPlain(string html)
        {
            string text = Walk(html ?? "", true);
            text = Regex.Replace(text, @"\s+", " ");
            return text.Trim();
        }

        public static string StripMarks(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            return SteeringMarks.Replace(text, "");
        }

        static string Finalize(string fragment)
        {
            string trimmed = (fragment ?? "").Trim();
            if (trimmed.Length == 0) return "<p></p>";
            if (Regex.IsMatch(trimmed, @"<(?:p|ul|ol|li|br|strong|b|em)\b", RegexOptions.IgnoreCase)) return trimmed;
            string breaks = trimmed.Replace("\r\n", "\n").Replace("\n", "<br>");
            return "<p>" + breaks + "</p>";
        }

        sealed class Frame
        {
            public string Name;
            public int R, G, B;
            public double A;
            public int BgR, BgG, BgB;
            public double BgA;
            public bool ZeroFont;
        }

        sealed class Tag
        {
            public string Name;
            public bool Close;
            public bool SelfClose;
            public string Attrs;
            public int End;
        }

        static string Walk(string input, bool plain)
        {
            string src = (input ?? "").Replace("\0", "");
            var output = new StringBuilder();
            var frames = new List<Frame>();
            frames.Add(Root());
            int i = 0;
            int drop = 0;
            while (i < src.Length)
            {
                if (src[i] != '<')
                {
                    int next = src.IndexOf('<', i);
                    int end = next < 0 ? src.Length : next;
                    PushText(output, plain, src.Substring(i, end - i), frames[frames.Count - 1], drop);
                    i = end;
                    continue;
                }
                if (StartsWith(src, i, "<!--"))
                {
                    int end = src.IndexOf("-->", i + 4, StringComparison.Ordinal);
                    i = end < 0 ? src.Length : end + 3;
                    continue;
                }
                if (StartsWith(src, i, "<!") || StartsWith(src, i, "<?"))
                {
                    int end = src.IndexOf('>', i + 2);
                    i = end < 0 ? src.Length : end + 1;
                    continue;
                }
                Tag tag = ReadTag(src, i);
                if (tag == null)
                {
                    PushText(output, plain, "<", frames[frames.Count - 1], drop);
                    i += 1;
                    continue;
                }
                i = tag.End;
                string name = tag.Name.ToLowerInvariant();
                if (tag.Close)
                {
                    if (drop > 0)
                    {
                        drop -= 1;
                        continue;
                    }
                    CloseFrames(frames, output, plain, name);
                    continue;
                }
                if (name == "script" || name == "style")
                {
                    Match close = Regex.Match(src.Substring(tag.End), "</" + name + "\\s*>", RegexOptions.IgnoreCase);
                    i = close.Success ? tag.End + close.Index + close.Length : src.Length;
                    continue;
                }
                if (drop > 0)
                {
                    if (!tag.SelfClose && !IsVoid(name)) drop += 1;
                    continue;
                }
                if (DropsContent(name) || name == "img")
                {
                    if (!tag.SelfClose && !IsVoid(name)) drop = 1;
                    continue;
                }
                bool subtree;
                Frame frame = Derive(frames[frames.Count - 1], name, tag.Attrs, out subtree);
                if (subtree)
                {
                    if (!tag.SelfClose && !IsVoid(name)) drop = 1;
                    continue;
                }
                if (!plain && Allowed(name)) output.Append(name == "br" ? "<br>" : "<" + name + ">");
                if (plain) output.Append(' ');
                if (tag.SelfClose || IsVoid(name)) continue;
                frames.Add(frame);
            }
            return output.ToString();
        }

        static Frame Root()
        {
            return new Frame { Name = "#root", R = 0, G = 0, B = 0, A = 1, BgR = 255, BgG = 255, BgB = 255, BgA = 1, ZeroFont = false };
        }

        static void PushText(StringBuilder output, bool plain, string raw, Frame frame, int drop)
        {
            if (drop > 0 || string.IsNullOrEmpty(raw)) return;
            if (frame.ZeroFont || ColorsTooClose(frame)) return;
            string decoded = StripMarks(Decode(raw));
            if (decoded.Length == 0) return;
            output.Append(plain ? decoded : Escape(decoded));
        }

        static void CloseFrames(List<Frame> frames, StringBuilder output, bool plain, string name)
        {
            int idx = -1;
            for (int at = frames.Count - 1; at >= 1; at--)
            {
                if (frames[at].Name == name)
                {
                    idx = at;
                    break;
                }
            }
            if (idx < 0) return;
            for (int at = frames.Count - 1; at >= idx; at--)
            {
                string open = frames[at].Name;
                if (!plain && Allowed(open) && open != "br") output.Append("</").Append(open).Append('>');
                if (plain) output.Append(' ');
            }
            frames.RemoveRange(idx, frames.Count - idx);
        }

        static Frame Derive(Frame parent, string name, string attrs, out bool subtree)
        {
            string style = StripCssComments(Decode(Attr(attrs, "style") ?? ""));
            int r = parent.R, g = parent.G, b = parent.B;
            double a = parent.A;
            int br = parent.BgR, bg = parent.BgG, bb = parent.BgB;
            double ba = parent.BgA;
            int cr, cg, cb;
            double ca;
            if (TryParseColor(LastDecl(style, "color") ?? Attr(attrs, "color") ?? "", out cr, out cg, out cb, out ca))
            {
                r = cr; g = cg; b = cb; a = ca;
            }
            string background = ColorFromBackground(LastDecl(style, "background-color") ?? "");
            if (background.Length == 0) background = ColorFromBackground(LastDecl(style, "background") ?? "");
            if (background.Length == 0) background = Attr(attrs, "bgcolor") ?? "";
            if (TryParseColor(background, out cr, out cg, out cb, out ca))
            {
                br = cr; bg = cg; bb = cb; ba = ca;
            }
            bool zeroFont = parent.ZeroFont;
            string fontDecl = LastDecl(style, "font-size");
            if (fontDecl != null)
            {
                bool zero;
                if (FontSizeIsZero(fontDecl, out zero)) zeroFont = zero;
            }
            string size = (Attr(attrs, "size") ?? "").Trim();
            if (Regex.IsMatch(size, @"^0+(?:\.0+)?$")) zeroFont = true;
            else if (Regex.IsMatch(size, @"^[1-7]$")) zeroFont = false;
            subtree = Regex.IsMatch(" " + (attrs ?? "") + " ", @"(?:^|\s)hidden(?:\s|=|$)", RegexOptions.IgnoreCase)
                || Regex.IsMatch(style, @"display\s*:\s*none", RegexOptions.IgnoreCase)
                || Regex.IsMatch(style, @"visibility\s*:\s*hidden", RegexOptions.IgnoreCase)
                || OpacityHides(style);
            return new Frame { Name = name, R = r, G = g, B = b, A = a, BgR = br, BgG = bg, BgB = bb, BgA = ba, ZeroFont = zeroFont };
        }

        static bool Allowed(string name)
        {
            switch (name)
            {
                case "p":
                case "br":
                case "strong":
                case "b":
                case "em":
                case "ul":
                case "ol":
                case "li":
                    return true;
                default:
                    return false;
            }
        }

        static bool DropsContent(string name)
        {
            switch (name)
            {
                case "script":
                case "style":
                case "head":
                case "title":
                case "iframe":
                case "object":
                case "embed":
                case "noscript":
                case "template":
                case "svg":
                case "math":
                case "textarea":
                case "select":
                case "option":
                    return true;
                default:
                    return false;
            }
        }

        static bool IsVoid(string name)
        {
            switch (name)
            {
                case "br":
                case "img":
                case "hr":
                case "meta":
                case "link":
                case "input":
                case "source":
                case "track":
                case "area":
                case "base":
                case "col":
                case "wbr":
                case "param":
                    return true;
                default:
                    return false;
            }
        }

        static Tag ReadTag(string src, int start)
        {
            int i = start + 1;
            if (i >= src.Length) return null;
            bool close = false;
            if (src[i] == '/')
            {
                close = true;
                i += 1;
            }
            if (i >= src.Length || !IsLetter(src[i])) return null;
            int nameStart = i;
            while (i < src.Length && IsName(src[i])) i += 1;
            string name = src.Substring(nameStart, i - nameStart);
            if (!close && i < src.Length && !IsTagEnd(src[i])) return null;
            int attrStart = i;
            char quote = '\0';
            while (i < src.Length)
            {
                char c = src[i];
                if (quote != '\0')
                {
                    if (c == quote) quote = '\0';
                    i += 1;
                    continue;
                }
                if (c == '"' || c == '\'')
                {
                    quote = c;
                    i += 1;
                    continue;
                }
                if (c == '>') break;
                i += 1;
            }
            string rawAttrs = src.Substring(attrStart, Math.Min(i, src.Length) - attrStart);
            bool selfClose = Regex.IsMatch(rawAttrs, @"/\s*$");
            return new Tag { Name = name, Close = close, SelfClose = selfClose, Attrs = rawAttrs, End = i >= src.Length ? src.Length : i + 1 };
        }

        static bool IsLetter(char c)
        {
            return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
        }

        static bool IsName(char c)
        {
            return IsLetter(c) || (c >= '0' && c <= '9');
        }

        static bool IsTagEnd(char c)
        {
            return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '/' || c == '>';
        }

        static string Attr(string attrs, string name)
        {
            if (string.IsNullOrEmpty(attrs)) return null;
            Match match = Regex.Match(attrs, "(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))", RegexOptions.IgnoreCase);
            if (!match.Success) return null;
            if (match.Groups[1].Success) return match.Groups[1].Value;
            if (match.Groups[2].Success) return match.Groups[2].Value;
            return match.Groups[3].Value;
        }

        static string LastDecl(string style, string name)
        {
            if (string.IsNullOrEmpty(style)) return null;
            MatchCollection matches = Regex.Matches(style, "(?:^|;)\\s*" + name + "\\s*:\\s*([^;]+)", RegexOptions.IgnoreCase);
            if (matches.Count == 0) return null;
            return matches[matches.Count - 1].Groups[1].Value.Trim();
        }

        static string StripCssComments(string style)
        {
            if (string.IsNullOrEmpty(style)) return "";
            return Regex.Replace(style, @"/\*[\s\S]*?\*/", "");
        }

        static string ColorFromBackground(string value)
        {
            if (string.IsNullOrEmpty(value) || Regex.IsMatch(value, @"url\s*\(", RegexOptions.IgnoreCase)) return "";
            Match hex = Regex.Match(value, @"#(?:[0-9a-fA-F]{3,8})");
            if (hex.Success) return hex.Value;
            Match rgb = Regex.Match(value, @"rgba?\([^)]*\)", RegexOptions.IgnoreCase);
            if (rgb.Success) return rgb.Value;
            string[] parts = value.Trim().Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return "";
            string named = parts[0].ToLowerInvariant();
            int r, g, b;
            double a;
            return TryNamed(named, out r, out g, out b, out a) ? named : "";
        }

        static bool FontSizeIsZero(string value, out bool zero)
        {
            zero = false;
            Match match = Regex.Match((value ?? "").Trim(), @"^([0-9.]+)\s*(px|pt|em|rem|%)?", RegexOptions.IgnoreCase);
            if (!match.Success) return false;
            double n;
            if (!double.TryParse(match.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out n)) return false;
            string unit = match.Groups[2].Success ? match.Groups[2].Value.ToLowerInvariant() : "px";
            if (n <= 0) zero = true;
            else if (unit == "px" && n < 1) zero = true;
            else if (unit == "pt" && n < 0.75) zero = true;
            else if ((unit == "em" || unit == "rem") && n < 0.08) zero = true;
            else if (unit == "%" && n < 8) zero = true;
            return true;
        }

        static bool OpacityHides(string style)
        {
            Match match = Regex.Match(style ?? "", @"opacity\s*:\s*([0-9.]+)\s*(%)?", RegexOptions.IgnoreCase);
            if (!match.Success) return false;
            double n;
            if (!double.TryParse(match.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out n)) return false;
            if (match.Groups[2].Success) n /= 100;
            return n <= 0.02;
        }

        static bool TryParseColor(string value, out int r, out int g, out int b, out double a)
        {
            r = 0; g = 0; b = 0; a = 1;
            string text = (value ?? "").Trim().ToLowerInvariant();
            if (text.Length == 0) return false;
            if (TryNamed(text, out r, out g, out b, out a)) return true;
            Match hex = Regex.Match(text, @"^#([0-9a-f]{3,8})$");
            if (hex.Success)
            {
                string raw = hex.Groups[1].Value;
                if (raw.Length == 3 || raw.Length == 4)
                {
                    r = Convert.ToInt32(new string(raw[0], 2), 16);
                    g = Convert.ToInt32(new string(raw[1], 2), 16);
                    b = Convert.ToInt32(new string(raw[2], 2), 16);
                    a = raw.Length == 4 ? Convert.ToInt32(new string(raw[3], 2), 16) / 255.0 : 1;
                    return true;
                }
                if (raw.Length == 6 || raw.Length == 8)
                {
                    r = Convert.ToInt32(raw.Substring(0, 2), 16);
                    g = Convert.ToInt32(raw.Substring(2, 2), 16);
                    b = Convert.ToInt32(raw.Substring(4, 2), 16);
                    a = raw.Length == 8 ? Convert.ToInt32(raw.Substring(6, 2), 16) / 255.0 : 1;
                    return true;
                }
            }
            Match rgb = Regex.Match(text, @"^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$");
            if (!rgb.Success) return false;
            r = ClampByte(int.Parse(rgb.Groups[1].Value, CultureInfo.InvariantCulture));
            g = ClampByte(int.Parse(rgb.Groups[2].Value, CultureInfo.InvariantCulture));
            b = ClampByte(int.Parse(rgb.Groups[3].Value, CultureInfo.InvariantCulture));
            a = rgb.Groups[4].Success ? Math.Min(1, Math.Max(0, double.Parse(rgb.Groups[4].Value, CultureInfo.InvariantCulture))) : 1;
            return true;
        }

        static bool TryNamed(string text, out int r, out int g, out int b, out double a)
        {
            a = 1;
            switch (text)
            {
                case "white": r = 255; g = 255; b = 255; return true;
                case "black": r = 0; g = 0; b = 0; return true;
                case "red": r = 255; g = 0; b = 0; return true;
                case "green": r = 0; g = 128; b = 0; return true;
                case "blue": r = 0; g = 0; b = 255; return true;
                case "yellow": r = 255; g = 255; b = 0; return true;
                case "gray":
                case "grey": r = 128; g = 128; b = 128; return true;
                case "silver": r = 192; g = 192; b = 192; return true;
                case "transparent": r = 0; g = 0; b = 0; a = 0; return true;
                default: r = 0; g = 0; b = 0; return false;
            }
        }

        static bool ColorsTooClose(Frame frame)
        {
            if (frame.A <= 0.02) return true;
            int br = frame.BgR, bg = frame.BgG, bb = frame.BgB;
            double ba = frame.BgA;
            if (ba <= 0.02)
            {
                br = 255; bg = 255; bb = 255; ba = 1;
            }
            double sr, sg, sb;
            Composite(frame.R, frame.G, frame.B, frame.A, br, bg, bb, ba, out sr, out sg, out sb);
            if (ba < 1)
            {
                double wr, wg, wb;
                Composite((int)sr, (int)sg, (int)sb, 1, 255, 255, 255, 1, out wr, out wg, out wb);
                sr = wr; sg = wg; sb = wb;
            }
            double baseR, baseG, baseB;
            if (frame.BgA < 1 && frame.BgA > 0.02)
            {
                Composite(frame.BgR, frame.BgG, frame.BgB, frame.BgA, 255, 255, 255, 1, out baseR, out baseG, out baseB);
            }
            else
            {
                baseR = br; baseG = bg; baseB = bb;
            }
            return Math.Abs(sr - baseR) <= 8 && Math.Abs(sg - baseG) <= 8 && Math.Abs(sb - baseB) <= 8;
        }

        static void Composite(int fr, int fg, int fb, double fa, int br, int bg, int bb, double ba, out double r, out double g, out double b)
        {
            double a = fa + ba * (1 - fa);
            if (a == 0)
            {
                r = 255; g = 255; b = 255;
                return;
            }
            r = (fr * fa + br * ba * (1 - fa)) / a;
            g = (fg * fa + bg * ba * (1 - fa)) / a;
            b = (fb * fa + bb * ba * (1 - fa)) / a;
        }

        static int ClampByte(int n)
        {
            if (n < 0) return 0;
            if (n > 255) return 255;
            return n;
        }

        static string Decode(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            string decoded = Regex.Replace(text, @"&#x([0-9a-fA-F]+);?", HexEntity);
            decoded = Regex.Replace(decoded, @"&#(\d+);?", DecEntity);
            decoded = Regex.Replace(decoded, "&nbsp;", " ", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&quot;", "\"", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&apos;", "'", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&lt;", "<", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&gt;", ">", RegexOptions.IgnoreCase);
            decoded = Regex.Replace(decoded, "&amp;", "&", RegexOptions.IgnoreCase);
            return decoded;
        }

        static string HexEntity(Match match)
        {
            int code;
            if (!int.TryParse(match.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out code)) return "";
            return FromCode(code);
        }

        static string DecEntity(Match match)
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

        static string Escape(string text)
        {
            return (text ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
        }

        static bool StartsWith(string src, int at, string prefix)
        {
            return at + prefix.Length <= src.Length && string.CompareOrdinal(src, at, prefix, 0, prefix.Length) == 0;
        }
    }
}
