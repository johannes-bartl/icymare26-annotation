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
    locked: false,       // existing markers only editable while Shift is held
    ctrlDown: false,
    altDown: false,
    shiftDown: false,
    panel: 'files',
    sidebarCollapsed: false,
    onboarded: false,    // the first-run prompt has been answered, one way or another
    expanded: {},        // typeId -> its instance list is open in the sidebar
    sources: [],         // loaded annotation files: {id, name, added, classes, ...}
    boxCollapse: {       // display-only preference; annotations remain full boxes
      enabled: false,
      split: false,
      all:  { ax: 0.5, ay: 0.5 },
      tall: { ax: 0.5, ay: 1.0 },
      wide: { ax: 0.5, ay: 0.5 }
    }
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

  /**
   * Configured marker position for a rectangle collapsed on screen.
   * ax runs left -> right; ay runs bottom -> top. The point follows rotated
   * boxes as well, although collapsing never changes the stored geometry.
   */
  App.boxCollapseAnchor = function (m) {
    var cfg = App.state.boxCollapse,
        pos = cfg.split ? (m.h >= m.w ? cfg.tall : cfg.wide) : cfg.all,
        lx = (pos.ax - 0.5) * m.w,
        ly = (0.5 - pos.ay) * m.h;
    return App.toWorld(lx, ly, m.cx, m.cy, m.angle || 0);
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

  /**
   * Drop an image and everything drawn on it. Returns the id of the image that
   * should take focus, so the caller can keep the canvas on something sensible
   * rather than emptying it whenever a middle entry is removed.
   */
  App.removeImage = function (imageId) {
    var s = App.state, i = -1, j, next = null;
    for (j = 0; j < s.images.length; j++) if (s.images[j].id === imageId) i = j;
    if (i === -1) return s.activeImageId;

    App.pushUndo();
    try { URL.revokeObjectURL(s.images[i].url); } catch (e) { /* already gone */ }
    delete s.markers[imageId];
    s.images.splice(i, 1);

    if (s.activeImageId === imageId) {
      /* the next image down, or the new last one if we removed the tail */
      next = s.images.length ? s.images[Math.min(i, s.images.length - 1)].id : null;
      s.activeImageId = next;
      s.selection = [];
    }
    App.save();
    return s.activeImageId;
  };

  /* ------------------------------------------------------- marker properties

     One description of what a marker exposes, shared by the readout on the
     canvas and the editable fields in the sidebar, so the two can never
     disagree about what a mode has.

     Every value is in absolute image pixels, matching the export. `x, y` is
     always the top-left corner of the shape's own box, never its centre.      */

  var FIELDS = {
    point:   [['x', 'X'], ['y', 'Y']],
    rect:    [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']],
    ellipse: [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']],
    line:    [['x1', 'X1'], ['y1', 'Y1'], ['x2', 'X2'], ['y2', 'Y2']],
    polygon: [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']],
    pose:    [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']]
  };

  /** Editable fields for a marker, as [{key, label}]. */
  App.markerFields = function (m, t) {
    var out = (FIELDS[m.shape] || []).map(function (f) { return { key: f[0], label: f[1] }; });
    if ((m.shape === 'rect' || m.shape === 'ellipse') && t && t.rotatable) {
      out.push({ key: 'angle', label: 'Angle', unit: 'deg' });
    }
    return out;
  };

  /** Read one field, in image pixels (or degrees for `angle`). */
  App.readField = function (m, key) {
    var b;
    if (m.shape === 'line') return m[key];
    if (m.shape === 'point') return key === 'x' ? m.cx : m.cy;
    if (m.shape === 'polygon') {
      b = App.bboxOf(m);
      if (key === 'x') return b.x1;
      if (key === 'y') return b.y1;
      if (key === 'w') return b.x2 - b.x1;
      if (key === 'h') return b.y2 - b.y1;
      return 0;
    }
    /* rect, ellipse, pose all carry a centre plus a size */
    if (key === 'x') return m.cx - m.w / 2;
    if (key === 'y') return m.cy - m.h / 2;
    if (key === 'w') return m.w;
    if (key === 'h') return m.h;
    if (key === 'angle') return m.angle || 0;
    return 0;
  };

  /**
   * Write one field. A polygon has no centre or size of its own, so setting
   * its box translates or scales every vertex — which is exactly what someone
   * nudging a traced outline into place wants.
   */
  App.writeField = function (m, key, v, img) {
    var b, i, sx, sy;
    if (!isFinite(v)) return false;

    if (m.shape === 'line') { m[key] = v; }
    else if (m.shape === 'point') { if (key === 'x') m.cx = v; else m.cy = v; }
    else if (m.shape === 'polygon') {
      b = App.bboxOf(m);
      if (key === 'x') { for (i = 0; i < m.pts.length; i++) m.pts[i][0] += v - b.x1; }
      else if (key === 'y') { for (i = 0; i < m.pts.length; i++) m.pts[i][1] += v - b.y1; }
      else if (key === 'w') {
        if (b.x2 - b.x1 < 0.01) return false;          // nothing to scale from
        sx = Math.max(v, 1) / (b.x2 - b.x1);
        for (i = 0; i < m.pts.length; i++) m.pts[i][0] = b.x1 + (m.pts[i][0] - b.x1) * sx;
      } else if (key === 'h') {
        if (b.y2 - b.y1 < 0.01) return false;
        sy = Math.max(v, 1) / (b.y2 - b.y1);
        for (i = 0; i < m.pts.length; i++) m.pts[i][1] = b.y1 + (m.pts[i][1] - b.y1) * sy;
      }
    } else {
      /* rect, ellipse, pose. Resizing holds the top-left corner still, so
         typing a width grows the shape rightwards rather than from its middle. */
      if (key === 'x') m.cx = v + m.w / 2;
      else if (key === 'y') m.cy = v + m.h / 2;
      else if (key === 'w') { var l = m.cx - m.w / 2; m.w = Math.max(v, 1); m.cx = l + m.w / 2; }
      else if (key === 'h') { var tp = m.cy - m.h / 2; m.h = Math.max(v, 1); m.cy = tp + m.h / 2; }
      else if (key === 'angle') m.angle = ((v % 360) + 360) % 360;
    }
    if (img && img.w) App.clampMarker(m, img.w, img.h);
    return true;
  };

  function tidy(v) {
    var r = Math.round(v * 10) / 10;
    return (r === Math.round(r)) ? String(Math.round(r)) : r.toFixed(1);
  }
  App.tidy = tidy;

  /** Facts about a marker that are worth showing but are not editable. */
  App.markerExtras = function (m, t) {
    var out = [], done, len;
    if (m.shape === 'line') {
      len = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
      out.push({ label: 'Length', value: tidy(len) + ' px' });
      out.push({ label: 'Angle', value: tidy(Math.atan2(m.y2 - m.y1, m.x2 - m.x1) * 180 / Math.PI) + ' °' });
    } else if (m.shape === 'polygon') {
      out.push({ label: 'Vertices', value: String(m.pts.length) });
      out.push({ label: 'Area', value: tidy(App.polygonArea(m.pts)) + ' px²' });
    } else if (m.shape === 'pose') {
      done = App.poseProgress(m);
      out.push({ label: 'Confirmed', value: done.done + ' of ' + done.total });
    }
    void t;
    return out;
  };

  /** One-line geometry summary, for the readout that follows the cursor. */
  App.markerSummary = function (m, t) {
    var f = App.markerFields(m, t), parts = [], i, len;
    for (i = 0; i < f.length; i++) {
      parts.push(f[i].label + ' ' + tidy(App.readField(m, f[i].key)) + (f[i].unit === 'deg' ? '°' : ''));
    }
    if (m.shape === 'line') {
      len = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
      parts.push('len ' + tidy(len));
    } else if (m.shape === 'polygon') {
      parts.push(m.pts.length + ' pts');
    } else if (m.shape === 'pose') {
      parts.push(App.poseProgress(m).done + '/' + m.kps.length + ' pts');
    }
    return parts.join('   ');
  };

  /** Every marker of a type, across every image, in image order. */
  App.instancesOf = function (typeId) {
    var s = App.state, out = [], i, j, img, list, n;
    for (i = 0; i < s.images.length; i++) {
      img = s.images[i];
      list = s.markers[img.id] || [];
      n = 0;
      for (j = 0; j < list.length; j++) {
        if (list[j].typeId !== typeId) continue;
        n += 1;
        out.push({ marker: list[j], image: img, index: n });
      }
    }
    return out;
  };

  /* ----------------------------------------------------------------- undo */

  var undoStack = [], redoStack = [], UNDO_LIMIT = 60;

  /* Loaded annotation files travel with the markers they brought: undoing a
     file's removal has to put the file back in the list too, or its markers
     return with nothing left that knows where they came from. */
  function snapshot() {
    return JSON.stringify({
      markers: App.state.markers, types: App.state.types, sources: App.state.sources
    });
  }
  function restore(str) {
    var d = JSON.parse(str);
    App.state.markers = d.markers;
    App.state.types = d.types;
    App.state.sources = d.sources || [];
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

     Geometry follows the layouts YOLO uses for each task, so a row maps onto a
     label line without rearranging anything:

       Detect    cls  xc yc w h
       OBB       cls  x1 y1 x2 y2 x3 y3 x4 y4
       Segment   cls  x1 y1 x2 y2 ... xn yn
       Pose 2D   cls  xc yc w h  px1 py1 px2 py2 ...
       Pose 3D   cls  xc yc w h  px1 py1 v1 px2 py2 v2 ...

     Points and lines have no YOLO task of their own, so they keep the obvious
     shape: x y, and x1 y1 x2 y2.

     A rotatable rectangle or ellipse is written as an oriented box - its four
     corners in order - because xc/yc/w/h cannot carry an angle. Everything
     else stays axis-aligned.

     Values are absolute image pixels, not normalised: image_width and
     image_height sit on every row, so dividing through is one step, while
     recovering pixels from normalised values without them is impossible.     */

  var HEAD = ['image_name', 'image_width', 'image_height', 'class_name'];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function num(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return (Math.round(v * 100) / 100).toString();
  }

  /** The four corners of a rotated box, clockwise from its top-left. */
  App.cornersOf = function (m) {
    var hw = m.w / 2, hh = m.h / 2, a = m.angle || 0, i, out = [],
        local = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], p;
    for (i = 0; i < 4; i++) {
      p = App.toWorld(local[i][0], local[i][1], m.cx, m.cy, a);
      out.push(p.x, p.y);
    }
    return out;
  };

  /* Which file a marker belongs in. Rotation changes the encoding, so it also
     changes the file - one set of columns per file, always. */
  var GROUPS = {
    points:         { label: 'Points',             shape: 'point' },
    lines:          { label: 'Lines',              shape: 'line' },
    rectangles:     { label: 'Rectangles',         shape: 'rect' },
    rectangles_obb: { label: 'Rectangles (OBB)',   shape: 'rect' },
    ellipses:       { label: 'Ellipses',           shape: 'ellipse' },
    ellipses_obb:   { label: 'Ellipses (OBB)',     shape: 'ellipse' },
    polygons:       { label: 'Polygons',           shape: 'polygon' },
    poses:          { label: 'Poses',              shape: 'pose' },
    poses_3d:       { label: 'Poses (visibility)', shape: 'pose' }
  };

  var GROUP_ORDER = ['points', 'lines', 'rectangles', 'rectangles_obb',
                     'ellipses', 'ellipses_obb', 'polygons', 'poses', 'poses_3d'];

  App.GROUPS = GROUPS;

  App.groupOf = function (m, t) {
    switch (m.shape) {
      case 'point':   return 'points';
      case 'line':    return 'lines';
      case 'rect':    return (t && t.rotatable) ? 'rectangles_obb' : 'rectangles';
      case 'ellipse': return (t && t.rotatable) ? 'ellipses_obb' : 'ellipses';
      case 'polygon': return 'polygons';
      case 'pose':    return (t && t.pose3d) ? 'poses_3d' : 'poses';
      default:        return null;
    }
  };

  /** The numbers one marker contributes, after the shared head columns. */
  function geomOf(m, group) {
    var out = [], i, kp;

    if (group === 'points') return [m.cx, m.cy];
    if (group === 'lines') return [m.x1, m.y1, m.x2, m.y2];
    if (group === 'rectangles' || group === 'ellipses') return [m.cx, m.cy, m.w, m.h];
    if (group === 'rectangles_obb' || group === 'ellipses_obb') return App.cornersOf(m);

    if (group === 'polygons') {
      out.push(m.pts.length);
      for (i = 0; i < m.pts.length; i++) out.push(m.pts[i][0], m.pts[i][1]);
      return out;
    }

    /* poses: the box, then every keypoint in skeleton order */
    out.push(m.cx, m.cy, m.w, m.h, m.kps.length);
    for (i = 0; i < m.kps.length; i++) {
      kp = m.kps[i];
      if (group === 'poses_3d') {
        out.push(kp[2] === App.VIS.ABSENT ? '' : kp[0],
                 kp[2] === App.VIS.ABSENT ? '' : kp[1], kp[2]);
      } else {
        /* a 2D pose has nowhere to say "absent", so those sit at the origin,
           which is what YOLO itself does with an unlabelled keypoint */
        out.push(kp[2] === App.VIS.ABSENT ? 0 : kp[0],
                 kp[2] === App.VIS.ABSENT ? 0 : kp[1]);
      }
    }
    return out;
  }

  /** Column names sized to the widest row, so ragged rows still line up. */
  function headerFor(group, widest) {
    var cols = HEAD.slice(), i, n;

    if (group === 'points') return cols.concat(['x', 'y']);
    if (group === 'lines') return cols.concat(['x1', 'y1', 'x2', 'y2']);
    if (group === 'rectangles' || group === 'ellipses') return cols.concat(['xc', 'yc', 'w', 'h']);
    if (group === 'rectangles_obb' || group === 'ellipses_obb') {
      return cols.concat(['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'x4', 'y4']);
    }

    if (group === 'polygons') {
      cols.push('n_vertices');
      n = (widest - 1) / 2;
      for (i = 1; i <= n; i++) cols.push('x' + i, 'y' + i);
      return cols;
    }

    cols.push('xc', 'yc', 'w', 'h', 'n_keypoints');
    n = group === 'poses_3d' ? (widest - 5) / 3 : (widest - 5) / 2;
    for (i = 1; i <= n; i++) {
      cols.push('px' + i, 'py' + i);
      if (group === 'poses_3d') cols.push('v' + i);
    }
    return cols;
  }

  /**
   * Rows for one file. Polygons and poses vary in length, so every row is
   * padded out to the widest one, and n_vertices / n_keypoints says where the
   * real values stop.
   */
  App.buildGroupCSV = function (group) {
    var s = App.state, body = [], widest = 0, i, j, img, list, m, t, g, row, header, rows;

    for (i = 0; i < s.images.length; i++) {
      img = s.images[i];
      list = s.markers[img.id] || [];
      for (j = 0; j < list.length; j++) {
        m = list[j];
        t = App.getType(m.typeId);
        if (App.groupOf(m, t) !== group) continue;
        g = geomOf(m, group);
        if (g.length > widest) widest = g.length;
        body.push({
          head: [csvCell(img.name), num(img.w), num(img.h), csvCell(t ? t.name : '(deleted type)')],
          geom: g
        });
      }
    }
    if (!body.length) return '';

    header = headerFor(group, widest);
    rows = [header.join(',')];
    for (i = 0; i < body.length; i++) {
      row = body[i].head.slice();
      for (j = 0; j < widest; j++) {
        row.push(j < body[i].geom.length
          ? (typeof body[i].geom[j] === 'string' ? body[i].geom[j] : num(body[i].geom[j]))
          : '');
      }
      rows.push(row.join(','));
    }
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
        kpt_shape: [t.skeleton.keypoints.length, t.pose3d ? 3 : 2],
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

  /** Markers in one export group, and which types contributed them. */
  function groupTally(group) {
    var s = App.state, k, list, i, m, t, n = 0, names = [], seen = {};
    for (k in s.markers) {
      list = s.markers[k];
      for (i = 0; i < list.length; i++) {
        m = list[i];
        t = App.getType(m.typeId);
        if (App.groupOf(m, t) !== group) continue;
        n += 1;
        if (t && !seen[t.name]) { seen[t.name] = 1; names.push(t.name); }
      }
    }
    return { count: n, types: names };
  }

  function poseTypeCount() {
    var n = 0, i;
    for (i = 0; i < App.state.types.length; i++) {
      if (App.state.types[i].shape === 'pose' && App.state.types[i].skeleton) n += 1;
    }
    return n;
  }

  /**
   * The files an export would produce right now. Drives both the export menu
   * and the download, so the menu can never offer a file that comes out empty.
   */
  App.exportFiles = function () {
    var out = [], i, g, tally, poses = 0;

    for (i = 0; i < GROUP_ORDER.length; i++) {
      g = GROUP_ORDER[i];
      tally = groupTally(g);
      if (!tally.count) continue;
      if (g === 'poses' || g === 'poses_3d') poses += tally.count;
      out.push({
        name: g + '.csv',
        label: GROUPS[g].label,
        shape: GROUPS[g].shape,
        types: tally.types,
        count: tally.count,
        text: App.buildGroupCSV(g)
      });
    }

    if (poses) {
      out.push({
        name: 'skeletons.json',
        label: 'Skeleton blueprints',
        shape: 'pose',
        types: [],
        count: poseTypeCount(),
        isJSON: true,
        text: App.buildSkeletonsJSON()
      });
    }
    return out;
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

  /* A BOM keeps Excel from mangling non-ASCII class names. Built from its code
     point rather than written literally, so no encoding round-trip can mangle it. */
  var BOM = String.fromCharCode(0xFEFF);

  function blobFor(file) {
    return /\.csv$/.test(file.name)
      ? new Blob([BOM + file.text], { type: 'text/csv;charset=utf-8' })
      : new Blob([file.text], { type: 'application/json;charset=utf-8' });
  }

  App.downloadFile = function (file) {
    App.download(blobFor(file), file.name.replace(/(\.\w+)$/, '_' + App.stamp() + '$1'));
  };

  App.downloadAll = function () {
    var files = App.exportFiles(), entries = [], i;
    if (!files.length) return 0;
    if (files.length === 1) { App.downloadFile(files[0]); return 1; }

    for (i = 0; i < files.length; i++) {
      entries.push({
        name: files[i].name,
        text: /\.csv$/.test(files[i].name) ? BOM + files[i].text : files[i].text
      });
    }
    App.download(window.Zip.create(entries), 'annotations_' + App.stamp() + '.zip');
    return files.length;
  };

})();
