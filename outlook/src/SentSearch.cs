using System;
using System.Collections.Generic;

namespace KuruOutlook
{
    public sealed class MailPick
    {
        public int Id;
        public string Kind;
        public string Subject;
        public string When;
        public bool IndexMatch;
    }

    public static class SentSearch
    {
        public const int MaxSent = 3;
        public const int MaxReceived = 2;
        public const int SentExcerptChars = 1200;
        public const int PriorChars = 800;
        public const int ReceivedExcerptChars = 800;
        public const int FallbackScan = 200;

        public static bool IsSmtp(string value)
        {
            string text = NormalizeSmtp(value);
            if (text.Length == 0 || text.IndexOf(' ') >= 0)
            {
                return false;
            }
            if (text.StartsWith("/O=", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            int at = text.IndexOf('@');
            return at > 0 && at < text.Length - 1 && text.IndexOf('@', at + 1) < 0;
        }

        public static string NormalizeSmtp(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            string text = value.Trim();
            int open = text.LastIndexOf('<');
            int close = text.LastIndexOf('>');
            if (open >= 0 && close > open)
            {
                text = text.Substring(open + 1, close - open - 1).Trim();
            }
            return text;
        }

        public static List<string> CounterpartyAddresses(IEnumerable<string> found, IEnumerable<string> own)
        {
            var skip = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (own != null)
            {
                foreach (string item in own)
                {
                    string smtp = NormalizeSmtp(item);
                    if (IsSmtp(smtp))
                    {
                        skip.Add(smtp);
                    }
                }
            }
            var result = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (found == null)
            {
                return result;
            }
            foreach (string item in found)
            {
                string smtp = NormalizeSmtp(item);
                if (!IsSmtp(smtp) || skip.Contains(smtp) || !seen.Add(smtp))
                {
                    continue;
                }
                result.Add(smtp);
            }
            return result;
        }

        public static bool FilterIgnored(int restrictedCount, int folderCount)
        {
            return folderCount > 30 && restrictedCount >= folderCount;
        }

        public static string RestrictFilter(string query, IList<string> addresses, bool inbox)
        {
            string words = WordClause(query);
            string who = WhoClause(addresses, inbox);
            if (words.Length == 0 && who.Length == 0)
            {
                return "";
            }
            if (who.Length == 0)
            {
                return "@SQL=" + words;
            }
            if (words.Length == 0)
            {
                return "@SQL=" + who;
            }
            return "@SQL=(" + who + ") AND (" + words + ")";
        }

        public static bool ContainsText(string haystack, string needle)
        {
            if (string.IsNullOrWhiteSpace(needle) || string.IsNullOrEmpty(haystack))
            {
                return false;
            }
            return haystack.IndexOf(needle.Trim(), StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static int QueryRank(string subject, string query, bool indexMatch)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return 1;
            }
            if (ContainsText(subject, query))
            {
                return 2;
            }
            return indexMatch ? 1 : 0;
        }

        public static List<MailPick> SelectHits(IList<MailPick> items, string query)
        {
            var chosen = new List<MailPick>();
            chosen.AddRange(Pick(items, "sent", query, MaxSent));
            chosen.AddRange(Pick(items, "received", query, MaxReceived));
            return chosen;
        }

        public static void SplitBodies(string html, string plain, int excerptMax, int priorMax, out string excerpt, out string prior)
        {
            excerpt = "";
            prior = "";
            if (!string.IsNullOrEmpty(html))
            {
                int end = MailBody.PrefaceEnd(html);
                if (end < 0)
                {
                    end = 0;
                }
                if (end > html.Length)
                {
                    end = html.Length;
                }
                excerpt = Cap(MailBody.VisibleText(html.Substring(0, end)), excerptMax);
                int quote = MailBody.QuoteStart(html);
                if (quote >= 0 && quote < html.Length)
                {
                    prior = Cap(MailBody.VisibleText(MailBody.WithHeadStyles(html, html.Substring(quote))), priorMax);
                }
                if (excerpt.Length > 0 || prior.Length > 0)
                {
                    return;
                }
            }
            SplitPlain(plain ?? "", excerptMax, priorMax, out excerpt, out prior);
        }

        static void SplitPlain(string plain, int excerptMax, int priorMax, out string excerpt, out string prior)
        {
            int cut = EarliestPlain(plain);
            if (cut < 0)
            {
                excerpt = Cap((plain ?? "").Trim(), excerptMax);
                prior = "";
                return;
            }
            excerpt = Cap(plain.Substring(0, cut).Trim(), excerptMax);
            prior = Cap(plain.Substring(cut).Trim(), priorMax);
        }

        public static string PlainPreface(string plain)
        {
            if (string.IsNullOrEmpty(plain))
            {
                return "";
            }
            int cut = EarliestPlain(plain);
            if (cut < 0)
            {
                return plain;
            }
            return plain.Substring(0, cut);
        }

        /// <summary>
        /// A quoted original starts at a separator line (Original Message / 元のメッセージ,
        /// alone or wrapped in dashes), or at a line-start 差出人: / From: when 送信日時: / Sent: / Date:
        /// begins one of the next four lines. A line-start 差出人: is also a quote when 日付:
        /// and either 宛先: or 件名: begin lines in that same window (iPhone / Mac Japanese Mail).
        /// 差出人: with only 日付: is kept. A sentence that merely contains those words is kept.
        /// </summary>
        static int EarliestPlain(string plain)
        {
            if (string.IsNullOrEmpty(plain))
            {
                return -1;
            }
            var starts = new List<int>();
            var ends = new List<int>();
            int i = 0;
            int lineStart = 0;
            while (i <= plain.Length)
            {
                bool boundary = i == plain.Length || plain[i] == '\n' || plain[i] == '\r';
                if (boundary)
                {
                    starts.Add(lineStart);
                    ends.Add(i);
                    if (i == plain.Length)
                    {
                        break;
                    }
                    if (plain[i] == '\r' && i + 1 < plain.Length && plain[i + 1] == '\n')
                    {
                        i++;
                    }
                    i++;
                    lineStart = i;
                    continue;
                }
                i++;
            }
            for (int n = 0; n < starts.Count; n++)
            {
                if (SeparatorQuote(plain, starts[n], ends[n]))
                {
                    return starts[n];
                }
                if (ReplyHeader(plain, starts[n], ends[n]) && HasDateHeaderSoon(plain, starts, ends, n + 1))
                {
                    return starts[n];
                }
                if (JapaneseSenderHeader(plain, starts[n], ends[n]) && HasAppleJapaneseHeadersSoon(plain, starts, ends, n + 1))
                {
                    return starts[n];
                }
            }
            return -1;
        }

        static bool SeparatorQuote(string text, int start, int end)
        {
            int i = SkipSpace(text, start, end);
            bool dashed = false;
            if (i < end && text[i] == '-')
            {
                while (i < end && text[i] == '-')
                {
                    i++;
                }
                i = SkipSpace(text, i, end);
                dashed = true;
            }
            string marker = null;
            if (RegionStarts(text, i, end, "Original Message", true))
            {
                marker = "Original Message";
            }
            else if (RegionStarts(text, i, end, "元のメッセージ", false))
            {
                marker = "元のメッセージ";
            }
            if (marker == null)
            {
                return false;
            }
            i = SkipSpace(text, i + marker.Length, end);
            if (!dashed)
            {
                return i == end;
            }
            if (i >= end || text[i] != '-')
            {
                return false;
            }
            while (i < end && text[i] == '-')
            {
                i++;
            }
            return SkipSpace(text, i, end) == end;
        }

        static bool ReplyHeader(string text, int start, int end)
        {
            int head = SkipSpace(text, start, end);
            return HeaderName(text, head, end, "差出人") || HeaderName(text, head, end, "From");
        }

        static bool DateHeader(string text, int start, int end)
        {
            int head = SkipSpace(text, start, end);
            return HeaderName(text, head, end, "送信日時") || HeaderName(text, head, end, "Sent") || HeaderName(text, head, end, "Date");
        }

        static bool HasDateHeaderSoon(string text, List<int> starts, List<int> ends, int from)
        {
            int last = from + 4;
            if (last > starts.Count)
            {
                last = starts.Count;
            }
            for (int n = from; n < last; n++)
            {
                if (DateHeader(text, starts[n], ends[n]))
                {
                    return true;
                }
            }
            return false;
        }

        static bool JapaneseSenderHeader(string text, int start, int end)
        {
            int head = SkipSpace(text, start, end);
            return HeaderName(text, head, end, "差出人");
        }

        static bool HasAppleJapaneseHeadersSoon(string text, List<int> starts, List<int> ends, int from)
        {
            int last = from + 4;
            if (last > starts.Count)
            {
                last = starts.Count;
            }
            bool date = false;
            bool partyOrSubject = false;
            for (int n = from; n < last; n++)
            {
                int head = SkipSpace(text, starts[n], ends[n]);
                if (HeaderName(text, head, ends[n], "日付"))
                {
                    date = true;
                }
                if (HeaderName(text, head, ends[n], "宛先") || HeaderName(text, head, ends[n], "件名"))
                {
                    partyOrSubject = true;
                }
            }
            return date && partyOrSubject;
        }

        static int SkipSpace(string text, int index, int end)
        {
            while (index < end && char.IsWhiteSpace(text[index]))
            {
                index++;
            }
            return index;
        }

        static bool HeaderName(string text, int index, int end, string name)
        {
            if (!RegionStarts(text, index, end, name, true))
            {
                return false;
            }
            int colon = SkipSpace(text, index + name.Length, end);
            if (colon >= end)
            {
                return false;
            }
            return text[colon] == ':' || text[colon] == '\uFF1A';
        }

        static bool RegionStarts(string text, int index, int end, string marker, bool ignoreCase)
        {
            if (index < 0 || string.IsNullOrEmpty(marker) || index + marker.Length > end)
            {
                return false;
            }
            for (int i = 0; i < marker.Length; i++)
            {
                char left = text[index + i];
                char right = marker[i];
                if (ignoreCase)
                {
                    if (char.ToUpperInvariant(left) != char.ToUpperInvariant(right))
                    {
                        return false;
                    }
                }
                else if (left != right)
                {
                    return false;
                }
            }
            return true;
        }

        public static string Cap(string text, int max)
        {
            if (string.IsNullOrEmpty(text) || text.Length <= max)
            {
                return text ?? "";
            }
            return text.Substring(0, max);
        }

        static List<MailPick> Pick(IList<MailPick> items, string kind, string query, int limit)
        {
            var ranked = new List<MailPick>();
            if (items != null)
            {
                foreach (MailPick item in items)
                {
                    if (item == null || item.Kind != kind)
                    {
                        continue;
                    }
                    if (QueryRank(item.Subject, query, item.IndexMatch) == 0)
                    {
                        continue;
                    }
                    ranked.Add(item);
                }
            }
            ranked.Sort(delegate(MailPick a, MailPick b)
            {
                int byRank = QueryRank(b.Subject, query, b.IndexMatch).CompareTo(QueryRank(a.Subject, query, a.IndexMatch));
                if (byRank != 0)
                {
                    return byRank;
                }
                return string.CompareOrdinal(b.When ?? "", a.When ?? "");
            });
            if (ranked.Count > limit)
            {
                ranked.RemoveRange(limit, ranked.Count - limit);
            }
            return ranked;
        }

        static string WordClause(string query)
        {
            string phrase = DaslPhrase(query);
            if (phrase.Length == 0)
            {
                return "";
            }
            return "\"urn:schemas:httpmail:subject\" ci_phrasematch '" + phrase
                + "' OR \"urn:schemas:httpmail:textdescription\" ci_phrasematch '" + phrase + "'";
        }

        static string WhoClause(IList<string> addresses, bool inbox)
        {
            if (addresses == null || addresses.Count == 0)
            {
                return "";
            }
            var parts = new List<string>();
            int used = 0;
            foreach (string raw in addresses)
            {
                if (used >= 6)
                {
                    break;
                }
                string addr = DaslPhrase(NormalizeSmtp(raw));
                if (!IsSmtp(addr))
                {
                    continue;
                }
                used++;
                if (inbox)
                {
                    parts.Add("\"urn:schemas:httpmail:fromemail\" LIKE '%" + addr + "%'");
                }
                else
                {
                    parts.Add("\"urn:schemas:httpmail:to\" LIKE '%" + addr + "%'");
                    parts.Add("\"urn:schemas:httpmail:cc\" LIKE '%" + addr + "%'");
                }
            }
            return string.Join(" OR ", parts.ToArray());
        }

        static string DaslPhrase(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            return value.Trim().Replace("'", "''");
        }
    }
}
