using System;
using System.Collections.Generic;
using System.Text;

namespace KuruOutlook
{
    public sealed class MailFileRow
    {
        public int Index;
        public string Name;
        public int Size;
        public string ContentId;
    }

    /// <summary>
    /// Which rows of the attachment well are worth reading. A picture the HTML
    /// body cites with cid: is a signature or an inline image, so it stays out.
    /// </summary>
    public static class MailFiles
    {
        public static bool IsBodyImage(string contentId, string html)
        {
            if (string.IsNullOrWhiteSpace(contentId) || string.IsNullOrEmpty(html))
            {
                return false;
            }
            string id = contentId.Trim().Trim('<', '>');
            if (id.Length == 0)
            {
                return false;
            }
            return html.IndexOf("cid:" + id, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static string Stamp(string entryId, IList<MailFileRow> rows)
        {
            if (string.IsNullOrEmpty(entryId) || rows == null)
            {
                return "";
            }
            var text = new StringBuilder(entryId);
            for (int i = 0; i < rows.Count; i++)
            {
                MailFileRow row = rows[i];
                if (row == null)
                {
                    continue;
                }
                text.Append('\n').Append(row.Index).Append('\t').Append(row.Name ?? "").Append('\t').Append(row.Size).Append('\t').Append(row.ContentId ?? "");
            }
            return text.ToString();
        }

        public static List<MailFileRow> Visible(IEnumerable<MailFileRow> rows, string html)
        {
            var kept = new List<MailFileRow>();
            if (rows == null)
            {
                return kept;
            }
            foreach (MailFileRow row in rows)
            {
                if (row == null || IsBodyImage(row.ContentId, html))
                {
                    continue;
                }
                kept.Add(row);
            }
            return kept;
        }
    }
}
