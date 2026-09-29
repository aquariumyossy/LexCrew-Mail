using KuruOutlook;

class MailTargetTest
{
    static int Main()
    {
        Expect(MailTarget.ConversationId("draft", "selected"), "draft");
        Expect(MailTarget.ConversationId("", "selected"), "selected");
        Expect(MailTarget.ConversationId(null, "selected"), "selected");
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
