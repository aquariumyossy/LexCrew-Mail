using KuruOutlook;

class TaskPaneNavigationTest
{
    static int Main()
    {
        Expect(TaskPaneNavigation.Allow("about:blank"), true);
        Expect(TaskPaneNavigation.Allow("https://127.0.0.1:28770/taskpane.html?v=1"), true);
        Expect(TaskPaneNavigation.Allow("http://127.0.0.1:28770/taskpane.html"), false);
        Expect(TaskPaneNavigation.Allow("https://localhost:28770/taskpane.html"), false);
        Expect(TaskPaneNavigation.Allow("https://127.0.0.1:443/taskpane.html"), false);
        Expect(TaskPaneNavigation.Allow("https://evil.example/taskpane.html"), false);
        Expect(TaskPaneNavigation.Allow("https://127.0.0.1.evil.example:28770/"), false);
        Expect(TaskPaneNavigation.Allow(""), false);
        Expect(TaskPaneNavigation.Allow(null), false);
        return 0;
    }

    static void Expect(bool actual, bool expected)
    {
        if (actual != expected)
        {
            throw new System.Exception(actual + " != " + expected);
        }
    }
}
