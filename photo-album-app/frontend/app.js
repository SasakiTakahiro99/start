// フォトアルバム フロントエンド。心臓部ループのUI制御。
const state = {
  albumId: null,
  candidates: [],
  pages: [],
  spread: 0, // 見開きインデックス(0=1〜2ページ目)
};

const $ = (sel) => document.querySelector(sel);

// ---------- 起動時 ----------
window.addEventListener('DOMContentLoaded', async () => {
  await refreshClipBadge();
  await ensureAlbum();
  await loadTagChips();
  bindEvents();
});

async function refreshClipBadge() {
  const badge = $('#clip-badge');
  try {
    const r = await fetch('/api/status');
    const j = await r.json();
    if (j.clip.available) {
      badge.textContent = 'AI: CLIP有効（意味検索）';
      badge.className = 'badge ok';
    } else {
      badge.textContent = 'AI: フォールバック（メタ照合）';
      badge.className = 'badge fallback';
      badge.title = j.clip.reason || '';
    }
  } catch {
    badge.textContent = 'AI状態: 不明';
  }
}

async function ensureAlbum() {
  const fd = new FormData();
  fd.append('title', 'マイアルバム');
  const r = await fetch('/albums', { method: 'POST', body: fd });
  const j = await r.json();
  state.albumId = j.album_id;
  $('#album-title').textContent = j.title;
  await refreshPages();
}

function bindEvents() {
  $('#import-btn').addEventListener('click', importPhotos);
  $('#keyword-btn').addEventListener('click', () => runKeyword($('#keyword-input').value));
  $('#keyword-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runKeyword(e.target.value); });
  $('#period-btn').addEventListener('click', runPeriod);
  $('#suggest-btn').addEventListener('click', runSuggest);
  $('#all-in-btn').addEventListener('click', allInEscape);
  $('#prev-page').addEventListener('click', () => moveSpread(-1));
  $('#next-page').addEventListener('click', () => moveSpread(1));
  $('#share-btn').addEventListener('click', createShare);
}

// ---------- ① 取り込み ----------
async function importPhotos() {
  const input = $('#file-input');
  if (!input.files.length) { alert('写真を選んでください'); return; }
  const prog = $('#import-progress');
  prog.innerHTML = `取り込み中… (${input.files.length}枚)`;
  const fd = new FormData();
  for (const f of input.files) fd.append('files', f);
  try {
    const r = await fetch('/photos/import', { method: 'POST', body: fd });
    const j = await r.json();
    const lines = j.imported.map((it) => {
      if (it.error) return `<div class="err">✗ ${it.filename}: ${it.error}</div>`;
      const fb = it.fallback_used ? ' <span class="fb">(簡易タグ)</span>' : ' <span class="ok">✓</span>';
      return `<div>${it.filename}${fb}</div>`;
    });
    prog.innerHTML = `取り込み完了: ${j.imported.length}枚` + lines.join('');
    await loadTagChips();
  } catch (e) {
    prog.innerHTML = `<div class="err">取り込み失敗: ${e}</div>`;
  }
}

// タグをチップ表示(キーワードのヒント兼ショートカット)
async function loadTagChips() {
  try {
    const r = await fetch('/photos');
    const j = await r.json();
    const counts = {};
    j.photos.forEach((p) => (p.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const box = $('#tag-chips');
    box.innerHTML = '';
    top.forEach(([tag]) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = tag;
      chip.addEventListener('click', () => { $('#keyword-input').value = tag; runKeyword(tag); });
      box.appendChild(chip);
    });
    $('#album-count').textContent = `（取り込み済み ${j.photos.length}枚）`;
  } catch {}
}

// ---------- ② 探す・候補提示 ----------
async function runKeyword(keyword) {
  keyword = (keyword || '').trim();
  if (!keyword) { alert('キーワードを入力してください'); return; }
  const fd = new FormData();
  fd.append('keyword', keyword);
  const r = await fetch('/search/keyword', { method: 'POST', body: fd });
  const j = await r.json();
  showCandidates(j.candidates, `「${keyword}」のオススメ順` + (j.clip_used ? '（意味検索）' : '（メタ照合）'));
}

async function runPeriod() {
  const year = $('#year-input').value;
  const month = $('#month-input').value;
  const params = new URLSearchParams({ granularity: 'month' });
  if (year) params.append('year', year);
  if (month) params.append('month', month);
  const r = await fetch('/search/period?' + params.toString());
  const j = await r.json();
  const label = year || month ? `${year || '?'}年${month || ''}月` : '全期間';
  showCandidates(j.candidates, `${label} のオススメ順`);
}

async function runSuggest() {
  const r = await fetch('/search/period/suggest');
  const j = await r.json();
  if (j.suggested) {
    $('#year-input').value = j.suggested.year;
    $('#month-input').value = j.suggested.month;
    showCandidates(j.candidates, `💡 ${j.suggested.year}年${j.suggested.month}月はどう？`);
  } else {
    showCandidates([], '提案できる写真がありません');
  }
}

function showCandidates(candidates, heading) {
  state.candidates = candidates;
  $('#candidates-heading').textContent = heading;
  const area = $('#candidates-area');
  const box = $('#candidates');
  box.innerHTML = '';
  if (!candidates.length) {
    box.innerHTML = '<p class="muted">該当する写真がありませんでした。別のキーワードや期間を試してください。</p>';
    area.classList.remove('hidden');
    $('#all-in-btn').classList.add('hidden');
    return;
  }
  $('#all-in-btn').classList.remove('hidden');
  candidates.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'card';
    const pct = Math.round((c.match_score || 0) * 100);
    card.innerHTML = `
      <div class="rank">${c.rank}</div>
      <img src="${c.thumbnail_url}" alt="候補写真">
      <div class="meta">一致度 ${pct}% ・ 品質 ${Math.round((c.quality_score || 0) * 100)}%</div>
      <button class="pick" data-id="${c.photo_id}">この1枚を入れる</button>`;
    const btn = card.querySelector('.pick');
    btn.addEventListener('click', () => pickOne(c.photo_id, btn));
    box.appendChild(card);
  });
  area.classList.remove('hidden');
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function pickOne(photoId, btn) {
  await addToAlbum([photoId]);
  btn.textContent = '✓ 追加しました';
  btn.classList.add('picked');
  btn.disabled = true;
}

// 逃げ道: 候補を全部入れる
async function allInEscape() {
  const ids = state.candidates.map((c) => c.photo_id);
  if (!ids.length) return;
  await addToAlbum(ids);
  $('#candidates').querySelectorAll('.pick').forEach((b) => {
    b.textContent = '✓ 追加しました'; b.classList.add('picked'); b.disabled = true;
  });
}

async function addToAlbum(photoIds) {
  const fd = new FormData();
  fd.append('photo_ids', photoIds.join(','));
  const r = await fetch(`/albums/${state.albumId}/photos`, { method: 'POST', body: fd });
  const j = await r.json();
  state.pages = j.pages;
  renderBook();
}

// ---------- ③ プレビュー ----------
async function refreshPages() {
  const r = await fetch(`/albums/${state.albumId}/pages`);
  const j = await r.json();
  state.pages = j.pages;
  renderBook();
}

function moveSpread(dir) {
  const maxSpread = Math.max(0, Math.ceil(state.pages.length / 2) - 1);
  state.spread = Math.min(maxSpread, Math.max(0, state.spread + dir));
  renderBook();
}

function renderBook() {
  const book = $('#book');
  if (!state.pages.length) {
    book.innerHTML = '<div class="book-empty">まだ写真がありません。②で写真を選んでください。</div>';
    $('#page-indicator').textContent = '-';
    return;
  }
  const left = state.pages[state.spread * 2];
  const right = state.pages[state.spread * 2 + 1];
  book.innerHTML = '';
  [left, right].forEach((pg) => {
    if (!pg) return;
    const el = document.createElement('div');
    el.className = 'page ' + (pg.layout_type || 'single');
    pg.photos.forEach((ph) => {
      const img = document.createElement('img');
      img.src = ph.thumbnail_url;
      el.appendChild(img);
    });
    const no = document.createElement('div');
    no.className = 'page-no';
    no.textContent = `${pg.page_index + 1} ページ`;
    el.appendChild(no);
    book.appendChild(el);
  });
  const total = Math.ceil(state.pages.length / 2);
  $('#page-indicator').textContent = `見開き ${state.spread + 1} / ${total}`;
}

// ---------- 共有 ----------
async function createShare() {
  if (!state.pages.length) { alert('先に写真をアルバムに追加してください'); return; }
  const r = await fetch(`/albums/${state.albumId}/share`, { method: 'POST' });
  const j = await r.json();
  const url = location.origin + j.view_url;
  const box = $('#share-result');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div>🔗 このリンクを知っている人は、アカウント不要で閲覧できます:</div>
    <input type="text" readonly value="${url}" onclick="this.select()">
    <div><a href="${j.view_url}" target="_blank">共有ビューを開く →</a></div>`;
}
