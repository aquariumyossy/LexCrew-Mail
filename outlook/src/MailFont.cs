using System;
using System.Collections.Generic;
using System.Globalization;

namespace KuruOutlook
{
    public sealed class MailFont
    {
        public static readonly MailFont Default = new MailFont("Yu Gothic", "游ゴシック", 10.5m);

        public readonly string Ascii;
        public readonly string FarEast;
        public readonly decimal SizePt;

        public MailFont(string ascii, string farEast, decimal sizePt)
        {
            Ascii = ascii;
            FarEast = farEast;
            SizePt = sizePt;
        }

        public static MailFont FromDraft(IDictionary<string, object> draft)
        {
            object raw;
            if (draft == null || !draft.TryGetValue("mailFont", out raw))
            {
                return Default;
            }
            var font = raw as IDictionary<string, object>;
            if (font == null)
            {
                return Default;
            }
            object ascii;
            object farEast;
            object size;
            if (!font.TryGetValue("ascii", out ascii) || !font.TryGetValue("fareast", out farEast) || !font.TryGetValue("sizePt", out size))
            {
                return Default;
            }
            string asciiName = ascii as string;
            string farEastName = farEast as string;
            if (string.IsNullOrWhiteSpace(asciiName) || string.IsNullOrWhiteSpace(farEastName))
            {
                return Default;
            }
            if (!(size is int || size is long || size is decimal || size is double || size is float))
            {
                return Default;
            }
            return new MailFont(asciiName, farEastName, Convert.ToDecimal(size, CultureInfo.InvariantCulture));
        }

        internal string Css()
        {
            string ascii = Q(Ascii);
            string farEast = Q(FarEast);
            return "font-size:" + SizePt.ToString("0.##", CultureInfo.InvariantCulture) + "pt;" +
                "font-family:" + ascii + "," + farEast + ",sans-serif;" +
                "mso-ascii-font-family:" + ascii + ";" +
                "mso-hansi-font-family:" + ascii + ";" +
                "mso-bidi-font-family:" + ascii + ";" +
                "mso-fareast-font-family:" + farEast;
        }

        static string Q(string name)
        {
            return "\"" + name.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("'", "\\27 ") + "\"";
        }
    }
}
