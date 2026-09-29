using System;
using System.Runtime.InteropServices;

namespace KuruOutlook
{
    public static class MailTarget
    {
        public static string ConversationId(string itemId, string selectedId)
        {
            if (!string.IsNullOrEmpty(itemId))
            {
                return itemId;
            }
            return selectedId ?? "";
        }

        public static dynamic Draft(object window, out bool inspector)
        {
            inspector = false;
            dynamic current = Current(window);
            if (current != null)
            {
                inspector = true;
                return current;
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
            inspector = false;
            dynamic current = Current(window);
            if (current != null)
            {
                inspector = true;
                return current;
            }
            return Selection(window);
        }

        public static dynamic Editor(object window)
        {
            if (Current(window) != null)
            {
                return Try(delegate { return ((dynamic)window).WordEditor; });
            }
            if (Inline(window) != null)
            {
                return Try(delegate { return ((dynamic)window).ActiveInlineResponseWordEditor; });
            }
            return null;
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
