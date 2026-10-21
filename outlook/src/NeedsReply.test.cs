using System;
using System.Globalization;
using System.Threading;
using KuruOutlook;

class NeedsReplyTest
{
    static int Main()
    {
        var culture = (CultureInfo)CultureInfo.InvariantCulture.Clone();
        culture.DateTimeFormat.DateSeparator = ".";
        culture.DateTimeFormat.TimeSeparator = ".";
        CultureInfo previous = Thread.CurrentThread.CurrentCulture;
        Thread.CurrentThread.CurrentCulture = culture;
        string filter;
        string sent;
        try
        {
            filter = NeedsReplyRules.RestrictSince("[ReceivedTime]", new DateTime(2026, 10, 18, 9, 30, 0));
            sent = NeedsReplyRules.RestrictSince("[SentOn]", new DateTime(2026, 10, 1, 0, 0, 0));
        }
        finally
        {
            Thread.CurrentThread.CurrentCulture = previous;
        }
        Expect(filter, "[ReceivedTime] >= '2026/10/18 09:30'");
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
        Expect(NeedsReplyRules.NextSession(true, true, true), "restart");
        Expect(NeedsReplyRules.NextSession(false, true, true), "continue");
        Expect(NeedsReplyRules.NextSession(false, true, false), "stale");
        Expect(NeedsReplyRules.NextSession(false, false, false), "stale");

        string headers = "From: a@b.c\r\nList-Post: <mailto:ml@example.com> (post)\r\nList-Id: Example <ml.example.com>\r\nReply-To:\r\n Sender@Example.com\r\nSubject: hi\r\n";
        var posted = NeedsReplyRules.HeaderSmtps(headers, "List-Post");
        if (posted.Count != 1 || posted[0] != "ml@example.com") throw new Exception("list-post");
        var replyTo = NeedsReplyRules.HeaderSmtps(headers, "Reply-To");
        if (replyTo.Count != 1 || replyTo[0] != "sender@example.com") throw new Exception("reply-to");
        if (NeedsReplyRules.HeaderSmtps(headers, "List-Id").Count != 0) throw new Exception("list-id without smtp");

        ExpectStamp(culture, "cloned separator");
        ExpectStamp(new CultureInfo("fi-FI"), "fi-FI");
        CultureInfo japanese = new CultureInfo("ja-JP");
        try
        {
            japanese.DateTimeFormat.Calendar = new JapaneseCalendar();
        }
        catch (Exception ex)
        {
            throw new Exception("ja-JP JapaneseCalendar unavailable: " + ex.GetType().Name + " " + ex.Message);
        }
        ExpectStamp(japanese, "ja-JP JapaneseCalendar");
        return 0;
    }

    static void ExpectStamp(CultureInfo culture, string label)
    {
        CultureInfo previous = Thread.CurrentThread.CurrentCulture;
        Thread.CurrentThread.CurrentCulture = culture;
        try
        {
            string text = NeedsReplyRules.FormatLocalTimestamp(new DateTime(2026, 10, 18, 9, 30, 0));
            Expect(text, "2026-10-18T09:30:00");
        }
        catch (Exception ex)
        {
            throw new Exception(label + ": " + ex.Message);
        }
        finally
        {
            Thread.CurrentThread.CurrentCulture = previous;
        }
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new Exception(actual + " != " + expected);
        }
    }
}
