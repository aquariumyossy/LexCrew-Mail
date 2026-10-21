using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace KuruOutlook
{
    /// <summary>
    /// Read-only scan of Inbox and Sent Items. The only write is putting UnRead back
    /// when Outlook flips it while a row is read. Nothing is moved, deleted, sent, or flagged.
    /// </summary>
    public static class NeedsReplyLookup
    {
        const int SentFolder = 5;
        const int InboxFolder = 6;
        const string BodyTag = "http://schemas.microsoft.com/mapi/proptag/0x1000001F";
        const string VerbTag = "http://schemas.microsoft.com/mapi/proptag/0x10810003";
        const string IconTag = "http://schemas.microsoft.com/mapi/proptag/0x10800003";
        const string SmtpTag = "http://schemas.microsoft.com/mapi/proptag/0x39FE001F";

        sealed class Session
        {
            public string Token;
            public string Folder;
            public int Days;
            public DateTime Start;
            public List<object> Folders;
            public List<string> StoreIds;
            public HashSet<string> Own;
            public int FolderIndex;
            public dynamic Items;
            public bool Sorted;
            public int Passed;
            public bool Done;
        }

        struct UnreadSnap
        {
            public bool Known;
            public bool Unread;
        }

        static Session _session;

        public static string Search(object window, string json)
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
                bool same = _session != null && _session.Token == token && _session.Folder == folder && _session.Days == days;
                if (!same)
                {
                    if (!reset)
                    {
                        return Error("検索をやり直してください。");
                    }
                    _session = Begin(window, token, folder, days);
                }
                if (_session.Done)
                {
                    return DonePayload(serializer, new List<object>(), 0);
                }
                var rows = new List<object>();
                int scanned = 0;
                var watch = Stopwatch.StartNew();
                while (rows.Count < take && scanned < take * 5 && watch.ElapsedMilliseconds < budgetMs && !_session.Done)
                {
                    if (_session.Passed >= NeedsReplyRules.HardPass)
                    {
                        _session.Done = true;
                        _session.Items = null;
                        break;
                    }
                    dynamic item = Pull(_session);
                    if (item == null)
                    {
                        _session.Done = true;
                        break;
                    }
                    scanned++;
                    _session.Passed++;
                    if (!IsMail(item))
                    {
                        continue;
                    }
                    DateTime when;
                    string whenText;
                    if (!TryWhen(item, _session.Folder == "sent", out when, out whenText))
                    {
                        continue;
                    }
                    if (when < _session.Start)
                    {
                        if (_session.Sorted)
                        {
                            _session.Items = null;
                            _session.FolderIndex++;
                        }
                        continue;
                    }
                    if (_session.Folder == "sent")
                    {
                        rows.Add(new Dictionary<string, object>
                        {
                            { "subject", Read(() => Convert.ToString(item.Subject)) },
                            { "sentOn", whenText }
                        });
                    }
                    else
                    {
                        rows.Add(InboxRow(item, whenText, StoreId()));
                    }
                }
                bool limited = _session.Passed >= NeedsReplyRules.HardPass;
                if (_session.Done)
                {
                    _session.Items = null;
                }
                return serializer.Serialize(new Dictionary<string, object>
                {
                    { "rows", rows.ToArray() },
                    { "scanned", scanned },
                    { "done", _session.Done },
                    { "limited", limited },
                    { "passed", _session.Passed }
                });
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
                dynamic explorer = null;
                try
                {
                    explorer = app.ActiveExplorer();
                }
                catch (COMException)
                {
                }
                if (explorer == null)
                {
                    try
                    {
                        dynamic explorers = app.Explorers;
                        if (Convert.ToInt32(explorers.Count) > 0)
                        {
                            explorer = explorers[1];
                        }
                    }
                    catch (COMException)
                    {
                    }
                }
                if (explorer == null)
                {
                    throw new InvalidOperationException("Outlook のメインウィンドウがありません。");
                }
                KeepingUnread(item, delegate
                {
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
            });
        }

        public static string Open(object window, string json)
        {
            return WithItem(window, json, delegate(dynamic app, dynamic item)
            {
                KeepingUnread(item, delegate { item.Display(); });
            });
        }

        static string WithItem(object window, string json, Action<dynamic, dynamic> use)
        {
            try
            {
                if (window == null)
                {
                    return Error("Outlook のウィンドウを取得できません。");
                }
                var input = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(string.IsNullOrEmpty(json) ? "{}" : json);
                string entryId = Text(input, "entryId");
                string storeId = Text(input, "storeId");
                if (entryId.Length == 0)
                {
                    return Error("メールを特定できません。");
                }
                dynamic app = ((dynamic)window).Application;
                dynamic item = ItemFromId(app.Session, entryId, storeId);
                if (item == null)
                {
                    return Error("メールを開けません。");
                }
                use(app, item);
                return new JavaScriptSerializer().Serialize(new Dictionary<string, object> { { "ok", true } });
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        static string DonePayload(JavaScriptSerializer serializer, List<object> rows, int scanned)
        {
            return serializer.Serialize(new Dictionary<string, object>
            {
                { "rows", rows.ToArray() },
                { "scanned", scanned },
                { "done", true },
                { "passed", _session == null ? 0 : _session.Passed }
            });
        }

        static Session Begin(object window, string token, string folderKind, int days)
        {
            dynamic app = ((dynamic)window).Application;
            dynamic olSession = app.Session;
            var folders = new List<object>();
            var storeIds = new List<string>();
            int which = folderKind == "sent" ? SentFolder : InboxFolder;
            EachStore(olSession, delegate(object store)
            {
                object folder = DefaultFolder(store, which);
                if (folder == null)
                {
                    return;
                }
                folders.Add(folder);
                string storeId = "";
                try
                {
                    storeId = Convert.ToString(((dynamic)folder).StoreID) ?? "";
                }
                catch (COMException)
                {
                }
                storeIds.Add(storeId);
            });
            return new Session
            {
                Token = token,
                Folder = folderKind,
                Days = days,
                Start = DateTime.Now.AddDays(-days),
                Folders = folders,
                StoreIds = storeIds,
                Own = new HashSet<string>(OwnAddresses(olSession), StringComparer.OrdinalIgnoreCase),
                FolderIndex = 0,
                Done = folders.Count == 0
            };
        }

        static dynamic Pull(Session session)
        {
            while (session.FolderIndex < session.Folders.Count)
            {
                if (session.Items == null)
                {
                    object folder = session.Folders[session.FolderIndex];
                    dynamic items;
                    try
                    {
                        items = ((dynamic)folder).Items;
                    }
                    catch (COMException)
                    {
                        session.FolderIndex++;
                        continue;
                    }
                    string field = session.Folder == "sent" ? "[SentOn]" : "[ReceivedTime]";
                    session.Sorted = TrySort(items, field);
                    dynamic restricted = items;
                    try
                    {
                        dynamic trial = items.Restrict(NeedsReplyRules.RestrictSince(field, session.Start));
                        int folderCount = CountOf(items);
                        int restrictedCount = CountOf(trial);
                        if (!SentSearch.FilterIgnored(restrictedCount, folderCount))
                        {
                            restricted = trial;
                            session.Sorted = TrySort(restricted, field);
                        }
                    }
                    catch (COMException)
                    {
                    }
                    catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
                    {
                    }
                    session.Items = restricted;
                    try
                    {
                        dynamic first = session.Items.GetFirst();
                        if (first == null)
                        {
                            session.Items = null;
                            session.FolderIndex++;
                            continue;
                        }
                        return first;
                    }
                    catch (COMException)
                    {
                        session.Items = null;
                        session.FolderIndex++;
                        continue;
                    }
                }
                dynamic next;
                try
                {
                    next = session.Items.GetNext();
                }
                catch (COMException)
                {
                    next = null;
                }
                if (next == null)
                {
                    session.Items = null;
                    session.FolderIndex++;
                    continue;
                }
                return next;
            }
            return null;
        }

        static string StoreId()
        {
            if (_session == null || _session.FolderIndex < 0 || _session.FolderIndex >= _session.StoreIds.Count)
            {
                return "";
            }
            return _session.StoreIds[_session.FolderIndex] ?? "";
        }

        static Dictionary<string, object> InboxRow(dynamic item, string whenText, string storeId)
        {
            string entryId = "";
            string subject = "";
            string from = "";
            bool inTo = false;
            bool replied = false;
            string body = "";
            KeepingUnread(item, delegate
            {
                entryId = Read(() => Convert.ToString(item.EntryID));
                subject = Read(() => Convert.ToString(item.Subject));
                from = Read(() => Convert.ToString(item.SenderName));
                if (from.Length == 0)
                {
                    from = Read(() => Convert.ToString(item.SenderEmailAddress));
                }
                inTo = UserInTo(item, _session == null ? null : _session.Own);
                replied = OutlookReplied(item);
                body = BodyOf(item);
            });
            return new Dictionary<string, object>
            {
                { "entryId", entryId },
                { "storeId", storeId },
                { "subject", subject },
                { "from", from },
                { "receivedOn", whenText },
                { "inTo", inTo },
                { "outlookReplied", replied },
                { "body", NeedsReplyRules.Cap(body, NeedsReplyRules.BodyChars) }
            };
        }

        static void KeepingUnread(dynamic item, Action action)
        {
            UnreadSnap snap = CaptureUnread(item);
            try
            {
                action();
            }
            finally
            {
                RestoreUnread(item, snap);
            }
        }

        static UnreadSnap CaptureUnread(dynamic item)
        {
            try
            {
                return new UnreadSnap { Known = true, Unread = (bool)item.UnRead };
            }
            catch
            {
                return new UnreadSnap { Known = false, Unread = false };
            }
        }

        static void RestoreUnread(dynamic item, UnreadSnap snap)
        {
            if (!snap.Known || item == null)
            {
                return;
            }
            try
            {
                if ((bool)item.UnRead != snap.Unread)
                {
                    item.UnRead = snap.Unread;
                }
            }
            catch
            {
            }
        }

        static bool OutlookReplied(dynamic item)
        {
            try
            {
                int verb = Convert.ToInt32(item.PropertyAccessor.GetProperty(VerbTag));
                if (NeedsReplyRules.IsReplyVerb(verb))
                {
                    return true;
                }
            }
            catch (COMException)
            {
            }
            try
            {
                int icon = Convert.ToInt32(item.PropertyAccessor.GetProperty(IconTag));
                if (NeedsReplyRules.IsRepliedIcon(icon))
                {
                    return true;
                }
            }
            catch (COMException)
            {
            }
            return false;
        }

        static string BodyOf(dynamic item)
        {
            try
            {
                string prop = Convert.ToString(item.PropertyAccessor.GetProperty(BodyTag));
                if (!string.IsNullOrEmpty(prop))
                {
                    return prop;
                }
            }
            catch (COMException)
            {
            }
            return Read(() => Convert.ToString(item.Body));
        }

        static bool UserInTo(dynamic item, HashSet<string> own)
        {
            if (own == null || own.Count == 0)
            {
                return false;
            }
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
                    if (type != 1)
                    {
                        continue;
                    }
                    string smtp = SmtpOfRecipient(recipient);
                    if (smtp.Length > 0 && own.Contains(smtp))
                    {
                        return true;
                    }
                }
            }
            catch (COMException)
            {
            }
            return false;
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
            if (smtp.Length == 0)
            {
                smtp = SentSearch.NormalizeSmtp(Read(() => Convert.ToString(recipient.Address)));
            }
            return SentSearch.IsSmtp(smtp) ? SentSearch.NormalizeSmtp(smtp) : "";
        }

        static string SmtpOfEntry(dynamic entry)
        {
            if (entry == null)
            {
                return "";
            }
            string address = Read(() => Convert.ToString(entry.Address));
            if (SentSearch.IsSmtp(address))
            {
                return SentSearch.NormalizeSmtp(address);
            }
            try
            {
                dynamic user = entry.GetExchangeUser();
                if (user != null)
                {
                    string primary = Convert.ToString(user.PrimarySmtpAddress);
                    if (SentSearch.IsSmtp(primary))
                    {
                        return SentSearch.NormalizeSmtp(primary);
                    }
                }
            }
            catch (COMException)
            {
            }
            try
            {
                string prop = Convert.ToString(entry.PropertyAccessor.GetProperty(SmtpTag));
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
                string smtp = SentSearch.NormalizeSmtp(item);
                if (SentSearch.IsSmtp(smtp) && seen.Add(smtp))
                {
                    own.Add(smtp);
                }
            }
            return own;
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

        static bool TrySort(dynamic items, string field)
        {
            try
            {
                items.Sort(field, true);
                return true;
            }
            catch (COMException)
            {
                try
                {
                    items.Sort("[SentOn]", true);
                    return true;
                }
                catch (COMException)
                {
                    return false;
                }
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
            if (when.Year < 1900)
            {
                return false;
            }
            text = when.ToString("yyyy-MM-ddTHH:mm:ss");
            return true;
        }

        static bool IsMail(dynamic item)
        {
            string messageClass = Read(() => Convert.ToString(item.MessageClass));
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

        static int IntOf(Dictionary<string, object> input, string key, int fallback)
        {
            if (input == null || !input.ContainsKey(key) || input[key] == null)
            {
                return fallback;
            }
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
            if (input == null || !input.ContainsKey(key) || input[key] == null)
            {
                return false;
            }
            object value = input[key];
            if (value is bool)
            {
                return (bool)value;
            }
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
