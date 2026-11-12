const state = {
  config: null,
  documents: [],
  documentText: new Map(),
};

const content = document.querySelector("#content");
const nav = document.querySelector("#site-nav");
const toc = document.querySelector("#toc");
const searchDialog = document.querySelector("#search-dialog");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const slugify = (value) => value
  .toLowerCase()
  .trim()
  .replace(/[^\p{L}\p{N}\s-]/gu, "")
  .replace(/[\s_-]+/g, "-")
  .replace(/^-+|-+$/g, "");

function safeUrl(url) {
  const cleaned = url.trim();
  if (/^(https?:\/\/|mailto:|#)/i.test(cleaned)) return cleaned;
  return "#";
}

function renderInline(text) {
  let html = escapeHtml(text);
  const codeTokens = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${escapeHtml(safeUrl(url))}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`);
  codeTokens.forEach((value, index) => { html = html.replace(`@@CODE${index}@@`, value); });
  return html;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const output = [];
  const headings = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLanguage = "";
  let code = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      flushParagraph(); closeList();
      if (!inCode) {
        inCode = true;
        codeLanguage = line.slice(3).trim();
        code = [];
      } else {
        output.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) { code.push(rawLine); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }

    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      const level = heading[1].length;
      const label = heading[2].replace(/[*_`]/g, "");
      const id = slugify(label) || `section-${headings.length + 1}`;
      headings.push({ level, label, id });
      output.push(`<h${level} id="${id}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { flushParagraph(); closeList(); output.push("<hr>"); continue; }
    if (line.startsWith("> ")) { flushParagraph(); closeList(); output.push(`<blockquote><p>${renderInline(line.slice(2))}</p></blockquote>`); continue; }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (listType !== type) { closeList(); listType = type; output.push(`<${type}>`); }
      output.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  if (inCode) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return { html: output.join("\n"), headings };
}

function setActiveNav(slug) {
  document.querySelectorAll("#site-nav a").forEach((link) => {
    const isHome = slug === "home" && link.classList.contains("nav-home");
    const isDoc = link.dataset.slug === slug;
    link.classList.toggle("active", isHome || isDoc);
  });
}

function closeMobileNav() {
  document.body.classList.remove("nav-open");
  document.querySelector("#menu-button").setAttribute("aria-expanded", "false");
}

function renderNav() {
  const grouped = Map.groupBy
    ? Map.groupBy(state.documents, (doc) => doc.category)
    : state.documents.reduce((map, doc) => map.set(doc.category, [...(map.get(doc.category) || []), doc]), new Map());
  let html = '<a class="nav-home" href="#home"><span aria-hidden="true">⌂</span>首页</a>';
  for (const [category, docs] of grouped) {
    html += `<section class="nav-section"><h2 class="nav-section-title">${escapeHtml(category)}</h2>`;
    html += docs.map((doc) => `<a class="nav-link" data-slug="${escapeHtml(doc.slug)}" href="#doc=${encodeURIComponent(doc.slug)}">${escapeHtml(doc.title)}</a>`).join("");
    html += "</section>";
  }
  nav.innerHTML = html;
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileNav));
}

function docCard(doc) {
  return `<a class="doc-card" href="#doc=${encodeURIComponent(doc.slug)}">
    <span class="category">${escapeHtml(doc.category)}</span>
    <span class="arrow" aria-hidden="true">↗</span>
    <h3>${escapeHtml(doc.title)}</h3>
    <p>${escapeHtml(doc.summary)}</p>
    <time datetime="${escapeHtml(doc.updated)}">更新于 ${escapeHtml(doc.updated)}</time>
  </a>`;
}

function renderHome() {
  document.title = `${state.config.title} · 首页`;
  setActiveNav("home");
  toc.innerHTML = "";
  const recent = [...state.documents].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4);
  content.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Personal knowledge base</p>
      <h1>把零散的思考，整理成<em>可以重访的路径</em>。</h1>
      <p>${escapeHtml(state.config.description)}</p>
      <div class="hero-actions">
        <a class="button primary" href="#doc=about">认识我</a>
        <button class="button" type="button" data-open-search>搜索文档</button>
      </div>
    </section>
    <section>
      <div class="section-heading"><h2>最近更新</h2><p>${recent.length} 篇公开内容</p></div>
      <div class="card-grid">${recent.map(docCard).join("")}</div>
    </section>`;
  content.querySelector("[data-open-search]").addEventListener("click", openSearch);
  window.scrollTo({ top: 0 });
}

async function getDocumentText(doc) {
  if (state.documentText.has(doc.slug)) return state.documentText.get(doc.slug);
  const response = await fetch(doc.file);
  if (!response.ok) throw new Error("document-not-found");
  const text = await response.text();
  state.documentText.set(doc.slug, text);
  return text;
}

async function renderDocument(slug) {
  const doc = state.documents.find((item) => item.slug === slug);
  if (!doc) return renderError("没有找到这篇文档", "它可能已更名、移动或尚未发布。");
  setActiveNav(slug);
  content.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>正在读取文档…</div>';
  try {
    const markdown = await getDocumentText(doc);
    const rendered = renderMarkdown(markdown);
    document.title = `${doc.title} · ${state.config.title}`;
    content.innerHTML = `
      <header class="doc-header">
        <p class="eyebrow">${escapeHtml(doc.category)}</p>
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="doc-summary">${escapeHtml(doc.summary)}</p>
        <div class="doc-meta"><span class="category-pill">${escapeHtml(doc.category)}</span><time datetime="${escapeHtml(doc.updated)}">最后更新：${escapeHtml(doc.updated)}</time><span>约 ${Math.max(1, Math.ceil(markdown.length / 500))} 分钟阅读</span></div>
      </header>
      <article class="prose">${rendered.html}</article>`;
    toc.innerHTML = rendered.headings.length
      ? `<p class="toc-title">本页目录</p>${rendered.headings.map((item) => `<a href="#${item.id}" style="padding-left:${item.level === 3 ? 22 : 12}px">${escapeHtml(item.label)}</a>`).join("")}`
      : "";
    window.scrollTo({ top: 0 });
  } catch {
    renderError("文档暂时无法打开", "请稍后重试，或先返回首页阅读其他内容。");
  }
}

function renderError(title, message) {
  document.title = `${title} · ${state.config?.title || "个人文档"}`;
  toc.innerHTML = "";
  content.innerHTML = `<div class="error-state"><p class="eyebrow">Something went quiet</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button primary" href="#home">返回首页</a></div>`;
}

function route() {
  closeMobileNav();
  const hash = location.hash.slice(1);
  if (!hash || hash === "home") return renderHome();
  if (hash.startsWith("doc=")) return renderDocument(decodeURIComponent(hash.slice(4)));
  if (document.getElementById(hash)) return;
  renderError("页面不存在", "请从导航中选择一篇已发布的文档。");
}

function openSearch() {
  if (!searchDialog.open) searchDialog.showModal();
  requestAnimationFrame(() => searchInput.focus());
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escapedQuery})`, "ig"), "<mark>$1</mark>");
}

async function search(query) {
  const term = query.trim().toLowerCase();
  if (!term) {
    searchResults.innerHTML = '<p class="search-hint">输入关键词，快速找到一篇文档。</p>';
    return;
  }
  const candidates = await Promise.all(state.documents.map(async (doc) => {
    let text = "";
    try { text = await getDocumentText(doc); } catch { /* keep metadata searchable */ }
    const haystack = `${doc.title} ${doc.summary} ${text}`.toLowerCase();
    const score = (doc.title.toLowerCase().includes(term) ? 5 : 0) + (doc.summary.toLowerCase().includes(term) ? 3 : 0) + (haystack.includes(term) ? 1 : 0);
    return { doc, score };
  }));
  const matches = candidates.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  searchResults.innerHTML = matches.length
    ? matches.map(({ doc }) => `<a class="search-result" href="#doc=${encodeURIComponent(doc.slug)}"><strong>${highlight(doc.title, term)}</strong><span>${highlight(doc.summary, term)}</span></a>`).join("")
    : `<div class="empty-state"><strong>未找到相关文档</strong><span>换一个关键词试试。</span></div>`;
  searchResults.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => searchDialog.close()));
}

function bindEvents() {
  window.addEventListener("hashchange", route);
  document.querySelector("#search-button").addEventListener("click", openSearch);
  searchInput.addEventListener("input", (event) => search(event.target.value));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
    if (event.key === "Escape" && document.body.classList.contains("nav-open")) closeMobileNav();
  });
  document.querySelector("#theme-button").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("docs-theme", next);
  });
  document.querySelector("#menu-button").addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    document.querySelector("#menu-button").setAttribute("aria-expanded", String(open));
  });
  document.querySelector("#sidebar-backdrop").addEventListener("click", closeMobileNav);
}

async function init() {
  bindEvents();
  try {
    const response = await fetch("content/manifest.json");
    if (!response.ok) throw new Error("manifest-not-found");
    const data = await response.json();
    state.config = data.site;
    state.documents = data.documents.filter((doc) => doc.published);
    document.querySelector("#site-title").textContent = data.site.title;
    document.querySelector("#site-tagline").textContent = data.site.tagline;
    renderNav();
    route();
  } catch {
    state.config = { title: "我的个人文档" };
    renderError("网站内容尚未就绪", "请确认 content/manifest.json 文件存在且格式正确。");
  }
}

init();
