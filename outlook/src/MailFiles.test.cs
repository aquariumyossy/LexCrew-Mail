using System;
using System.Collections.Generic;
using KuruOutlook;

class MailFilesTest
{
    static int Main()
    {
        Expect(MailFiles.IsBodyImage("image001.png@01D", "<img src=\"cid:image001.png@01D\">"), true);
        Expect(MailFiles.IsBodyImage("<image001.png@01D>", "<img src='cid:image001.png@01D'>"), true);
        Expect(MailFiles.IsBodyImage("image001.png@01D", "<img src=\"CID:image001.png@01D\">"), true);
        Expect(MailFiles.IsBodyImage("", "<img src=\"cid:image001.png@01D\">"), false);
        Expect(MailFiles.IsBodyImage("scan.pdf", "本文だけ"), false);
        var rows = new List<MailFileRow>
        {
            new MailFileRow { Index = 1, Name = "署名.png", Size = 20, ContentId = "sig@1" },
            new MailFileRow { Index = 2, Name = "契約.pdf", Size = 40, ContentId = "" },
            new MailFileRow { Index = 3, Name = "別図.png", Size = 8, ContentId = "other@1" }
        };
        var kept = MailFiles.Visible(rows, "<img src=\"cid:sig@1\">");
        if (kept.Count != 2 || kept[0].Name != "契約.pdf" || kept[1].Name != "別図.png")
        {
            throw new Exception("visible rows " + kept.Count);
        }
        return 0;
    }

    static void Expect(bool actual, bool expected)
    {
        if (actual != expected)
        {
            throw new Exception(actual + " != " + expected);
        }
    }
}
