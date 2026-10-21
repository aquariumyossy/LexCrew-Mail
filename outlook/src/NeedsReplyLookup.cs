using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace KuruOutlook
{
    /// <summary>
    /// Read-only scan of Inbox and Sent Items. One scan state per task pane.
    /// Nothing is marked read, flagged, moved, deleted, sent, or forwarded.
    /// Jump and Open leave read-state changes to Outlook's normal selection and Display.
    /// </summary>
    public sealed class NeedsReplyLookup
    {
        const int SentFolder = 5;
        const int InboxFolder = 6;
        const string BodyWideTag = "http://schemas.microsoft.com/mapi/proptag/0x1000001F";
        const string BodyAnsiTag = "http://schemas.microsoft.com/mapi/proptag/0x1000001E";
        const string HeaderWideTag = "http://schemas.microsoft.com/mapi/proptag/0x007D001F";
        const string HeaderAnsiTag = "http://schemas.microsoft.com/mapi/proptag/0x007D001E";
        const string VerbTag = "http://schemas.microsoft.com/mapi/proptag/0x10810003";
        const string IconTag = "http://schemas.microsoft.com/mapi/proptag/0x10800003";
        const string SmtpTag = "http://schemas.microsoft.com/mapi/proptag/0x39FE001F";
        const string SenderSmtpTag = "http://schemas.microsoft.com/mapi/proptag/0x5D01001F";
        const string DisplayToTag = "http://schemas.microsoft.com/mapi/proptag/0x0E04001F";

        sealed class FolderScan
        {
            public object Folder;
            public string StoreId;
            public dynamic Items;
            public bool Sorted;
            public bool Opened;
            public bool Started;
            public bool Done;
        }

        sealed class Session
        {
            public string Token;
            public string FolderKind;
            public int Days;
            public DateTime Start;
            public List<FolderScan> Folders;
            public HashSet<string> Own;
            public int Cursor;
            public int Passed;
            public bool Done;
            public dynamic HeldItem;
            public string HeldWhen;
            public string HeldStore;
        }

        Session _session;

        public string Search(object window, string json)
        {
            try
            {
                var serializer = new JavaScriptSerializer();
                serializer.MaxJsonLength = int.MaxValue;
                var input = serializer.Deserialize<Dictionary<string, object>>(string.IsNullOrEmpty(json) ? "{}" : json);
                string token = Text(input, "token");
                if (token.Length == 0 || window == null)
                {
                    return Error(window == null ? "Outlook のウィンドウを取得できません。" : "検索をやり直してください。");
                }
                string folder = Text(input, "folder") == "sent" ? "sent" : "inbox";
                int days = NeedsReplyRules.ClampInt(IntOf(input, "days", 3), NeedsReplyRules.MinDays, NeedsReplyRules.MaxDays);
                int take = NeedsReplyRules.ClampInt(IntOf(input, "take", NeedsReplyRules.DefaultTake), 1, NeedsReplyRules.MaxTake);
                int budgetMs = NeedsReplyRules.ClampInt(IntOf(input, "budgetMs", NeedsReplyRules.DefaultBudgetMs), 50, NeedsReplyRules.MaxBudgetMs);
                bool reset = BoolOf(input, "reset");
                bool same = _session != null && _session.Token == token && _session.FolderKind == folder && _session.Days == days;
                string action = NeedsReplyRules.NextSession(reset, _session != null, same);
                if (action == "stale")
                {
                    return Error("検索をやり直してください。");
                }
                if (action == "restart")
                {
                    _session = Begin(window, token, folder, days);
                }
                if (_session.Done && _session.HeldItem == null)
                {
                    return Payload(serializer, new List<object>(), 0, true, false);
                }
                var rows = new List<object>();
                int scanned = 0;
                var watch = Stopwatch.StartNew();
                while (rows.Count < take && scanned < take * 5 && !_session.Done)
                {
                    if (watch.ElapsedMilliseconds >= budgetMs) break;
                    if (_session.Passed >= NeedsReplyRules.HardPass)
                    {
                        _session.Done = true;
                        break;
                    }
                    if (_session.HeldItem != null)
                    {
                        if (watch.ElapsedMilliseconds >= budgetMs) break;
                        rows.Add(InboxRow(_session.HeldItem, _session.HeldWhen, _session.HeldStore, _session.Own));
                        _session.HeldItem = null;
                        continue;
                    }
                    FolderScan scan;
                    bool paused;
                    dynamic item = NextItem(_session, watch, budgetMs, out scan, out paused);
                    if (paused) break;
                    if (item == null)
                    {
                        _session.Done = true;
                        break;
                    }
                    scanned++;
                    _session.Passed++;
                    if (!IsMail(item)) continue;
                    DateTime when;
                    string whenText;
                    if (!TryWhen(item, _session.FolderKind == "sent", out when, out whenText)) continue;
                    if (when < _session.Start)
                    {
                        if (scan != null && scan.Sorted) scan.Done = true;
                        continue;
                    }
                    if (_session.FolderKind == "sent")
                    {
                        rows.Add(SentRow(item, whenText));
                        continue;
                    }
                    if (watch.ElapsedMilliseconds >= budgetMs)
                    {
                        _session.HeldItem = item;
                        _session.HeldWhen = whenText;
                        _session.HeldStore = scan == null ? "" : (scan.StoreId ?? "");
                        break;
                    }
                    string storeId = scan == null ? "" : (scan.StoreId ?? "");
                    rows.Add(InboxRow(item, whenText, storeId, _session.Own));
                }
                bool limited = _session.Passed >= NeedsReplyRules.HardPass;
                return Payload(serializer, rows, scanned, _session.Done && _session.HeldItem == null, limited);
            }
            catch (Exception ex)
            {
                _session = null;
                return Error(ex.Message);
            }
        }

        public static string Select(object window, string json)
        {
            return WithItem(window, json, delegate(dynamic app, dynamic item)
            {
                dynamic explorer = ExplorerOf(app);
                if (explorer == null)
                {
                    throw new InvalidOperationException("Outlook のメインウィンドウがありません。");
                }
                try
                {
                    explorer.CurrentFolder = item.Parent;
                }
                catch (COMException)
                {
                }
                explorer.ClearSelection();
                explorer.AddToSelection(item);
            });
        }

        public static string Open(object window, string json)
        {
            return WithItem(window, json, delegate(dynamic app, dynamic item)
            {
                item.Display();
            });
        }

        static string WithItem(object window, string json, Action<dynamic, dynamic> use)
        {
            try
            {
                if (window == null) return Error("Outlook のウィンドウを取得できません。");
                var input = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(string.IsNullOrEmpty(json) ? "{}" : json);
                string entryId = Text(input, "entryId");
                string storeId = Text(input, "storeId");
                if (entryId.Length == 0) return Error("メールを特定できません。");
                dynamic app = ((dynamic)window).Application;
                dynamic item = ItemFromId(app.Session, entryId, storeId);
                if (item == null) return Error("メールを開けません。");
                use(app, item);
                return new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "ok", true } });
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        string Payload(JavaScriptSerializer serializer, List<object> rows, int scanned, bool done, bool limited)
        {
            return serializer.Serialize(new Dictionary<string, object>
            {
                { "rows", rows.ToArray() },
                { "scanned", scanned },
                { "done", done },
                { "limited", limited },
                { "passed", _session == null ? 0 : _session.Passed },
                { "own", OwnArray(_session) }
            });
        }

        static string[] OwnArray(Session session)
        {
            if (session == null || session.Own == null) return new string[0];
            var list = new List<string>(session.Own);
            return list.ToArray();
        }

        static Session Begin(object window, string token, string folderKind, int days)
        {
            dynamic app = ((dynamic)window).Application;
            dynamic olSession = app.Session;
            var folders = new List<FolderScan>();
            int which = folderKind == "sent" ? SentFolder : InboxFolder;
            dynamic stores = olSession.Stores;
            int count = Convert.ToInt32(stores.Count);
            for (int i = 1; i <= count; i++)
            {
                object store;
                try
                {
                    store = stores[i];
                }
                catch (COMException)
                {
                    continue;
                }
                object folder = DefaultFolder(store, which);
                if (folder == null) continue;
                string storeId = "";
                try
                {
                    storeId = Convert.ToString(((dynamic)folder).StoreID) ?? "";
                }
                catch (COMException)
                {
                }
                folders.Add(new FolderScan { Folder = folder, StoreId = storeId });
            }
            var own = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string smtp in OwnAddresses(olSession))
            {
                if (smtp.Length > 0) own.Add(smtp.ToLowerInvariant());
            }
            return new Session
            {
                Token = token,
                FolderKind = folderKind,
                Days = days,
                Start = DateTime.Now.AddDays(-days),
                Folders = folders,
                Own = own,
                Done = folders.Count == 0
            };
        }

        static dynamic NextItem(Session session, Stopwatch watch, int budgetMs, out FolderScan scan, out bool paused)
        {
            scan = null;
            paused = false;
            int count = session.Folders.Count;
            if (count == 0) return null;
            int skipped = 0;
            while (skipped < count)
            {
                if (watch.ElapsedMilliseconds >= budgetMs)
                {
                    paused = true;
                    return null;
                }
                int index = session.Cursor % count;
                FolderScan current = session.Folders[index];
                if (current.Done)
                {
                    session.Cursor++;
                    skipped++;
                    continue;
                }
                if (!current.Opened)
                {
                    if (!OpenFolder(current, session, watch, budgetMs))
                    {
                        paused = true;
                        return null;
                    }
                }
                if (current.Done)
                {
                    session.Cursor++;
                    skipped++;
                    continue;
                }
                dynamic item = Advance(current);
                session.Cursor++;
                if (item == null)
                {
                    current.Done = true;
                    skipped++;
                    continue;
                }
                scan = current;
                return item;
            }
            return null;
        }

        static bool OpenFolder(FolderScan scan, Session session, Stopwatch watch, int budgetMs)
        {
            if (watch.ElapsedMilliseconds >= budgetMs) return false;
            dynamic items;
            try
            {
                items = ((dynamic)scan.Folder).Items;
            }
            catch (COMException)
            {
                scan.Opened = true;
                scan.Done = true;
                return true;
            }
            string field = session.FolderKind == "sent" ? "[SentOn]" : "[ReceivedTime]";
            if (watch.ElapsedMilliseconds >= budgetMs) return false;
            bool sorted = TrySort(items, field);
            dynamic chosen = items;
            if (watch.ElapsedMilliseconds < budgetMs)
            {
                try
                {
                    dynamic trial = items.Restrict(NeedsReplyRules.RestrictSince(field, session.Start));
                    int folderCount = CountOf(items);
                    int restrictedCount = CountOf(trial);
                    if (!SentSearch.FilterIgnored(restrictedCount, folderCount))
                    {
                        chosen = trial;
                        if (watch.ElapsedMilliseconds < budgetMs) sorted = TrySort(chosen, field);
                        else sorted = false;
                    }
                }
                catch (COMException)
                {
                }
                catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
                {
                }
            }
            scan.Items = chosen;
            scan.Sorted = sorted;
            scan.Opened = true;
            return true;
        }

        static dynamic Advance(FolderScan scan)
        {
            try
            {
                dynamic item = scan.Started ? scan.Items.GetNext() : scan.Items.GetFirst();
                scan.Started = true;
                return item;
            }
            catch (COMException)
            {
                return null;
            }
        }

        static bool TrySort(dynamic items, string field)
        {
            try
            {
                items.Sort(field, true);
                return true;
            }
            catch (COMException)
            {
                return false;
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
                return false;
            }
        }

        static Dictionary<string, object> SentRow(dynamic item, string whenText)
        {
            return new Dictionary<string, object>
            {
                { "subject", Read(() => Convert.ToString(item.Subject)) },
                { "sentOn", whenText },
                { "to", TypedAddresses(item, false, 1).ToArray() },
                { "cc", TypedAddresses(item, false, 2).ToArray() }
            };
        }

        static Dictionary<string, object> InboxRow(dynamic item, string whenText, string storeId, HashSet<string> own)
        {
            string headers = TransportHeaders(item);
            var replyTo = TypedAddresses(item, true, -1);
            AddSmtps(replyTo, NeedsReplyRules.HeaderSmtps(headers, "Reply-To"));
            var lists = new List<string>();
            AddSmtps(lists, NeedsReplyRules.HeaderSmtps(headers, "List-Post"));
            AddSmtps(lists, NeedsReplyRules.HeaderSmtps(headers, "List-Id"));
            return new Dictionary<string, object>
            {
                { "entryId", Read(() => Convert.ToString(item.EntryID)) },
                { "storeId", storeId ?? "" },
                { "subject", Read(() => Convert.ToString(item.Subject)) },
                { "from", SenderLabel(item) },
                { "receivedOn", whenText },
                { "inTo", UserInTo(item, own) },
                { "outlookReplied", OutlookReplied(item) },
                { "fromAddress", SenderSmtp(item) },
                { "replyTo", replyTo.ToArray() },
                { "listAddresses", lists.ToArray() },
                { "toAddresses", TypedAddresses(item, false, 1).ToArray() },
                { "ccAddresses", TypedAddresses(item, false, 2).ToArray() },
                { "body", NeedsReplyRules.Cap(BodyOf(item), NeedsReplyRules.BodyChars) }
            };
        }

        static string SenderLabel(dynamic item)
        {
            string from = Read(() => Convert.ToString(item.SenderName));
            if (from.Length == 0) from = Read(() => Convert.ToString(item.SenderEmailAddress));
            return from;
        }

        static string BodyOf(dynamic item)
        {
            string text = Mapi(item, BodyWideTag);
            if (text.Length == 0) text = Mapi(item, BodyAnsiTag);
            return SentSearch.PlainPreface(text);
        }

        static string TransportHeaders(dynamic item)
        {
            string text = Mapi(item, HeaderWideTag);
            if (text.Length == 0) text = Mapi(item, HeaderAnsiTag);
            return text;
        }

        static bool UserInTo(dynamic item, HashSet<string> own)
        {
            if (own == null || own.Count == 0) return false;
            if (ToRecipientsInclude(item, own)) return true;
            if (DisplayHas(Read(() => Convert.ToString(item.To)), own)) return true;
            return DisplayHas(Mapi(item, DisplayToTag), own);
        }

        static bool ToRecipientsInclude(dynamic item, HashSet<string> own)
        {
            try
            {
                dynamic recipients = item.Recipients;
                int count = Convert.ToInt32(recipients.Count);
                int limit = count < 30 ? count : 30;
                for (int i = 1; i <= limit; i++)
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
                    if (type != 1) continue;
                    string smtp = SmtpOfRecipient(recipient);
                    if (smtp.Length > 0 && own.Contains(smtp)) return true;
                }
            }
            catch (COMException)
            {
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
            }
            return false;
        }

        static bool DisplayHas(string display, HashSet<string> own)
        {
            if (string.IsNullOrEmpty(display) || own == null) return false;
            string[] labels = MailParty.LabelsFromDisplayList(display);
            for (int i = 0; i < labels.Length; i++)
            {
                string smtp = LowerSmtp(MailParty.Smtp(labels[i]));
                if (smtp.Length > 0 && own.Contains(smtp)) return true;
            }
            return false;
        }

        static List<string> TypedAddresses(dynamic item, bool replyRecipients, int type)
        {
            var found = new List<string>();
            try
            {
                dynamic recipients = replyRecipients ? item.ReplyRecipients : item.Recipients;
                int count = Convert.ToInt32(recipients.Count);
                int limit = count < 30 ? count : 30;
                for (int i = 1; i <= limit; i++)
                {
                    dynamic recipient = recipients[i];
                    if (type >= 0)
                    {
                        int kind = 1;
                        try
                        {
                            kind = Convert.ToInt32(recipient.Type);
                        }
                        catch (COMException)
                        {
                        }
                        if (kind != type) continue;
                    }
                    string smtp = SmtpOfRecipient(recipient);
                    if (smtp.Length > 0 && !found.Contains(smtp)) found.Add(smtp);
                }
            }
            catch (COMException)
            {
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
            }
            return found;
        }

        static void AddSmtps(List<string> into, List<string> more)
        {
            if (into == null || more == null) return;
            for (int i = 0; i < more.Count; i++)
            {
                string smtp = (more[i] ?? "").Trim().ToLowerInvariant();
                if (smtp.Length > 0 && !into.Contains(smtp)) into.Add(smtp);
            }
        }

        static bool OutlookReplied(dynamic item)
        {
            try
            {
                int verb = Convert.ToInt32(item.PropertyAccessor.GetProperty(VerbTag));
                if (NeedsReplyRules.IsReplyVerb(verb)) return true;
            }
            catch (COMException)
            {
            }
            try
            {
                int icon = Convert.ToInt32(item.PropertyAccessor.GetProperty(IconTag));
                if (NeedsReplyRules.IsRepliedIcon(icon)) return true;
            }
            catch (COMException)
            {
            }
            return false;
        }

        static string SenderSmtp(dynamic item)
        {
            try
            {
                string smtp = SmtpOfEntry(item.Sender);
                if (smtp.Length > 0) return smtp;
            }
            catch (COMException)
            {
            }
            string prop = LowerSmtp(Mapi(item, SenderSmtpTag));
            if (prop.Length > 0) return prop;
            return LowerSmtp(Read(() => Convert.ToString(item.SenderEmailAddress)));
        }

        static string SmtpOfRecipient(dynamic recipient)
        {
            string smtp = "";
            try
            {
                smtp = SmtpOfEntry(recipient.AddressEntry);
            }
            catch (COMException)
            {
            }
            if (smtp.Length == 0) smtp = LowerSmtp(Read(() => Convert.ToString(recipient.Address)));
            return smtp;
        }

        static string SmtpOfEntry(dynamic entry)
        {
            if (entry == null) return "";
            string address = LowerSmtp(Read(() => Convert.ToString(entry.Address)));
            if (address.Length > 0) return address;
            try
            {
                dynamic user = entry.GetExchangeUser();
                if (user != null)
                {
                    string primary = LowerSmtp(Convert.ToString(user.PrimarySmtpAddress));
                    if (primary.Length > 0) return primary;
                }
            }
            catch (COMException)
            {
            }
            return LowerSmtp(Mapi(entry, SmtpTag));
        }

        static string LowerSmtp(string value)
        {
            string smtp = SentSearch.NormalizeSmtp(value);
            if (!SentSearch.IsSmtp(smtp)) return "";
            return smtp.ToLowerInvariant();
        }

        static string Mapi(dynamic item, string tag)
        {
            try
            {
                object value = item.PropertyAccessor.GetProperty(tag);
                return Convert.ToString(value) ?? "";
            }
            catch (COMException)
            {
                return "";
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
                return "";
            }
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
                found.Add(SmtpOfEntry(session.CurrentUser.AddressEntry));
                found.Add(Convert.ToString(session.CurrentUser.Address));
            }
            catch (COMException)
            {
            }
            var own = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string item in found)
            {
                string smtp = LowerSmtp(item);
                if (smtp.Length > 0 && seen.Add(smtp)) own.Add(smtp);
            }
            return own;
        }

        static dynamic ExplorerOf(dynamic app)
        {
            dynamic explorer = null;
            try
            {
                explorer = app.ActiveExplorer();
            }
            catch (COMException)
            {
            }
            if (explorer != null) return explorer;
            try
            {
                dynamic explorers = app.Explorers;
                if (Convert.ToInt32(explorers.Count) > 0) return explorers[1];
            }
            catch (COMException)
            {
            }
            return null;
        }

        static dynamic ItemFromId(dynamic session, string entryId, string storeId)
        {
            if (storeId.Length > 0)
            {
                try
                {
                    return session.GetItemFromID(entryId, storeId);
                }
                catch (COMException)
                {
                }
            }
            try
            {
                return session.GetItemFromID(entryId);
            }
            catch (COMException)
            {
                return null;
            }
        }

        static object DefaultFolder(object store, int kind)
        {
            try
            {
                return ((dynamic)store).GetDefaultFolder(kind);
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

        static bool TryWhen(dynamic item, bool sent, out DateTime when, out string text)
        {
            when = DateTime.MinValue;
            text = "";
            try
            {
                when = sent ? (DateTime)item.SentOn : (DateTime)item.ReceivedTime;
            }
            catch
            {
                try
                {
                    when = (DateTime)item.SentOn;
                }
                catch
                {
                    return false;
                }
            }
            if (when.Year < 1900) return false;
            text = when.ToString("yyyy-MM-ddTHH:mm:ss");
            return true;
        }

        static bool IsMail(dynamic item)
        {
            string messageClass = Read(() => Convert.ToString(item.MessageClass));
            if (messageClass.StartsWith("IPM.Note", StringComparison.OrdinalIgnoreCase)) return true;
            try
            {
                return Convert.ToInt32(item.Class) == 43;
            }
            catch
            {
                return false;
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
            if (input == null || !input.ContainsKey(key) || input[key] == null) return "";
            return Convert.ToString(input[key]).Trim();
        }

        static int IntOf(Dictionary<string, object> input, string key, int fallback)
        {
            if (input == null || !input.ContainsKey(key) || input[key] == null) return fallback;
            try
            {
                return Convert.ToInt32(input[key]);
            }
            catch
            {
                return fallback;
            }
        }

        static bool BoolOf(Dictionary<string, object> input, string key)
        {
            if (input == null || !input.ContainsKey(key) || input[key] == null) return false;
            object value = input[key];
            if (value is bool) return (bool)value;
            return string.Equals(Convert.ToString(value), "true", StringComparison.OrdinalIgnoreCase);
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
