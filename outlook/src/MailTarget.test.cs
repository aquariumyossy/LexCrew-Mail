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
        return 0;
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }
}
