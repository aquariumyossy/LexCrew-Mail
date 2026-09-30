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
        Expect(MailParty.PartyLabel("山田 太郎", "taro@example.com"), "山田 太郎 <taro@example.com>");
        Expect(MailParty.PartyLabel("taro@example.com", ""), "taro@example.com");
        Expect(MailParty.PartyLabel("", "TARO@example.com"), "taro@example.com");
        Expect(MailParty.PartyLabel("山田", "/O=ORG/OU=EXCHANGE/CN=YAMADA"), "山田");
        Expect(MailParty.PartyLabel("", "/O=ORG/OU=EXCHANGE/CN=YAMADA"), "");
        Expect(MailParty.LabelFromDisplay("山田太郎（taro@example.com）"), "山田太郎 <taro@example.com>");
        Expect(MailParty.LabelFromDisplay("「鈴木」 <s@example.com>"), "鈴木 <s@example.com>");
        ExpectMany(
            MailParty.LabelsFromDisplayList("山田 太郎 <taro@example.com>; hanako@example.com; /O=ORG/CN=X"),
            "山田 太郎 <taro@example.com>",
            "hanako@example.com"
        );
        ExpectMany(MailParty.LabelsFromDisplayList("山田, 太郎 <taro@example.com>"), "山田, 太郎 <taro@example.com>");
        ExpectMany(MailParty.SplitDisplayList("山田 <a;b@example.com>; 鈴木"), "山田 <a;b@example.com>", "鈴木");
        ExpectMany(MailParty.CapParties(new string[] { "a", "a", "b" }), "a", "b");
        var many = new string[31];
        for (int i = 0; i < many.Length; i++)
        {
            many[i] = "人" + i;
        }
        string[] capped = MailParty.CapParties(many);
        Expect(capped.Length.ToString(), "31");
        Expect(capped[0], "人0");
        Expect(capped[29], "人29");
        Expect(capped[30], "ほか 1 人");
        return 0;
    }

    static void ExpectMany(string[] actual, params string[] expected)
    {
        if (actual == null)
        {
            throw new System.Exception("null");
        }
        if (actual.Length != expected.Length)
        {
            throw new System.Exception(actual.Length + " != " + expected.Length);
        }
        for (int i = 0; i < actual.Length; i++)
        {
            Expect(actual[i], expected[i]);
        }
    }

    static void Expect(string actual, string expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }
}
