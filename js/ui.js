/* ============================================================================
   ui.js — sidebar panels, marker-type editor, toolbar, keyboard, file intake.
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App, Canvas = window.Canvas;
  var UI = window.UI = {};
  var $ = function (id) { return document.getElementById(id); };

  var els = {};
  var draft = null;        // marker-type being created/edited
  var editingTypeId = null;
  var confirmCb = null;
  var toastTimer = null;

  /* ================================================================== init */

  function init() {
    window.hydrateIcons(document);

    els.app = $('app');
    els.sidebar = $('sidebar');
    els.stage = $('stage');
    els.empty = $('empty');
    els.dropzone = $('dropzone');
    els.fileList = $('file-list');
    els.fileFoot = $('file-foot');
    els.typeList = $('type-list');
    els.bin = $('bincursor');
    els.modalRoot = $('modal-root');
    els.chip = $('active-type-chip');

    Canvas.init();
    wireRail();
    wireResizer();
    wireToolbar();
    wireFiles();
    wireModals();
    wireKeyboard();

    setPanel('files');
    setTool(App.state.tool);
    refresh();
  }


  /* ================================================================== rail */

  function wireRail() {
    var btns = document.querySelectorAll('.rail-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var p = this.dataset.panel;
        if (p === App.state.panel && !App.state.sidebarCollapsed) setCollapsed(true);
        else { setCollapsed(false); setPanel(p); }
      });
    }
  }

  function setPanel(name) {
    App.state.panel = name;
    var secs = document.querySelectorAll('.panel'), i;
    for (i = 0; i < secs.length; i++) secs[i].classList.toggle('active', secs[i].dataset.panel === name);
    var btns = document.querySelectorAll('.rail-btn');
    for (i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.panel === name);
  }

  function setCollapsed(v) {
    App.state.sidebarCollapsed = v;
    els.app.classList.toggle('collapsed', v);
    if (!v) {
      var btns = document.querySelectorAll('.rail-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.panel === App.state.panel);
      }
    }
  }

  function wireResizer() {
    var r = $('resizer'), dragging = false;
    r.addEventListener('pointerdown', function (e) {
      dragging = true;
      r.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
    });
    r.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = App.clamp(e.clientX - els.sidebar.getBoundingClientRect().left, 170, 480);
      els.sidebar.style.width = w + 'px';
    });
    r.addEventListener('pointerup', function () {
      dragging = false;
      document.body.classList.remove('resizing');
    });
    r.addEventListener('dblclick', function () { setCollapsed(!App.state.sidebarCollapsed); });
  }

  /* =============================================================== toolbar */

  function wireToolbar() {
    var tools = document.querySelectorAll('#toolgroup .tool');
    for (var i = 0; i < tools.length; i++) {
      tools[i].addEventListener('click', function () {
        var t = this.dataset.tool;
        if (t === 'delete' && App.state.selection.length) {
          App.deleteMarkers(App.state.selection.slice());
          refresh();
          return;
        }
        setTool(App.state.tool === t && t === 'delete' ? 'annotate' : t);
      });
    }

    $('btn-zoom-in').addEventListener('click', function () { Canvas.zoomAt(1.25); updateStatus(); });
    $('btn-zoom-out').addEventListener('click', function () { Canvas.zoomAt(0.8); updateStatus(); });
    $('btn-zoom-level').addEventListener('click', function () { Canvas.resetZoom(); updateStatus(); });
    $('btn-fit').addEventListener('click', function () { Canvas.fit(); updateStatus(); });
    $('btn-prev').addEventListener('click', function () { step(-1); });
    $('btn-next').addEventListener('click', function () { step(1); });
    $('btn-help').addEventListener('click', function () { openModal('modal-help'); });
    $('btn-lock').addEventListener('click', function () { setLocked(!App.state.locked); });
    $('onboard-new').addEventListener('click', function () { openTypeEditor(null); });
    $('onboard-help').addEventListener('click', function () { openModal('modal-help'); });
    wireExport();

    $('btn-new-type').addEventListener('click', function () { openTypeEditor(null); });
    $('btn-new-type-2').addEventListener('click', function () { openTypeEditor(null); });
  }

  /**
   * The lock guards existing work: with it on, the annotate tool only ever
   * places new markers, and the handles for editing one appear only while
   * Shift is held. Stops a stray drag reshaping a marker you already placed.
   */
  function setLocked(v) {
    App.state.locked = v;
    var b = $('btn-lock');
    b.classList.toggle('active', v);
    b.querySelector('[data-icon]').innerHTML = window.svgIcon(v ? 'lock' : 'unlock', 18);
    b.title = v
      ? 'Existing markers are locked — hold Shift to resize or move one. Click to unlock. (L)'
      : 'Markers can be edited freely. Click to lock them so you only place new ones. (L)';
    Canvas.updateCursor();
    Canvas.render();
    updateStatus();
  }

  function setTool(t) {
    App.state.tool = t;
    var tools = document.querySelectorAll('#toolgroup .tool');
    for (var i = 0; i < tools.length; i++) tools[i].classList.toggle('active', tools[i].dataset.tool === t);
    els.app.classList.toggle('deleting', t === 'delete');
    if (t !== 'annotate') Canvas.cancelPending();
    renderTypes();
    updateChip();
    Canvas.updateCursor();
    Canvas.render();
  }

  UI.downloadText = function (text, filename, mime) {
    App.download(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
  };

  /* ---------------------------------------------------------- export menu */

  var exportFiles = [], menuTimer = null;

  function wireExport() {
    var wrap = $('exportwrap'), menu = $('export-menu');

    wrap.addEventListener('mouseenter', function () {
      if (menuTimer) clearTimeout(menuTimer);
      renderExportMenu();
      menu.hidden = false;
    });
    wrap.addEventListener('mouseleave', function () {
      menuTimer = setTimeout(function () { menu.hidden = true; }, 180);
    });

    $('btn-export').addEventListener('click', function () { downloadAll(); });

    menu.addEventListener('click', function (e) {
      var row = e.target.closest('.exportrow');
      if (!row) return;
      if (row.dataset.all) { downloadAll(); return; }
      var f = exportFiles[+row.dataset.i];
      if (!f) return;
      App.downloadFile(f);
      UI.toast('Downloaded ' + f.name);
    });
  }

  function downloadAll() {
    var n = App.downloadAll();
    if (!n) { UI.toast('Nothing to export yet — draw some markers first'); return; }
    UI.toast(n === 1 ? 'Exported 1 file' : 'Exported ' + n + ' files as a ZIP');
    $('export-menu').hidden = true;
  }

  function renderExportMenu() {
    exportFiles = App.exportFiles();
    var menu = $('export-menu'), html = '', i, f, total = 0;

    if (!exportFiles.length) {
      menu.innerHTML = '<p class="exportmenu-empty">Nothing to export yet.<br>' +
                       'Draw some markers first.</p>';
      return;
    }

    html += '<div class="exportmenu-head">One file per drawing mode</div>';
    for (i = 0; i < exportFiles.length; i++) {
      f = exportFiles[i];
      if (!f.isJSON) total += f.count;
      html += '<button class="exportrow" data-i="' + i + '">' +
                '<span class="exportrow-icon">' + window.svgIcon(f.shape, 16) + '</span>' +
                '<span class="exportrow-main">' +
                  '<span class="exportrow-name">' + esc(f.label) + '</span>' +
                  '<span class="exportrow-sub">' + f.count + ' ' +
                    (f.isJSON ? 'skeleton' + (f.count === 1 ? '' : 's')
                              : 'marker' + (f.count === 1 ? '' : 's')) +
                    (f.types && f.types.length ? ' · ' + esc(f.types.join(', ')) : '') +
                    ' · ' + esc(f.name) + '</span>' +
                '</span>' +
                '<span class="exportrow-dl">' + window.svgIcon('download', 15) + '</span>' +
              '</button>';
    }
    html += '<div class="exportmenu-sep"></div>' +
            '<button class="exportrow all" data-all="1">' +
              '<span class="exportrow-icon">' + window.svgIcon('download', 15) + '</span>' +
              '<span class="exportrow-main">' +
                '<span class="exportrow-name">Download everything</span>' +
                '<span class="exportrow-sub">' + exportFiles.length + ' files' +
                  (exportFiles.length > 1 ? ', zipped' : '') + ' · ' + total + ' markers</span>' +
              '</span>' +
            '</button>';
    menu.innerHTML = html;
  }

  /* ============================================================ file intake */

  function wireFiles() {
    var inFiles = $('input-files'), inFolder = $('input-folder');

    $('btn-load').addEventListener('click', function () { inFiles.click(); });
    $('btn-load-2').addEventListener('click', function () { inFiles.click(); });
    $('btn-add-files').addEventListener('click', function () { inFiles.click(); });
    $('btn-add-folder').addEventListener('click', function () { inFolder.click(); });

    inFiles.addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    inFolder.addEventListener('change', function () { addFiles(this.files); this.value = ''; });

    var depth = 0;
    window.addEventListener('dragenter', function (e) {
      e.preventDefault(); depth += 1; els.dropzone.classList.add('on');
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('dragleave', function (e) {
      e.preventDefault(); depth -= 1; if (depth <= 0) { depth = 0; els.dropzone.classList.remove('on'); }
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; els.dropzone.classList.remove('on');
      collectDropped(e.dataTransfer, addFiles);
    });

    els.fileList.addEventListener('click', function (e) {
      var row = e.target.closest('.file-row');
      if (!row) return;
      if (e.target.closest('[data-act="del-image"]')) { askRemoveImage(row.dataset.id); return; }
      selectImage(row.dataset.id);
    });
  }

  /** Walk a DataTransfer, descending into dropped folders. */
  function collectDropped(dt, done) {
    var items = dt.items, entries = [], i, out = [], pending = 1;

    if (!items || !items.length || !items[0].webkitGetAsEntry) { done(dt.files); return; }
    for (i = 0; i < items.length; i++) {
      var en = items[i].webkitGetAsEntry();
      if (en) entries.push(en);
    }
    if (!entries.length) { done(dt.files); return; }

    function finish() { pending -= 1; if (pending === 0) done(out); }

    function walk(entry) {
      if (entry.isFile) {
        pending += 1;
        entry.file(function (f) { out.push(f); finish(); }, finish);
      } else if (entry.isDirectory) {
        pending += 1;
        var reader = entry.createReader();
        (function readMore() {
          reader.readEntries(function (batch) {
            if (!batch.length) { finish(); return; }
            for (var j = 0; j < batch.length; j++) walk(batch[j]);
            readMore();
          }, finish);
        })();
      }
    }
    for (i = 0; i < entries.length; i++) walk(entries[i]);
    finish();
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return /^image\//.test(f.type) || /\.(jpe?g|png|bmp|webp|gif|tiff?)$/i.test(f.name);
    });
    if (!files.length) { UI.toast('No images found in that drop'); return; }

    files.sort(function (a, b) { return App.naturalCompare(a.name, b.name); });

    var existing = {}, added = 0, i, f, key, img;
    for (i = 0; i < App.state.images.length; i++) existing[App.state.images[i].key] = true;

    for (i = 0; i < files.length; i++) {
      f = files[i];
      key = App.imageKey(f);
      if (existing[key]) continue;
      existing[key] = true;
      img = {
        id: App.uid('img'), key: key, name: f.name, file: f,
        url: URL.createObjectURL(f), w: 0, h: 0, loaded: false
      };
      App.state.images.push(img);
      added += 1;
    }

    if (!App.state.activeImageId && App.state.images.length) {
      selectImage(App.state.images[0].id);
    } else {
      refresh();
    }
    if (added) UI.toast('Added ' + added + ' image' + (added === 1 ? '' : 's'));
    App.save();
  }

  function selectImage(id) {
    if (App.state.activeImageId === id) return;
    Canvas.cancelPending();
    App.state.activeImageId = id;
    App.state.selection = [];
    Canvas.showImage(App.activeImage(), refresh);
    refresh();
  }

  function askRemoveImage(id) {
    var img = null, i, n;
    for (i = 0; i < App.state.images.length; i++) if (App.state.images[i].id === id) img = App.state.images[i];
    if (!img) return;
    n = App.countOfImage(id);

    if (!n) { removeImage(id); return; }
    confirm2(
      'Remove ' + img.name + '?',
      'It carries ' + n + ' marker' + (n === 1 ? '' : 's') + ', which go with it. Ctrl+Z brings both back.',
      function () { removeImage(id); }
    );
  }

  function removeImage(id) {
    var next = App.removeImage(id);
    Canvas.dropImage(id);
    if (next) Canvas.showImage(App.activeImage(), refresh);
    else Canvas.render();
    refresh();
    UI.toast('Image removed');
  }

  function step(dir) {
    var idx = App.imageIndex();
    if (idx === -1) return;
    var next = App.clamp(idx + dir, 0, App.state.images.length - 1);
    if (next !== idx) selectImage(App.state.images[next].id);
  }

  /* ============================================================== rendering */

  UI.refresh = refresh;
  function refresh() {
    renderFiles();
    renderTypes();
    updateStatus();
    updateChip();

    var has = App.state.images.length > 0,
        needsType = has && !App.state.types.length;
    els.empty.hidden = has;
    $('onboard').hidden = !needsType;
    $('imgnav').hidden = !has;

    /* the moment there are images but nothing to label them with, put the
       marker-types panel in front of the user rather than the file list */
    if (needsType && App.state.panel !== 'markers') { setCollapsed(false); setPanel('markers'); }
  }

  function renderFiles() {
    var s = App.state, html = '', i, img, n;
    for (i = 0; i < s.images.length; i++) {
      img = s.images[i];
      n = App.countOfImage(img.id);
      html += '<div class="file-row' + (img.id === s.activeImageId ? ' active' : '') +
                '" data-id="' + img.id + '" tabindex="0">' +
                '<img class="file-thumb" src="' + img.url + '" loading="lazy" alt="">' +
                '<span class="file-name" title="' + esc(img.name) + '">' + esc(img.name) + '</span>' +
                (n ? '<span class="pill">' + n + '</span>' : '') +
                '<button class="iconbtn tiny danger file-del" data-act="del-image" ' +
                  'title="Remove this image (Del)">' + window.svgIcon('trash', 13) + '</button>' +
              '</div>';
    }
    els.fileList.innerHTML = html || '<p class="panel-empty">No images yet.<br>Drop a folder anywhere on the page.</p>';
    els.fileFoot.textContent = s.images.length
      ? s.images.length + ' image' + (s.images.length === 1 ? '' : 's') + ' · ' + App.totalMarkers() + ' markers'
      : 'No images loaded';
  }

  function renderTypes() {
    /* Only the annotate tool places markers, so only then does a type being
       "active" mean anything — highlighting one while selecting or deleting
       just suggests it is about to be used. */
    var s = App.state, drawing = s.tool === 'annotate', html = '', i, t, n;
    for (i = 0; i < s.types.length; i++) {
      t = s.types[i];
      n = App.countOfType(t.id);
      html += '<div class="type-row' + (drawing && t.id === s.activeTypeId ? ' active' : '') + '" data-id="' + t.id + '">' +
                '<span class="type-dot" style="background:' + t.color + '"></span>' +
                '<span class="type-shape" title="' + App.SHAPE_LABEL[t.shape] +
                  (t.rotatable ? ' (rotatable)' : '') + '">' + window.svgIcon(t.shape, 16) + '</span>' +
                '<span class="type-name" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' +
                (t.shape === 'pose' && t.skeleton
                  ? '<span class="type-kind" title="' + t.skeleton.keypoints.length + ' keypoints">' +
                    t.skeleton.keypoints.length + 'kp</span>' : '') +
                (t.rotatable ? '<span class="type-rot" title="Rotatable">' + window.svgIcon('rotate', 13) + '</span>' : '') +
                '<span class="pill count" title="markers placed">' + n + '</span>' +
                '<span class="key' + (t.hotkey ? '' : ' none') + '">' + (t.hotkey || '–') + '</span>' +
                '<button class="iconbtn tiny" data-act="edit" title="Edit">' + window.svgIcon('edit', 14) + '</button>' +
                '<button class="iconbtn tiny danger" data-act="del" title="Delete type">' + window.svgIcon('trash', 14) + '</button>' +
              '</div>';
    }
    els.typeList.innerHTML = html || '<p class="panel-empty">No marker types yet.<br>Create one to start annotating.</p>';
  }

  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('.type-row');
    if (!row) return;
    var btn = e.target.closest('[data-act]');
    if (btn && btn.dataset.act === 'edit') { openTypeEditor(row.dataset.id); return; }
    if (btn && btn.dataset.act === 'del') { askDeleteType(row.dataset.id); return; }
    Canvas.cancelPending();
    App.state.activeTypeId = row.dataset.id;
    App.save();
    refresh();
    Canvas.updateCursor();
  });

  function updateChip() {
    var t = App.activeType();
    if (!t || App.state.tool !== 'annotate') { els.chip.hidden = true; return; }
    els.chip.hidden = false;
    els.chip.innerHTML = '<span class="chip-dot" style="background:' + t.color + '"></span>' +
      window.svgIcon(t.shape, 14) + '<span>' + esc(t.name) + '</span>' +
      (t.hotkey ? '<span class="key">' + t.hotkey + '</span>' : '');
  }

  UI.updateStatus = updateStatus;
  function updateStatus() {
    var img = App.activeImage(), idx = App.imageIndex(), n = App.state.images.length;
    $('st-name').textContent = img ? img.name : '—';
    $('st-dims').textContent = img && img.w ? img.w + ' × ' + img.h + ' px' : '';
    $('st-count').textContent = img ? App.countOfImage(img.id) + ' markers' : '';
    $('st-sel').textContent = App.state.selection.length ? App.state.selection.length + ' selected' : '';
    $('st-rot').textContent = Canvas.view.rot ? 'view rotated ' + (Canvas.view.rot * 90) + '°' : '';
    var pv = Canvas.pendingCount();
    $('st-hint').textContent = Canvas.hasPending()
      ? pv + (pv === 1 ? ' vertex' : ' vertices') +
        (pv >= 3 ? ' · click the first point, or Enter, to close' : ' · keep clicking') + ' · Esc cancels'
      : '';
    $('imgnav-label').textContent = (idx + 1) + ' / ' + n;
    $('btn-zoom-level').textContent = Math.round(Canvas.view.scale * 100) + '%';
  }

  UI.setCursorReadout = function (ip, img) {
    $('st-cursor').textContent = (ip && img && img.w)
      ? 'x ' + Math.round(App.clamp(ip.x, 0, img.w)) + '  y ' + Math.round(App.clamp(ip.y, 0, img.h))
      : '';
    $('btn-zoom-level').textContent = Math.round(Canvas.view.scale * 100) + '%';
  };

  UI.moveBinCursor = function (cx, cy, show) {
    if (!show) { els.bin.hidden = true; return; }
    els.bin.hidden = false;
    els.bin.style.transform = 'translate(' + (cx + 12) + 'px,' + (cy + 10) + 'px)';
  };

  /* ================================================== marker type editor */

  function openTypeEditor(typeId) {
    var t = typeId ? App.getType(typeId) : null;
    editingTypeId = typeId || null;
    draft = t
      ? {
          name: t.name, shape: t.shape, rotatable: !!t.rotatable, color: t.color,
          hotkey: t.hotkey,
          skeleton: t.skeleton ? window.Skeleton.clone(t.skeleton) : null
        }
      : {
          name: '', shape: 'rect', rotatable: false, color: nextColor(),
          hotkey: nextHotkey(), skeleton: null
        };

    $('modal-type-title').textContent = t ? 'Edit marker type' : 'New marker type';
    $('f-save').textContent = t ? 'Save' : 'Create';
    $('f-name').value = draft.name;
    $('f-error').hidden = true;

    renderShapes();
    renderSwatches();
    renderKeys();
    syncColorInputs();
    syncShapeFields();

    openModal('modal-type');
    setTimeout(function () { $('f-name').focus(); }, 30);
  }

  function nextColor() {
    var used = {}, i;
    for (i = 0; i < App.state.types.length; i++) used[App.state.types[i].color.toLowerCase()] = true;
    for (i = 0; i < App.PALETTE.length; i++) if (!used[App.PALETTE[i].toLowerCase()]) return App.PALETTE[i];
    return App.PALETTE[App.state.types.length % App.PALETTE.length];
  }

  function nextHotkey() {
    var used = {}, i;
    for (i = 0; i < App.state.types.length; i++) if (App.state.types[i].hotkey) used[App.state.types[i].hotkey] = true;
    for (i = 0; i < App.HOTKEYS.length; i++) if (!used[App.HOTKEYS[i]]) return App.HOTKEYS[i];
    return null;
  }

  function renderShapes() {
    var opts = document.querySelectorAll('#f-shape .shapeopt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle('active', opts[i].dataset.shape === draft.shape);
    }
  }

  /** Show only the fields that mean anything for the chosen mode. */
  function syncShapeFields() {
    var canRotate = draft.shape === 'rect' || draft.shape === 'ellipse',
        isPose = draft.shape === 'pose';

    $('f-rotatable-wrap').hidden = !canRotate;
    if (!canRotate) draft.rotatable = false;
    $('f-rotatable').checked = draft.rotatable;

    $('f-skel-wrap').hidden = !isPose;
    if (isPose && !draft.skeleton) draft.skeleton = window.Skeleton.clone(window.Skeleton.PRESETS.quadruped);
    $('f-skel-summary').textContent = draft.skeleton ? window.Skeleton.summary(draft.skeleton) : 'no keypoints yet';
  }

  function renderSwatches() {
    var html = '', i, c;
    for (i = 0; i < App.PALETTE.length; i++) {
      c = App.PALETTE[i];
      html += '<button type="button" class="swatch' +
              (c.toLowerCase() === (draft.color || '').toLowerCase() ? ' active' : '') +
              '" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
    }
    $('f-swatches').innerHTML = html;
  }

  function renderKeys() {
    var html = '', i, k, owner;
    for (i = 0; i < App.HOTKEYS.length; i++) {
      k = App.HOTKEYS[i];
      owner = ownerOfKey(k);
      html += '<button type="button" class="keyopt' +
              (draft.hotkey === k ? ' active' : '') +
              (owner ? ' taken' : '') + '" data-key="' + k + '"' +
              (owner ? ' title="Used by ' + esc(owner.name) + '"' : '') + '>' + k + '</button>';
    }
    html += '<button type="button" class="keyopt wide' + (draft.hotkey ? '' : ' active') + '" data-key="">None</button>';
    $('f-keys').innerHTML = html;
  }

  function ownerOfKey(k) {
    var ts = App.state.types, i;
    for (i = 0; i < ts.length; i++) {
      if (ts[i].hotkey === k && ts[i].id !== editingTypeId) return ts[i];
    }
    return null;
  }

  function syncColorInputs() {
    $('f-hex').value = draft.color;
    $('f-hexpreview').style.background = draft.color;
    $('f-picker').value = normHex(draft.color) || '#4c9aff';
  }

  function normHex(v) {
    var s = (v || '').trim();
    if (s[0] !== '#') s = '#' + s;
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
  }

  function wireModals() {
    /* backdrop + every [data-close] */
    els.modalRoot.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });

    $('f-shape').addEventListener('click', function (e) {
      var b = e.target.closest('.shapeopt');
      if (!b) return;
      draft.shape = b.dataset.shape;
      renderShapes();
      syncShapeFields();
    });

    $('f-rotatable').addEventListener('change', function () { draft.rotatable = this.checked; });

    $('f-skel-edit').addEventListener('click', function () {
      var used = editingTypeId ? App.countOfType(editingTypeId) : 0;
      window.Skeleton.open(
        draft.skeleton,
        {
          locked: used > 0,
          lockReason: 'Keypoints are locked: ' + used +
                      (used === 1 ? ' pose already uses' : ' poses already use') +
                      ' this skeleton, and their order is the export order. ' +
                      'You can still rename points, move the template and change bones.'
        },
        function (result) {
          if (result) {
            draft.skeleton = result;
            $('f-skel-summary').textContent = window.Skeleton.summary(result);
          }
          openModal('modal-type');
        }
      );
    });

    $('f-swatches').addEventListener('click', function (e) {
      var b = e.target.closest('.swatch');
      if (!b) return;
      draft.color = b.dataset.color;
      renderSwatches();
      syncColorInputs();
    });

    $('f-hex').addEventListener('input', function () {
      var h = normHex(this.value);
      if (h) { draft.color = h; $('f-hexpreview').style.background = h; $('f-picker').value = h; renderSwatches(); }
    });

    $('f-picker').addEventListener('input', function () {
      draft.color = this.value;
      syncColorInputs();
      renderSwatches();
    });

    $('f-keys').addEventListener('click', function (e) {
      var b = e.target.closest('.keyopt');
      if (!b || b.classList.contains('taken')) return;
      draft.hotkey = b.dataset.key || null;
      renderKeys();
    });

    $('f-name').addEventListener('input', function () { draft.name = this.value; });
    $('f-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveType(); });
    $('f-save').addEventListener('click', saveType);

    $('confirm-ok').addEventListener('click', function () {
      var cb = confirmCb;
      closeModal();
      if (cb) cb();
    });
  }

  function saveType() {
    var name = (draft.name || '').trim();
    if (!name) { showFormError('Give the marker type a name.'); return; }
    if (!normHex(draft.color)) { showFormError('That colour is not a valid hex value.'); return; }
    if (draft.shape === 'pose' && (!draft.skeleton || !draft.skeleton.keypoints.length)) {
      showFormError('A pose type needs a skeleton with at least one keypoint.');
      return;
    }

    if (editingTypeId) {
      var t = App.getType(editingTypeId);
      App.pushUndo();
      t.name = name;
      t.rotatable = !!draft.rotatable;
      t.color = draft.color;
      t.hotkey = draft.hotkey;
      t.skeleton = draft.skeleton;
      if (t.shape !== draft.shape && App.countOfType(t.id) === 0) t.shape = draft.shape;
      else if (t.shape !== draft.shape) UI.toast('Mode kept — markers of this type already exist');
    } else {
      App.pushUndo();
      var nt = {
        id: App.uid('t'), name: name, shape: draft.shape,
        rotatable: !!draft.rotatable, color: draft.color, hotkey: draft.hotkey,
        skeleton: draft.skeleton
      };
      App.state.types.push(nt);
      App.state.activeTypeId = nt.id;
    }
    App.save();
    closeModal();
    refresh();
  }

  function showFormError(msg) {
    var e = $('f-error');
    e.textContent = msg;
    e.hidden = false;
  }

  function askDeleteType(typeId) {
    var t = App.getType(typeId), n = App.countOfType(typeId);
    confirm2(
      'Delete “' + t.name + '”?',
      n ? 'This also removes ' + n + ' marker' + (n === 1 ? '' : 's') + ' already placed with this type. This cannot be undone from the sidebar, but Ctrl+Z still works.'
        : 'No markers use this type yet.',
      function () { App.deleteType(typeId); refresh(); Canvas.render(); }
    );
  }

  function confirm2(title, text, cb) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    confirmCb = cb;
    openModal('modal-confirm');
    setTimeout(function () { $('confirm-ok').focus(); }, 30);
  }
  UI.confirm = confirm2;

  function openModal(id) {
    var ms = els.modalRoot.querySelectorAll('.modal'), i;
    for (i = 0; i < ms.length; i++) ms[i].hidden = ms[i].id !== id;
    els.modalRoot.hidden = false;
  }

  function closeModal() {
    els.modalRoot.hidden = true;
    confirmCb = null;
    editingTypeId = null;
  }

  /* The skeleton editor opens over the type editor and hands control back to
     it, so the draft type survives the round trip. */
  UI.openModalStacked = function (id) { openModal(id); };
  UI.closeModalStacked = function () { els.modalRoot.hidden = true; };

  function modalOpen() { return !els.modalRoot.hidden; }

  /* =============================================================== keyboard */

  function wireKeyboard() {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Control' || e.key === 'Meta') {
        if (!App.state.ctrlDown) { App.state.ctrlDown = true; Canvas.updateCursor(); Canvas.render(); }
      }
      if (e.key === 'Alt' && !App.state.altDown) {
        App.state.altDown = true; Canvas.refreshHover(); Canvas.render();
      }
      if (e.key === 'Shift' && !App.state.shiftDown) {
        App.state.shiftDown = true; Canvas.refreshHover(); Canvas.render();
      }

      if (modalOpen()) {
        if (e.key === 'Escape') {
          e.preventDefault();
          /* inside the skeleton editor, Escape drops the selected keypoint
             first and only cancels the dialog on a second press */
          if (!$('modal-skeleton').hidden) {
            if (!window.Skeleton.handleEscape()) window.Skeleton.cancel();
            return;
          }
          closeModal();
        }
        return;
      }
      if (isTyping(e.target)) return;

      var k = e.key, ctrl = e.ctrlKey || e.metaKey;

      /* Delete means "this image" while the file list holds focus, and
         "these markers" everywhere else */
      var fileRow = e.target.closest && e.target.closest('.file-row');
      if (fileRow && (k === 'Delete' || k === 'Backspace')) {
        e.preventDefault();
        askRemoveImage(fileRow.dataset.id);
        return;
      }

      if (ctrl && (k === 'z' || k === 'Z')) {
        e.preventDefault();
        if (e.shiftKey ? App.redo() : App.undo()) { refresh(); Canvas.render(); }
        return;
      }
      if (ctrl && (k === 'y' || k === 'Y')) {
        e.preventDefault();
        if (App.redo()) { refresh(); Canvas.render(); }
        return;
      }
      if (ctrl && (k === 'a' || k === 'A')) {
        e.preventDefault();
        App.state.selection = App.activeMarkers().map(function (m) { return m.id; });
        refresh(); Canvas.render();
        return;
      }
      if (ctrl) return;

      if (App.HOTKEYS.indexOf(k) !== -1) {
        var ts = App.state.types, i;
        for (i = 0; i < ts.length; i++) {
          if (ts[i].hotkey === k) {
            Canvas.cancelPending();
            App.state.activeTypeId = ts[i].id;
            setTool('annotate');
            App.save(); refresh();
            return;
          }
        }
        return;
      }

      switch (k) {
        case 'v': case 'V': setTool('select'); break;
        case 'a': case 'A': setTool('annotate'); break;
        case 'x': case 'X': setTool(App.state.tool === 'delete' ? 'annotate' : 'delete'); break;
        case 'r': case 'R': Canvas.rotateView(); break;
        case 'l': case 'L': setLocked(!App.state.locked); break;
        case 'f': case 'F': Canvas.fit(); updateStatus(); break;
        case '?': openModal('modal-help'); break;
        case '+': case '=': Canvas.zoomAt(1.25); updateStatus(); break;
        case '-': case '_': Canvas.zoomAt(0.8); updateStatus(); break;
        case ',': step(-1); break;
        case '.': step(1); break;
        case 'ArrowLeft': step(-1); break;
        case 'ArrowRight': step(1); break;
        case 'Enter':
          if (Canvas.hasPending()) { e.preventDefault(); Canvas.commitPending(); }
          break;
        case 'Delete': case 'Backspace':
          if (Canvas.hasPending()) { e.preventDefault(); Canvas.popPendingVertex(); break; }
          if (App.state.selection.length) {
            e.preventDefault();
            App.deleteMarkers(App.state.selection.slice());
            refresh(); Canvas.render();
          }
          break;
        case 'Escape':
          if (Canvas.cancelPending()) break;
          App.state.selection = [];
          refresh(); Canvas.render();
          break;
        case ' ':
          e.preventDefault();
          Canvas.setSpace(true);
          break;
        default: break;
      }
    });

    window.addEventListener('keyup', function (e) {
      if (e.key === 'Control' || e.key === 'Meta') {
        App.state.ctrlDown = false;
        UI.moveBinCursor(0, 0, false);
        Canvas.updateCursor();
        Canvas.render();
      }
      if (e.key === 'Alt') {
        App.state.altDown = false;
        UI.moveBinCursor(0, 0, false);
        Canvas.refreshHover();
        Canvas.render();
      }
      if (e.key === 'Shift') {
        App.state.shiftDown = false;
        Canvas.refreshHover();
        Canvas.render();
      }
      if (e.key === ' ') Canvas.setSpace(false);
    });

    window.addEventListener('blur', function () {
      App.state.ctrlDown = false;
      App.state.altDown = false;
      App.state.shiftDown = false;
      Canvas.setSpace(false);
      UI.moveBinCursor(0, 0, false);
      Canvas.refreshHover();
      Canvas.render();
    });

    /* Nothing is stored between sessions, so reloading or closing the tab
       throws the work away. Browsers only allow their own generic wording. */
    window.addEventListener('beforeunload', function (e) {
      if (!App.state.images.length && !App.totalMarkers()) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
  }

  function isTyping(el) {
    if (!el) return false;
    var t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
  }

  /* ================================================================== misc */

  UI.toast = function (msg) {
    var t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2200);
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
