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

  App.SHAPES = ['point', 'rect', 'line', 'ellipse'];

  App.SHAPE_LABEL = {
    point: 'Point', rect: 'Rectangle', line: 'Line', ellipse: 'Ellipse'
  };

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
    var a, c, s, ex, ey, rx, ry;
    if (m.shape === 'point') {
      return { x1: m.cx, y1: m.cy, x2: m.cx, y2: m.cy };
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
    return { x: m.cx, y: m.cy };
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
    if (m.shape === 'line') { m.x1 += dx; m.y1 += dy; m.x2 += dx; m.y2 += dy; }
    else { m.cx += dx; m.cy += dy; }
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

  /* ---------------------------------------------------------- persistence */

  var STORE_KEY = 'icymare-annotator-v1';
  var saveTimer = null;

  /** Stable identity for an image file across sessions. */
  App.imageKey = function (file) { return file.name + '|' + file.size; };

  App.save = function () {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(App.saveNow, 400);
  };

  App.saveNow = function () {
    try {
      var s = App.state, byKey = {}, i, img;
      for (i = 0; i < s.images.length; i++) {
        img = s.images[i];
        byKey[img.key] = { w: img.w, h: img.h, markers: s.markers[img.id] || [] };
      }
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1, types: s.types, activeTypeId: s.activeTypeId, images: byKey
      }));
    } catch (e) { /* quota or private mode — annotation still works in-session */ }
  };

  App.loadStore = function () {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  /** Re-attach stored annotations to a freshly added image. */
  App.hydrateImage = function (img) {
    var store = App.loadStore();
    if (!store || !store.images || !store.images[img.key]) return;
    var rec = store.images[img.key];
    if (rec.w && !img.w) { img.w = rec.w; img.h = rec.h; }
    App.state.markers[img.id] = rec.markers || [];
  };

  App.clearStore = function () {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  };

  /* ----------------------------------------------------------- CSV export */

  var CSV_COLUMNS = [
    'image_name', 'image_width', 'image_height',
    'marker_id', 'class_name', 'marker_type',
    'cx', 'cy', 'width', 'height', 'angle_deg',
    'x1', 'y1', 'x2', 'y2',
    'bbox_x1', 'bbox_y1', 'bbox_x2', 'bbox_y2'
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

  App.buildCSV = function () {
    var s = App.state, rows = [CSV_COLUMNS.join(',')], i, j, img, list, m, t, b, c, row;

    for (i = 0; i < s.images.length; i++) {
      img = s.images[i];
      list = s.markers[img.id] || [];
      for (j = 0; j < list.length; j++) {
        m = list[j];
        t = App.getType(m.typeId);
        b = App.bboxOf(m);
        c = App.centerOf(m);
        row = [
          csvCell(img.name), num(img.w), num(img.h),
          csvCell(m.id), csvCell(t ? t.name : '(deleted type)'), csvCell(m.shape),
          num(c.x), num(c.y),
          m.shape === 'point' ? '0' : num(m.shape === 'line' ? b.x2 - b.x1 : m.w),
          m.shape === 'point' ? '0' : num(m.shape === 'line' ? b.y2 - b.y1 : m.h),
          num(m.shape === 'line'
            ? Math.atan2(m.y2 - m.y1, m.x2 - m.x1) * 180 / Math.PI
            : (m.angle || 0)),
          m.shape === 'line' ? num(m.x1) : '',
          m.shape === 'line' ? num(m.y1) : '',
          m.shape === 'line' ? num(m.x2) : '',
          m.shape === 'line' ? num(m.y2) : '',
          num(b.x1), num(b.y1), num(b.x2), num(b.y2)
        ];
        rows.push(row.join(','));
      }
    }
    return rows.join('\r\n') + '\r\n';
  };

  App.totalMarkers = function () {
    var n = 0, k;
    for (k in App.state.markers) n += App.state.markers[k].length;
    return n;
  };

  App.downloadCSV = function () {
    var csv = App.buildCSV(),
        blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
        url = URL.createObjectURL(blob),
        d = new Date(),
        pad = function (n) { return (n < 10 ? '0' : '') + n; },
        stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                '_' + pad(d.getHours()) + pad(d.getMinutes()),
        a = document.createElement('a');
    a.href = url;
    a.download = 'annotations_' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

})();
