using KuruOutlook;

class DraftGuardTest
{
    static int Main()
    {
        string[] allowed = { "a@example.com", "self@example.com", "監査 <b@example.com>" };
        string outsider = DraftGuard.FirstOutsider(new[] { "c@evil.example" }, allowed);
        if (outsider == null)
        {
            throw new System.Exception("outsider was accepted");
        }
        if (DraftGuard.FirstOutsider(new[] { "A@Example.com" }, new[] { "a@example.com" }) != null)
        {
            throw new System.Exception("same smtp was rejected");
        }
        if (DraftGuard.FirstOutsider(new[] { "名 <b@example.com>" }, allowed) != null)
        {
            throw new System.Exception("thread participant was rejected");
        }

        string[] currentTo = { "a@example.com" };
        string needs = DraftGuard.RefuseHeaderChange(false, "件名", "別件", currentTo, currentTo, new string[0], null, null, null, allowed);
        if (needs == null || needs.IndexOf("確認") < 0)
        {
            throw new System.Exception("subject change skipped confirmation: " + needs);
        }
        string approved = DraftGuard.RefuseHeaderChange(true, "件名", "別件", currentTo, currentTo, new string[0], null, null, null, allowed);
        if (approved != null)
        {
            throw new System.Exception("approved subject was refused: " + approved);
        }
        string outside = DraftGuard.RefuseHeaderChange(true, "件名", "", currentTo, new[] { "c@evil.example" }, new string[0], null, null, null, allowed);
        if (outside != null)
        {
            throw new System.Exception("approved outsider was refused: " + outside);
        }
        string unapproved = DraftGuard.RefuseHeaderChange(false, "件名", "", currentTo, new[] { "c@evil.example" }, new string[0], null, null, null, allowed);
        if (unapproved == null || unapproved.IndexOf("確認") < 0)
        {
            throw new System.Exception("unapproved outsider skipped confirmation: " + unapproved);
        }
        string malformed = DraftGuard.RefuseHeaderChange(true, "件名", "", currentTo, new[] { "not-an-email" }, new string[0], null, null, null, allowed);
        if (malformed == null || malformed.IndexOf("形式") < 0)
        {
            throw new System.Exception("malformed address was accepted: " + malformed);
        }
        string bcc = DraftGuard.RefuseHeaderChange(false, "件名", "", currentTo, null, new string[0], null, new string[0], new[] { "hidden@elsewhere.example" }, allowed);
        if (bcc == null || bcc.IndexOf("確認") < 0)
        {
            throw new System.Exception("unapproved bcc skipped confirmation: " + bcc);
        }
        string same = DraftGuard.RefuseHeaderChange(false, "件名", "件名", currentTo, new[] { "A@Example.com" }, null, null, null, null, new[] { "a@example.com" });
        if (same != null)
        {
            throw new System.Exception("unchanged header required confirmation: " + same);
        }
        string bidi = DraftGuard.RefuseHeaderChange(false, "件名", "件名\u202E攻撃", currentTo, null, null, null, null, null, allowed);
        if (bidi == null)
        {
            throw new System.Exception("bidi subject was treated as unchanged");
        }
        string stripped = DraftGuard.RefuseHeaderChange(true, "件名", "件名\u202E", currentTo, null, null, null, null, null, allowed);
        if (stripped != null)
        {
            throw new System.Exception("marks-only subject was a change: " + stripped);
        }
        string clear = DraftGuard.RefuseHeaderChange(false, "件名", "", currentTo, new string[0], new string[0], null, null, null, allowed);
        if (clear == null)
        {
            throw new System.Exception("clearing recipients skipped confirmation");
        }
        return 0;
    }
}
