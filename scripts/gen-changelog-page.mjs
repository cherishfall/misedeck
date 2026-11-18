#!/usr/bin/env node
// Generate the MiseDeck site pages for the owner's site repo.
//
// The changelog is derived from the published GitHub Releases, not
// hand-maintained: a MiseDeck release body is bilingual — "## English"
// then "## 简体中文", or "# MiseDeck v1.0.1" then "# MiseDeck 1.0.1（简体中文）"
// — so this script splits each body at its language marker and emits the
// two halves as sibling blocks, the shape the site's language toggle hides
// and shows. A body that carries one language only is rendered in both
// languages with a note that says the notes could not be split, never a
// claim about the release itself.
//
// The same release list drives the landing page's version chip and the
// install file names, so a release never leaves the site stale.
//
// The generator fails loudly instead of publishing something wrong: a
// release body it cannot read, an install file the release does not
// have, and a `brew install` command that survived into the page all
// stop the run before a file is written.
//
// Usage:
//   node scripts/gen-changelog-page.mjs [--out <path>] [--repo <owner/name>]
//                                       [--limit <n>] [--site <dir>]
//                                       [--index <path>]
//
// Defaults: repo=cherishfall/misedeck, site=../cherishfall.github.io/misedeck,
// out=<site>/changelog.html, index=<site>/index.html. Requires `gh` on PATH
// and a logged-in session (the release bodies are read through the GitHub API).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const REPO = arg("--repo", "cherishfall/misedeck");
const LIMIT = Number(arg("--limit", "40"));
const SITE = resolve(arg("--site", resolve(repoRoot, "../cherishfall.github.io/misedeck")));
const OUT = resolve(arg("--out", resolve(SITE, "changelog.html")));
const INDEX = resolve(arg("--index", resolve(SITE, "index.html")));

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// `gh release list --json` has no `body` field, so the list comes from
// the release list and each body (and its asset names) from the releases API.
const list = JSON.parse(
  gh(["release", "list", "--repo", REPO, "--limit", String(LIMIT), "--json", "tagName,name,publishedAt,isPrerelease"]),
);

// A body that could not be read is not a body without notes: it is a
// failure, and a page that says "this release has no notes" would be a
// lie. The failures are collected and reported before anything is written.
const fetchFailures = [];
const releases = list.map((r) => {
  let body = "";
  let assets = [];
  try {
    const release = JSON.parse(gh(["api", `repos/${REPO}/releases/tags/${r.tagName}`]));
    body = release.body ?? "";
    assets = (release.assets ?? []).map((a) => a.name);
  } catch (e) {
    fetchFailures.push({ tag: r.tagName, message: String(e.message).split("\n")[0] });
  }
  return { ...r, body, assets };
});

if (fetchFailures.length) {
  for (const failure of fetchFailures) {
    console.warn(`WARNING: could not read the release ${failure.tag}: ${failure.message}`);
  }
  throw new Error(
    `${fetchFailures.length} release(s) could not be read (${fetchFailures.map((f) => f.tag).join(", ")}) — ` +
      `the changelog would publish empty notes. Fix the access and run the generator again; nothing was written.`,
  );
}

const stable = releases.filter((r) => !r.isPrerelease);
const latest = stable[0] ?? releases[0];
const latestVersion = latest.tagName.replace(/^v/, "");
const latestDate = latest.publishedAt.slice(0, 10);

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Inline markdown → HTML: code spans, bold, links, and bare URLs.
 *
 * A code span is literal: it is neither marked up nor linkified, so a
 * URL inside one stays text. A URL that stands on its own — not inside
 * a markdown link — becomes a link.
 *
 * The code spans are parked behind a sentinel before the text is
 * marked up, so a bold run that spans one — "**reads `mise -C $HOME`**"
 * — is still bold, and the span's own content is never marked up.
 */
function inline(text) {
  const spans = [];
  const parked = String(text).replace(/`([^`]+)`/g, (_, code) => {
    spans.push(`<code>${esc(code)}</code>`);
    return `\u0000C${spans.length - 1}\u0000`;
  });
  return inlineText(parked).replace(/\u0000C(\d+)\u0000/g, (_, i) => spans[Number(i)]);
}

function inlineText(text) {
  const s = esc(text);
  // A markdown link: its URL leaves the text stream first, so the
  // bare-URL pass below cannot linkify it a second time.
  const links = [];
  let out = s.replace(/\[([^\]]+)\]\((https?:[^)\s\u0000]+)\)/g, (_, label, url) => {
    links.push(`<a href="${url}" rel="noopener">${label}</a>`);
    return `\u0000L${links.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // A bare URL.
  out = out.replace(/https?:\/\/[^\s<>"'`\u0000]+/g, (url) => {
    let trimmed = url.replace(/[.,;:!?。，；：！？、）】》」』]+$/, "");
    if (trimmed.endsWith(")") && !trimmed.includes("(")) trimmed = trimmed.slice(0, -1);
    if (!trimmed) return url;
    return `<a href="${trimmed}" rel="noopener">${trimmed}</a>${url.slice(trimmed.length)}`;
  });
  return out.replace(/\u0000L(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

// A fenced code block: three or more backticks or tildes at the start
// of a line — after the blockquote markers a fenced block inside a
// quote carries. Everything between the markers is literal text.
const FENCE = /^\s*(?:>\s*)*(?:`{3,}|~{3,})/;
// The blockquote markers a line inside a quote carries.
const QUOTE = /^\s*(?:>\s*)+/;

/**
 * The body of a fenced block that starts at `start`: its lines without
 * the blockquote markers, and the index of the closing fence.
 */
function fenceBody(lines, start) {
  const body = [];
  let j = start;
  while (j < lines.length && !FENCE.test(lines[j].trim())) {
    body.push(lines[j].replace(QUOTE, ""));
    j += 1;
  }
  return { body, closing: j };
}

/**
 * Normalise a line of a release body before it is tested for an install
 * command: drop the list marker and the shell prompt, and unwrap an
 * inline code span that makes up the whole line.
 *
 * The neutraliser and the guard use this one helper, so a command
 * cannot be one thing to the neutraliser and another to the guard.
 */
function normaliseCommandLine(line) {
  let text = String(line).trim();
  let previous = "";
  while (text !== previous) {
    previous = text;
    // A list marker: "- ", "* ", "+ ", "1. ", "1) ".
    text = text.replace(/^(?:[-*+]|\d+[.)])[ \t]+/, "");
    // A shell prompt: "$ ", "> ", "❯ ".
    text = text.replace(/^(?:[$>❯][ \t]*)+/, "");
    text = text.trim();
  }
  // An inline code span that IS the whole line.
  const span = /^`([^`]+)`$/.exec(text);
  if (span) text = span[1].trim();
  return text;
}

/**
 * Is this line a `brew install` COMMAND (not a mention of one)?
 *
 * A line is a command when, after normalisation, the whole line IS
 * that command: it starts with `brew install` and continues as command
 * arguments. A release note may legitimately mention that the command
 * is gone — "the historical `brew install …` line is gone" — and such a
 * sentence does not start with the command, so it is left alone.
 */
function isBrewInstallCommand(line) {
  const text = normaliseCommandLine(line);
  const m = /^brew\s+install\b(.*)$/i.exec(text);
  if (!m) return false;
  const tail = m[1].trim();
  if (!tail) return true;
  // Sentence punctuation or a dash: the line continues in prose.
  if (/[.,;:!?。，；：！？]\s/.test(tail)) return false;
  if (/[—–]/.test(tail)) return false;
  // Two plain words in a row read as prose, not as arguments.
  let run = 0;
  for (const token of tail.split(/\s+/)) {
    if (/^[a-z][a-z']*$/.test(token)) {
      run += 1;
      if (run >= 2) return false;
    } else {
      run = 0;
    }
  }
  return true;
}

/**
 * A release body may name an install channel that no longer exists:
 * v1.0.0-beta.2 published `brew install --cask cherishfall/tap/misedeck`
 * while the tap repo is 404 — v1 ships no tap (ADR-0002). The page must
 * not offer a command that cannot work, so the command is replaced by a
 * note that says the channel is gone. Every other line of the body is
 * kept as it is.
 */
const DEAD_MARKER = "MISEDECK_DEAD_CHANNEL_MARKER";
const DEAD_CHANNEL_NOTE = `<p class="rel-dead"><span lang="zh-CN">（这条 Homebrew 安装命令已经失效：MiseDeck v1 只通过 GitHub Releases 分发。）</span><span lang="en">(This Homebrew command no longer works: MiseDeck v1 ships through GitHub Releases only.)</span></p>`;
// The same note, inside the half that is only a fallback: it is hidden
// and shown with the rest of that half.
function deadChannelNote(extraClass = "") {
  if (!extraClass) return DEAD_CHANNEL_NOTE;
  return DEAD_CHANNEL_NOTE.replace('class="rel-dead"', `class="rel-dead ${extraClass}"`);
}
// The placeholder for a dead command inside a fence that holds more
// than the dead command. It must not read as a command itself.
const DEAD_FENCE_NOTE = "# [the Homebrew command no longer works: MiseDeck v1 ships through GitHub Releases only]";

/**
 * Replace every dead install command of a half with the marker line; a
 * fenced block that holds nothing else goes as a whole, and a dead
 * command inside a fence that holds more becomes a comment. Every other
 * line is left exactly as it is.
 */
function neutraliseDeadChannels(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (FENCE.test(line.trim())) {
      const { body, closing } = fenceBody(lines, i + 1);
      const end = closing < lines.length ? closing : lines.length;
      const commands = body.filter((l) => l.trim());
      if (commands.length && commands.every((l) => isBrewInstallCommand(l))) {
        out.push(DEAD_MARKER);
      } else {
        out.push(line);
        for (const l of body) out.push(isBrewInstallCommand(l) ? DEAD_FENCE_NOTE : l);
        if (end < lines.length) out.push(lines[end]);
      }
      i = end < lines.length ? end + 1 : lines.length;
      continue;
    }
    out.push(isBrewInstallCommand(line) ? DEAD_MARKER : line);
    i += 1;
  }
  return out.join("\n");
}

/**
 * The language marker of a release body is a heading that IS a language
 * name — `## English`, `## 简体中文`, `## English:`, `## MiseDeck 1.0.1
 * （简体中文）` — not a heading that merely mentions one. The heading may
 * carry a title ("MiseDeck 1.0.1（简体中文）"); the title is kept.
 */
const LANGUAGE_NAMES = [
  { name: "English", lang: "en" },
  { name: "简体中文", lang: "zh" },
  { name: "中文", lang: "zh" },
];

function languageOfHeading(text) {
  let t = text.trim();
  t = t.replace(/[：:]\s*$/, "").trim();
  t = t.replace(/[）)]\s*$/, "").trim();
  for (const { name, lang } of LANGUAGE_NAMES) {
    if (t === name) return { lang, title: "" };
    const m = new RegExp(`^(.*?)[\\s（(]${name}$`).exec(t);
    if (m) return { lang, title: m[1].replace(/[（(\s]+$/, "").trim() };
  }
  return null;
}

/**
 * Split a release body at its language marker.
 *
 * The English half is what precedes the Chinese marker, the Chinese
 * half what follows it. Content that precedes the first marker belongs
 * to neither half: it is kept in the preceding (English) half and the
 * split says so, because nothing may be dropped. A heading inside a
 * fenced code block is not a heading, so it is never a marker.
 */
function splitBody(body) {
  const text = (body ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const markers = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line.trim())) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) return;
    const lang = languageOfHeading(m[2]);
    if (lang) markers.push({ index: i, ...lang });
  });
  const zhHead = markers.find((h) => h.lang === "zh");
  const enHead = markers.find((h) => h.lang === "en");
  const slice = (from, to) =>
    lines.slice(from, to === undefined ? lines.length : to).join("\n").trim();
  const withTitle = (half, title) => (title ? `${title}\n\n${half}`.trim() : half);

  if (enHead && zhHead) {
    const first = enHead.index < zhHead.index ? enHead : zhHead;
    const pre = slice(0, first.index);
    let en;
    let zh;
    if (enHead.index < zhHead.index) {
      en = slice(enHead.index + 1, zhHead.index);
      zh = slice(zhHead.index + 1);
    } else {
      en = slice(enHead.index + 1);
      zh = slice(zhHead.index + 1, enHead.index);
    }
    if (pre) {
      console.warn(
        `a release body has ${pre.split("\n").length} line(s) before its language marker — ` +
          `they were kept in the English half`,
      );
      en = `${pre}\n\n${en}`.trim();
    }
    return { en: withTitle(en, enHead.title), zh: withTitle(zh, zhHead.title) };
  }
  if (zhHead) {
    // Only a Chinese marker: everything before it is the English half.
    return { en: slice(0, zhHead.index), zh: withTitle(slice(zhHead.index + 1), zhHead.title) };
  }
  if (enHead) {
    // Only an English marker: the content before it belongs to neither
    // half either, so it is kept in the English half and the split says so.
    const pre = slice(0, enHead.index);
    const en = slice(enHead.index + 1);
    if (pre) {
      console.warn(
        `a release body has ${pre.split("\n").length} line(s) before its language marker — ` +
          `they were kept in the English half`,
      );
      return { en: withTitle(`${pre}\n\n${en}`, enHead.title), zh: "" };
    }
    return { en: withTitle(en, enHead.title), zh: "" };
  }
  return { en: text.trim(), zh: "" };
}

/**
 * One half of a release body → HTML: headings become h3, bullets lists,
 * fenced code becomes a code block. A heading inside a fence is part of
 * the code, never a heading.
 *
 * `lang` may be empty — then no `lang` attribute is written; its
 * visibility is decided by the `rel-fallback-*` class instead.
 */
function halfToHtml(text, lang, extraClass = "") {
  if (!text) return "";
  const attr = lang ? ` lang="${lang}"` : "";
  const cls = extraClass ? ` class="${extraClass}"` : "";
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list && list.length) {
      blocks.push(`<ul${attr}${cls}>\n${list.map((i) => `  <li>${inline(i)}</li>`).join("\n")}\n</ul>`);
    }
    list = null;
  };
  const lines = neutraliseDeadChannels(text).split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (FENCE.test(line)) {
      // A fenced code block: its content is literal text.
      flush();
      const { body, closing } = fenceBody(lines, i + 1);
      blocks.push(`<pre${attr}${cls}><code>${esc(body.join("\n"))}</code></pre>`);
      i = closing < lines.length ? closing + 1 : lines.length;
      continue;
    }
    if (!line) {
      flush();
      i += 1;
      continue;
    }
    if (line === DEAD_MARKER) {
      flush();
      blocks.push(deadChannelNote(extraClass));
      i += 1;
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      (list ??= []).push(bullet[1]);
      i += 1;
      continue;
    }
    flush();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(`<h3${attr}${cls}>${inline(heading[1])}</h3>`);
      i += 1;
      continue;
    }
    blocks.push(`<p${attr}${cls}>${inline(line)}</p>`);
    i += 1;
  }
  flush();
  return blocks.join("\n");
}

// A note that says what the generator knows: the notes could not be
// split per language. It never claims the release itself is single
// language — that is a fact about the release, and the generator has not
// checked it.
const SPLIT_NOTE = `<span lang="zh-CN">这次发布的说明未能按语言拆分，下面是原文。</span><span lang="en">These release notes could not be split by language; the original text follows.</span>`;
const NO_NOTES = `<p class="rel-note"><span lang="zh-CN">这次发布没有发布说明。</span><span lang="en">This release has no notes.</span></p>`;

const sections = releases.map((r) => {
  const version = r.tagName.replace(/^v/, "");
  const id = `v${version.replace(/\./g, "-")}`;
  const { en, zh } = splitBody(r.body);
  const badge = r.isPrerelease
    ? '<span class="rel-tag"><span lang="zh-CN">预发布</span><span lang="en">Pre-release</span></span>'
    : "";
  // A release whose body carries only one language must not look empty
  // in the other — and must not show twice in the language it does
  // have. The missing half is rendered with the other language's text
  // and a visibility class: `rel-fallback-en` shows only in English
  // mode, `rel-fallback-zh` only in Chinese mode (the CSS lives in
  // site.css). The fallback carries the `lang` of its own text, so a
  // screen reader reads it in the language it is written in.
  let enHtml = "";
  let zhHtml = "";
  let notes = "";
  if (!en && !zh) {
    notes = NO_NOTES;
  } else {
    enHtml = en ? halfToHtml(en, "en") : halfToHtml(zh, "zh-CN", "rel-fallback rel-fallback-en");
    zhHtml = zh ? halfToHtml(zh, "zh-CN") : halfToHtml(en, "en", "rel-fallback rel-fallback-zh");
    if (!zh) notes = `<p class="rel-note rel-fallback rel-fallback-zh">${SPLIT_NOTE}</p>`;
    else if (!en) notes = `<p class="rel-note rel-fallback rel-fallback-en">${SPLIT_NOTE}</p>`;
  }
  return `<section class="rel" id="${id}">
  <h2 class="rel-h"><span class="rel-ver">${version}</span>${badge}<time class="rel-date" datetime="${r.publishedAt.slice(0, 10)}">${r.publishedAt.slice(0, 10)}</time></h2>
${notes}
${enHtml}
${zhHtml}
</section>`;
});

const html = `<!-- Generated by the misedeck repo's scripts/gen-changelog-page.mjs from the
     published GitHub Releases — do not edit by hand. Re-run the generator
     after a release; the site's language toggle, header, and footer are
     shared with index.html (site.css). -->
<!doctype html>
<html
  lang="zh-CN"
  data-title-zh="MiseDeck · 更新日志"
  data-title-en="MiseDeck · Changelog"
  data-desc-zh="MiseDeck 的发布历史：每个版本的改动，双语记录。"
  data-desc-en="MiseDeck's release history: what changed in each version, in both languages."
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MiseDeck · 更新日志</title>
    <meta name="description" content="MiseDeck 的发布历史：每个版本的改动，双语记录。" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="MiseDeck · 更新日志" />
    <meta property="og:description" content="MiseDeck 的发布历史：每个版本的改动，双语记录。" />
    <meta property="og:image" content="https://cherishfall.github.io/misedeck/screens/en/tools.webp" />
    <meta property="og:image:width" content="1920" />
    <meta property="og:image:height" content="1292" />
    <link rel="canonical" href="https://cherishfall.github.io/misedeck/changelog.html" />
    <link rel="stylesheet" href="site.css" />
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%238B2252'/%3E%3Ctext x='16' y='22' font-family='Georgia,serif' font-size='18' fill='%23FDF8F3' text-anchor='middle'%3EM%3C/text%3E%3C/svg%3E"
    />
    <script>
      (function () {
        "use strict";
        try {
          if (localStorage.getItem("misedeck-lang") === "en") {
            document.documentElement.classList.add("lang-en");
            document.documentElement.lang = "en";
          }
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <a class="skip-link" href="#main"><span lang="zh-CN">跳到正文</span><span lang="en">Skip to content</span></a>

    <header class="site-head">
      <div class="container inner">
        <a class="brand" href="./">
          <img src="icon.svg" alt="" width="26" height="26" />
          MiseDeck
        </a>
        <nav aria-label="主导航" data-aria-zh="主导航" data-aria-en="Main navigation">
          <ul class="site-nav">
            <li><a href="index.html#features"><span lang="zh-CN">页面</span><span lang="en">Pages</span></a></li>
            <li><a href="index.html#panel"><span lang="zh-CN">执行面板</span><span lang="en">Execution panel</span></a></li>
            <li><a href="index.html#screens"><span lang="zh-CN">截图</span><span lang="en">Screens</span></a></li>
            <li><a href="index.html#install"><span lang="zh-CN">安装</span><span lang="en">Install</span></a></li>
            <li><a href="changelog.html"><span lang="zh-CN">更新日志</span><span lang="en">Changelog</span></a></li>
          </ul>
        </nav>
        <div class="head-right">
          <a class="ver-chip" href="https://github.com/${REPO}/releases/tag/v${latestVersion}">v${latestVersion}</a>
          <div class="lang-group" id="lang-group" role="group" aria-label="界面语言">
            <button type="button" id="lang-zh" aria-pressed="true">中文</button>
            <button type="button" id="lang-en" aria-pressed="false">English</button>
          </div>
        </div>
      </div>
    </header>

    <main id="main" class="section">
      <div class="container">
        <div class="page-head">
          <a class="back-link" href="./"><span lang="zh-CN">← 返回首页</span><span lang="en">← Back to home</span></a>
          <h1><span lang="zh-CN">更新日志</span><span lang="en">Changelog</span></h1>
          <p class="page-meta">
            <span lang="zh-CN">最新版本 ${latestVersion} · ${latestDate} · 共 ${releases.length} 个发布</span>
            <span lang="en">Latest version ${latestVersion} · ${latestDate} · ${releases.length} releases</span>
          </p>
        </div>

${sections.join("\n")}
      </div>
    </main>

    <footer class="site-foot">
      <div class="container inner">
        <a href="https://github.com/${REPO}">GitHub</a>
        <a href="./"><span lang="zh-CN">首页</span><span lang="en">Home</span></a>
        <a href="https://github.com/${REPO}/blob/master/LICENSE">MIT License</a>
        <span class="spacer">© 2026 cherishfall</span>
      </div>
    </footer>

    <script>
      (function () {
        "use strict";
        var KEY = "misedeck-lang";
        var root = document.documentElement;
        var btnZh = document.getElementById("lang-zh");
        var btnEn = document.getElementById("lang-en");
        var group = document.getElementById("lang-group");
        var nav = document.querySelector("nav[data-aria-zh]");

        function stored() {
          try {
            return localStorage.getItem(KEY);
          } catch (e) {
            return null;
          }
        }

        function apply(lang, persist) {
          var en = lang === "en";
          root.classList.toggle("lang-en", en);
          root.lang = en ? "en" : "zh-CN";
          btnZh.setAttribute("aria-pressed", en ? "false" : "true");
          btnEn.setAttribute("aria-pressed", en ? "true" : "false");
          document.title = en ? root.dataset.titleEn : root.dataset.titleZh;
          var desc = document.querySelector('meta[name="description"]');
          if (desc) desc.setAttribute("content", en ? root.dataset.descEn : root.dataset.descZh);
          var ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle) ogTitle.setAttribute("content", en ? root.dataset.titleEn : root.dataset.titleZh);
          var ogDesc = document.querySelector('meta[property="og:description"]');
          if (ogDesc) ogDesc.setAttribute("content", en ? root.dataset.descEn : root.dataset.descZh);
          if (group) group.setAttribute("aria-label", en ? "Language" : "界面语言");
          if (nav) nav.setAttribute("aria-label", en ? nav.dataset.ariaEn : nav.dataset.ariaZh);
          if (persist) {
            try {
              localStorage.setItem(KEY, lang);
            } catch (e) {}
          }
        }

        btnZh.addEventListener("click", function () {
          apply("zh", true);
        });
        btnEn.addEventListener("click", function () {
          apply("en", true);
        });

        var saved = stored();
        apply(saved === "en" ? "en" : saved === "zh" ? "zh" : root.lang === "en" ? "en" : "zh", false);
      })();
    </script>
  </body>
</html>
`;

// ---------------------------------------------------------------- guard ---
// A generated page must never offer an install command that cannot work:
// the Homebrew tap of v1.0.0-beta.2 is 404 and v1 ships no tap (ADR-0002).
//
// The check looks for a brew COMMAND (a line that runs `brew install`),
// not for the words: a release note may legitimately mention that the
// command is gone, and the dead-channel note itself names it. The same
// normalisation the neutraliser uses is applied here, and every line of
// the page is tested, so a command in the middle of the page cannot slip
// through.
function htmlToLines(html) {
  const block = "hr|pre|p|li|h[1-6]|ul|ol|section|div|blockquote|table|thead|tbody|tr|td|th|dl|dt|dd|figure|figcaption";
  return html
    .replace(new RegExp(`</?(?:${block})\\b[^>]*>`, "gi"), "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n");
}

function brewCommandsIn(text) {
  return htmlToLines(text).filter((line) => isBrewInstallCommand(line));
}

// The dead-channel note must not read as a command itself, or the guard
// would reject the page the neutraliser just wrote.
if (isBrewInstallCommand(DEAD_CHANNEL_NOTE)) {
  throw new Error("the dead-channel note reads as a `brew install` command — the guard would reject its own page");
}

const offenders = brewCommandsIn(html);
if (offenders.length) {
  throw new Error(
    `${OUT} still offers a "brew install" command — that channel does not exist:\n` +
      offenders.map((line) => `  ${line.trim()}`).join("\n"),
  );
}

/* -------------------------------------------------------------- landing --- */
// The landing page's version chip and the three install file names must
// track the release, not a hand-typed value: they are patched in place
// from the same release list the changelog uses, so a release never
// leaves the site stale. The file stays hand-maintained — only the values
// that must follow the release are rewritten.

const ASSET_SUFFIX = {
  macos: "_aarch64.dmg",
  windows: "_x64-setup.exe",
  linux: "_amd64.deb",
};

/**
 * The install file of one platform. The release must have it: a name
 * that was guessed here could name a file the release does not have,
 * so a missing asset stops the generator instead.
 */
function pickAsset(assets, suffix, platform, version) {
  const name = assets.find((n) => n.endsWith(suffix));
  if (!name) {
    throw new Error(
      `the release ${REPO} v${version} has no ${platform} install file (nothing ends in ${suffix}) — ` +
        `the landing page must not name a file the release does not have`,
    );
  }
  return name;
}

const installFiles = {};
for (const [platform, suffix] of Object.entries(ASSET_SUFFIX)) {
  installFiles[platform] = pickAsset(latest.assets, suffix, platform, latestVersion);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceOnce(text, re, replacement, what) {
  if (!re.test(text)) {
    throw new Error(`the landing page has no ${what} to update — the generator cannot keep it in sync`);
  }
  return text.replace(re, replacement);
}

function syncLandingPage(path, version, files) {
  if (!existsSync(path)) {
    console.warn(`skipped the landing page (not found: ${path})`);
    return;
  }
  const before = readFileSync(path, "utf8");
  let after = before;

  // The version chip: the version itself and the release page it links to.
  after = replaceOnce(
    after,
    /(<a class="ver-chip" href=")[^"]*(">)[^<]*(<\/a>)/,
    `$1https://github.com/${REPO}/releases/tag/v${version}$2v${version}$3`,
    "version chip",
  );

  // The three install file names: the real asset names of the release.
  for (const [platform, name] of Object.entries(files)) {
    const suffix = escapeRe(ASSET_SUFFIX[platform]);
    after = replaceOnce(
      after,
      new RegExp(`(<code class="file-name">)MiseDeck[_-][^<]*${suffix}(</code>)`),
      `$1${name}$2`,
      `${platform} install file name`,
    );
  }

  if (after === before) {
    console.log(`${path} already in sync (v${version})`);
    return;
  }
  writeFileSync(path, after);
  console.log(`synced ${path} (v${version}: ${Object.values(files).join(", ")})`);
}

// The landing page is part of the site too: it must not offer a command
// that cannot work either.
if (existsSync(INDEX)) {
  const landingOffenders = brewCommandsIn(readFileSync(INDEX, "utf8"));
  if (landingOffenders.length) {
    throw new Error(
      `${INDEX} still offers a "brew install" command — that channel does not exist:\n` +
        landingOffenders.map((line) => `  ${line.trim()}`).join("\n"),
    );
  }
}

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${releases.length} releases, latest ${latestVersion})`);

syncLandingPage(INDEX, latestVersion, installFiles);
