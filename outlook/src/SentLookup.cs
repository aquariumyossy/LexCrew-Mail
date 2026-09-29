using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace KuruOutlook
{
    public static class SentLookup
    {
        const int SentFolder = 5;
        const int InboxFolder = 6;
        const int IndexWalkCap = 500;

        sealed class Candidate
        {
            public int Id;
            public string Kind;
            public string Subject;
            public string When;
            public bool IndexMatch;
            public string To;
            public string From;
            public string Folder;
            public object Item;
        }

        public static string Search(object window, string json)
        {
            try
            {
                var serializer = new JavaScriptSerializer();
                serializer.MaxJsonLength = int.MaxValue;
                var input = serializer.Deserialize<Dictionary<string, object>>(string.IsNullOrEmpty(json) ? "{}" : json);
                string query = Text(input, "q");
                string requested = Text(input, "address");
                if (query.Length == 0 && requested.Length == 0)
                {
                    return Error("検索語を入力してください。");
                }
                if (!SentSearch.IsSmtp(requested))
                {
                    requested = "";
                }
                dynamic app = ((dynamic)window).Application;
                dynamic session = app.Session;
                List<string> own = OwnAddresses(session);
                List<string> addresses = requested.Length > 0
                    ? SentSearch.CounterpartyAddresses(new string[] { requested }, own)
                    : ComposeAddresses(window, own);
                if (query.Length == 0 && addresses.Count == 0)
                {
                    return Error("検索語を入力してください。");
                }
                var candidates = new List<Candidate>();
                EachStore((object)session, delegate(object store)
                {
                    string storeName = Read((Func<string>)delegate { return Convert.ToString(((dynamic)store).DisplayName); });
                    Collect(Folder(store, SentFolder), "sent", storeName, query, addresses, false, candidates);
                    Collect(Folder(store, InboxFolder), "received", storeName, query, addresses, true, candidates);
                });
                var scores = new List<MailPick>();
                foreach (Candidate row in candidates)
                {
                    scores.Add(new MailPick
                    {
                        Id = row.Id,
                        Kind = row.Kind,
                        Subject = row.Subject,
                        When = row.When,
                        IndexMatch = row.IndexMatch
                    });
                }
                List<MailPick> chosen = SentSearch.SelectHits(scores, query);
                var sent = new List<object>();
                var received = new List<object>();
                foreach (MailPick pick in chosen)
                {
                    Candidate row = candidates[pick.Id];
                    object hit = Materialize(row, own);
                    if (row.Kind == "received")
                    {
                        received.Add(hit);
                    }
                    else
                    {
                        sent.Add(hit);
                    }
                }
                return serializer.Serialize(new Dictionary<string, object>
                {
                    { "sent", sent },
                    { "received", received }
                });
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        static void Collect(object folder, string kind, string storeName, string query, List<string> addresses, bool inbox, List<Candidate> into)
        {
            if (folder == null)
            {
                return;
            }
            string folderName = Read((Func<string>)delegate { return Convert.ToString(((dynamic)folder).Name); });
            string label = storeName.Length == 0 ? folderName : storeName + " / " + folderName;
            dynamic items;
            try
            {
                items = ((dynamic)folder).Items;
            }
            catch (COMException)
            {
                return;
            }
            string sortField = inbox ? "[ReceivedTime]" : "[SentOn]";
            TrySort(items, sortField);
            string filter = SentSearch.RestrictFilter(query, addresses, inbox);
            if (filter.Length == 0)
            {
                return;
            }
            try
            {
                dynamic restricted = items.Restrict(filter);
                TrySort(restricted, sortField);
                int folderCount = CountOf(items);
                int restrictedCount = CountOf(restricted);
                if (SentSearch.FilterIgnored(restrictedCount, folderCount))
                {
                    Scan(items, kind, label, query, addresses, inbox, into);
                    return;
                }
                TakeIndexed(restricted, kind, label, query, into);
            }
            catch (COMException)
            {
                Scan(items, kind, label, query, addresses, inbox, into);
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
                Scan(items, kind, label, query, addresses, inbox, into);
            }
        }

        static void TakeIndexed(dynamic restricted, string kind, string label, string query, List<Candidate> into)
        {
            int limit = kind == "received" ? SentSearch.MaxReceived : SentSearch.MaxSent;
            var subjectHits = new List<Candidate>();
            var bodyHits = new List<Candidate>();
            int seen = 0;
            dynamic item = First(restricted);
            while (item != null && seen < IndexWalkCap && subjectHits.Count < limit)
            {
                seen++;
                if (IsMail(item))
                {
                    Candidate row = Head(item, kind, label, true);
                    if (string.IsNullOrWhiteSpace(query) || SentSearch.QueryRank(row.Subject, query, false) == 2)
                    {
                        subjectHits.Add(row);
                    }
                    else if (bodyHits.Count < limit)
                    {
                        bodyHits.Add(row);
                    }
                }
                item = Next(restricted);
            }
            AddLimited(into, subjectHits, bodyHits, limit);
        }

        static void Scan(dynamic items, string kind, string label, string query, List<string> addresses, bool inbox, List<Candidate> into)
        {
            int seen = 0;
            int steps = 0;
            dynamic item = First(items);
            while (item != null && seen < SentSearch.FallbackScan && steps < SentSearch.FallbackScan * 2)
            {
                steps++;
                if (IsMail(item))
                {
                    seen++;
                    if (addresses.Count == 0 || Involves(item, addresses, inbox))
                    {
                        string subject = Read((Func<string>)delegate { return Convert.ToString(item.Subject); });
                        string plain = Read((Func<string>)delegate { return Convert.ToString(item.Body); });
                        bool subjectHit = SentSearch.ContainsText(subject, query);
                        bool bodyHit = SentSearch.ContainsText(plain, query);
                        if (string.IsNullOrWhiteSpace(query) || subjectHit || bodyHit)
                        {
                            Candidate row = Head(item, kind, label, !subjectHit && bodyHit);
                            row.Subject = subject;
                            into.Add(row);
                            row.Id = into.Count - 1;
                        }
                    }
                }
                item = Next(items);
            }
        }

        static void AddLimited(List<Candidate> into, List<Candidate> subjectHits, List<Candidate> bodyHits, int limit)
        {
            var local = new List<Candidate>();
            local.AddRange(subjectHits);
            foreach (Candidate row in bodyHits)
            {
                if (local.Count >= limit)
                {
                    break;
                }
                local.Add(row);
            }
            foreach (Candidate row in local)
            {
                into.Add(row);
                row.Id = into.Count - 1;
            }
        }

        static Candidate Head(dynamic item, string kind, string label, bool indexMatch)
        {
            return new Candidate
            {
                Kind = kind,
                Subject = Read((Func<string>)delegate { return Convert.ToString(item.Subject); }),
                When = WhenOf(item, kind == "received"),
                IndexMatch = indexMatch,
                To = Read((Func<string>)delegate { return Convert.ToString(item.To); }),
                From = Read((Func<string>)delegate { return Convert.ToString(item.SenderName); }),
                Folder = label,
                Item = item
            };
        }

        static object Materialize(Candidate row, List<string> own)
        {
            dynamic item = row.Item;
            string html = Read((Func<string>)delegate { return Convert.ToString(item.HTMLBody); });
            string plain = html.Length == 0 ? Read((Func<string>)delegate { return Convert.ToString(item.Body); }) : "";
            int excerptMax = row.Kind == "received" ? SentSearch.ReceivedExcerptChars : SentSearch.SentExcerptChars;
            string excerpt;
            string prior;
            SentSearch.SplitBodies(html, plain, excerptMax, SentSearch.PriorChars, out excerpt, out prior);
            string shown = row.When.StartsWith("0000") ? "" : row.When;
            if (row.Kind == "received")
            {
                string sender = SenderSmtp(item);
                List<string> address = SentSearch.CounterpartyAddresses(new string[] { sender }, own);
                return new Dictionary<string, object>
                {
                    { "subject", row.Subject ?? "" },
                    { "from", row.From ?? "" },
                    { "address", address.Count == 0 ? "" : address[0] },
                    { "receivedOn", shown },
                    { "folder", row.Folder ?? "" },
                    { "excerpt", excerpt }
                };
            }
            return new Dictionary<string, object>
            {
                { "subject", row.Subject ?? "" },
                { "to", row.To ?? "" },
                { "addresses", SentSearch.CounterpartyAddresses(RecipientSmtps(item), own) },
                { "sentOn", shown },
                { "folder", row.Folder ?? "" },
                { "excerpt", excerpt },
                { "prior", prior }
            };
        }

        static bool Involves(dynamic item, List<string> addresses, bool inbox)
        {
            var found = new List<string>();
            if (inbox)
            {
                found.Add(SenderSmtp(item));
            }
            else
            {
                found.AddRange(RecipientSmtps(item));
            }
            foreach (string raw in found)
            {
                string smtp = SentSearch.NormalizeSmtp(raw);
                if (!SentSearch.IsSmtp(smtp))
                {
                    continue;
                }
                foreach (string wanted in addresses)
                {
                    if (string.Equals(smtp, wanted, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            return false;
        }

        static List<string> ComposeAddresses(object window, List<string> own)
        {
            bool inspector;
            dynamic item = MailTarget.Draft(window, out inspector);
            if (item == null || !IsMail(item))
            {
                return new List<string>();
            }
            string mode = MailGate.Mode(inspector, Read((Func<string>)delegate { return Convert.ToString(item.MessageClass); }), SafeSent(item));
            if (mode != "compose")
            {
                return new List<string>();
            }
            return SentSearch.CounterpartyAddresses(RecipientSmtps(item), own);
        }

        static List<string> OwnAddresses(dynamic session)
        {
            var found = new List<string>();
            try
            {
                dynamic accounts = session.Accounts;
                int count = Convert.ToInt32(accounts.Count);
                for (int i = 1; i <= count; i++)
                {
                    try
                    {
                        found.Add(Convert.ToString(accounts[i].SmtpAddress));
                    }
                    catch (COMException)
                    {
                    }
                }
            }
            catch (COMException)
            {
            }
            try
            {
                found.Add(SmtpOf(session.CurrentUser.AddressEntry));
                found.Add(Convert.ToString(session.CurrentUser.Address));
            }
            catch (COMException)
            {
            }
            return found;
        }

        static List<string> RecipientSmtps(dynamic item)
        {
            var found = new List<string>();
            try
            {
                dynamic recipients = item.Recipients;
                int count = Convert.ToInt32(recipients.Count);
                for (int i = 1; i <= count; i++)
                {
                    dynamic recipient = recipients[i];
                    int type = 1;
                    try
                    {
                        type = Convert.ToInt32(recipient.Type);
                    }
                    catch (COMException)
                    {
                    }
                    if (type == 3)
                    {
                        continue;
                    }
                    string smtp = SmtpOf(recipient.AddressEntry);
                    if (smtp.Length == 0)
                    {
                        smtp = SentSearch.NormalizeSmtp(Read((Func<string>)delegate { return Convert.ToString(recipient.Address); }));
                    }
                    if (smtp.Length > 0)
                    {
                        found.Add(smtp);
                    }
                }
            }
            catch (COMException)
            {
            }
            return found;
        }

        static string SenderSmtp(dynamic item)
        {
            try
            {
                string smtp = SmtpOf(item.Sender);
                if (smtp.Length > 0)
                {
                    return smtp;
                }
            }
            catch (COMException)
            {
            }
            try
            {
                string prop = Convert.ToString(item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x5D01001F"));
                if (SentSearch.IsSmtp(prop))
                {
                    return SentSearch.NormalizeSmtp(prop);
                }
            }
            catch (COMException)
            {
            }
            string raw = Read((Func<string>)delegate { return Convert.ToString(item.SenderEmailAddress); });
            return SentSearch.IsSmtp(raw) ? SentSearch.NormalizeSmtp(raw) : "";
        }

        static string SmtpOf(dynamic entry)
        {
            if (entry == null)
            {
                return "";
            }
            string address = Read((Func<string>)delegate { return Convert.ToString(entry.Address); });
            if (SentSearch.IsSmtp(address))
            {
                return SentSearch.NormalizeSmtp(address);
            }
            try
            {
                dynamic user = entry.GetExchangeUser();
                if (user != null)
                {
                    string smtp = Convert.ToString(user.PrimarySmtpAddress);
                    if (SentSearch.IsSmtp(smtp))
                    {
                        return SentSearch.NormalizeSmtp(smtp);
                    }
                }
            }
            catch (COMException)
            {
            }
            try
            {
                string prop = Convert.ToString(entry.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x39FE001F"));
                if (SentSearch.IsSmtp(prop))
                {
                    return SentSearch.NormalizeSmtp(prop);
                }
            }
            catch (COMException)
            {
            }
            return "";
        }

        static void EachStore(dynamic session, Action<object> visit)
        {
            dynamic stores = session.Stores;
            int count = Convert.ToInt32(stores.Count);
            for (int i = 1; i <= count; i++)
            {
                try
                {
                    visit(stores[i]);
                }
                catch (COMException)
                {
                }
            }
        }

        static object Folder(object store, int defaultFolder)
        {
            try
            {
                return ((dynamic)store).GetDefaultFolder(defaultFolder);
            }
            catch (COMException)
            {
                return null;
            }
        }

        static void TrySort(dynamic items, string field)
        {
            try
            {
                items.Sort(field, true);
            }
            catch (COMException)
            {
                try
                {
                    items.Sort("[SentOn]", true);
                }
                catch (COMException)
                {
                }
            }
        }

        static dynamic First(dynamic items)
        {
            try
            {
                return items.GetFirst();
            }
            catch (COMException)
            {
                return null;
            }
        }

        static dynamic Next(dynamic items)
        {
            try
            {
                return items.GetNext();
            }
            catch (COMException)
            {
                return null;
            }
        }

        static int CountOf(dynamic items)
        {
            try
            {
                return Convert.ToInt32(items.Count);
            }
            catch (COMException)
            {
                return 0;
            }
        }

        static string WhenOf(dynamic item, bool received)
        {
            DateTime when;
            if (!TryDate(item, received ? "ReceivedTime" : "SentOn", out when) && !TryDate(item, "SentOn", out when))
            {
                return "0000-01-01T00:00:00";
            }
            if (when.Year < 1900)
            {
                return "0000-01-01T00:00:00";
            }
            return when.ToString("yyyy-MM-ddTHH:mm:ss");
        }

        static bool TryDate(dynamic item, string name, out DateTime when)
        {
            when = DateTime.MinValue;
            try
            {
                when = name == "ReceivedTime" ? (DateTime)item.ReceivedTime : (DateTime)item.SentOn;
                return true;
            }
            catch
            {
                return false;
            }
        }

        static bool IsMail(dynamic item)
        {
            string messageClass = Read((Func<string>)delegate { return Convert.ToString(item.MessageClass); });
            if (messageClass.StartsWith("IPM.Note", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            try
            {
                return Convert.ToInt32(item.Class) == 43;
            }
            catch
            {
                return false;
            }
        }

        static bool SafeSent(dynamic item)
        {
            try
            {
                return (bool)item.Sent;
            }
            catch
            {
                return true;
            }
        }

        static string Read(Func<string> read)
        {
            try
            {
                return read() ?? "";
            }
            catch
            {
                return "";
            }
        }

        static string Text(Dictionary<string, object> input, string key)
        {
            if (input == null || !input.ContainsKey(key) || input[key] == null)
            {
                return "";
            }
            return Convert.ToString(input[key]).Trim();
        }

        static string Error(string message)
        {
            return new JavaScriptSerializer().Serialize(new Dictionary<string, object>
            {
                { "error", message ?? "" }
            });
        }
    }
}
