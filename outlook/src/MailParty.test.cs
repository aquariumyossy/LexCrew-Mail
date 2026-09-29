using KuruOutlook;

class MailPartyTest
{
    static int Main()
    {
        Expect(MailParty.PersonName("山田 太郎"), "山田 太郎");
        Expect(MailParty.PersonName("山田 太郎 <taro@example.com>"), "山田 太郎");
        Expect(MailParty.PersonName("山田太郎（taro@example.com）"), "山田太郎");
        Expect(MailParty.PersonName("山田太郎(taro@example.com)"), "山田太郎");
        Expect(MailParty.PersonName("taro@example.com"), "");
        Expect(MailParty.PersonName("/O=ORG/OU=EXCHANGE/CN=YAMADA"), "");
        Expect(MailParty.PersonName("taro@example.com", "山田太郎"), "山田太郎");
        Expect(MailParty.PersonName("", null), "");
        Expect(MailParty.PersonName("「鈴木」 <s@example.com>"), "鈴木");
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
