import { describe, expect, it } from "vitest";
import { sanitizeMailHtml, visibleMailText } from "./mailHtml";

describe("sanitizeMailHtml", () => {
  it("keeps the allowlisted tags and drops every attribute", () => {
    const clean = sanitizeMailHtml('<p style="color:red" onclick="alert(1)">色</p><br><strong>太</strong><em>斜</em>');
    expect(clean).toBe("<p>色</p><br><strong>太</strong><em>斜</em>");
    expect(clean).not.toContain("color");
    expect(clean).not.toContain("onclick");
  });

  it("keeps lists and drops links, images, and scripts", () => {
    const clean = sanitizeMailHtml(
      '<ul><li>一</li></ul><a href="http://evil.example">文</a><img src="http://evil.example/x.png" onerror="alert(1)"><script>alert(1)</script><p>残</p>'
    );
    expect(clean).toContain("<ul><li>一</li></ul>");
    expect(clean).toContain("<p>残</p>");
    expect(clean).toContain("文");
    expect(clean).not.toContain("href");
    expect(clean).not.toContain("img");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("evil");
    expect(clean).not.toContain("alert");
  });

  it("escapes plain text instead of treating a stray angle bracket as html", () => {
    expect(sanitizeMailHtml("a < b & c")).toBe("<p>a &lt; b &amp; c</p>");
  });

  it("does not wrap a br fragment in a paragraph", () => {
    expect(sanitizeMailHtml("先生方<br><br>本文")).toBe("先生方<br><br>本文");
  });

  it("drops hidden elements, comments, and style blocks", () => {
    const clean = sanitizeMailHtml(
      '<style>.x{background:url(http://evil.example)}</style><!-- 隠し --><div style="display:none">秘密</div><span hidden>属性</span><p>本文</p>'
    );
    expect(clean).toBe("<p>本文</p>");
    expect(clean).not.toContain("秘密");
    expect(clean).not.toContain("url");
  });

  it("drops a tag that smuggles an event handler onto the name", () => {
    const clean = sanitizeMailHtml("<p/onmouseover=alert(1)>本文</p>");
    expect(clean).toContain("本文");
    expect(clean).not.toContain("onmouseover");
    expect(clean).not.toContain("alert");
  });
});

describe("visibleMailText", () => {
  it("keeps readable text and drops head, style, and entities", () => {
    const text = visibleMailText(
      "<html><head><style>.x{color:red}</style>MicrosoftInternetExplorer4</head><body><p>本文 &amp; 続き</p></body></html>"
    );
    expect(text).toBe("本文 & 続き");
  });

  it("removes text the reader cannot see", () => {
    const html = [
      '<span style="display:none">表示なし</span>',
      '<span style="visibility:hidden">不可視</span>',
      '<span style="font-size:0px">ゼロ</span>',
      '<font size="0">サイズ</font>',
      '<span style="opacity:0">透明</span>',
      '<span style="color:#ffffff">白文字</span>',
      '<span style="color:#ff0000;background:#ff0000">同色</span>',
      '<b hidden>属性</b>',
      '<span style="color:#ffffff;background:#000000">黒地の白</span>',
      "本文",
    ].join("");
    const text = visibleMailText(html);
    expect(text).toContain("本文");
    expect(text).toContain("黒地の白");
    for (const hidden of ["表示なし", "不可視", "ゼロ", "サイズ", "透明", "白文字", "同色", "属性"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("keeps a visible child inside white text", () => {
    const text = visibleMailText('<span style="color:#ffffff">隠<span style="color:#000000">見</span></span>');
    expect(text).not.toContain("隠");
    expect(text).toContain("見");
  });

  it("strips zero-width and bidi controls", () => {
    expect(visibleMailText("本\u200B文\u202E逆")).toBe("本文逆");
  });

  it("drops Word hidden text and one-point type, and keeps readable type", () => {
    const html = [
      "<html><head><style>",
      "<!--",
      "p.MsoNormal, li.MsoNormal, div.MsoNormal",
      "\t{margin:0mm;font-size:10.5pt;font-family:\"Yu Gothic\",sans-serif;}",
      "span.MsoHidden",
      "\t{mso-style-name:\"隠し文字\";mso-hide:all;}",
      "span.20",
      "\t{mso-hide:all;}",
      "-->",
      "</style>",
      "<!--[if gte mso 9]><style>span.Vanish{mso-hide:all}</style><![endif]-->",
      "</head><body>",
      "<p class=MsoNormal>見える本文です。<span class=MsoHidden>隠し文字の指示</span></p>",
      "<p class=MsoNormal><span class=20>数字クラスの隠し</span></p>",
      "<p class=MsoNormal><span class=Vanish>条件付き隠し</span></p>",
      "<p class=MsoNormal><span style='mso-hide: all'>直書きの隠し</span></p>",
      "<p class=MsoNormal><span style='MSO-HIDE:ALL !important'>大文字の隠し</span></p>",
      "<p class=MsoNormal><span style='font-size:1.0pt'>一ポイントの行<span style='font-size:12pt'>中の見える</span></span></p>",
      "<p class=MsoNormal><span style='FONT-SIZE: 1pt !important'>一点</span></p>",
      "<p class=MsoNormal><span style='font-size:0.5pt'>半分</span></p>",
      "<p class=MsoNormal><span style='font-size:2px'>極小ピクセル</span></p>",
      "<p class=MsoNormal><span style='font-size:0'>ゼロ単位なし</span></p>",
      "<p class=MsoNormal><span style='mso-hide:none'>隠さない</span></p>",
      "<p class=MsoNormal><span style='font-size:10.5pt'>十ポイント半</span></p>",
      "<p class=MsoNormal><span style='font-size:12px'>十二ピクセル</span></p>",
      "<p class=MsoNormal><span style='color:white'>白い行</span></p>",
      "<p class=MsoNormal>普通の行です。</p>",
      "</body></html>",
    ].join("\n");
    const text = visibleMailText(html);
    for (const hidden of [
      "隠し文字の指示",
      "数字クラスの隠し",
      "条件付き隠し",
      "直書きの隠し",
      "大文字の隠し",
      "一ポイントの行",
      "一点",
      "半分",
      "極小ピクセル",
      "ゼロ単位なし",
      "白い行",
    ]) {
      expect(text).not.toContain(hidden);
    }
    expect(text).toContain("隠さない");
    expect(text).toContain("中の見える");
    expect(text).toContain("見える本文です。");
    expect(text).toContain("十ポイント半");
    expect(text).toContain("十二ピクセル");
    expect(text).toContain("普通の行です。");
    expect(sanitizeMailHtml(html)).not.toContain("隠し文字の指示");
    expect(sanitizeMailHtml(html)).not.toContain("一ポイントの行");
    expect(sanitizeMailHtml(html)).toContain("見える本文です。");
  });
});
