using System;
using KuruOutlook;

class QuotedHeadersTest
{
    static int Main()
    {
        string html = "<div><p><b>From:</b> 4cs 佐藤良一 &lt;r.sato@4cs.co.jp&gt;<br>"
            + "<b>To:</b> ml.kanto-soshotanto@4cs.co.jp<br>"
            + "<b>Cc:</b> okamoto.takafumi@4cs.co.jp<br>"
            + "<b>Subject:</b> 週次</p><p>本文です。yoshida@yoshidalaw.jp とは無関係です。</p></div>";
        string[] fromHtml = QuotedHeaders.Addresses(html);
        Require(Has(fromHtml, "r.sato@4cs.co.jp"), "quoted from");
        Require(Has(fromHtml, "ml.kanto-soshotanto@4cs.co.jp"), "quoted to");
        Require(Has(fromHtml, "okamoto.takafumi@4cs.co.jp"), "quoted cc");
        Require(!Has(fromHtml, "yoshida@yoshidalaw.jp"), "prose leaked");

        string plain = "差出人: 4cs 佐藤良一 <R.Sato@4cs.co.jp>\n宛先: ml.kanto-soshotanto@4cs.co.jp\n返信先: reply@4cs.co.jp\nBcc: secret@4cs.co.jp\n本文です。yoshida@yoshidalaw.jp";
        string[] fromPlain = QuotedHeaders.Addresses(plain);
        Require(Has(fromPlain, "r.sato@4cs.co.jp"), "japanese from");
        Require(Has(fromPlain, "reply@4cs.co.jp"), "reply-to");
        Require(!Has(fromPlain, "secret@4cs.co.jp"), "bcc leaked");
        Require(!Has(fromPlain, "yoshida@yoshidalaw.jp"), "plain prose leaked");
        return 0;
    }

    static bool Has(string[] rows, string smtp)
    {
        for (int i = 0; i < rows.Length; i++)
        {
            if (rows[i] == smtp) return true;
        }
        return false;
    }

    static void Require(bool ok, string message)
    {
        if (!ok) throw new Exception(message);
    }
}
