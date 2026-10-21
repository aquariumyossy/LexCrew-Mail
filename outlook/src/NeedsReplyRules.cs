using System;

namespace KuruOutlook
{
    public static class NeedsReplyRules
    {
        public const int MinDays = 1;
        public const int MaxDays = 30;
        public const int DefaultTake = 12;
        public const int MaxTake = 20;
        public const int DefaultBudgetMs = 350;
        public const int MaxBudgetMs = 800;
        public const int HardPass = 500;
        public const int BodyChars = 2000;
        public const int ReplyToSender = 102;
        public const int ReplyToAll = 103;
        public const int RepliedIcon = 261;

        public static int ClampInt(int value, int min, int max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        public static string RestrictSince(string field, DateTime start)
        {
            return field + " >= '" + start.ToString("yyyy/MM/dd HH:mm") + "'";
        }

        public static bool IsReplyVerb(int verb)
        {
            return verb == ReplyToSender || verb == ReplyToAll;
        }

        public static bool IsRepliedIcon(int icon)
        {
            return icon == RepliedIcon;
        }

        public static string Cap(string text, int max)
        {
            if (string.IsNullOrEmpty(text) || text.Length <= max) return text ?? "";
            return text.Substring(0, max);
        }
    }
}
