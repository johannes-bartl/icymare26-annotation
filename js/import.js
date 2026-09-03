/* ============================================================================
   import.js — read annotation CSVs back in, so predictions can be inspected
   against the images they came from.

   The files this tool exports are the obvious input, but nothing here depends
   on having produced them: the geometry is worked out from whichever columns
   are present, and the image and class columns accept the usual aliases. One
   file may cover any number of images, and any number of files may be loaded.

   Every marker carries the id of the file it came from, so removing that file
   removes exactly what it brought and nothing else.
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App;
  var Importer = window.Importer = {};

  /* ------------------------------------------------------------- CSV parsing */

  /** Split CSV text into rows of cells, honouring quoted fields. */
  Importer.parse = function (text) {
    var rows = [], row = [], cell = '', i = 0, c, inQuotes = false;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip a BOM

    while (i < text.length) {
      c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        cell += c; i += 1; continue;
      }
      if (c === '"') { inQuotes = true; i += 1; continue; }
      if (c === ',') { row.push(cell); cell = ''; i += 1; continue; }
      if (c === '\r') { i += 1; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue; }
      cell += c; i += 1;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] || '').trim() !== ''; });
  };

  /* --------------------------------------------------------- column matching */

  var IMAGE_KEYS = ['image_name', 'image', 'filename', 'file_name', 'file', 'img', 'path'];
  var CLASS_KEYS = ['class_name', 'class', 'label', 'category', 'name', 'type'];
  var W_KEYS = ['image_width', 'img_width', 'width'];
  var H_KEYS = ['image_height', 'img_height', 'height'];

  function indexOfAny(header, keys) {
    var i, j;
    for (j = 0; j < keys.length; j++) {
      for (i = 0; i < header.length; i++) if (header[i] === keys[j]) return i;
    }
    return -1;
  }

  function col(header, name) {
    for (var i = 0; i < header.length; i++) if (header[i] === name) return i;
    return -1;
  }

  /**
   * Work out which encoding a file uses from the columns it carries. The order
   * matters: a pose file also has an x1, so the most specific marker wins.
   *
   * A box and an ellipse are the same four numbers, so the columns alone
   * cannot separate them. The filename breaks the tie, which round-trips this
   * tool's own ellipses.csv; anything else lands on a rectangle, which is the
   * safe reading of xc/yc/w/h.
   */
  Importer.detect = function (header, fileName) {
    var has = function (n) { return col(header, n) !== -1; },
        ellipse = /ellipse/i.test(fileName || '');

    if (has('n_keypoints')) return { shape: 'pose', vis: has('v1') };
    if (has('n_vertices')) return { shape: 'polygon' };
    if (has('x4') && has('y4')) return { shape: 'obb', ellipse: ellipse };
    if ((has('xc') || has('cx')) && has('w') && has('h')) {
      return { shape: ellipse ? 'ellipse' : 'rect' };
    }
    if (has('x2') && has('y2') && has('x1') && has('y1')) return { shape: 'line' };
    if (has('x') && has('y') && has('w') && has('h')) {
      return { shape: ellipse ? 'ellipse' : 'rect', topLeft: true };
    }
    if (has('x') && has('y')) return { shape: 'point' };
    return null;
  };

  function nv(cells, i) {
    if (i < 0 || i >= cells.length) return NaN;
    var s = (cells[i] || '').trim();
    if (s === '') return NaN;
    return parseFloat(s);
  }

  /* ---------------------------------------------------------- shape building */

  /** Recover centre, size and angle from four corners — the inverse of cornersOf. */
  function fromCorners(p) {
    var cx = (p[0] + p[2] + p[4] + p[6]) / 4,
        cy = (p[1] + p[3] + p[5] + p[7]) / 4,
        wdx = p[2] - p[0], wdy = p[3] - p[1],
        hdx = p[6] - p[0], hdy = p[7] - p[1];
    return {
      cx: cx, cy: cy,
      w: Math.hypot(wdx, wdy),
      h: Math.hypot(hdx, hdy),
      angle: ((Math.atan2(wdy, wdx) * 180 / Math.PI) % 360 + 360) % 360
    };
  }

  /** A blueprint for a skeleton we have no names for: n points, no bones. */
  function genericSkeleton(n) {
    var kps = [], i;
    for (i = 0; i < n; i++) {
      kps.push({ name: 'point_' + (i + 1), side: 'C',
                 tx: 0.5, ty: n > 1 ? i / (n - 1) : 0.5 });
    }
    return { name: 'Imported', keypoints: kps, edges: [], flip: [] };
  }

  /* ----------------------------------------------------------------- ingest */

  function findImage(name) {
    var s = App.state, i, base = String(name).split(/[\\/]/).pop().toLowerCase();
    for (i = 0; i < s.images.length; i++) {
      if (s.images[i].name.toLowerCase() === base) return s.images[i];
    }
    return null;
  }

  /**
   * Find a marker type that already fits, or make one. "Fits" means the same
   * name and the same encoding — a Seal box and a Seal pose are different
   * things and must not be merged just because they share a label.
   */
  function typeFor(name, kind, sourceId, palette) {
    var s = App.state, i, t,
        want = kind.shape === 'obb' ? (kind.ellipse ? 'ellipse' : 'rect') : kind.shape,
        rot = kind.shape === 'obb';

    for (i = 0; i < s.types.length; i++) {
      t = s.types[i];
      if (t.name !== name || t.shape !== want) continue;
      if ((want === 'rect' || want === 'ellipse') && !!t.rotatable !== rot) continue;
      if (want === 'pose' && t.skeleton && kind.nkp && t.skeleton.keypoints.length !== kind.nkp) continue;
      return t;
    }

    t = {
      id: App.uid('t'),
      name: name,
      shape: want,
      rotatable: rot,
      color: palette(),
      hotkey: null,
      pose3d: !!kind.vis,
      skeleton: want === 'pose' ? genericSkeleton(kind.nkp || 1) : null,
      fromSource: sourceId
    };
    s.types.push(t);
    return t;
  }

  /**
   * Read one CSV into the current project.
   * @returns {{added:number, skipped:number, classes:string[], images:string[], scaled:boolean}}
   */
  Importer.ingest = function (fileName, text, sourceId) {
    var rows = Importer.parse(text), i, r, header, kind, out = {
      added: 0, skipped: 0, classes: [], images: [], scaled: false, error: null
    };

    if (rows.length < 2) { out.error = 'no rows'; return out; }

    header = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    kind = Importer.detect(header, fileName);
    if (!kind) { out.error = 'could not tell which columns hold the geometry'; return out; }

    var iImg = indexOfAny(header, IMAGE_KEYS),
        iCls = indexOfAny(header, CLASS_KEYS),
        iW = indexOfAny(header, W_KEYS),
        iH = indexOfAny(header, H_KEYS);
    if (iImg === -1) { out.error = 'no image column (tried ' + IMAGE_KEYS.slice(0, 4).join(', ') + ')'; return out; }

    var used = {}, seenImg = {}, palette = paletteRunner(), missing = {};

    for (i = 1; i < rows.length; i++) {
      r = rows[i];
      if (!r.length || !(r[iImg] || '').trim()) continue;

      var img = findImage(r[iImg]);
      if (!img) { out.skipped += 1; missing[String(r[iImg]).split(/[\\/]/).pop()] = 1; continue; }

      var csvW = nv(r, iW), csvH = nv(r, iH), sx = 1, sy = 1;

      if (!img.w) {
        /* size still unknown: take the file's word for it rather than dropping
           the row, and place the coordinates as given */
        if (isFinite(csvW) && csvW > 0) { img.w = csvW; img.h = csvH; }
        else { out.skipped += 1; missing[String(r[iImg]).split(/[\\/]/).pop()] = 1; continue; }
      } else {
        /* predictions often come from a resized copy; rescale onto this image */
        if (isFinite(csvW) && csvW > 0 && Math.abs(csvW - img.w) > 0.5) { sx = img.w / csvW; out.scaled = true; }
        if (isFinite(csvH) && csvH > 0 && Math.abs(csvH - img.h) > 0.5) { sy = img.h / csvH; out.scaled = true; }
      }

      var cls = iCls === -1 ? 'imported' : String(r[iCls] || 'imported').trim() || 'imported';
      var nkp = kind.shape === 'pose' ? (nv(r, col(header, 'n_keypoints')) | 0) : 0;
      var t = typeFor(cls, { shape: kind.shape, vis: kind.vis, nkp: nkp, ellipse: kind.ellipse },
                      sourceId, palette);
      var m = buildMarker(kind, header, r, t, sx, sy);
      if (!m) { out.skipped += 1; continue; }

      m.source = sourceId;
      if (!App.state.markers[img.id]) App.state.markers[img.id] = [];
      App.state.markers[img.id].push(m);
      out.added += 1;
      if (!used[cls]) { used[cls] = 1; out.classes.push(cls); }
      if (!seenImg[img.name]) { seenImg[img.name] = 1; out.images.push(img.name); }
    }

    out.missingImages = Object.keys(missing);
    return out;
  };

  function buildMarker(kind, header, r, t, sx, sy) {
    var m = { id: App.uid('m'), typeId: t.id, shape: t.shape, angle: 0 },
        c = function (n) { return col(header, n); }, i, n, x, y, v, box, pts, kps;

    if (kind.shape === 'point') {
      m.cx = nv(r, c('x')) * sx; m.cy = nv(r, c('y')) * sy;
      m.w = 0; m.h = 0;
      return isFinite(m.cx) && isFinite(m.cy) ? m : null;
    }

    if (kind.shape === 'line') {
      m.x1 = nv(r, c('x1')) * sx; m.y1 = nv(r, c('y1')) * sy;
      m.x2 = nv(r, c('x2')) * sx; m.y2 = nv(r, c('y2')) * sy;
      return isFinite(m.x1) && isFinite(m.y2) ? m : null;
    }

    if (kind.shape === 'obb') {
      var p = [];
      for (i = 1; i <= 4; i++) { p.push(nv(r, c('x' + i)) * sx, nv(r, c('y' + i)) * sy); }
      if (p.some(function (q) { return !isFinite(q); })) return null;
      box = fromCorners(p);
      m.cx = box.cx; m.cy = box.cy; m.w = box.w; m.h = box.h; m.angle = box.angle;
      return m;
    }

    if (kind.shape === 'rect' || kind.shape === 'ellipse') {
      if (kind.topLeft) {
        m.w = nv(r, c('w')) * sx; m.h = nv(r, c('h')) * sy;
        m.cx = nv(r, c('x')) * sx + m.w / 2;
        m.cy = nv(r, c('y')) * sy + m.h / 2;
      } else {
        m.cx = nv(r, c('xc') !== -1 ? c('xc') : c('cx')) * sx;
        m.cy = nv(r, c('yc') !== -1 ? c('yc') : c('cy')) * sy;
        m.w = nv(r, c('w')) * sx; m.h = nv(r, c('h')) * sy;
      }
      var ang = nv(r, c('angle_deg'));
      if (isFinite(ang)) m.angle = ang;
      return isFinite(m.cx) && isFinite(m.w) ? m : null;
    }

    if (kind.shape === 'polygon') {
      n = nv(r, c('n_vertices')) | 0;
      pts = [];
      for (i = 1; i <= n; i++) {
        x = nv(r, c('x' + i)) * sx; y = nv(r, c('y' + i)) * sy;
        if (!isFinite(x) || !isFinite(y)) break;
        pts.push([x, y]);
      }
      if (pts.length < 3) return null;
      m.pts = pts;
      return m;
    }

    /* pose */
    m.cx = nv(r, c('xc')) * sx; m.cy = nv(r, c('yc')) * sy;
    m.w = nv(r, c('w')) * sx; m.h = nv(r, c('h')) * sy;
    n = nv(r, c('n_keypoints')) | 0;
    kps = [];
    for (i = 1; i <= n; i++) {
      x = nv(r, c('px' + i)); y = nv(r, c('py' + i));
      v = kind.vis ? nv(r, c('v' + i)) : 2;
      if (!isFinite(v)) v = 2;
      if (!isFinite(x) || !isFinite(y) || (v === 0)) {
        kps.push([m.cx, m.cy, App.VIS.ABSENT, 1]);
      } else {
        kps.push([x * sx, y * sy, v, 1]);
      }
    }
    if (!kps.length) return null;
    m.kps = kps;
    if (!isFinite(m.cx) || !isFinite(m.w)) return null;
    return m;
  }

  /** Hand out palette colours that are not already spoken for. */
  function paletteRunner() {
    var used = {}, i;
    for (i = 0; i < App.state.types.length; i++) used[App.state.types[i].color.toLowerCase()] = 1;
    var n = 0;
    return function () {
      var j;
      for (j = 0; j < App.PALETTE.length; j++) {
        if (!used[App.PALETTE[j].toLowerCase()]) { used[App.PALETTE[j].toLowerCase()] = 1; return App.PALETTE[j]; }
      }
      n += 1;
      return App.PALETTE[n % App.PALETTE.length];
    };
  }

  /* ---------------------------------------------------------------- sources */

  /** Forget a loaded file: its markers go, and any type it invented that is
      now unused goes with them. */
  Importer.removeSource = function (sourceId) {
    var s = App.state, k, i, removed = 0;

    App.pushUndo();
    for (k in s.markers) {
      var before = s.markers[k].length;
      s.markers[k] = s.markers[k].filter(function (m) { return m.source !== sourceId; });
      removed += before - s.markers[k].length;
    }
    s.types = s.types.filter(function (t) {
      return t.fromSource !== sourceId || App.countOfType(t.id) > 0;
    });
    if (!App.getType(s.activeTypeId)) s.activeTypeId = s.types.length ? s.types[0].id : null;
    s.selection = s.selection.filter(function (id) { return !!App.getMarker(id); });
    for (i = 0; i < s.sources.length; i++) {
      if (s.sources[i].id === sourceId) { s.sources.splice(i, 1); break; }
    }
    return removed;
  };

})();
