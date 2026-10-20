using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace KuruOutlook
{
    public static class DraftGuard
    {
        static readonly Regex Mailbox = new Regex(
            @"^[a-z0-9](?:[a-z0-9._%+\-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?)+$",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static string RefuseHeaderChange(
            bool headerApproved,
            string currentSubject,
            string proposedSubject,
            string[] currentTo,
            string[] proposedTo,
            string[] currentCc,
            string[] proposedCc,
            string[] currentBcc,
            string[] proposedBcc,
            string[] allowed)
        {
            string malformed = FirstMalformed(proposedTo) ?? FirstMalformed(proposedCc) ?? FirstMalformed(proposedBcc);
            if (malformed != null) return "エラー: 宛先の形式が不正です。" + malformed;
            string nextSubject = proposedSubject == null ? null : MailHtml.StripMarks(proposedSubject).Trim();
            string nowSubject = MailHtml.StripMarks(currentSubject).Trim();
            bool subjectChanges = nextSubject != null && nextSubject.Length > 0
                && !string.Equals(nowSubject, nextSubject, StringComparison.Ordinal);
            bool toChanges = proposedTo != null && !SameAddresses(proposedTo, currentTo);
            bool ccChanges = proposedCc != null && !SameAddresses(proposedCc, currentCc);
            bool bccChanges = proposedBcc != null && !SameAddresses(proposedBcc, currentBcc);
            if ((subjectChanges || toChanges || ccChanges || bccChanges) && !headerApproved)
            {
                return "エラー: 件名または宛先の変更は、作業ウィンドウでの確認が必要です。";
            }
            return null;
        }

        public static string FirstMalformed(string[] proposed)
        {
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
                    if (!IsMailbox(piece)) return piece;
                }
            }
            return null;
        }

        public static bool IsMailbox(string value)
        {
            string smtp = MailParty.Smtp(MailHtml.StripMarks(value ?? ""));
            if (smtp.Length == 0 || smtp.Length > 254) return false;
            return Mailbox.IsMatch(smtp);
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
