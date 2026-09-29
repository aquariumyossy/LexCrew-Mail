using System;
using System.Collections.Generic;
using KuruOutlook;

class SentSearchTest
{
    static int Main()
    {
        string words = SentSearch.RestrictFilter("期日", new string[0], false);
        ExpectContains(words, "ci_phrasematch '期日'");
        ExpectContains(words, "urn:schemas:httpmail:subject");
        ExpectContains(words, "urn:schemas:httpmail:textdescription");

        string sent = SentSearch.RestrictFilter("it's", new string[] { "a@b.co" }, false);
        ExpectContains(sent, "ci_phrasematch 'it''s'");
        ExpectContains(sent, "urn:schemas:httpmail:to");
        ExpectContains(sent, "urn:schemas:httpmail:cc");
        ExpectContains(sent, "LIKE '%a@b.co%'");

        string inbox = SentSearch.RestrictFilter("期日", new string[] { "a@b.co" }, true);
        ExpectContains(inbox, "urn:schemas:httpmail:fromemail");
        if (inbox.IndexOf("urn:schemas:httpmail:to") >= 0)
        {
            throw new Exception("inbox filter used the recipient column");
        }

        List<string> kept = SentSearch.CounterpartyAddresses(
            new string[] { "Me@Firm.jp", "山田", "/O=ORG/OU=EX", "Name <a@b.co>", "a@b.co" },
            new string[] { "me@firm.jp" });
        if (kept.Count != 1 || kept[0] != "a@b.co")
        {
            throw new Exception("counterparty filter kept " + string.Join(",", kept.ToArray()));
        }

        if (!SentSearch.FilterIgnored(100, 100) || SentSearch.FilterIgnored(3, 100) || SentSearch.FilterIgnored(10, 10))
        {
            throw new Exception("filter-ignored heuristic");
        }

        string html = "<html><body><p>新しい前文です</p><div id=\"Signature\">署名</div><div style='border:none;border-top:solid #E1E1E1 1.0pt'><p>引用された依頼</p></div></body></html>";
        string excerpt;
        string prior;
        SentSearch.SplitBodies(html, "", SentSearch.SentExcerptChars, SentSearch.PriorChars, out excerpt, out prior);
        ExpectContains(excerpt, "新しい前文です");
        if (excerpt.IndexOf("引用された依頼") >= 0 || excerpt.IndexOf("署名") >= 0)
        {
            throw new Exception("excerpt leaked quote or signature: " + excerpt);
        }
        ExpectContains(prior, "引用された依頼");
        if (prior.IndexOf("新しい前文です") >= 0)
        {
            throw new Exception("prior kept the preface: " + prior);
        }

        SentSearch.SplitBodies("", "挨拶です\nOriginal Message\n古い依頼", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "挨拶です");
        ExpectContains(prior, "Original Message");
        ExpectContains(prior, "古い依頼");

        SentSearch.SplitBodies("", "挨拶です\n差出人: 山田", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "挨拶です");
        ExpectContains(prior, "差出人");

        string longBody = new string('あ', 1300);
        SentSearch.SplitBodies("", longBody, SentSearch.ReceivedExcerptChars, SentSearch.PriorChars, out excerpt, out prior);
        if (excerpt.Length != SentSearch.ReceivedExcerptChars)
        {
            throw new Exception("excerpt cap " + excerpt.Length);
        }

        var picks = SentSearch.SelectHits(new MailPick[]
        {
            Row(0, "sent", "別件", "2026-09-01", false),
            Row(1, "sent", "期日報告", "2026-01-01", true),
            Row(2, "sent", "近況", "2026-09-20", true),
            Row(3, "sent", "期日の連絡", "2026-08-01", true),
            Row(4, "sent", "期日の古い連絡", "2025-01-01", true),
            Row(5, "received", "期日確認", "2026-07-01", true),
            Row(6, "received", "雑談", "2026-09-01", false),
            Row(7, "received", "期日の返信", "2026-03-01", true)
        }, "期日");
        ExpectIds(picks, new int[] { 3, 1, 4, 5, 7 });
        return 0;
    }

    static MailPick Row(int id, string kind, string subject, string when, bool indexMatch)
    {
        return new MailPick { Id = id, Kind = kind, Subject = subject, When = when, IndexMatch = indexMatch };
    }

    static void ExpectIds(List<MailPick> picks, int[] ids)
    {
        if (picks.Count != ids.Length)
        {
            throw new Exception("selected " + picks.Count + " hits");
        }
        for (int i = 0; i < ids.Length; i++)
        {
            if (picks[i].Id != ids[i])
            {
                throw new Exception("hit " + i + " was " + picks[i].Id);
            }
        }
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new Exception(actual + " != " + expected);
        }
    }

    static void ExpectContains(string actual, string expected)
    {
        if (actual.IndexOf(expected) < 0)
        {
            throw new Exception(actual + " missing " + expected);
        }
    }
}
