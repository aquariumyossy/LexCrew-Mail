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
                    prior = Cap(MailBody.VisibleText(html.Substring(quote)), priorMax);
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

        static int EarliestPlain(string plain)
        {
            if (string.IsNullOrEmpty(plain))
            {
                return -1;
            }
            string[] markers = { "Original Message", "差出人" };
            int best = -1;
            for (int i = 0; i < markers.Length; i++)
            {
                int at = plain.IndexOf(markers[i], StringComparison.OrdinalIgnoreCase);
                if (at >= 0 && (best < 0 || at < best))
                {
                    best = at;
                }
            }
            return best;
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
