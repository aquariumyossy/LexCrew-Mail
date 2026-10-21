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
        string hiddenQuote = "<html><head><style>span.MsoHidden{mso-hide:all}</style></head><body><p>新しい前文です</p><div style='border:none;border-top:solid #E1E1E1 1.0pt'><p>引用<span class=MsoHidden>引用の隠し</span>見える</p></div></body></html>";
        SentSearch.SplitBodies(hiddenQuote, "引用の隠し", SentSearch.SentExcerptChars, SentSearch.PriorChars, out excerpt, out prior);
        ExpectContains(prior, "引用");
        ExpectContains(prior, "見える");
        if (prior.IndexOf("引用の隠し") >= 0)
        {
            throw new Exception("prior kept class-hidden text: " + prior);
        }
        if (prior.IndexOf("新しい前文です") >= 0)
        {
            throw new Exception("prior kept the preface: " + prior);
        }

        SentSearch.SplitBodies("", "挨拶です\nOriginal Message\n古い依頼", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "挨拶です");
        ExpectContains(prior, "Original Message");
        ExpectContains(prior, "古い依頼");

        SentSearch.SplitBodies("", "挨拶です\n差出人: 山田\n送信日時: 2026年10月18日 9:30", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "挨拶です");
        ExpectContains(prior, "差出人");
        ExpectContains(prior, "送信日時");
        string original = SentSearch.PlainPreface("吉田先生、確認です\n-----Original Message-----\nFrom: 誰か\nSent: Monday");
        ExpectContains(original, "吉田先生、確認です");
        if (original.IndexOf("Original Message") >= 0 || original.IndexOf("From:") >= 0)
        {
            throw new Exception("original message stayed in the preface: " + original);
        }
        string japanese = SentSearch.PlainPreface("各位\n-----元のメッセージ-----\n差出人: 吉田先生\n送信日時: 2026年10月18日");
        ExpectContains(japanese, "各位");
        if (japanese.IndexOf("差出人") >= 0 || japanese.IndexOf("吉田") >= 0)
        {
            throw new Exception("japanese quote stayed in the preface: " + japanese);
        }
        if (SentSearch.PlainPreface("本文\nFrom: 吉田先生 <a@b.c>\nSent: Monday, October 18, 2026 9:30 AM").IndexOf("吉田先生") >= 0)
        {
            throw new Exception("From header stayed in the preface");
        }
        string midLine = SentSearch.PlainPreface("内容証明の差出人は吉田先生です");
        Expect(midLine, "内容証明の差出人は吉田先生です");
        string midFrom = SentSearch.PlainPreface("前文です。see from: the office、吉田先生");
        Expect(midFrom, "前文です。see from: the office、吉田先生");
        SentSearch.SplitBodies("", "内容証明の差出人は吉田先生です", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "内容証明の差出人は吉田先生です");
        Expect(prior, "");
        SentSearch.SplitBodies("", "前文です。途中の文章 from: ここです", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "前文です。途中の文章 from: ここです");
        Expect(prior, "");
        string keptSentence = "元のメッセージを残して、吉田先生に返信します";
        Expect(SentSearch.PlainPreface(keptSentence), keptSentence);
        string notice = "差出人：株式会社X\n吉田先生、内容をご確認ください";
        Expect(SentSearch.PlainPreface(notice), notice);
        SentSearch.SplitBodies("", notice, 1200, 800, out excerpt, out prior);
        Expect(excerpt, notice);
        Expect(prior, "");
        string noticeDate = "差出人：株式会社X\n日付：2026年10月18日\n吉田先生、内容をご確認ください";
        Expect(SentSearch.PlainPreface(noticeDate), noticeDate);
        SentSearch.SplitBodies("", noticeDate, 1200, 800, out excerpt, out prior);
        Expect(excerpt, noticeDate);
        Expect(prior, "");
        string iphone = "お世話になっております。\n差出人: 山田太郎 <yamada@example.com>\n日付: 2026年10月18日 9:30\n宛先: 自分 <me@example.com>\n件名: ご依頼\n\n吉田先生、古い本文です";
        string iphonePreface = SentSearch.PlainPreface(iphone);
        ExpectContains(iphonePreface, "お世話になっております。");
        if (iphonePreface.IndexOf("吉田先生") >= 0 || iphonePreface.IndexOf("差出人") >= 0 || iphonePreface.IndexOf("日付") >= 0)
        {
            throw new Exception("iPhone Japanese header stayed in the preface: " + iphonePreface);
        }
        SentSearch.SplitBodies("", iphone, 1200, 800, out excerpt, out prior);
        Expect(excerpt, "お世話になっております。");
        ExpectContains(prior, "差出人");
        string mac = "確認しました。\n差出人: 山田太郎 <yamada@example.com>\n件名: 会議の件\n日付: 2026年10月18日 9:30:00 JST\n宛先: 自分 <me@example.com>\n\n吉田先生、古い本文です";
        string macPreface = SentSearch.PlainPreface(mac);
        ExpectContains(macPreface, "確認しました。");
        if (macPreface.IndexOf("吉田先生") >= 0 || macPreface.IndexOf("差出人") >= 0 || macPreface.IndexOf("件名") >= 0)
        {
            throw new Exception("Mac Japanese header stayed in the preface: " + macPreface);
        }
        string travel = "From: 東京 To: 大阪";
        Expect(SentSearch.PlainPreface(travel), travel);
        SentSearch.SplitBodies("", "From: 東京 To: 大阪\n明日出発します", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "From: 東京 To: 大阪\n明日出発します");
        Expect(prior, "");
        string outlookJp = "お世話になっております。\n-----元のメッセージ-----\n差出人: 山田太郎 <yamada@example.com>\n送信日時: 2026年10月18日 9:30\n宛先: 自分\n件名: 依頼\n\n吉田先生、古い本文です";
        string jpPreface = SentSearch.PlainPreface(outlookJp);
        ExpectContains(jpPreface, "お世話になっております。");
        if (jpPreface.IndexOf("吉田先生") >= 0 || jpPreface.IndexOf("差出人") >= 0 || jpPreface.IndexOf("元のメッセージ") >= 0)
        {
            throw new Exception("japanese outlook header stayed in the preface: " + jpPreface);
        }
        string outlookEn = "Thanks.\n-----Original Message-----\nFrom: Yamada <a@b.c>\nSent: Monday, October 18, 2026 9:30 AM\nTo: Me\nSubject: Request\n\n吉田先生、古い本文です";
        string enPreface = SentSearch.PlainPreface(outlookEn);
        ExpectContains(enPreface, "Thanks.");
        if (enPreface.IndexOf("吉田先生") >= 0 || enPreface.IndexOf("From:") >= 0 || enPreface.IndexOf("Original Message") >= 0)
        {
            throw new Exception("english outlook header stayed in the preface: " + enPreface);
        }
        SentSearch.SplitBodies("", "前文です\nFrom: 吉田先生\nTo: 自分\nSent: Monday", 1200, 800, out excerpt, out prior);
        Expect(excerpt, "前文です");
        ExpectContains(prior, "From:");
        ExpectContains(prior, "吉田先生");
        if (SentSearch.PlainPreface("前文\n  From: 吉田先生\n  Sent: Monday").IndexOf("吉田先生") >= 0)
        {
            throw new Exception("indented From header stayed in the preface");
        }
        if (SentSearch.PlainPreface("差出人は吉田先生です").IndexOf("吉田先生") < 0)
        {
            throw new Exception("a line that merely starts with 差出人 and has no colon was cut");
        }
        string lateDate = "本文\nFrom: 吉田先生\n\n\n\n\nSent: Monday";
        if (SentSearch.PlainPreface(lateDate).IndexOf("吉田先生") < 0)
        {
            throw new Exception("Sent five lines later was treated as the quote header");
        }

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
