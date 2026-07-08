// 見開きページ1枚を描画する共通ロジック(index.html / share.html で共有)。
// 1ページ最大10〜12枚まで、写真の縦横比を考慮して破綻しないグリッドで自動配置する。
// レイアウト種別(layout_type)ごとに列数を決め、各写真は向きに応じてマス目のspanを持つ。
(function (global) {
  // 枚数(=layout_type)ごとの基準列数。CSSの .page.gridN と揃える。
  // 枚数が増えたら列数も増える(少なくとも減らない)よう単調に設定。
  // single(1枚のみのページ)はページ全体を専有せず、grid6と同じマスサイズで表示する。
  var COLS = {
    single: 3, duo: 1, grid3: 2, grid4: 2,
    grid6: 3, grid8: 4, grid10: 5, grid12: 6,
  };
  // レイアウト種別ごとの最低行数(枚数が少なくてもマスサイズを崩さないための下限)。
  var MIN_ROWS = { single: 2 };

  function colsFor(layout, count) {
    if (COLS[layout]) return COLS[layout];
    // 未知の種別は枚数から平方根ベースで推定(破綻回避のフォールバック)。
    return Math.max(1, Math.round(Math.sqrt(count)));
  }

  // 写真の縦横比から、グリッド上での列span/行spanを決める。
  // 横長は横2マス、縦長は縦2マス取り、潰れ・見切れを防ぐ。ただし列数を超えない。
  function spanFor(aspect, cols) {
    var ar = aspect || 1.0;
    var colSpan = 1, rowSpan = 1;
    if (cols >= 2 && ar >= 1.7) colSpan = 2;      // かなり横長
    else if (ar <= 0.6) rowSpan = 2;              // かなり縦長
    return { colSpan: Math.min(colSpan, cols), rowSpan: rowSpan };
  }

  // 各写真のspanをdense詰めでシミュレートし、必要な行数を求める。
  // grid-auto-flow: row dense と同じ左詰めルールで、ページ枠内に収まる行数を返す。
  function rowsFor(photos, cols) {
    if (!photos.length) return 1;
    // occ[r] = そのr行で埋まっている列数のビット的マップ(配列で保持)。
    var grid = [];
    function ensureRow(r) { while (grid.length <= r) grid.push(new Array(cols).fill(false)); }
    function fits(r, c, colSpan, rowSpan) {
      for (var dr = 0; dr < rowSpan; dr++) {
        ensureRow(r + dr);
        for (var dc = 0; dc < colSpan; dc++) {
          if (c + dc >= cols || grid[r + dr][c + dc]) return false;
        }
      }
      return true;
    }
    function place(r, c, colSpan, rowSpan) {
      for (var dr = 0; dr < rowSpan; dr++)
        for (var dc = 0; dc < colSpan; dc++) grid[r + dr][c + dc] = true;
    }
    photos.forEach(function (ph) {
      var sp = spanFor(ph.aspect_ratio, cols);
      var colSpan = Math.min(sp.colSpan, cols);
      var rowSpan = sp.rowSpan;
      var placed = false;
      for (var r = 0; !placed; r++) {
        for (var c = 0; c + colSpan <= cols; c++) {
          if (fits(r, c, colSpan, rowSpan)) { place(r, c, colSpan, rowSpan); placed = true; break; }
        }
      }
    });
    return Math.max(1, grid.length);
  }

  // pg: { page_index, layout_type, photos:[{thumbnail_url, aspect_ratio}] }
  function renderAlbumPage(pg) {
    var el = document.createElement('div');
    var layout = pg.layout_type || 'single';
    el.className = 'page ' + layout;
    // 実在写真(photo_idあり かつ サムネイルURLあり)だけを描く。
    // 空スロットのプレースホルダは<img>を描かず、broken imageを出さない(二重防御)。
    var photos = (pg.photos || []).filter(function (ph) {
      return ph && ph.photo_id != null && ph.thumbnail_url;
    });
    var cols = colsFor(layout, photos.length);
    el.style.setProperty('--cols', cols);
    // A4縦の固定枠内に収めるため、行を「行数ぶん等分」する。
    // 各写真のspanから使用行数を求め、grid-template-rowsを均等分割で固定。
    var rows = Math.max(rowsFor(photos, cols), MIN_ROWS[layout] || 1);
    el.style.setProperty('--rows', rows);
    el.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';

    photos.forEach(function (ph) {
      var fig = document.createElement('div');
      fig.className = 'slot';
      var sp = spanFor(ph.aspect_ratio, cols);
      if (sp.colSpan > 1) fig.style.gridColumn = 'span ' + sp.colSpan;
      if (sp.rowSpan > 1) fig.style.gridRow = 'span ' + sp.rowSpan;
      var img = document.createElement('img');
      img.src = ph.thumbnail_url;
      img.loading = 'lazy';
      fig.appendChild(img);
      el.appendChild(fig);
    });

    var no = document.createElement('div');
    no.className = 'page-no';
    no.textContent = (pg.page_index + 1) + ' ページ';
    el.appendChild(no);
    return el;
  }

  global.renderAlbumPage = renderAlbumPage;
})(window);
