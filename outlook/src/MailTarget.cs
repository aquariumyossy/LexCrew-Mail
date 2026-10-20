using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace KuruOutlook
{
    public enum WindowClass
    {
        Unknown = 0,
        Explorer = 34,
        Inspector = 35
    }

    public enum ItemSource
    {
        None,
        Current,
        Inline,
        Selection
    }

    public sealed class HostItem
    {
        public string EntryId;
        public string ConversationId;
    }

    public sealed class HostWindow
    {
        public WindowClass Kind;
        public bool Alive;
        public HostItem Current;
        public HostItem Inline;
        public HostItem Selection;
    }

    public sealed class ResolvedHost
    {
        public bool Ok;
        public string Error;
        public string EntryId;
        public string ConversationId;
        public ItemSource Source;
    }

    /// <summary>
    /// Which inspector is open. Close forgets the item so a later pop-out cannot read it.
    /// </summary>
    public sealed class PaneHosts
    {
        readonly Dictionary<string, HostWindow> _open = new Dictionary<string, HostWindow>();

        public void Open(string id, HostWindow window)
        {
            _open[id] = window;
        }

        public void Close(string id)
        {
            HostWindow window;
            if (!_open.TryGetValue(id, out window) || window == null)
            {
                return;
            }
            window.Alive = false;
            window.Current = null;
            window.Inline = null;
            window.Selection = null;
        }

        public ResolvedHost Context(string id)
        {
            HostWindow window;
            if (!_open.TryGetValue(id, out window))
            {
                return MailTarget.Resolve(null);
            }
            return MailTarget.Resolve(window);
        }
    }

    public static class MailTarget
    {
        public const string UnknownItemError = "このウィンドウのメールを特定できません。";

        public static string ConversationId(string itemConversationId, string itemEntryId)
        {
            if (!string.IsNullOrEmpty(itemConversationId))
            {
                return itemConversationId;
            }
            if (string.IsNullOrEmpty(itemEntryId))
            {
                return "";
            }
            return "item:" + itemEntryId;
        }

        /// <summary>
        /// Inspector pop-outs use only CurrentItem. Explorer selection is never a substitute.
        /// </summary>
        public static ItemSource Choose(WindowClass kind, bool alive, bool hasCurrent, bool hasInline, bool hasSelection)
        {
            if (!alive || kind == WindowClass.Unknown)
            {
                return ItemSource.None;
            }
            if (kind == WindowClass.Inspector)
            {
                return hasCurrent ? ItemSource.Current : ItemSource.None;
            }
            if (kind != WindowClass.Explorer)
            {
                return ItemSource.None;
            }
            if (hasInline)
            {
                return ItemSource.Inline;
            }
            if (hasSelection)
            {
                return ItemSource.Selection;
            }
            return ItemSource.None;
        }

        public static ResolvedHost Resolve(HostWindow window)
        {
            if (window == null)
            {
                return Refuse();
            }
            ItemSource source = Choose(
                window.Kind,
                window.Alive,
                window.Current != null,
                window.Inline != null,
                window.Selection != null);
            HostItem item = ItemFor(window, source);
            if (item == null)
            {
                return Refuse();
            }
            return new ResolvedHost
            {
                Ok = true,
                Error = "",
                EntryId = item.EntryId ?? "",
                ConversationId = ConversationId(item.ConversationId, item.EntryId),
                Source = source
            };
        }

        public static string Missing(object window)
        {
            WindowClass kind = Classify(window);
            if (window == null || kind == WindowClass.Unknown || kind == WindowClass.Inspector)
            {
                return UnknownItemError;
            }
            return "メールが選択されていません。";
        }

        public static WindowClass Classify(object window)
        {
            if (window == null)
            {
                return WindowClass.Unknown;
            }
            object raw = Try(delegate { return ((dynamic)window).Class; });
            if (raw == null)
            {
                return WindowClass.Unknown;
            }
            try
            {
                int cls = Convert.ToInt32(raw);
                if (cls == (int)WindowClass.Explorer)
                {
                    return WindowClass.Explorer;
                }
                if (cls == (int)WindowClass.Inspector)
                {
                    return WindowClass.Inspector;
                }
            }
            catch (InvalidCastException)
            {
            }
            catch (FormatException)
            {
            }
            catch (OverflowException)
            {
            }
            return WindowClass.Unknown;
        }

        public static dynamic Draft(object window, out bool inspector)
        {
            inspector = false;
            WindowClass kind = Classify(window);
            if (kind == WindowClass.Inspector)
            {
                inspector = true;
                return Current(window);
            }
            if (kind != WindowClass.Explorer)
            {
                return null;
            }
            dynamic inline = Inline(window);
            if (inline != null)
            {
                inspector = true;
                return inline;
            }
            return Selection(window);
        }

        public static dynamic Selected(object window)
        {
            bool inspector;
            return Selected(window, out inspector);
        }

        public static dynamic Selected(object window, out bool inspector)
        {
            return Draft(window, out inspector);
        }

        public static dynamic Editor(object window)
        {
            WindowClass kind = Classify(window);
            if (kind == WindowClass.Inspector)
            {
                if (Current(window) != null)
                {
                    return Try(delegate { return ((dynamic)window).WordEditor; });
                }
                return null;
            }
            if (kind == WindowClass.Explorer && Inline(window) != null)
            {
                return Try(delegate { return ((dynamic)window).ActiveInlineResponseWordEditor; });
            }
            return null;
        }

        static HostItem ItemFor(HostWindow window, ItemSource source)
        {
            if (source == ItemSource.Current)
            {
                return window.Current;
            }
            if (source == ItemSource.Inline)
            {
                return window.Inline;
            }
            if (source == ItemSource.Selection)
            {
                return window.Selection;
            }
            return null;
        }

        static ResolvedHost Refuse()
        {
            return new ResolvedHost
            {
                Ok = false,
                Error = UnknownItemError,
                EntryId = "",
                ConversationId = "",
                Source = ItemSource.None
            };
        }

        static dynamic Current(object window)
        {
            return Alive(Try(delegate { return ((dynamic)window).CurrentItem; }));
        }

        static dynamic Inline(object window)
        {
            return Alive(Try(delegate { return ((dynamic)window).ActiveInlineResponse; }));
        }

        static dynamic Selection(object window)
        {
            dynamic selection = Try(delegate { return ((dynamic)window).Selection; });
            if (selection == null)
            {
                return null;
            }
            int count = 0;
            try
            {
                count = Convert.ToInt32(selection.Count);
            }
            catch (COMException)
            {
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
            }
            if (count < 1)
            {
                return null;
            }
            return Alive(Try(delegate { return selection[1]; }));
        }

        static dynamic Alive(dynamic item)
        {
            if (item == null)
            {
                return null;
            }
            try
            {
                if (string.IsNullOrEmpty(Convert.ToString(item.MessageClass)))
                {
                    return null;
                }
            }
            catch (COMException)
            {
                return null;
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
                return null;
            }
            return item;
        }

        static dynamic Try(Func<dynamic> read)
        {
            try
            {
                return read();
            }
            catch (COMException)
            {
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
            {
            }
            return null;
        }
    }
}
