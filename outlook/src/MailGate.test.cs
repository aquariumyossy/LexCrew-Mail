using KuruOutlook;

class MailGateTest
{
    static int Main()
    {
        Expect(MailGate.Mode(true, "IPM.Note", false), "compose");
        Expect(MailGate.Mode(true, "IPM.Note", true), "read");
        Expect(MailGate.Mode(false, "IPM.Note", false), "read");
        Expect(MailGate.Mode(true, "IPM.Appointment", false), "not-message");
        Expect(MailGate.Mode(false, "", false), "none");
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
