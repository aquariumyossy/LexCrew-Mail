using System;

namespace KuruOutlook
{
    public static class MailGate
    {
        public static string Mode(bool inspector, string messageClass, bool sent)
        {
            if (string.IsNullOrEmpty(messageClass))
            {
                return "none";
            }
            if (messageClass.StartsWith("IPM.Appointment", StringComparison.OrdinalIgnoreCase))
            {
                return "not-message";
            }
            if (!messageClass.StartsWith("IPM.Note", StringComparison.OrdinalIgnoreCase))
            {
                return "not-message";
            }
            if (inspector && !sent)
            {
                return "compose";
            }
            return "read";
        }
    }
}
