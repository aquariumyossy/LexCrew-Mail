using KuruOutlook;

class MailBodyTest
{
    static int Main()
    {
        string styled = "<html><head><style>.x{color:red}</style>MicrosoftInternetExplorer4</head><body><p>本文 &amp; 続き</p></body></html>";
        string visible = MailBody.VisibleText(styled);
        Expect(visible, "本文 & 続き");
        if (visible.IndexOf("MicrosoftInternetExplorer4") >= 0 || visible.IndexOf("color:red") >= 0)
        {
            throw new System.Exception("style or head leaked: " + visible);
        }

        string signed = "<html><head><style>Signature</style></head><body><p>古い前文</p><div id=\"Signature\">署名</div><div style='border:none;border-top:solid #E1E1E1 1.0pt'><a name=\"_MailOriginal\">引用</a></div></body></html>";
        string keptSign = MailBody.SplicePreface(signed, "<p>新しい前文</p>", MailFont.Default);
        ExpectContains(keptSign, "mso-fareast-font-family:\"游ゴシック\"");
        ExpectContains(keptSign, ">新しい前文</p></div><div id=\"Signature\">");
        ExpectContains(keptSign, "name=\"_MailOriginal\"");
        if (keptSign.IndexOf("id=\"Signature\" style=") >= 0)
        {
            throw new System.Exception("signature was restyled");
        }
        if (keptSign.IndexOf("古い前文") >= 0)
        {
            throw new System.Exception("old preface remained");
        }

        string quoted = "<html><body><p>古い</p><div style='border:none;border-top:solid #E1E1E1 1.0pt'><p><a name=\"_MailOriginal\">From</a></p></div></body></html>";
        string keptQuote = MailBody.SplicePreface(quoted, "<p>新規</p>", MailFont.Default);
        ExpectContains(keptQuote, ">新規</p></div><div style='border:none;border-top:solid #E1E1E1 1.0pt'>");
        if (keptQuote.IndexOf("<a name=\"_MailOriginal\">") < keptQuote.IndexOf("<div style="))
        {
            throw new System.Exception("cut inside the quote div");
        }

        string fresh = "<html><body><p>下書き</p></body></html>";
        string replaced = MailBody.SplicePreface(fresh, "<p>全部</p>", MailFont.Default);
        ExpectContains(replaced, "<body><div style='" + "font-size:10.5pt;font-family:\"Yu Gothic\",\"游ゴシック\",sans-serif;");
        ExpectContains(replaced, ">全部</p></div></body>");
        if (replaced.IndexOf("下書き") >= 0)
        {
            throw new System.Exception("fresh body was not replaced");
        }

        System.Globalization.CultureInfo culture = System.Threading.Thread.CurrentThread.CurrentCulture;
        try
        {
            System.Threading.Thread.CurrentThread.CurrentCulture = new System.Globalization.CultureInfo("ja-JP");
            string japanese = MailBody.SplicePreface(fresh, "<p>全部</p>", MailFont.Default);
            ExpectContains(japanese, "font-size:10.5pt;");
            if (japanese.IndexOf("10,5") >= 0)
            {
                throw new System.Exception("size used a culture decimal separator");
            }
        }
        finally
        {
            System.Threading.Thread.CurrentThread.CurrentCulture = culture;
        }

        string escaped = MailBody.SplicePreface("<html><body>古い</body></html>", "a < b & c", MailFont.Default);
        ExpectContains(escaped, ">a &lt; b &amp; c</p>");
        ExpectContains(escaped, "mso-fareast-font-family:\"游ゴシック\"");
        if (escaped.IndexOf("a < b") >= 0)
        {
            throw new System.Exception("preface was not escaped");
        }

        string styledPreface = MailBody.SplicePreface("<html><body><p>古い</p></body></html>", "<p style=\"color:red\">色</p>", MailFont.Default);
        ExpectContains(styledPreface, "color:red;");
        ExpectContains(styledPreface, "mso-fareast-font-family:\"游ゴシック\"");

        string competing = MailBody.SplicePreface("<html><body><p>古い</p></body></html>", "<p style=\"color:red;font-weight:bold;font-size:12pt;font-family:Calibri;mso-ascii-theme-font:minor-latin\">色</p>", MailFont.Default);
        ExpectContains(competing, "color:red;");
        ExpectContains(competing, "font-weight:bold;");
        ExpectContains(competing, "mso-fareast-font-family:\"游ゴシック\"");
        if (competing.IndexOf("12pt") >= 0 || competing.IndexOf("Calibri") >= 0 || competing.IndexOf("minor-latin") >= 0)
        {
            throw new System.Exception("competing font survived: " + competing);
        }

        string fontTag = MailBody.SplicePreface("<html><body><p>古い</p></body></html>", "<font face=\"MS Gothic\" size=\"3\" color=\"red\">色</font>", MailFont.Default);
        if (fontTag.IndexOf("face=") >= 0 || fontTag.IndexOf("size=") >= 0 || fontTag.IndexOf("MS Gothic") >= 0)
        {
            throw new System.Exception("font tag kept face or size: " + fontTag);
        }
        if (fontTag.IndexOf("color=\"red\"") < 0 && fontTag.IndexOf("color='red'") < 0)
        {
            throw new System.Exception("font tag lost color: " + fontTag);
        }
        ExpectContains(fontTag, "font-size:10.5pt;");

        string breaks = MailBody.SplicePreface("<html><body>古い</body></html>", "先生方<br><br>本文", MailFont.Default);
        ExpectContains(breaks, "<body><div style='font-size:10.5pt;font-family:\"Yu Gothic\",\"游ゴシック\",sans-serif;");
        ExpectContains(breaks, ">先生方<br><br>本文</div>");
        if (breaks.IndexOf("<p") >= 0)
        {
            throw new System.Exception("br preface was wrapped in p: " + breaks);
        }

        string mincho = MailBody.SplicePreface(fresh, "<p>明朝</p>", new MailFont("Yu Mincho", "游明朝", 12m));
        ExpectContains(mincho, "font-size:12pt;");
        ExpectContains(mincho, "mso-fareast-font-family:\"游明朝\"");

        Expect(MailBody.PreserveFrom(10, 40).ToString(), "10");
        Expect(MailBody.PreserveFrom(-1, 40).ToString(), "40");
        Expect(MailBody.PreserveFrom(80, 40).ToString(), "40");
        Expect(MailBody.PreserveFrom(-1, -1).ToString(), "-1");
        string prefaceDoc = MailBody.PrefaceDocument("<p>前文</p>", MailFont.Default);
        ExpectContains(prefaceDoc, "charset=\"utf-8\"");
        ExpectContains(prefaceDoc, ">前文</p>");
        ExpectContains(prefaceDoc, "mso-fareast-font-family:\"游ゴシック\"");
        return 0;
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }

    static void ExpectContains(string actual, string expected)
    {
        if (actual.IndexOf(expected) < 0)
        {
            throw new System.Exception(actual + " missing " + expected);
        }
    }
}
