using KuruOutlook;

class MailTargetTest
{
    static int Main()
    {
        Expect(MailTarget.ConversationId("draft", "entry-1"), "draft");
        // An unsaved item must not inherit a different item's conversation id.
        Expect(MailTarget.ConversationId("", "entry-1"), "item:entry-1");
        Expect(MailTarget.ConversationId(null, "entry-1"), "item:entry-1");
        Expect(MailTarget.ConversationId("", null), "");
        Expect(MailTarget.ConversationId("", ""), "");
        InspectorIgnoresExplorerSelection();
        ClosedInspectorIsForgotten();
        return 0;
    }

    static void InspectorIgnoresExplorerSelection()
    {
        // Pane hosted in pop-out B while the explorer selection is still mail A.
        var window = new HostWindow
        {
            Kind = WindowClass.Inspector,
            Alive = true,
            Current = Item("entry-b", "conv-b"),
            Selection = Item("entry-a", "conv-a")
        };
        ResolvedHost resolved = MailTarget.Resolve(window);
        Expect(resolved.Ok, true);
        Expect(resolved.Source, ItemSource.Current);
        Expect(resolved.EntryId, "entry-b");
        Expect(resolved.ConversationId, "conv-b");
        Expect(MailTarget.Choose(WindowClass.Inspector, true, false, false, true), ItemSource.None);
        Expect(MailTarget.Choose(WindowClass.Explorer, true, false, true, true), ItemSource.Inline);
        Expect(MailTarget.Choose(WindowClass.Explorer, true, false, false, true), ItemSource.Selection);
        Expect(MailTarget.Choose(WindowClass.Unknown, true, true, true, true), ItemSource.None);
    }

    static void ClosedInspectorIsForgotten()
    {
        var hosts = new PaneHosts();
        hosts.Open("A", new HostWindow
        {
            Kind = WindowClass.Inspector,
            Alive = true,
            Current = Item("entry-a", "conv-a")
        });
        hosts.Close("A");
        hosts.Open("B", new HostWindow
        {
            Kind = WindowClass.Inspector,
            Alive = true,
            Current = Item("entry-b", "conv-b"),
            Selection = Item("entry-a", "conv-a")
        });
        ResolvedHost closed = hosts.Context("A");
        Expect(closed.Ok, false);
        Expect(closed.EntryId, "");
        Expect(closed.ConversationId, "");
        ResolvedHost open = hosts.Context("B");
        Expect(open.Ok, true);
        Expect(open.EntryId, "entry-b");
        Expect(open.ConversationId, "conv-b");
        Expect(open.EntryId == "entry-a", false);
    }

    static HostItem Item(string entryId, string conversationId)
    {
        return new HostItem { EntryId = entryId, ConversationId = conversationId };
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }

    static void Expect(bool actual, bool expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }

    static void Expect(ItemSource actual, ItemSource expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }
}
