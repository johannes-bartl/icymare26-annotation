/* ============================================================================
   core.js — application state, geometry helpers, persistence, CSV export.
   All marker coordinates are stored in ABSOLUTE IMAGE PIXELS (origin top-left).
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App = {};

  /* ---------------------------------------------------------------- state */

  App.state = {
    images: [],          // {id, key, name, file, url, w, h, loaded}
    activeImageId: null,
    types: [],           // {id, name, shape, rotatable, color, hotkey}
    activeTypeId: null,
    markers: {},         // imageId -> [marker]
    selection: [],       // marker ids on the active image
    tool: 'annotate',    // 'annotate' | 'select' | 'delete'
    ctrlDown: false,
    panel: 'files',
    sidebarCollapsed: false
  };

  App.SHAPES = ['point', 'rect', 'line', 'ellipse', 'polygon', 'pose'];

  App.SHAPE_LABEL = {
    point: 'Point', rect: 'Rectangle', line: 'Line', ellipse: 'Ellipse',
    polygon: 'Polygon', pose: 'Pose'
  };

  /* Keypoint visibility, following the COCO convention that YOLO-pose expects. */
  App.VIS = { ABSENT: 0, OCCLUDED: 1, VISIBLE: 2 };

  App.PALETTE = [
    '#ff5c5c', '#ff9f43', '#ffd93d', '#7bd88f', '#2ecc9b', '#4cc9f0',
    '#4c9aff', '#8b7bff', '#d183ff', '#ff7ab8', '#a0785a', '#c3ccd8'
  ];

  App.HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  /* --------------------------------------------------------- tiny helpers */

  var seq = 0;
  App.uid = function (p) { seq += 1; return (p || 'id') + '_' + Date.now().toString(36) + seq.toString(36); };

  App.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };

  App.deg2rad = function (d) { return d * Math.PI / 180; };

  App.naturalCompare = function (a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  /* ------------------------------------------------------------- accessors */

  App.activeImage = function () {
    var s = App.state;
    for (var i = 0; i < s.images.length; i++) if (s.images[i].id === s.activeImageId) return s.images[i];
    return null;
  };

  App.imageIndex = function () {
    var s = App.state;
    for (var i = 0; i < s.images.length; i++) if (s.images[i].id === s.activeImageId) return i;
    return -1;
  };

  App.activeMarkers = function () {
    var id = App.state.activeImageId;
    if (!id) return [];
    if (!App.state.markers[id]) App.state.markers[id] = [];
    return App.state.markers[id];
  };

  App.getType = function (id) {
    var t = App.state.types;
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  };

  App.activeType = function () { return App.getType(App.state.activeTypeId); };

  App.getMarker = function (mid) {
    var m = App.activeMarkers();
    for (var i = 0; i < m.length; i++) if (m[i].id === mid) return m[i];
    return null;
  };

  /** Total markers of a given type across every image. */
  App.countOfType = function (typeId) {
    var n = 0, k, list, i;
    for (k in App.state.markers) {
      list = App.state.markers[k];
      for (i = 0; i < list.length; i++) if (list[i].typeId === typeId) n += 1;
    }
    return n;
  };

  App.countOfImage = function (imageId) {
    var list = App.state.markers[imageId];
    return list ? list.length : 0;
  };

  /* ------------------------------------------------------------- geometry */

  /**
   * Axis-aligned bounding box of a marker, in image pixels.
   * Returns {x1, y1, x2, y2}.
   */
  App.bboxOf = function (m) {
    var a, c, s, ex, ey, rx, ry, i, p;
    if (m.shape === 'point') {
      return { x1: m.cx, y1: m.cy, x2: m.cx, y2: m.cy };
    }
    if (m.shape === 'polygon') {
      if (!m.pts.length) return { x1: 0, y1: 0, x2: 0, y2: 0 };
      c = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
      for (i = 0; i < m.pts.length; i++) {
        p = m.pts[i];
        if (p[0] < c.x1) c.x1 = p[0];
        if (p[0] > c.x2) c.x2 = p[0];
        if (p[1] < c.y1) c.y1 = p[1];
        if (p[1] > c.y2) c.y2 = p[1];
      }
      return c;
    }
    if (m.shape === 'pose') {
      return { x1: m.cx - m.w / 2, y1: m.cy - m.h / 2, x2: m.cx + m.w / 2, y2: m.cy + m.h / 2 };
    }
    if (m.shape === 'line') {
      return {
        x1: Math.min(m.x1, m.x2), y1: Math.min(m.y1, m.y2),
        x2: Math.max(m.x1, m.x2), y2: Math.max(m.y1, m.y2)
      };
    }
    a = App.deg2rad(m.angle || 0);
    c = Math.abs(Math.cos(a));
    s = Math.abs(Math.sin(a));
    if (m.shape === 'rect') {
      ex = (m.w / 2) * c + (m.h / 2) * s;
      ey = (m.w / 2) * s + (m.h / 2) * c;
    } else {                                   // ellipse
      rx = m.w / 2; ry = m.h / 2;
      ex = Math.sqrt(rx * rx * c * c + ry * ry * s * s);
      ey = Math.sqrt(rx * rx * s * s + ry * ry * c * c);
    }
    return { x1: m.cx - ex, y1: m.cy - ey, x2: m.cx + ex, y2: m.cy + ey };
  };

  /** Representative centre point of any marker. */
  App.centerOf = function (m) {
    if (m.shape === 'line') return { x: (m.x1 + m.x2) / 2, y: (m.y1 + m.y2) / 2 };
    if (m.shape === 'polygon') {
      var b = App.bboxOf(m);
      return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
    }
    return { x: m.cx, y: m.cy };
  };

  /** Shoelace area of a polygon, in square image pixels. */
  App.polygonArea = function (pts) {
    var a = 0, i, j;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    return Math.abs(a / 2);
  };

  App.pointInPolygon = function (px, py, pts) {
    var inside = false, i, j, xi, yi, xj, yj;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      xi = pts[i][0]; yi = pts[i][1];
      xj = pts[j][0]; yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  /** Rotate (px,py) around (ox,oy) by -angleDeg — i.e. into the marker's local frame. */
  App.toLocal = function (px, py, ox, oy, angleDeg) {
    var a = -App.deg2rad(angleDeg || 0),
        dx = px - ox, dy = py - oy,
        c = Math.cos(a), s = Math.sin(a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };

  /** Inverse of toLocal: local offset -> absolute image coords. */
  App.toWorld = function (lx, ly, ox, oy, angleDeg) {
    var a = App.deg2rad(angleDeg || 0),
        c = Math.cos(a), s = Math.sin(a);
    return { x: ox + lx * c - ly * s, y: oy + lx * s + ly * c };
  };

  App.distToSegment = function (px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy, t;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    t = App.clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  /** Keep a marker inside the image bounds (translation only, never resizes). */
  App.clampMarker = function (m, iw, ih) {
    var b = App.bboxOf(m), dx = 0, dy = 0;
    if (b.x1 < 0) dx = -b.x1; else if (b.x2 > iw) dx = iw - b.x2;
    if (b.y1 < 0) dy = -b.y1; else if (b.y2 > ih) dy = ih - b.y2;
    if (dx === 0 && dy === 0) return;
    App.translateMarker(m, dx, dy);
  };

  App.translateMarker = function (m, dx, dy) {
    var i;
    if (m.shape === 'line') { m.x1 += dx; m.y1 += dy; m.x2 += dx; m.y2 += dy; return; }
    if (m.shape === 'polygon') {
      for (i = 0; i < m.pts.length; i++) { m.pts[i][0] += dx; m.pts[i][1] += dy; }
      return;
    }
    if (m.shape === 'pose') {
      m.cx += dx; m.cy += dy;
      for (i = 0; i < m.kps.length; i++) { m.kps[i][0] += dx; m.kps[i][1] += dy; }
      return;
    }
    m.cx += dx; m.cy += dy;
  };

  /** Lay a type's template pose inside a box — the pre-posed skeleton. */
  App.makePose = function (type, x, y, w, h) {
    var sk = type.skeleton, kps = [], i, k;
    for (i = 0; i < sk.keypoints.length; i++) {
      k = sk.keypoints[i];
      /* [x, y, visibility, touched] — `touched` is UI-only and never exported */
      kps.push([x + k.tx * w, y + k.ty * h, App.VIS.VISIBLE, 0]);
    }
    return {
      id: App.uid('m'), typeId: type.id, shape: 'pose', angle: 0,
      cx: x + w / 2, cy: y + h / 2, w: w, h: h, kps: kps
    };
  };

  /** How many of a pose's keypoints the user has actually confirmed. */
  App.poseProgress = function (m) {
    var done = 0, i;
    for (i = 0; i < m.kps.length; i++) if (m.kps[i][3]) done += 1;
    return { done: done, total: m.kps.length };
  };

  /* ------------------------------------------------------------- mutation */

  App.addMarker = function (m) {
    App.pushUndo();
    App.activeMarkers().push(m);
    App.save();
  };

  App.deleteMarkers = function (ids) {
    if (!ids.length) return;
    App.pushUndo();
    var list = App.activeMarkers(), keep = [], i;
    for (i = 0; i < list.length; i++) if (ids.indexOf(list[i].id) === -1) keep.push(list[i]);
    App.state.markers[App.state.activeImageId] = keep;
    App.state.selection = App.state.selection.filter(function (id) { return ids.indexOf(id) === -1; });
    App.save();
  };

  /** Remove a marker type and every marker that uses it. */
  App.deleteType = function (typeId) {
    App.pushUndo();
    var s = App.state, k;
    s.types = s.types.filter(function (t) { return t.id !== typeId; });
    for (k in s.markers) {
      s.markers[k] = s.markers[k].filter(function (m) { return m.typeId !== typeId; });
    }
    if (s.activeTypeId === typeId) s.activeTypeId = s.types.length ? s.types[0].id : null;
    s.selection = s.selection.filter(function (id) { return !!App.getMarker(id); });
    App.save();
  };

  /* ----------------------------------------------------------------- undo */

  var undoStack = [], redoStack = [], UNDO_LIMIT = 60;

  function snapshot() {
    return JSON.stringify({ markers: App.state.markers, types: App.state.types });
  }
  function restore(str) {
    var d = JSON.parse(str);
    App.state.markers = d.markers;
    App.state.types = d.types;
    App.state.selection = [];
    if (!App.getType(App.state.activeTypeId)) {
      App.state.activeTypeId = App.state.types.length ? App.state.types[0].id : null;
    }
  }

  App.pushUndo = function () {
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  };

  App.undo = function () {
    if (!undoStack.length) return false;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    App.save();
    return true;
  };

  App.redo = function () {
    if (!redoStack.length) return false;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    App.save();
    return true;
  };

  /* ---------------------------------------------------------- persistence

     Deliberately none. Nothing is written to localStorage: marker types and
     annotations live only for the lifetime of the tab, and ui.js warns before
     the page unloads. App.save() is kept as a no-op so call sites read the
     same as before.                                                          */

  /** Identity of an image file, used to skip duplicates within a session. */
  App.imageKey = function (file) { return file.name + '|' + file.size; };

  App.save = function () {};
  App.saveNow = function () {};

  /* Earlier builds of this tool did persist. Drop anything they left behind so
     no stale annotations linger in someone's browser. */
  try { localStorage.removeItem('icymare-annotator-v1'); } catch (e) {}

  /* ----------------------------------------------------------- CSV export

     One row per marker, in absolute image pixels, origin top-left.
       point    x, y
       rect     x, y = top-left of the unrotated box, w, h, angle_deg
       ellipse  x, y = top-left of the unrotated bounding box, w, h, angle_deg
       line     x, y = start, x2, y2 = end
     A rotated shape turns about its own centre, so (x, y, w, h, angle_deg)
     stays lossless.                                                          */

  var CSV_COLUMNS = [
    'image_name', 'image_width', 'image_height',
    'class_name', 'marker_type',
    'x', 'y', 'w', 'h', 'x2', 'y2', 'angle_deg'
  ];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function num(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return (Math.round(v * 100) / 100).toString();
  }

  /** Geometry columns [x, y, w, h, x2, y2, angle_deg] for one marker. */
  function geomCells(m) {
    if (m.shape === 'point') return [num(m.cx), num(m.cy), '', '', '', '', ''];
    if (m.shape === 'line')  return [num(m.x1), num(m.y1), '', '', num(m.x2), num(m.y2), ''];
    return [
      num(m.cx - m.w / 2), num(m.cy - m.h / 2),
      num(m.w), num(m.h), '', '', num(m.angle || 0)
    ];
  }

  var BASIC_SHAPES = { point: 1, rect: 1, line: 1, ellipse: 1 };

  /**
   * Walk every marker, calling fn(image, marker, type, instanceId).
   * Instance ids restart at 1 per image and per shape family, so they line up
   * with the row groupings in the long-format files.
   */
  function eachMarker(want, fn) {
    var s = App.state, i, j, img, list, m, counters;
    for (i = 0; i < s.images.length; i++) {
      img = s.images[i];
      list = s.markers[img.id] || [];
      counters = {};
      for (j = 0; j < list.length; j++) {
        m = list[j];
        if (!want(m)) continue;
        counters[m.shape] = (counters[m.shape] || 0) + 1;
        fn(img, m, App.getType(m.typeId), counters[m.shape]);
      }
    }
  }

  function typeName(t) { return t ? t.name : '(deleted type)'; }

  App.buildCSV = function () {
    var rows = [CSV_COLUMNS.join(',')];
    eachMarker(function (m) { return BASIC_SHAPES[m.shape]; }, function (img, m, t) {
      rows.push([
        csvCell(img.name), num(img.w), num(img.h),
        csvCell(typeName(t)), csvCell(m.shape)
      ].concat(geomCells(m)).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  };

  /* Long format: one row per vertex. Variable-length geometry does not belong
     in variable-width columns — this pivots in one line of pandas. */
  var POLY_COLUMNS = [
    'image_name', 'image_width', 'image_height',
    'class_name', 'kind', 'instance_id', 'n_vertices', 'area_px',
    'vertex_index', 'x', 'y'
  ];

  App.buildPolygonCSV = function () {
    var rows = [POLY_COLUMNS.join(',')];
    eachMarker(function (m) { return m.shape === 'polygon'; }, function (img, m, t, inst) {
      var area = App.polygonArea(m.pts), k;
      for (k = 0; k < m.pts.length; k++) {
        rows.push([
          csvCell(img.name), num(img.w), num(img.h),
          csvCell(typeName(t)), csvCell(t && t.kind ? t.kind : 'thing'),
          inst, m.pts.length, num(area),
          k, num(m.pts[k][0]), num(m.pts[k][1])
        ].join(','));
      }
    });
    return rows.join('\r\n') + '\r\n';
  };

  /* Long format again: one row per keypoint, with the instance's box repeated.
     Wide format breaks the moment two skeletons have different point counts. */
  var POSE_COLUMNS = [
    'image_name', 'image_width', 'image_height',
    'class_name', 'instance_id', 'box_x', 'box_y', 'box_w', 'box_h',
    'keypoint_index', 'keypoint_name', 'x', 'y', 'visibility'
  ];

  App.buildPoseCSV = function () {
    var rows = [POSE_COLUMNS.join(',')];
    eachMarker(function (m) { return m.shape === 'pose'; }, function (img, m, t, inst) {
      var sk = t && t.skeleton, k, kp, name;
      for (k = 0; k < m.kps.length; k++) {
        kp = m.kps[k];
        name = (sk && sk.keypoints[k]) ? sk.keypoints[k].name : 'point_' + (k + 1);
        rows.push([
          csvCell(img.name), num(img.w), num(img.h),
          csvCell(typeName(t)), inst,
          num(m.cx - m.w / 2), num(m.cy - m.h / 2), num(m.w), num(m.h),
          k, csvCell(name),
          /* an absent keypoint has no meaningful position */
          kp[2] === App.VIS.ABSENT ? '' : num(kp[0]),
          kp[2] === App.VIS.ABSENT ? '' : num(kp[1]),
          kp[2]
        ].join(','));
      }
    });
    return rows.join('\r\n') + '\r\n';
  };

  App.buildSkeletonsJSON = function () {
    var out = {}, i, t;
    for (i = 0; i < App.state.types.length; i++) {
      t = App.state.types[i];
      if (t.shape !== 'pose' || !t.skeleton) continue;
      out[t.name] = {
        name: t.skeleton.name,
        keypoints: t.skeleton.keypoints,
        edges: t.skeleton.edges,
        flip: t.skeleton.flip,
        kpt_shape: [t.skeleton.keypoints.length, 3],
        flip_idx: window.Skeleton ? window.Skeleton.flipIdx(t.skeleton) : null
      };
    }
    return JSON.stringify(out, null, 2);
  };

  App.totalMarkers = function () {
    var n = 0, k;
    for (k in App.state.markers) n += App.state.markers[k].length;
    return n;
  };

  /** How many markers of each family exist, so the export can adapt. */
  App.exportTally = function () {
    var tally = { basic: 0, polygon: 0, pose: 0 }, k, list, i, m;
    for (k in App.state.markers) {
      list = App.state.markers[k];
      for (i = 0; i < list.length; i++) {
        m = list[i];
        if (BASIC_SHAPES[m.shape]) tally.basic += 1;
        else if (m.shape === 'polygon') tally.polygon += 1;
        else if (m.shape === 'pose') tally.pose += 1;
      }
    }
    return tally;
  };

  /**
   * Whichever kinds are present get a file; a lone kind downloads on its own,
   * several are bundled into a ZIP.
   */
  App.buildExportFiles = function () {
    var tally = App.exportTally(), files = [];
    if (tally.basic) files.push({ name: 'annotations.csv', text: App.buildCSV() });
    if (tally.polygon) files.push({ name: 'polygons.csv', text: App.buildPolygonCSV() });
    if (tally.pose) {
      files.push({ name: 'pose.csv', text: App.buildPoseCSV() });
      files.push({ name: 'skeletons.json', text: App.buildSkeletonsJSON() });
    }
    return files;
  };

  App.stamp = function () {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           '_' + p(d.getHours()) + p(d.getMinutes());
  };

  App.download = function (blob, filename) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  App.exportAll = function () {
    var files = App.buildExportFiles(), stamp = App.stamp(), i, entries;
    if (!files.length) return 0;

    if (files.length === 1) {
      App.download(
        new Blob(['﻿' + files[0].text], { type: 'text/csv;charset=utf-8' }),
        files[0].name.replace(/\.csv$/, '_' + stamp + '.csv')
      );
      return files.length;
    }

    entries = [];
    for (i = 0; i < files.length; i++) {
      entries.push({
        name: files[i].name,
        text: /\.csv$/.test(files[i].name) ? '﻿' + files[i].text : files[i].text
      });
    }
    App.download(window.Zip.create(entries), 'annotations_' + stamp + '.zip');
    return files.length;
  };

})();
