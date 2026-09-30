export const DISCLAIMER =
  "できた文面は下書きであり、法律意見ではありません。メールに入るのは、まだ送っていない作成中のメールへ入れた本文だけです。根拠にできるのは、ウェブ検索の結果、Argos で選んだフォルダの資料、予定表の件名と場所だけです。";

export type LibraryNotice = {
  name: string;
  license: string;
  copyright: string;
  choice?: string;
};

export type AboutFeature = {
  title: string;
  body: string;
};

export const aboutCopy = {
  title: "LexCrew Mail について",
  buttonLabel: "このアプリについて",
  overview: [
    "Outlook のメール画面で、返信の下書きや文面の直しができます。やりたいことを書くと、開いているメールを読んで文面を整えます。送信はしません。",
    DISCLAIMER,
  ],
  features: [
    {
      title: "指示して文面を作る",
      body: "入力欄に「返信の下書きを書いて」「この文面を短くして」と書くと、開いているメールの文面を作ります。署名と、その下の引用はそのまま残します。チャットに出た文章はメールには入りません。",
    },
    {
      title: "御礼・承諾・お断り・日程調整",
      body: "ボタンを押すと、その種類の返信をすぐ作れます。日程調整では、空いている時間だけを候補にします。",
    },
    {
      title: "参考にする情報",
      body: "ウェブ検索、入力欄の argos で選んだフォルダの資料、これまでに送ったメールの言い回しを参考にできます。",
    },
    {
      title: "予定",
      body: "予定表から、空いている時間と、予定の件名と場所を読めます。上のカレンダーのアイコン（日程調整）で、空きを探す曜日、対応時間、枠の長さを決められます。",
    },
    {
      title: "ファイル",
      body: "クリップかドラッグ＆ドロップで付けたファイルの中身を読んで、文面に活かせます。開いているメールの添付は、設定の「メール添付ファイルを読む」がオンのときに読みます。",
    },
    {
      title: "履歴とコンテキスト",
      body: "「会話の履歴」から、前のやり取りに戻れます。「コンテキスト」には、いつも使うメモと、相手ごとのメモを残せます。",
    },
  ] satisfies AboutFeature[],
  licenseNote: "実行時に読み込むライブラリです。ライセンス全文は各パッケージに同梱しています。",
  licenses: [
    { name: "better-sqlite3", license: "MIT", copyright: "Copyright (c) 2017 Joshua Wise" },
    {
      name: "express",
      license: "MIT",
      copyright: "Copyright (c) 2009-2014 TJ Holowaychuk, 2013-2014 Roman Shtylman, 2014-2015 Douglas Christopher Wilson",
    },
    {
      name: "marked",
      license: "MIT",
      copyright: "Copyright (c) 2018- MarkedJS, 2011-2018 Christopher Jeffrey",
    },
    {
      name: "JSZip",
      license: "MIT",
      copyright: "Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso",
      choice: "MIT または GPL-3.0。本アプリは MIT。",
    },
    {
      name: "DOMPurify",
      license: "MPL-2.0 または Apache-2.0",
      copyright: "Copyright Cure53 and other contributors",
    },
    { name: "node-ical", license: "Apache-2.0", copyright: "Copyright Jens Maus" },
    { name: "pdf.js", license: "Apache-2.0", copyright: "Copyright 2024 Mozilla Foundation" },
    {
      name: "node-forge",
      license: "BSD-3-Clause",
      copyright: "Copyright (c) 2010 Digital Bazaar, Inc.",
      choice: "BSD-3-Clause または GPL-2.0。本アプリは BSD-3-Clause。",
    },
  ] satisfies LibraryNotice[],
  credit: "弁護士　吉田秀平",
};
