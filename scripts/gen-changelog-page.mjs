#!/usr/bin/env node
// Generate the MiseDeck changelog page for the owner's site repo.
//
// The site's changelog is derived from the published GitHub Releases, not
// hand-maintained: every MiseDeck release body is already bilingual
// ("## English" then "## 简体中文"), so this script splits each body at
// the Chinese heading and emits the two halves as sibling blocks — the
// shape the site's language toggle hides and shows.
//
// Usage:
//   node scripts/gen-changelog-page.mjs [--out <path>] [--repo <owner/name>]
//                                       [--limit <n>] [--site <dir>]
//
// Defaults: repo=cherishfall/misedeck, site=../cherishfall.github.io/misedeck,
// out=<site>/changelog.html. Requires `gh` on PATH and a logged-in session
// (the release bodies are read through the GitHub API).

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// `gh release list --json` has no `body` field, so the list comes from
// the release list and each body from the releases API.
const list = JSON.parse(
  gh(["release", "list", "--repo", REPO, "--limit", String(LIMIT), "--json", "tagName,name,publishedAt,isPrerelease"]),
);

const releases = list.map((r) => {
  let body = "";
  try {
    // `--jq .body` prints the raw body, not JSON.
    body = gh(["api", `repos/${REPO}/releases/tags/${r.tagName}`, "--jq", ".body"]);
  } catch (e) {
    body = "";
  }
  return { ...r, body };
});

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Inline markdown → HTML: code spans, bold, links. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

/**
 * Split one release body into its two language halves. A body is
 * "## English … ## 简体中文 …"; a body with only one half (or a custom
 * body) falls back to treating the whole thing as English.
 */
function splitBody(body) {
  const text = (body ?? "").replace(/\r\n/g, "\n");
  const zhIndex = text.search(/^##\s*简体中文\s*$/m);
  if (zhIndex < 0) {
    const enIndex = text.search(/^##\s*English\s*$/m);
    if (enIndex < 0) return { en: text.trim(), zh: "" };
    return {
      en: text.slice(enIndex).replace(/^##\s*English\s*$/m, "").trim(),
      zh: "",
    };
  }
  const enHead = text.slice(0, zhIndex);
  const zhHead = text.slice(zhIndex).replace(/^##\s*简体中文\s*$/m, "");
  const enIndex = enHead.search(/^##\s*English\s*$/m);
  return {
    en: (enIndex >= 0 ? enHead.slice(enIndex).replace(/^##\s*English\s*$/m, "") : enHead).trim(),
    zh: zhHead.trim(),
  };
}

/** One half of a release body → HTML: headings become h3, bullets lists. */
function halfToHtml(text, lang) {
  if (!text) return "";
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list && list.length) {
      blocks.push(`<ul lang="${lang}">\n${list.map((i) => `  <li>${inline(i)}</li>`).join("\n")}\n</ul>`);
    }
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      (list ??= []).push(bullet[1]);
      continue;
    }
    flush();
    const heading = line.match(/^#{2,3}\s+(.*)$/);
    if (heading) {
      blocks.push(`<h3 lang="${lang}">${inline(heading[1])}</h3>`);
      continue;
    }
    blocks.push(`<p lang="${lang}">${inline(line)}</p>`);
  }
  flush();
  return blocks.join("\n");
}

const sections = releases.map((r) => {
  const version = r.tagName.replace(/^v/, "");
  const id = `v${version.replace(/\./g, "-")}`;
  const { en, zh } = splitBody(r.body);
  const badge = r.isPrerelease
    ? '<span class="rel-tag"><span lang="zh-CN">预发布</span><span lang="en">Pre-release</span></span>'
    : "";
  return `<section class="rel" id="${id}">
  <h2 class="rel-h"><span class="rel-ver">${version}</span>${badge}<time class="rel-date" datetime="${r.publishedAt.slice(0, 10)}">${r.publishedAt.slice(0, 10)}</time></h2>
${halfToHtml(en, "en")}
${halfToHtml(zh, "zh-CN")}
</section>`;
});

const stable = releases.filter((r) => !r.isPrerelease);
const latest = stable[0] ?? releases[0];
const latestVersion = latest.tagName.replace(/^v/, "");
const latestDate = latest.publishedAt.slice(0, 10);

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
        <nav aria-label="主导航">
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
            <span lang="zh-CN">最新版本 ${latestVersion} · ${latestDate} · 共 ${releases.length} 个版本</span>
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

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${releases.length} releases, latest ${latestVersion})`);
