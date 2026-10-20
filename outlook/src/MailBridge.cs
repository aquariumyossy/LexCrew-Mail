using System;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace KuruOutlook
{
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class MailBridge
    {
        const string SmtpTag = "http://schemas.microsoft.com/mapi/proptag/0x39FE001F";
        readonly object _window;
        string _fileStamp;
        string _fileList;

        public MailBridge(object window)
        {
            _window = window;
        }

        public string GetContext()
        {
            var clock = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                bool inspector;
                dynamic item = MailTarget.Draft(_window, out inspector);
                if (item == null)
                {
                    return "{\"mode\":\"none\",\"conversationId\":\"\",\"itemId\":\"\"}";
                }
                string messageClass = Convert.ToString(item.MessageClass);
                bool sent = SafeSent(item);
                string mode = MailGate.Mode(inspector, messageClass, sent);
                string itemId = SafeString(() => Convert.ToString(item.EntryID));
                string conversationId = "";
                if (mode != "not-message")
                {
                    conversationId = MailTarget.ConversationId(
                        SafeString(() => item.ConversationID),
                        itemId);
                }
                return "{\"mode\":\"" + Json(mode) + "\",\"conversationId\":\"" + Json(conversationId) + "\",\"itemId\":\"" + Json(itemId) + "\"}";
            }
            catch (Exception ex)
            {
                return "{\"mode\":\"none\",\"conversationId\":\"\",\"itemId\":\"\",\"error\":\"" + Json(ex.Message) + "\"}";
            }
            finally
            {
                Log("GetContext " + clock.ElapsedMilliseconds + "ms");
            }
        }

        public string ReadItem()
        {
            try
            {
                bool inspector;
                dynamic item = MailTarget.Draft(_window, out inspector);
                if (item == null)
                {
                    return "{\"error\":\"メールが選択されていません。\"}";
                }
                string messageClass = Convert.ToString(item.MessageClass);
                string mode = MailGate.Mode(inspector, messageClass, SafeSent(item));
                if (mode == "none")
                {
                    return "{\"error\":\"メールが選択されていません。\"}";
                }
                if (mode == "not-message")
                {
                    return "{\"error\":\"予定は本文を書きません。\"}";
                }
                string html = SafeString(() => item.HTMLBody);
                string from;
                string[] to;
                string[] cc;
                string[] bcc;
                FillHeaderLists(item, out from, out to, out cc, out bcc);
                var payload = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "subject", SafeString(() => item.Subject) },
                    { "from", from },
                    { "to", to },
                    { "cc", cc },
                    { "bcc", bcc },
                    { "bodyHtml", MailBody.VisibleText(html) },
                    { "citations", new object[0] }
                };
                return new JavaScriptSerializer().Serialize(payload);
            }
            catch (Exception ex)
            {
                return "{\"error\":\"" + Json(ex.Message) + "\"}";
            }
        }

        public string ReadHeader()
        {
            try
            {
                bool inspector;
                dynamic item = MailTarget.Draft(_window, out inspector);
                if (item == null)
                {
                    return "{\"ok\":false}";
                }
                string messageClass = Convert.ToString(item.MessageClass);
                string mode = MailGate.Mode(inspector, messageClass, SafeSent(item));
                if (mode == "none" || mode == "not-message")
                {
                    return "{\"ok\":false}";
                }
                string from;
                string[] to;
                string[] cc;
                string[] bcc;
                FillHeaderLists(item, out from, out to, out cc, out bcc);
                var payload = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "ok", true },
                    { "subject", SafeString(() => item.Subject) },
                    { "from", from },
                    { "to", to },
                    { "cc", cc },
                    { "bcc", bcc }
                };
                return new JavaScriptSerializer().Serialize(payload);
            }
            catch
            {
                return "{\"ok\":false}";
            }
        }

        public string ReadConversation()
        {
            try
            {
                bool inspector;
                dynamic item = MailTarget.Draft(_window, out inspector);
                if (item == null)
                {
                    return "{\"messages\":[]}";
                }
                var messages = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
                CollectConversation(item, messages);
                string source = QuotedHeaders.Clip(
                    SafeString(() => Convert.ToString(item.HTMLBody)) + "\n" + SafeString(() => Convert.ToString(item.Body)));
                return new JavaScriptSerializer().Serialize(new System.Collections.Generic.Dictionary<string, object>
                {
                    { "messages", messages },
                    { "source", source }
                });
            }
            catch
            {
                return "{\"messages\":[]}";
            }
        }

        public string ReadParties()
        {
            try
            {
                bool inspector;
                dynamic item = MailTarget.Draft(_window, out inspector);
                if (item == null)
                {
                    return "{\"parties\":[]}";
                }
                string self = SelfSmtp(item);
                var parties = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
                AddParty(parties, "from", SenderLabel(item), SenderSmtp(item), self);
                AddRecipients(parties, item, self);
                return new JavaScriptSerializer().Serialize(new System.Collections.Generic.Dictionary<string, object>
                {
                    { "parties", parties }
                });
            }
            catch
            {
                return "{\"parties\":[]}";
            }
        }

        public string ListMailFiles()
        {
            var clock = System.Diagnostics.Stopwatch.StartNew();
            string how = "skip";
            try
            {
                bool inspector;
                dynamic item = MailTarget.Selected(_window, out inspector);
                if (item == null)
                {
                    return "{\"error\":\"メールが選択されていません。\"}";
                }
                string mode = MailGate.Mode(inspector, Convert.ToString(item.MessageClass), SafeSent(item));
                if (mode == "none" || mode == "not-message")
                {
                    return "{\"error\":\"添付を読めるメールがありません。\"}";
                }
                dynamic attachments = item.Attachments;
                int count = 0;
                try
                {
                    count = attachments == null ? 0 : Convert.ToInt32(attachments.Count);
                }
                catch
                {
                    count = 0;
                }
                var rows = new System.Collections.Generic.List<MailFileRow>();
                for (int i = 1; i <= count; i++)
                {
                    dynamic attachment = attachments[i];
                    int type = 0;
                    try
                    {
                        type = Convert.ToInt32(attachment.Type);
                    }
                    catch
                    {
                    }
                    if (type != 1 && type != 6)
                    {
                        continue;
                    }
                    int size = 0;
                    try
                    {
                        size = Convert.ToInt32(attachment.Size);
                    }
                    catch
                    {
                    }
                    rows.Add(new MailFileRow
                    {
                        Index = i,
                        Name = SafeString(() => attachment.FileName),
                        Size = size,
                        ContentId = ContentId(attachment)
                    });
                }
                string stamp = MailFiles.Stamp(SafeString(() => item.EntryID), rows);
                if (stamp.Length > 0 && stamp == _fileStamp)
                {
                    how = "cache";
                    return _fileList;
                }
                string html = SafeString(() => item.HTMLBody);
                var visible = MailFiles.Visible(rows, html);
                var files = new System.Collections.Generic.List<object>();
                foreach (MailFileRow row in visible)
                {
                    files.Add(new System.Collections.Generic.Dictionary<string, object>
                    {
                        { "index", row.Index },
                        { "name", row.Name ?? "" },
                        { "size", row.Size }
                    });
                }
                string json = new JavaScriptSerializer().Serialize(new System.Collections.Generic.Dictionary<string, object>
                {
                    { "files", files }
                });
                if (stamp.Length > 0)
                {
                    _fileStamp = stamp;
                    _fileList = json;
                }
                how = "html";
                return json;
            }
            catch (Exception ex)
            {
                how = "error";
                return "{\"error\":\"" + Json(ex.Message) + "\"}";
            }
            finally
            {
                Log("ListMailFiles " + clock.ElapsedMilliseconds + "ms " + how);
            }
        }

        public string ReadMailFile(int index)
        {
            string temp = "";
            try
            {
                dynamic item = MailTarget.Selected(_window);
                if (item == null)
                {
                    return "{\"error\":\"メールが選択されていません。\"}";
                }
                dynamic attachment = item.Attachments[index];
                temp = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "kuru-" + Guid.NewGuid().ToString("n"));
                attachment.SaveAsFile(temp);
                byte[] bytes = System.IO.File.ReadAllBytes(temp);
                var serializer = new JavaScriptSerializer();
                serializer.MaxJsonLength = int.MaxValue;
                return serializer.Serialize(new System.Collections.Generic.Dictionary<string, object>
                {
                    { "data", Convert.ToBase64String(bytes) }
                });
            }
            catch (Exception ex)
            {
                return "{\"error\":\"" + Json(ex.Message) + "\"}";
            }
            finally
            {
                if (temp != "")
                {
                    try
                    {
                        System.IO.File.Delete(temp);
                    }
                    catch
                    {
                    }
                }
            }
        }

        public string WriteDraft(string json)
        {
            try
            {
                bool inspector;
                dynamic item = MailTarget.Draft(_window, out inspector);
                if (item == null)
                {
                    return "エラー: メールが選択されていません。";
                }
                string mode = MailGate.Mode(inspector, Convert.ToString(item.MessageClass), SafeSent(item));
                if (mode != "compose")
                {
                    return mode == "read"
                        ? "エラー: 閲覧中は本文を書きません。返信・転送を開いてから書き戻してください。"
                        : "エラー: 本文を書けるメールがありません。";
                }
                var serializer = new JavaScriptSerializer();
                var draft = serializer.Deserialize<System.Collections.Generic.Dictionary<string, object>>(json);
                string preface = Convert.ToString(draft["bodyHtml"]);
                string proposedSubject = draft.ContainsKey("subject") ? Convert.ToString(draft["subject"]) : null;
                string refusal = DraftGuard.RefuseHeaderChange(
                    HeaderApproved(draft),
                    SafeString(() => Convert.ToString(item.Subject)),
                    proposedSubject,
                    RecipientsOfType(item, 1),
                    DraftAddresses(draft, "to"),
                    RecipientsOfType(item, 2),
                    DraftAddresses(draft, "cc"),
                    RecipientsOfType(item, 3),
                    DraftAddresses(draft, "bcc"),
                    ThreadParticipants(item));
                if (refusal != null)
                {
                    return refusal;
                }
                MailFont font = MailFont.FromDraft(draft);
                bool mutated;
                string wordError;
                if (!TryWordPreface(preface, font, out mutated, out wordError))
                {
                    if (mutated)
                    {
                        return "エラー: " + (string.IsNullOrEmpty(wordError) ? "本文を書き込めませんでした。" : wordError);
                    }
                    item.HTMLBody = MailBody.SplicePreface(SafeString(() => item.HTMLBody), preface, font);
                }
                string subject = draft.ContainsKey("subject") ? MailHtml.StripMarks(Convert.ToString(draft["subject"])).Trim() : "";
                if (!string.IsNullOrEmpty(subject))
                {
                    item.Subject = subject;
                }
                SetAddressField(item, draft, "to", 1);
                SetAddressField(item, draft, "cc", 2);
                SetAddressField(item, draft, "bcc", 3);
                return "作成ウィンドウへ書き戻しました。";
            }
            catch (Exception ex)
            {
                return "エラー: " + ex.Message;
            }
        }

        bool TryWordPreface(string preface, MailFont font, out bool mutated, out string error)
        {
            mutated = false;
            error = null;
            dynamic editor = MailTarget.Editor(_window);
            if (editor == null)
            {
                return false;
            }
            dynamic bookmarks;
            try
            {
                bookmarks = editor.Bookmarks;
                bookmarks.ShowHidden = true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
            int signature = BookmarkStart(bookmarks, "_MailAutoSig");
            int quote = BookmarkStart(bookmarks, "_MailOriginal");
            int keep = MailBody.PreserveFrom(signature, quote);
            if (keep < 0)
            {
                return false;
            }
            string anchor = signature >= 0 && (quote < 0 || signature < quote) ? "_MailAutoSig" : "_MailOriginal";
            string temp = "";
            try
            {
                temp = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "kuru-" + Guid.NewGuid().ToString("n") + ".htm");
                System.IO.File.WriteAllText(temp, MailBody.PrefaceDocument(preface, font), new System.Text.UTF8Encoding(true));
                int before = Convert.ToInt32(editor.Content.End);
                mutated = true;
                editor.Range(0, 0).InsertFile(temp, Type.Missing, false, false, false);
                int inserted = Convert.ToInt32(editor.Content.End) - before;
                dynamic mark = bookmarks.Item(anchor);
                if (Convert.ToInt32(mark.Range.Start) != keep + inserted)
                {
                    bookmarks.Add(anchor, editor.Range(keep + inserted, Convert.ToInt32(mark.Range.End)));
                }
                if (keep > 0)
                {
                    editor.Range(inserted, keep + inserted).Delete();
                }
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
            finally
            {
                if (temp != "")
                {
                    try
                    {
                        System.IO.File.Delete(temp);
                    }
                    catch
                    {
                    }
                }
            }
        }

        static int BookmarkStart(dynamic bookmarks, string name)
        {
            try
            {
                if (!(bool)bookmarks.Exists(name))
                {
                    return -1;
                }
                return Convert.ToInt32(bookmarks.Item(name).Range.Start);
            }
            catch
            {
                return -1;
            }
        }

        public string SearchSent(string json)
        {
            return SentLookup.Search(_window, json);
        }

        public string ReadCalendar(string json)
        {
            try
            {
                var serializer = new JavaScriptSerializer();
                var input = serializer.Deserialize<System.Collections.Generic.Dictionary<string, object>>(string.IsNullOrEmpty(json) ? "{}" : json);
                DateTime from;
                DateTime to;
                if (!TryRange(input, out from, out to))
                {
                    return "{\"error\":\"予定の期間が不正です。\"}";
                }
                dynamic app = ((dynamic)_window).Application;
                var folders = new System.Collections.Generic.List<object>();
                CollectCalendars(app, folders);
                if (folders.Count == 0)
                {
                    return "{\"error\":\"予定表を読めません。\"}";
                }
                var appointments = new System.Collections.Generic.List<object>();
                int attempts = 0;
                int failures = 0;
                foreach (object folder in folders)
                {
                    attempts++;
                    try
                    {
                        ReadFolder(folder, from, to, appointments);
                    }
                    catch
                    {
                        failures++;
                    }
                }
                if (attempts > 0 && failures == attempts)
                {
                    return "{\"error\":\"予定表を読めません。\"}";
                }
                var payload = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "appointments", appointments },
                    { "calendars", folders.Count }
                };
                return serializer.Serialize(payload);
            }
            catch (Exception ex)
            {
                return "{\"error\":\"" + Json(ex.Message) + "\"}";
            }
        }

        static void CollectCalendars(dynamic app, System.Collections.Generic.List<object> folders)
        {
            var seen = new System.Collections.Generic.HashSet<string>();
            var selected = new System.Collections.Generic.List<object>();
            var unknown = new System.Collections.Generic.List<object>();
            var all = new System.Collections.Generic.List<object>();
            TryNavigationCalendars(app, selected, unknown, all);
            if (selected.Count > 0)
            {
                foreach (object folder in selected) AddFolder(folders, seen, folder);
                foreach (object folder in unknown) AddFolder(folders, seen, folder);
            }
            else
            {
                foreach (object folder in all) AddFolder(folders, seen, folder);
            }
            AddStoreCalendars(app, folders, seen);
        }

        static void TryNavigationCalendars(
            dynamic app,
            System.Collections.Generic.List<object> selected,
            System.Collections.Generic.List<object> unknown,
            System.Collections.Generic.List<object> all)
        {
            try
            {
                dynamic explorer = app.ActiveExplorer();
                if (explorer == null)
                {
                    return;
                }
                dynamic modules = explorer.NavigationPane.Modules;
                for (int m = 1; m <= (int)modules.Count; m++)
                {
                    dynamic mod = modules[m];
                    int type = 0;
                    try
                    {
                        type = Convert.ToInt32(mod.NavigationModuleType);
                    }
                    catch (COMException)
                    {
                        continue;
                    }
                    if (type != 1)
                    {
                        continue;
                    }
                    dynamic groups = mod.NavigationGroups;
                    for (int g = 1; g <= (int)groups.Count; g++)
                    {
                        dynamic navFolders = groups[g].NavigationFolders;
                        for (int f = 1; f <= (int)navFolders.Count; f++)
                        {
                            dynamic nav = navFolders[f];
                            object folder;
                            try
                            {
                                folder = nav.Folder;
                            }
                            catch (COMException)
                            {
                                continue;
                            }
                            if (folder == null)
                            {
                                continue;
                            }
                            all.Add(folder);
                            int state = -1;
                            try
                            {
                                state = (bool)nav.IsSelected ? 1 : 0;
                            }
                            catch (COMException)
                            {
                            }
                            if (state == 1)
                            {
                                selected.Add(folder);
                            }
                            else if (state < 0)
                            {
                                unknown.Add(folder);
                            }
                        }
                    }
                }
            }
            catch (COMException)
            {
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
            }
        }

        static void AddStoreCalendars(dynamic app, System.Collections.Generic.List<object> folders, System.Collections.Generic.HashSet<string> seen)
        {
            dynamic session = app.Session;
            try
            {
                dynamic root = session.GetDefaultFolder(9);
                AddFolder(folders, seen, root);
                dynamic children = root.Folders;
                for (int i = 1; i <= (int)children.Count; i++)
                {
                    try
                    {
                        AddFolder(folders, seen, children[i]);
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
                dynamic stores = session.Stores;
                for (int i = 1; i <= (int)stores.Count; i++)
                {
                    try
                    {
                        AddFolder(folders, seen, stores[i].GetDefaultFolder(9));
                    }
                    catch (COMException)
                    {
                    }
                }
            }
            catch (COMException)
            {
            }
        }

        static void AddFolder(System.Collections.Generic.List<object> folders, System.Collections.Generic.HashSet<string> seen, object folder)
        {
            if (folder == null)
            {
                return;
            }
            string id = "";
            try
            {
                id = Convert.ToString(((dynamic)folder).EntryID) ?? "";
            }
            catch (COMException)
            {
            }
            if (id != "" && !seen.Add(id))
            {
                return;
            }
            folders.Add(folder);
        }

        static void ReadFolder(object folder, DateTime from, DateTime to, System.Collections.Generic.List<object> appointments)
        {
            dynamic items = ((dynamic)folder).Items;
            items.Sort("[Start]");
            items.IncludeRecurrences = true;
            string startText = from.ToString("yyyy/MM/dd HH:mm");
            string endText = to.ToString("yyyy/MM/dd HH:mm");
            dynamic restricted;
            try
            {
                restricted = items.Restrict("[Start] <= '" + endText + "' AND [End] >= '" + startText + "'");
            }
            catch (COMException)
            {
                restricted = items.Restrict("[Start] >= '" + startText + "' AND [Start] <= '" + endText + "'");
            }
            int n = 0;
            dynamic item = restricted.GetFirst();
            while (item != null && n < 1500 && appointments.Count < 1500)
            {
                n++;
                DateTime start;
                DateTime end;
                try
                {
                    start = (DateTime)item.Start;
                    end = (DateTime)item.End;
                }
                catch (COMException)
                {
                    item = restricted.GetNext();
                    continue;
                }
                if (end <= from || start >= to)
                {
                    item = restricted.GetNext();
                    continue;
                }
                int meeting = 0;
                int recurrence = 0;
                try
                {
                    meeting = Convert.ToInt32(item.MeetingStatus);
                }
                catch (COMException)
                {
                }
                try
                {
                    recurrence = Convert.ToInt32(item.RecurrenceState);
                }
                catch (COMException)
                {
                }
                // 5 と 7 は取消。1 は繰り返しの親で、各回と重なる。
                if (meeting == 5 || meeting == 7 || recurrence == 1)
                {
                    item = restricted.GetNext();
                    continue;
                }
                bool allDay = false;
                int status = 2;
                try
                {
                    allDay = (bool)item.AllDayEvent;
                }
                catch (COMException)
                {
                }
                try
                {
                    status = Convert.ToInt32(item.BusyStatus);
                }
                catch (COMException)
                {
                }
                appointments.Add(new System.Collections.Generic.Dictionary<string, object>
                {
                    { "start", start.ToString("yyyy-MM-ddTHH:mm:ss") },
                    { "end", end.ToString("yyyy-MM-ddTHH:mm:ss") },
                    { "busy", status != 0 },
                    { "allDay", allDay },
                    { "subject", SafeString(() => item.Subject) },
                    { "location", SafeString(() => item.Location) }
                });
                item = restricted.GetNext();
            }
        }

        static bool TryRange(System.Collections.Generic.Dictionary<string, object> input, out DateTime from, out DateTime to)
        {
            from = DateTime.MinValue;
            to = DateTime.MinValue;
            if (input == null || !input.ContainsKey("from") || !input.ContainsKey("to"))
            {
                return false;
            }
            return DateTime.TryParse(Convert.ToString(input["from"]), out from)
                && DateTime.TryParse(Convert.ToString(input["to"]), out to)
                && to > from;
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

        static string SelfSmtp(dynamic item)
        {
            string smtp = "";
            try
            {
                smtp = SmtpOfEntry(item.Session.CurrentUser.AddressEntry);
            }
            catch
            {
            }
            if (smtp.Length > 0)
            {
                return smtp;
            }
            return AcceptSmtp(SafeString(() => Convert.ToString(item.Session.CurrentUser.Address)));
        }

        static string SenderSmtp(dynamic item)
        {
            string smtp = "";
            try
            {
                smtp = SmtpOfEntry(item.Sender);
            }
            catch
            {
            }
            if (smtp.Length > 0)
            {
                return smtp;
            }
            smtp = AcceptSmtp(SafeString(() => Convert.ToString(item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x5D01001F"))));
            if (smtp.Length > 0)
            {
                return smtp;
            }
            smtp = AcceptSmtp(SafeString(() => Convert.ToString(item.SenderEmailAddress)));
            if (smtp.Length > 0)
            {
                return smtp;
            }
            smtp = NameSmtp(SafeString(() => Convert.ToString(item.SenderName)));
            if (smtp.Length > 0)
            {
                return smtp;
            }
            smtp = NameSmtp(MapiString(item, "http://schemas.microsoft.com/mapi/proptag/0x0C1A001F"));
            if (smtp.Length > 0)
            {
                return smtp;
            }
            return NameSmtp(SafeString(() => item.Sender.Name));
        }

        static string NameSmtp(string value)
        {
            return AcceptSmtp(MailParty.Smtp(value));
        }

        static string RecipientSmtp(dynamic recipient)
        {
            string smtp = "";
            try
            {
                smtp = SmtpOfEntry(recipient.AddressEntry);
            }
            catch
            {
            }
            if (smtp.Length > 0)
            {
                return smtp;
            }
            smtp = NameSmtp(SafeString(() => Convert.ToString(recipient.Name)));
            if (smtp.Length > 0)
            {
                return smtp;
            }
            return AcceptSmtp(SafeString(() => Convert.ToString(recipient.Address)));
        }

        static string SmtpOfEntry(dynamic entry)
        {
            if (entry == null)
            {
                return "";
            }
            string address = AcceptSmtp(SafeString(() => Convert.ToString(entry.Address)));
            if (address.Length > 0)
            {
                return address;
            }
            string exchange = AcceptSmtp(SafeString(() => PrimarySmtp(entry.GetExchangeUser())));
            if (exchange.Length > 0)
            {
                return exchange;
            }
            string list = AcceptSmtp(SafeString(() => PrimarySmtp(entry.GetExchangeDistributionList())));
            if (list.Length > 0)
            {
                return list;
            }
            return AcceptSmtp(SafeString(() => Convert.ToString(entry.PropertyAccessor.GetProperty(SmtpTag))));
        }

        static string PrimarySmtp(dynamic user)
        {
            if (user == null)
            {
                return "";
            }
            return Convert.ToString(user.PrimarySmtpAddress) ?? "";
        }

        static string AcceptSmtp(string value)
        {
            if (!SentSearch.IsSmtp(value))
            {
                return "";
            }
            return SentSearch.NormalizeSmtp(value).ToLowerInvariant();
        }

        static void AddParty(System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> parties, string role, string name, string address, string self)
        {
            if (address.Length == 0 || address == self)
            {
                return;
            }
            parties.Add(new System.Collections.Generic.Dictionary<string, object>
            {
                { "role", role },
                { "name", name ?? "" },
                { "address", address }
            });
        }

        static void AddRecipients(System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> parties, dynamic item, string self)
        {
            var to = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
            var cc = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
            var bcc = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
            try
            {
                dynamic recipients = item.Recipients;
                int count = recipients == null ? 0 : Convert.ToInt32(recipients.Count);
                for (int i = 1; i <= count; i++)
                {
                    try
                    {
                        dynamic recipient = recipients[i];
                        int kind = 1;
                        try
                        {
                            kind = Convert.ToInt32(recipient.Type);
                        }
                        catch
                        {
                        }
                        string address = RecipientSmtp(recipient);
                        string name = MailParty.PersonName(
                            SafeString(() => Convert.ToString(recipient.Name)),
                            SafeString(() => Convert.ToString(recipient.Address))
                        );
                        if (kind == 3)
                        {
                            AddParty(bcc, "bcc", name, address, self);
                        }
                        else
                        {
                            AddParty(kind == 2 ? cc : to, kind == 2 ? "cc" : "to", name, address, self);
                        }
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            parties.AddRange(to);
            parties.AddRange(cc);
            parties.AddRange(bcc);
        }

        static string SenderLabel(dynamic item)
        {
            return MailParty.PersonName(
                SafeString(() => item.SentOnBehalfOfName),
                SafeString(() => item.SenderName),
                MapiString(item, "http://schemas.microsoft.com/mapi/proptag/0x0042001F"),
                MapiString(item, "http://schemas.microsoft.com/mapi/proptag/0x0C1A001F"),
                SafeString(() => item.Sender.Name),
                ExchangeSenderName(item)
            );
        }

        static void FillHeaderLists(dynamic item, out string from, out string[] to, out string[] cc, out string[] bcc)
        {
            from = MailParty.PartyLabel(SenderLabel(item), SenderSmtp(item));
            var toList = new System.Collections.Generic.List<string>();
            var ccList = new System.Collections.Generic.List<string>();
            var bccList = new System.Collections.Generic.List<string>();
            CollectHeaderParties(item, toList, ccList, bccList);
            to = MailParty.CapParties(toList);
            cc = MailParty.CapParties(ccList);
            bcc = MailParty.CapParties(bccList);
        }

        static void CollectHeaderParties(
            dynamic item,
            System.Collections.Generic.List<string> to,
            System.Collections.Generic.List<string> cc,
            System.Collections.Generic.List<string> bcc)
        {
            try
            {
                dynamic recipients = item.Recipients;
                int count = recipients == null ? 0 : Convert.ToInt32(recipients.Count);
                for (int i = 1; i <= count; i++)
                {
                    try
                    {
                        dynamic recipient = recipients[i];
                        int kind = 0;
                        try
                        {
                            kind = Convert.ToInt32(recipient.Type);
                        }
                        catch
                        {
                        }
                        string rawName = SafeString(() => Convert.ToString(recipient.Name));
                        string rawAddress = SafeString(() => Convert.ToString(recipient.Address));
                        string smtp = RecipientSmtp(recipient);
                        if (smtp.Length == 0)
                        {
                            smtp = rawAddress;
                        }
                        string label = MailParty.PartyLabel(rawName.Length > 0 ? rawName : rawAddress, smtp);
                        AddUnique(kind == 3 ? bcc : kind == 2 ? cc : to, label);
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            if (to.Count == 0)
            {
                AddDisplayFallback(to, item, true);
            }
            if (cc.Count == 0)
            {
                AddDisplayFallback(cc, item, false);
            }
            if (bcc.Count == 0)
            {
                string[] labels = MailParty.LabelsFromDisplayList(SafeString(() => item.BCC));
                for (int i = 0; i < labels.Length; i++)
                {
                    AddUnique(bcc, labels[i]);
                }
            }
        }

        static void AddDisplayFallback(System.Collections.Generic.List<string> into, dynamic item, bool toField)
        {
            string fallback = toField ? SafeString(() => item.To) : SafeString(() => item.CC);
            string[] labels = MailParty.LabelsFromDisplayList(fallback);
            if (labels.Length == 0)
            {
                labels = MailParty.LabelsFromDisplayList(MapiString(
                    item,
                    toField
                        ? "http://schemas.microsoft.com/mapi/proptag/0x0E04001F"
                        : "http://schemas.microsoft.com/mapi/proptag/0x0E03001F"
                ));
            }
            for (int i = 0; i < labels.Length; i++)
            {
                AddUnique(into, labels[i]);
            }
        }

        static void AddUnique(System.Collections.Generic.List<string> into, string label)
        {
            if (label.Length == 0 || into.Contains(label))
            {
                return;
            }
            into.Add(label);
        }

        static string MapiString(dynamic item, string tag)
        {
            try
            {
                object value = item.PropertyAccessor.GetProperty(tag);
                return System.Convert.ToString(value) ?? "";
            }
            catch
            {
                return "";
            }
        }

        static string ExchangeSenderName(dynamic item)
        {
            try
            {
                dynamic user = item.Sender.GetExchangeUser();
                if (user == null)
                {
                    return "";
                }
                return System.Convert.ToString(user.Name) ?? "";
            }
            catch
            {
                return "";
            }
        }

        static string SafeString(Func<string> read)
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

        static bool HeaderApproved(System.Collections.Generic.Dictionary<string, object> draft)
        {
            object value;
            if (!draft.TryGetValue("headerApproved", out value) || value == null)
            {
                return false;
            }
            if (value is bool)
            {
                return (bool)value;
            }
            return string.Equals(Convert.ToString(value), "true", StringComparison.OrdinalIgnoreCase);
        }

        static string[] DraftAddresses(System.Collections.Generic.Dictionary<string, object> draft, string key)
        {
            object value;
            if (!draft.TryGetValue(key, out value) || value == null)
            {
                return null;
            }
            var list = value as System.Collections.IList;
            if (list == null)
            {
                return null;
            }
            var parts = new string[list.Count];
            for (int i = 0; i < list.Count; i++)
            {
                parts[i] = Convert.ToString(list[i]);
            }
            return parts;
        }

        const int ConversationLimit = 400;

        static void CollectConversation(dynamic item, System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> messages)
        {
            var seen = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string openId = SafeString(() => Convert.ToString(item.EntryID));
            if (openId.Length > 0)
            {
                seen.Add(openId);
            }
            try
            {
                messages.Add(MessageParties(item));
            }
            catch
            {
            }
            try
            {
                AppendQuotedHeaders(item, messages);
            }
            catch
            {
            }
            int beforeSiblings = messages.Count;
            try
            {
                dynamic conversation = item.GetConversation();
                if (conversation != null)
                {
                    try
                    {
                        WalkConversation(conversation, conversation.GetRootItems(), messages, seen, 0);
                    }
                    catch
                    {
                    }
                    try
                    {
                        CollectConversationTable(item, conversation, messages, seen);
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            if (messages.Count == beforeSiblings)
            {
                try
                {
                    CollectSelectionSibling(item, messages, seen);
                }
                catch
                {
                }
            }
        }

        static void AppendQuotedHeaders(dynamic item, System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> messages)
        {
            var list = new System.Collections.Generic.List<string>();
            string html = QuotedHeaders.Clip(SafeString(() => Convert.ToString(item.HTMLBody)));
            string plain = QuotedHeaders.Clip(SafeString(() => Convert.ToString(item.Body)));
            string[] fromHtml = QuotedHeaders.Addresses(html);
            string[] fromPlain = QuotedHeaders.Addresses(plain);
            for (int i = 0; i < fromHtml.Length; i++) AddParticipant(list, fromHtml[i]);
            for (int i = 0; i < fromPlain.Length; i++) AddParticipant(list, fromPlain[i]);
            if (list.Count == 0)
            {
                return;
            }
            messages.Add(new System.Collections.Generic.Dictionary<string, object>
            {
                { "from", "" },
                { "sender", "" },
                { "to", list.ToArray() },
                { "cc", new string[0] },
                { "replyTo", new string[0] }
            });
        }

        static void CollectSelectionSibling(
            dynamic item,
            System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> messages,
            System.Collections.Generic.HashSet<string> seen)
        {
            string openId = SafeString(() => Convert.ToString(item.ConversationID));
            if (openId.Length == 0)
            {
                return;
            }
            dynamic explorer = null;
            try
            {
                explorer = item.Application.ActiveExplorer();
            }
            catch
            {
                return;
            }
            if (explorer == null)
            {
                return;
            }
            dynamic selection = null;
            try
            {
                selection = explorer.Selection;
            }
            catch
            {
                return;
            }
            if (selection == null)
            {
                return;
            }
            int count = 0;
            try
            {
                count = Convert.ToInt32(selection.Count);
            }
            catch
            {
                return;
            }
            int take = count < 20 ? count : 20;
            for (int i = 1; i <= take && messages.Count < ConversationLimit; i++)
            {
                try
                {
                    dynamic selected = selection[i];
                    if (selected == null)
                    {
                        continue;
                    }
                    string cid = SafeString(() => Convert.ToString(selected.ConversationID));
                    if (!string.Equals(cid, openId, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    string entryId = SafeString(() => Convert.ToString(selected.EntryID));
                    if (entryId.Length > 0 && !seen.Add(entryId))
                    {
                        continue;
                    }
                    messages.Add(MessageParties(selected));
                }
                catch
                {
                }
            }
        }

        static void WalkConversation(
            dynamic conversation,
            dynamic roots,
            System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> messages,
            System.Collections.Generic.HashSet<string> seen,
            int depth)
        {
            if (roots == null || depth > 40 || messages.Count >= ConversationLimit)
            {
                return;
            }
            int count = 0;
            try
            {
                count = Convert.ToInt32(roots.Count);
            }
            catch
            {
                return;
            }
            for (int i = 1; i <= count && messages.Count < ConversationLimit; i++)
            {
                dynamic mail = null;
                try
                {
                    try
                    {
                        mail = roots[i];
                    }
                    catch
                    {
                        mail = roots.Item(i);
                    }
                    if (mail == null)
                    {
                        continue;
                    }
                    string entryId = SafeString(() => Convert.ToString(mail.EntryID));
                    bool fresh = entryId.Length == 0 || seen.Add(entryId);
                    if (fresh)
                    {
                        messages.Add(MessageParties(mail));
                    }
                    dynamic children = null;
                    try
                    {
                        children = conversation.GetChildren(mail);
                    }
                    catch
                    {
                    }
                    WalkConversation(conversation, children, messages, seen, depth + 1);
                }
                catch
                {
                }
            }
        }

        static void CollectConversationTable(
            dynamic item,
            dynamic conversation,
            System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>> messages,
            System.Collections.Generic.HashSet<string> seen)
        {
            dynamic table = conversation.GetTable();
            if (table == null)
            {
                return;
            }
            try
            {
                table.Columns.Add("EntryID");
            }
            catch
            {
            }
            try
            {
                table.Columns.Add("StoreID");
            }
            catch
            {
            }
            int guard = 0;
            while (messages.Count < ConversationLimit && guard < ConversationLimit)
            {
                guard++;
                bool end = true;
                try
                {
                    end = (bool)table.EndOfTable;
                }
                catch
                {
                    return;
                }
                if (end)
                {
                    return;
                }
                try
                {
                    dynamic row = table.GetNextRow();
                    if (row == null)
                    {
                        return;
                    }
                    string entryId = Convert.ToString(row["EntryID"]) ?? "";
                    if (entryId.Length == 0 || !seen.Add(entryId))
                    {
                        continue;
                    }
                    string storeId = "";
                    try
                    {
                        storeId = Convert.ToString(row["StoreID"]) ?? "";
                    }
                    catch
                    {
                    }
                    dynamic mail = null;
                    if (storeId.Length > 0)
                    {
                        try
                        {
                            mail = item.Session.GetItemFromID(entryId, storeId);
                        }
                        catch
                        {
                        }
                    }
                    if (mail == null)
                    {
                        mail = item.Session.GetItemFromID(entryId);
                    }
                    if (mail == null)
                    {
                        continue;
                    }
                    messages.Add(MessageParties(mail));
                }
                catch
                {
                }
            }
        }

        static System.Collections.Generic.Dictionary<string, object> MessageParties(dynamic item)
        {
            string sender = SenderSmtp(item);
            string from = RepresentingSmtp(item);
            if (from.Length == 0)
            {
                from = sender;
            }
            return new System.Collections.Generic.Dictionary<string, object>
            {
                { "from", from },
                { "sender", sender },
                { "to", RecipientsOfType(item, 1) },
                { "cc", RecipientsOfType(item, 2) },
                { "replyTo", ReplyToAddresses(item) }
            };
        }

        static string RepresentingSmtp(dynamic item)
        {
            try
            {
                string behalf = SmtpOfEntry(item.SentOnBehalfOf);
                if (behalf.Length > 0)
                {
                    return behalf;
                }
            }
            catch
            {
            }
            string prop = AcceptSmtp(SafeString(() => Convert.ToString(item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x5D02001F"))));
            if (prop.Length > 0)
            {
                return prop;
            }
            string named = NameSmtp(SafeString(() => Convert.ToString(item.SentOnBehalfOfName)));
            if (named.Length > 0)
            {
                return named;
            }
            named = NameSmtp(MapiString(item, "http://schemas.microsoft.com/mapi/proptag/0x0065001F"));
            if (named.Length > 0)
            {
                return named;
            }
            return NameSmtp(MapiString(item, "http://schemas.microsoft.com/mapi/proptag/0x0042001F"));
        }

        static string[] ReplyToAddresses(dynamic item)
        {
            var list = new System.Collections.Generic.List<string>();
            try
            {
                dynamic recipients = item.ReplyRecipients;
                int count = recipients == null ? 0 : Convert.ToInt32(recipients.Count);
                for (int i = 1; i <= count; i++)
                {
                    try
                    {
                        AddParticipant(list, RecipientSmtp(recipients[i]));
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            if (list.Count == 0)
            {
                string[] labels = MailParty.LabelsFromDisplayList(SafeString(() => Convert.ToString(item.ReplyRecipientNames)));
                for (int i = 0; i < labels.Length; i++)
                {
                    AddParticipant(list, AcceptSmtp(MailParty.Smtp(labels[i])));
                }
            }
            return list.ToArray();
        }

        static string[] ThreadParticipants(dynamic item)
        {
            var list = new System.Collections.Generic.List<string>();
            AddParticipant(list, SelfSmtp(item));
            AddParticipant(list, SenderSmtp(item));
            try
            {
                dynamic recipients = item.Recipients;
                int count = recipients == null ? 0 : Convert.ToInt32(recipients.Count);
                for (int i = 1; i <= count; i++)
                {
                    try
                    {
                        AddParticipant(list, RecipientSmtp(recipients[i]));
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            AddDisplayParticipants(list, item, true);
            AddDisplayParticipants(list, item, false);
            string[] bccLabels = MailParty.LabelsFromDisplayList(SafeString(() => item.BCC));
            for (int i = 0; i < bccLabels.Length; i++)
            {
                AddParticipant(list, MailParty.Smtp(bccLabels[i]));
            }
            return list.ToArray();
        }

        static string[] RecipientsOfType(dynamic item, int type)
        {
            var list = new System.Collections.Generic.List<string>();
            try
            {
                dynamic recipients = item.Recipients;
                int count = recipients == null ? 0 : Convert.ToInt32(recipients.Count);
                for (int i = 1; i <= count; i++)
                {
                    try
                    {
                        dynamic recipient = recipients[i];
                        int kind = 1;
                        try
                        {
                            kind = Convert.ToInt32(recipient.Type);
                        }
                        catch
                        {
                        }
                        if (kind != type)
                        {
                            continue;
                        }
                        string smtp = RecipientSmtp(recipient);
                        if (smtp.Length > 0)
                        {
                            list.Add(smtp);
                        }
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            if (list.Count == 0)
            {
                if (type == 3)
                {
                    string[] labels = MailParty.LabelsFromDisplayList(SafeString(() => item.BCC));
                    for (int i = 0; i < labels.Length; i++)
                    {
                        AddParticipant(list, MailParty.Smtp(labels[i]));
                    }
                }
                else
                {
                    AddDisplayParticipants(list, item, type != 2);
                }
            }
            return list.ToArray();
        }

        static void AddDisplayParticipants(System.Collections.Generic.List<string> list, dynamic item, bool toField)
        {
            string fallback = toField ? SafeString(() => item.To) : SafeString(() => item.CC);
            string[] labels = MailParty.LabelsFromDisplayList(fallback);
            for (int i = 0; i < labels.Length; i++)
            {
                AddParticipant(list, MailParty.Smtp(labels[i]));
            }
        }

        static void AddParticipant(System.Collections.Generic.List<string> list, string smtp)
        {
            if (string.IsNullOrEmpty(smtp))
            {
                return;
            }
            for (int i = 0; i < list.Count; i++)
            {
                if (string.Equals(list[i], smtp, StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }
            }
            list.Add(smtp);
        }

        static void SetAddressField(dynamic item, System.Collections.Generic.Dictionary<string, object> draft, string key, int type)
        {
            if (!draft.ContainsKey(key) || draft[key] == null)
            {
                return;
            }
            var list = draft[key] as System.Collections.ArrayList;
            if (list == null)
            {
                return;
            }
            if (list.Count == 0)
            {
                ClearAddressField(item, type);
                return;
            }
            string[] parts = new string[list.Count];
            for (int i = 0; i < list.Count; i++)
            {
                parts[i] = MailHtml.StripMarks(Convert.ToString(list[i])).Trim();
            }
            string joined = string.Join("; ", parts);
            if (type == 3)
            {
                item.BCC = joined;
            }
            else if (type == 2)
            {
                item.CC = joined;
            }
            else
            {
                item.To = joined;
            }
        }

        static void ClearAddressField(dynamic item, int type)
        {
            try
            {
                dynamic recipients = item.Recipients;
                int count = recipients == null ? 0 : Convert.ToInt32(recipients.Count);
                for (int i = count; i >= 1; i--)
                {
                    try
                    {
                        dynamic recipient = recipients[i];
                        int kind = 1;
                        try
                        {
                            kind = Convert.ToInt32(recipient.Type);
                        }
                        catch
                        {
                        }
                        bool drop = type == 3 ? kind == 3 : type == 2 ? kind == 2 : kind != 2 && kind != 3;
                        if (drop)
                        {
                            recipient.Delete();
                        }
                    }
                    catch
                    {
                    }
                }
            }
            catch
            {
            }
            if (type == 3)
            {
                item.BCC = "";
            }
            else if (type == 2)
            {
                item.CC = "";
            }
            else
            {
                item.To = "";
            }
        }

        static string ContentId(dynamic attachment)
        {
            try
            {
                object value = attachment.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F");
                return Convert.ToString(value) ?? "";
            }
            catch
            {
                return "";
            }
        }

        static string Json(string value)
        {
            return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        static void Log(string text)
        {
            try
            {
                System.IO.File.AppendAllText(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "kuru-addin.log"), DateTime.Now.ToString("HH:mm:ss ") + text + Environment.NewLine);
            }
            catch
            {
            }
        }
    }
}
