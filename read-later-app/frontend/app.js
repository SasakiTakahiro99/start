const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, null: 3, undefined: 3 };

let allArticles = [];

async function loadStatus() {
  const badge = document.getElementById("llm-badge");
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.llm_configured) {
      badge.textContent = "AI要約: 有効";
      badge.className = "badge on";
    } else {
      badge.textContent = "AI要約: 無効(ANTHROPIC_API_KEY未設定)";
      badge.className = "badge off";
    }
  } catch (e) {
    badge.textContent = "状態取得エラー";
  }
}

async function loadArticles() {
  const res = await fetch("/api/articles");
  const data = await res.json();
  allArticles = data.articles;
  populateTagFilter();
  render();
}

function populateTagFilter() {
  const select = document.getElementById("filter-tag");
  const current = select.value;
  const tags = new Set();
  allArticles.forEach((a) => (a.tags || []).forEach((t) => tags.add(t)));
  select.innerHTML = '<option value="">すべて</option>';
  [...tags].sort().forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
  if ([...tags].includes(current)) select.value = current;
}

function render() {
  const listEl = document.getElementById("article-list");
  const readFilter = document.getElementById("filter-read").value;
  const tagFilter = document.getElementById("filter-tag").value;
  const sortOrder = document.getElementById("sort-order").value;

  let items = allArticles.filter((a) => {
    if (readFilter === "unread" && a.is_read) return false;
    if (readFilter === "read" && !a.is_read) return false;
    if (tagFilter && !(a.tags || []).includes(tagFilter)) return false;
    return true;
  });

  items = [...items].sort((a, b) => {
    if (sortOrder === "date_asc") return a.created_at.localeCompare(b.created_at);
    if (sortOrder === "priority") {
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return b.created_at.localeCompare(a.created_at);
    }
    return b.created_at.localeCompare(a.created_at); // date_desc
  });

  if (items.length === 0) {
    listEl.innerHTML = '<p class="empty-hint">該当する記事がありません</p>';
    return;
  }

  listEl.innerHTML = "";
  items.forEach((a) => listEl.appendChild(renderCard(a)));
}

function renderCard(a) {
  const card = document.createElement("div");
  card.className = "card" + (a.is_read ? " read" : "");

  const header = document.createElement("div");
  header.className = "card-header";

  const titleBlock = document.createElement("div");
  const title = document.createElement("p");
  title.className = "card-title";
  const link = document.createElement("a");
  link.href = a.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = a.title || a.url;
  title.appendChild(link);
  const urlP = document.createElement("p");
  urlP.className = "card-url";
  urlP.textContent = a.url;
  titleBlock.appendChild(title);
  titleBlock.appendChild(urlP);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const readBtn = document.createElement("button");
  readBtn.textContent = a.is_read ? "未読に戻す" : "既読にする";
  readBtn.addEventListener("click", () => toggleRead(a.id, !a.is_read));
  actions.appendChild(readBtn);

  header.appendChild(titleBlock);
  header.appendChild(actions);
  card.appendChild(header);

  if (a.llm_status === "done") {
    const summary = document.createElement("p");
    summary.className = "card-summary";
    summary.textContent = a.summary;
    card.appendChild(summary);

    const meta = document.createElement("div");
    meta.className = "meta-row";
    if (a.priority) {
      const pill = document.createElement("span");
      pill.className = "priority-pill priority-" + a.priority;
      pill.textContent = "優先度: " + (PRIORITY_LABEL[a.priority] || a.priority);
      meta.appendChild(pill);
    }
    (a.tags || []).forEach((t) => {
      const tag = document.createElement("span");
      tag.className = "tag-pill";
      tag.textContent = t;
      meta.appendChild(tag);
    });
    card.appendChild(meta);
  } else if (a.llm_status === "pending") {
    const note = document.createElement("p");
    note.className = "status-text";
    note.textContent = "要約を生成中、または未生成です。";
    card.appendChild(note);
    card.appendChild(retryButton(a.id));
  } else if (a.llm_status === "failed") {
    const note = document.createElement("p");
    note.className = "llm-note";
    note.textContent = "要約生成に失敗しました: " + (a.error_message || "不明なエラー");
    card.appendChild(note);
    card.appendChild(retryButton(a.id));
  }

  return card;
}

function retryButton(articleId) {
  const btn = document.createElement("button");
  btn.textContent = "要約を生成";
  btn.style.marginTop = "6px";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "生成中...";
    try {
      const res = await fetch(`/api/articles/${articleId}/retry-summary`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("要約生成に失敗しました: " + (err.detail || res.statusText));
      }
    } catch (e) {
      alert("通信エラーが発生しました");
    }
    await loadArticles();
  });
  return btn;
}

async function toggleRead(articleId, isRead) {
  const form = new URLSearchParams();
  form.set("is_read", isRead ? "true" : "false");
  await fetch(`/api/articles/${articleId}/read`, { method: "POST", body: form });
  await loadArticles();
}

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("url-input");
  const statusEl = document.getElementById("add-status");
  const submitBtn = e.target.querySelector("button");
  const url = input.value.trim();
  if (!url) return;

  submitBtn.disabled = true;
  statusEl.className = "status-text";
  statusEl.textContent = "登録中(本文取得・要約生成には数秒〜十数秒かかります)...";

  try {
    const form = new URLSearchParams();
    form.set("url", url);
    const res = await fetch("/api/articles", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      statusEl.className = "status-text error";
      statusEl.textContent = data.detail || "登録に失敗しました";
    } else {
      statusEl.textContent = "登録しました";
      input.value = "";
      await loadArticles();
    }
  } catch (err) {
    statusEl.className = "status-text error";
    statusEl.textContent = "通信エラーが発生しました";
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("filter-read").addEventListener("change", render);
document.getElementById("filter-tag").addEventListener("change", render);
document.getElementById("sort-order").addEventListener("change", render);

loadStatus();
loadArticles();
