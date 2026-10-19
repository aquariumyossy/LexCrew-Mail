using System;
using System.Collections.Generic;

namespace KuruOutlook
{
    public static class DraftGuard
    {
        public static string RefuseHeaderChange(
            bool headerApproved,
            string currentSubject,
            string proposedSubject,
            string[] currentTo,
            string[] proposedTo,
            string[] currentCc,
            string[] proposedCc,
            string[] allowed)
        {
            if (proposedTo != null)
            {
                string outsider = FirstOutsider(proposedTo, allowed);
                if (outsider != null) return "エラー: スレッドの参加者以外の宛先です。" + outsider;
            }
            if (proposedCc != null)
            {
                string outsider = FirstOutsider(proposedCc, allowed);
                if (outsider != null) return "エラー: スレッドの参加者以外の宛先です。" + outsider;
            }
            string nextSubject = proposedSubject == null ? null : MailHtml.StripMarks(proposedSubject).Trim();
            string nowSubject = MailHtml.StripMarks(currentSubject).Trim();
            bool subjectChanges = nextSubject != null && nextSubject.Length > 0
                && !string.Equals(nowSubject, nextSubject, StringComparison.Ordinal);
            bool toChanges = proposedTo != null && !SameAddresses(proposedTo, currentTo);
            bool ccChanges = proposedCc != null && !SameAddresses(proposedCc, currentCc);
            if ((subjectChanges || toChanges || ccChanges) && !headerApproved)
            {
                return "エラー: 件名または宛先の変更は、作業ウィンドウでの確認が必要です。";
            }
            return null;
        }

        public static string FirstOutsider(string[] proposed, string[] allowed)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (allowed != null)
            {
                for (int i = 0; i < allowed.Length; i++)
                {
                    string smtp = MailParty.Smtp(allowed[i]);
                    if (smtp.Length > 0) set.Add(smtp);
                }
            }
            if (proposed == null) return null;
            for (int i = 0; i < proposed.Length; i++)
            {
                string raw = proposed[i] ?? "";
                string[] pieces = raw.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries);
                if (pieces.Length == 0 && raw.Trim().Length > 0) pieces = new[] { raw };
                for (int p = 0; p < pieces.Length; p++)
                {
                    string piece = MailHtml.StripMarks(pieces[p]).Trim();
                    if (piece.Length == 0) continue;
                    string smtp = MailParty.Smtp(piece);
                    if (smtp.Length == 0 || !set.Contains(smtp)) return piece;
                }
            }
            return null;
        }

        public static bool SameAddresses(string[] left, string[] right)
        {
            var a = AddressSet(left);
            var b = AddressSet(right);
            if (a.Count != b.Count) return false;
            foreach (string item in a)
            {
                if (!b.Contains(item)) return false;
            }
            return true;
        }

        static HashSet<string> AddressSet(string[] values)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (values == null) return set;
            for (int i = 0; i < values.Length; i++)
            {
                string[] pieces = (values[i] ?? "").Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries);
                for (int p = 0; p < pieces.Length; p++)
                {
                    string smtp = MailParty.Smtp(MailHtml.StripMarks(pieces[p]));
                    if (smtp.Length > 0) set.Add(smtp);
                }
            }
            return set;
        }
    }
}
