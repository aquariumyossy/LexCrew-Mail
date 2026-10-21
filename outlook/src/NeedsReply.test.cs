using System;
using KuruOutlook;

class NeedsReplyTest
{
    static int Main()
    {
        string filter = NeedsReplyRules.RestrictSince("[ReceivedTime]", new DateTime(2026, 10, 18, 9, 30, 0));
        Expect(filter, "[ReceivedTime] >= '2026/10/18 09:30'");
        string sent = NeedsReplyRules.RestrictSince("[SentOn]", new DateTime(2026, 10, 1, 0, 0, 0));
        Expect(sent, "[SentOn] >= '2026/10/01 00:00'");

        if (!NeedsReplyRules.IsReplyVerb(102) || !NeedsReplyRules.IsReplyVerb(103))
        {
            throw new Exception("reply verbs");
        }
        if (NeedsReplyRules.IsReplyVerb(104) || NeedsReplyRules.IsReplyVerb(0))
        {
            throw new Exception("forward is not a reply");
        }
        if (!NeedsReplyRules.IsRepliedIcon(261) || NeedsReplyRules.IsRepliedIcon(262))
        {
            throw new Exception("replied icon");
        }

        if (NeedsReplyRules.ClampInt(0, 1, 30) != 1 || NeedsReplyRules.ClampInt(90, 1, 30) != 30 || NeedsReplyRules.ClampInt(7, 1, 30) != 7)
        {
            throw new Exception("day clamp");
        }
        if (NeedsReplyRules.Cap("abcdef", 3) != "abc" || NeedsReplyRules.Cap("ab", 3) != "ab" || NeedsReplyRules.Cap(null, 3) != "")
        {
            throw new Exception("cap");
        }
        return 0;
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new Exception(actual + " != " + expected);
        }
    }
}
