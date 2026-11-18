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

const releases = list.map((r) => {
  let body = "";
  let assets = [];
  try {
    const release = JSON.parse(gh(["api", `repos/${REPO}/releases/tags/${r.tagName}`]));
    body = release.body ?? "";
    assets = (release.assets ?? []).map((a) => a.name);
  } catch (e) {
    body = "";
  }
  return { ...r, body, assets };
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
 * The language marker of a release body is a heading — at any level —
 * that names the language: `## 简体中文`, `# MiseDeck 1.0.1（简体中文）`,
 * `## English`. The Chinese half is everything after the Chinese marker;
 * the English half is what precedes it, or what follows an `English`
 * marker when the body carries no Chinese marker at all.
 */
const ZH_MARKER = /中文/;
const EN_MARKER = /^English\b/i;

function splitBody(body) {
  const text = (body ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const headings = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) headings.push({ index: i, text: m[2] });
  });
  const zhHead = headings.find((h) => ZH_MARKER.test(h.text));
  const enHead = headings.find((h) => EN_MARKER.test(h.text));
  const slice = (from, to) => lines.slice(from, to === undefined ? lines.length : to).join("\n").trim();
  if (zhHead) {
    if (enHead && enHead.index < zhHead.index) {
      return { en: slice(enHead.index + 1, zhHead.index), zh: slice(zhHead.index + 1) };
    }
    if (enHead && enHead.index > zhHead.index) {
      return { en: slice(enHead.index + 1), zh: slice(zhHead.index + 1, enHead.index) };
    }
    return { en: slice(0, zhHead.index), zh: slice(zhHead.index + 1) };
  }
  if (enHead) return { en: slice(enHead.index + 1), zh: "" };
  return { en: text.trim(), zh: "" };
}

/**
 * A release body may name an install channel that no longer exists:
 * v1.0.0-beta.2 published `brew install --cask cherishfall/tap/misedeck`
 * while the tap repo is 404 — v1 ships no tap (ADR-0002). The page must
 * not offer a command that cannot work, so the command is replaced by a
 * note that says the channel is gone. Every other line of the body is
 * kept as it is.
 */
const DEAD_INSTALL = /^\s*(?:[$>]\s*)?brew\s+install\b/i;
const DEAD_MARKER = "MISEDECK_DEAD_CHANNEL_MARKER";
const DEAD_CHANNEL_NOTE = `<p class="rel-dead"><span lang="zh-CN">（这条 Homebrew 安装命令已经失效：MiseDeck v1 只通过 GitHub Releases 分发。）</span><span lang="en">(This Homebrew command no longer works: MiseDeck v1 ships through GitHub Releases only.)</span></p>`;

/**
 * Replace every dead install command of a half with the marker line; a
 * fenced block that holds nothing else goes as a whole. Every other line
 * is left exactly as it is.
 */
function neutraliseDeadChannels(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      let j = i + 1;
      const body = [];
      while (j < lines.length && !/^```/.test(lines[j].trim())) {
        body.push(lines[j]);
        j += 1;
      }
      const commands = body.filter((l) => l.trim());
      if (commands.length && commands.every((l) => DEAD_INSTALL.test(l))) {
        out.push(DEAD_MARKER);
        i = j < lines.length ? j + 1 : lines.length;
        continue;
      }
      out.push(line);
      i += 1;
      continue;
    }
    out.push(DEAD_INSTALL.test(line) ? DEAD_MARKER : line);
    i += 1;
  }
  return out.join("\n");
}

/**
 * One half of a release body → HTML: headings become h3, bullets lists.
 * `lang` may be empty — then no `lang` attribute is written (the
 * fallback half, which carries the other language's text); its
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
  for (const raw of neutraliseDeadChannels(text).split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line === DEAD_MARKER) {
      flush();
      blocks.push(DEAD_CHANNEL_NOTE);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      (list ??= []).push(bullet[1]);
      continue;
    }
    flush();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(`<h3${attr}${cls}>${inline(heading[1])}</h3>`);
      continue;
    }
    blocks.push(`<p${attr}${cls}>${inline(line)}</p>`);
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
  // site.css).
  let enHtml = "";
  let zhHtml = "";
  let notes = "";
  if (!en && !zh) {
    notes = NO_NOTES;
  } else {
    enHtml = en ? halfToHtml(en, "en") : halfToHtml(zh, "", "rel-fallback rel-fallback-en");
    zhHtml = zh ? halfToHtml(zh, "zh-CN") : halfToHtml(en, "", "rel-fallback rel-fallback-zh");
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

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${releases.length} releases, latest ${latestVersion})`);

// ---------------------------------------------------------------- guard ---
// A generated page must never offer an install command that cannot work:
// the Homebrew tap of v1.0.0-beta.2 is 404 and v1 ships no tap (ADR-0002).
//
// The check looks for a brew COMMAND (a line that runs `brew install`),
// not for the words: a release note may legitimately mention that the
// command is gone, and the dead-channel note itself names it.
if (DEAD_INSTALL.test(html.replace(/<[^>]+>/g, "\n"))) {
  throw new Error(`${OUT} still offers a "brew install" command — that channel does not exist`);
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

function pickAsset(assets, suffix, fallback) {
  return assets.find((name) => name.endsWith(suffix)) ?? fallback;
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

function syncLandingPage(path, version, assets) {
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
  const files = {
    macos: pickAsset(assets, ASSET_SUFFIX.macos, `MiseDeck_${version}_aarch64.dmg`),
    windows: pickAsset(assets, ASSET_SUFFIX.windows, `MiseDeck_${version}_x64-setup.exe`),
    linux: pickAsset(assets, ASSET_SUFFIX.linux, `MiseDeck_${version}_amd64.deb`),
  };
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

syncLandingPage(INDEX, latestVersion, latest.assets);
