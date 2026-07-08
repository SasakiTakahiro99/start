// ライブラリ専用ページ。取り込み済み写真の一覧(日付新しい順/古い順/色順ソート)。
// メイン画面(index)から移設。既存の /photos API・サムネイル配信を再利用する。
const $ = (sel) => document.querySelector(sel);

async function refreshLibrary() {
  const sort = $('#library-sort').value || 'date_desc';
  const grid = $('#library-grid');
  grid.innerHTML = '<p class="muted">読み込み中…</p>';
  try {
    const r = await fetch('/photos?sort=' + encodeURIComponent(sort));
    const j = await r.json();
    grid.innerHTML = '';
    $('#library-count').textContent = `全 ${j.count}枚`;
    if (!j.photos.length) {
      grid.innerHTML = '<p class="muted">まだ写真がありません。アルバム作成画面で取り込んでください。</p>';
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

document.addEventListener('DOMContentLoaded', () => {
  $('#library-sort').addEventListener('change', refreshLibrary);
  $('#library-refresh').addEventListener('click', refreshLibrary);
  refreshLibrary();
});
