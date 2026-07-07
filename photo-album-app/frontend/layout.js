// 見開きページ1枚を描画する共通ロジック(index.html / share.html で共有)。
// 1ページ最大10〜12枚まで、写真の縦横比を考慮して破綻しないグリッドで自動配置する。
// レイアウト種別(layout_type)ごとに列数を決め、各写真は向きに応じてマス目のspanを持つ。
(function (global) {
  // 枚数(=layout_type)ごとの基準列数。CSSの .page.gridN と揃える。
  var COLS = {
    single: 1, duo: 1, grid3: 2, grid4: 2,
    grid6: 3, grid8: 4, grid10: 5, grid12: 4,
  };

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

  // pg: { page_index, layout_type, photos:[{thumbnail_url, aspect_ratio}] }
  function renderAlbumPage(pg) {
    var el = document.createElement('div');
    var layout = pg.layout_type || 'single';
    el.className = 'page ' + layout;
    var photos = pg.photos || [];
    var cols = colsFor(layout, photos.length);
    el.style.setProperty('--cols', cols);

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
