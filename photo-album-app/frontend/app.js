// フォトアルバム フロントエンド。心臓部ループのUI制御。
const state = {
  albumId: null,
  candidates: [],
  pages: [],
  spread: 0, // 見開きインデックス(0=1〜2ページ目)
  share: null, // 発行済み共有リンク { token, url } or null
};

const $ = (sel) => document.querySelector(sel);

// ---------- 起動時 ----------
window.addEventListener('DOMContentLoaded', async () => {
  await refreshClipBadge();
  await ensureAlbum();
  await loadTagChips();
  await refreshLibrary();
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
  $('#file-input').addEventListener('change', updateSelectedLabel);
  $('#folder-input').addEventListener('change', updateSelectedLabel);
  $('#library-sort').addEventListener('change', refreshLibrary);
  $('#library-refresh').addEventListener('click', refreshLibrary);
  $('#keyword-btn').addEventListener('click', () => runKeyword($('#keyword-input').value));
  $('#keyword-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runKeyword(e.target.value); });
  $('#period-btn').addEventListener('click', runPeriod);
  $('#suggest-btn').addEventListener('click', runSuggest);
  $('#all-in-btn').addEventListener('click', allInEscape);
  $('#prev-page').addEventListener('click', () => moveSpread(-1));
  $('#next-page').addEventListener('click', () => moveSpread(1));
  $('#share-btn').addEventListener('click', createShare);
  $('#copy-link-btn').addEventListener('click', copyShareLink);
}

// ---------- ① 取り込み(ファイル / フォルダ一括) ----------
// ファイル選択とフォルダ選択の両方から画像ファイルだけを集める。
function collectImageFiles() {
  const files = [];
  const seen = new Set();
  for (const input of [$('#file-input'), $('#folder-input')]) {
    for (const f of input.files) {
      if (!isImageFile(f)) continue; // 画像以外(フォルダ内の非画像)はスキップ
      const key = (f.webkitRelativePath || f.name) + '|' + f.size;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(f);
    }
  }
  return files;
}

function isImageFile(f) {
  if (f.type && f.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|bmp|webp|tiff?|heic|heif)$/i.test(f.name);
}

function updateSelectedLabel() {
  const files = collectImageFiles();
  const label = $('#import-selected');
  if (!files.length) { label.textContent = ''; return; }
  label.textContent = `画像 ${files.length} 枚を選択中（画像以外は自動スキップ）`;
}

async function importPhotos() {
  const files = collectImageFiles();
  if (!files.length) { alert('画像ファイルを選んでください（フォルダ内の画像でもOK）'); return; }
  const prog = $('#import-progress');
  prog.innerHTML = `取り込み中… (${files.length}枚)`;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  try {
    const r = await fetch('/photos/import', { method: 'POST', body: fd });
    const j = await r.json();
    const ok = j.imported.filter((it) => !it.error).length;
    const ng = j.imported.length - ok;
    const lines = j.imported.map((it) => {
      if (it.error) return `<div class="err">✗ ${it.filename}: ${it.error}</div>`;
      const fb = it.fallback_used ? ' <span class="fb">(簡易タグ)</span>' : ' <span class="ok">✓</span>';
      return `<div>${it.filename}${fb}</div>`;
    });
    prog.innerHTML = `取り込み完了: 成功 ${ok}枚` + (ng ? ` / 失敗 ${ng}枚` : '') + lines.join('');
    await loadTagChips();
    await refreshLibrary();
  } catch (e) {
    prog.innerHTML = `<div class="err">取り込み失敗: ${e}</div>`;
  }
}

// ---------- ② ライブラリ(取り込み済み一覧) ----------
async function refreshLibrary() {
  const sort = $('#library-sort').value || 'date_desc';
  const grid = $('#library-grid');
  try {
    const r = await fetch('/photos?sort=' + encodeURIComponent(sort));
    const j = await r.json();
    grid.innerHTML = '';
    if (!j.photos.length) {
      grid.innerHTML = '<p class="muted">まだ写真がありません。上で取り込んでください。</p>';
      return;
    }
    j.photos.forEach((p) => {
      const cell = document.createElement('div');
      cell.className = 'lib-cell';
      const when = (p.taken_at || p.imported_at || '').slice(0, 10);
      cell.innerHTML = `<img src="${p.thumbnail_url}" alt="写真" loading="lazy"><div class="lib-date">${when}</div>`;
      grid.appendChild(cell);
    });
  } catch (e) {
    grid.innerHTML = `<p class="err">一覧の取得に失敗しました: ${e}</p>`;
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
  // ページ構成が変わったので、発行済み共有リンクは失効させる(④)。
  await invalidateShareOnChange();
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
    book.appendChild(renderAlbumPage(pg));
  });
  const total = Math.ceil(state.pages.length / 2);
  $('#page-indicator').textContent = `見開き ${state.spread + 1} / ${total}`;
}

// ---------- 共有(④ コピー / ページ構成変化で失効) ----------

async function createShare() {
  if (!state.pages.length) { alert('先に写真をアルバムに追加してください'); return; }
  const r = await fetch(`/albums/${state.albumId}/share`, { method: 'POST' });
  const j = await r.json();
  const url = location.origin + j.view_url;
  state.share = { token: j.token, url };
  const box = $('#share-result');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div>🔗 このリンクを知っている人は、アカウント不要で閲覧できます:</div>
    <input id="share-url" type="text" readonly value="${url}" onclick="this.select()">
    <div><a href="${j.view_url}" target="_blank">共有ビューを開く →</a></div>
    <div id="copy-feedback" class="copy-feedback"></div>`;
  // 発行に成功したのでコピーボタンを活性化。
  $('#copy-link-btn').disabled = false;
}

async function copyShareLink() {
  if (!state.share) return;
  try {
    await navigator.clipboard.writeText(state.share.url);
    showCopyFeedback('✓ コピーしました');
  } catch {
    // クリップボードAPIが使えない環境向けのフォールバック(手動選択)。
    const input = $('#share-url');
    if (input) { input.focus(); input.select(); }
    showCopyFeedback('コピーできない場合はリンクを選択してコピーしてください');
  }
}

function showCopyFeedback(msg) {
  const fb = $('#copy-feedback');
  if (fb) fb.textContent = msg;
}

// 表示中アルバムのページ構成が変わったら、発行済み共有リンクを失効させる。
async function invalidateShareOnChange() {
  if (!state.share) return;
  const token = state.share.token;
  state.share = null;
  try {
    await fetch(`/albums/${state.albumId}/share/${encodeURIComponent(token)}`, { method: 'DELETE' });
  } catch {}
  // 画面上の表示リンクをクリアし、コピーボタンを非活性に戻す。
  const box = $('#share-result');
  box.classList.add('hidden');
  box.innerHTML = '';
  $('#copy-link-btn').disabled = true;
}
