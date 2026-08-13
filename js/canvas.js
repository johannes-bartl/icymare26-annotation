/* ============================================================================
   canvas.js — pan/zoom viewport, marker rendering, and all mouse interaction.

   Mouse map
     left  drag on empty canvas .... draw a new marker (annotate tool)
                                     rubber-band select (select tool)
     left  drag on a handle ........ resize, rotate, or move a point
     right drag .................... pan          (middle drag and space+drag too)
     wheel ......................... zoom at cursor
     Ctrl held / delete tool ....... left click removes the marker under the cursor

   Markers are outlines with no fill, so the inside of a box is still free
   canvas: you draw a new marker there. Editing happens through the handles,
   which appear as soon as the cursor comes near a marker's edge.

   `view.rot` turns the image on screen in 90° steps. It is a display-only
   transform — marker coordinates are always stored, edited and exported in
   the original image's pixel frame.
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App;
  var Canvas = window.Canvas = {};

  var canvas, ctx, stage, dpr = 1;
  var view = Canvas.view = { scale: 1, x: 0, y: 0, rot: 0 };

  var HANDLE_R = 4.5;          // screen px, half-size of a resize handle
  var HIT_TOL = 7;             // screen px slack for hit-testing thin shapes
  var EDGE_TOL = 11;           // screen px — how close counts as "near an edge"
  var REACH_PAD = 34;          // screen px past the bounding box that stays armed
  var POINT_R = 11;            // screen px grab radius around a point marker
  var ROT_OFFSET = 26;         // screen px above the shape for the rotation grip
  var MIN_SIZE = 3;            // image px, smallest marker we will keep

  var imgCache = {};           // imageId -> HTMLImageElement

  var CLOSE_TOL = 10;          // screen px around the first vertex that closes a polygon
  var TRACE_STEP = 9;          // screen px between points when tracing a polygon by dragging
  var MIN_POLY_PTS = 3;

  /* interaction state */
  var drag = null;             // {mode, ...}
  var pending = null;          // polygon under construction: {type, pts, cursor}
  var hoverEdgeId = null;      // marker whose handles are currently revealed
  var hoverBodyId = null;      // marker under the cursor (delete / select tool)
  var hoverHandle = null;
  var hoverInsert = null;      // {marker, index, x, y} — where a new vertex would go
  var spaceDown = false;
  var rafPending = false;
  var lastPointer = null;      // screen coords, for thinning out dense handles

  var DENSE_VERTS = 12;        // above this, a polygon only shows handles near the cursor
  var DENSE_RADIUS = 70;       // screen px

  /* ------------------------------------------------------------------ init */

  Canvas.init = function () {
    canvas = document.getElementById('canvas');
    stage = document.getElementById('stage');
    ctx = canvas.getContext('2d');

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('dblclick', function () { if (pending) Canvas.commitPending(); });
    stage.addEventListener('pointerleave', onLeave);
  };

  function resize() {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    var r = stage.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    Canvas.render();
  }

  Canvas.setSpace = function (down) { spaceDown = down; updateCursor(); };

  /* ------------------------------------------------------------ transforms */

  /** Size of the image as it currently appears on screen. */
  function rotDims() {
    var img = App.activeImage();
    if (!img) return { w: 0, h: 0 };
    return (view.rot % 2) ? { w: img.h, h: img.w } : { w: img.w, h: img.h };
  }

  /** Image pixel -> rotated display space. */
  function rotate(px, py) {
    var img = App.activeImage();
    if (!img) return { x: px, y: py };
    switch (view.rot) {
      case 1:  return { x: img.h - py, y: px };
      case 2:  return { x: img.w - px, y: img.h - py };
      case 3:  return { x: py,         y: img.w - px };
      default: return { x: px,         y: py };
    }
  }

  /** Rotated display space -> image pixel. */
  function unrotate(rx, ry) {
    var img = App.activeImage();
    if (!img) return { x: rx, y: ry };
    switch (view.rot) {
      case 1:  return { x: ry,         y: img.h - rx };
      case 2:  return { x: img.w - rx, y: img.h - ry };
      case 3:  return { x: img.w - ry, y: rx };
      default: return { x: rx,         y: ry };
    }
  }

  function toScreen(px, py) {
    var r = rotate(px, py);
    return { x: r.x * view.scale + view.x, y: r.y * view.scale + view.y };
  }

  function toImage(sx, sy) {
    return unrotate((sx - view.x) / view.scale, (sy - view.y) / view.scale);
  }

  function evPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** A marker's rotation as it appears on screen, in degrees. */
  function screenAngle(m) { return (m.angle || 0) + 90 * view.rot; }

  Canvas.fit = function () {
    var d = rotDims();
    if (!d.w) return;
    var r = stage.getBoundingClientRect(),
        pad = 48,
        s = Math.min((r.width - pad) / d.w, (r.height - pad - 26) / d.h);
    view.scale = App.clamp(s, 0.02, 8);
    view.x = (r.width - d.w * view.scale) / 2;
    view.y = (r.height - 26 - d.h * view.scale) / 2;
    Canvas.render();
  };

  Canvas.zoomAt = function (factor, sx, sy) {
    var r, before, after;
    if (sx === undefined) {
      r = stage.getBoundingClientRect();
      sx = r.width / 2; sy = r.height / 2;
    }
    before = toImage(sx, sy);
    view.scale = App.clamp(view.scale * factor, 0.02, 40);
    after = toScreen(before.x, before.y);
    view.x += sx - after.x;
    view.y += sy - after.y;
    Canvas.render();
  };

  Canvas.resetZoom = function () {
    var r = stage.getBoundingClientRect();
    Canvas.zoomAt(1 / view.scale, r.width / 2, (r.height - 26) / 2);
  };

  /** Turn the image 90° clockwise on screen. Stored coordinates never change. */
  Canvas.rotateView = function () {
    view.rot = (view.rot + 1) % 4;
    Canvas.fit();
    if (window.UI) window.UI.updateStatus();
  };

  /* ------------------------------------------------------------- image load */

  Canvas.showImage = function (img, done) {
    if (!img) { Canvas.render(); return; }
    var el = imgCache[img.id];
    if (el && el.complete) { afterLoad(img, el, done); return; }
    el = new Image();
    el.onload = function () { afterLoad(img, el, done); };
    el.onerror = function () { if (done) done(); };
    el.src = img.url;
    imgCache[img.id] = el;
  };

  function afterLoad(img, el, done) {
    img.w = el.naturalWidth;
    img.h = el.naturalHeight;
    img.loaded = true;
    Canvas.fit();
    if (done) done();
  }

  /* ---------------------------------------------------------------- render */

  Canvas.render = function () {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; draw(); });
  };

  function draw() {
    if (!ctx) return;
    var img = App.activeImage(), el = img ? imgCache[img.id] : null, i,
        markers = App.activeMarkers(), sel = App.state.selection, d;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    if (!img || !el || !el.complete || !img.w) return;

    /* image, under the display rotation */
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    switch (view.rot) {
      case 1: ctx.transform(0, 1, -1, 0, img.h, 0); break;
      case 2: ctx.transform(-1, 0, 0, -1, img.w, img.h); break;
      case 3: ctx.transform(0, -1, 1, 0, 0, img.w); break;
      default: break;
    }
    ctx.imageSmoothingEnabled = view.scale < 3;
    ctx.drawImage(el, 0, 0, img.w, img.h);
    ctx.restore();

    /* image border */
    d = rotDims();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(view.x + .5, view.y + .5, d.w * view.scale, d.h * view.scale);

    /* markers: unselected first so the selection always sits on top */
    for (i = 0; i < markers.length; i++) {
      if (sel.indexOf(markers[i].id) === -1) drawMarker(markers[i], false);
    }
    for (i = 0; i < markers.length; i++) {
      if (sel.indexOf(markers[i].id) !== -1) drawMarker(markers[i], true);
    }

    /* in-progress shape */
    if (drag && drag.mode === 'create' && drag.preview) drawMarker(drag.preview, false, true);
    if (pending) drawPending();
    if (hoverInsert && !drag) drawInsertGhost();

    /* rubber band */
    if (drag && drag.mode === 'band') {
      var x = Math.min(drag.sx, drag.mx), y = Math.min(drag.sy, drag.my),
          w = Math.abs(drag.mx - drag.sx), h = Math.abs(drag.my - drag.sy);
      ctx.fillStyle = 'rgba(76,154,255,.14)';
      ctx.strokeStyle = 'rgba(120,180,255,.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + .5, y + .5, w, h);
      ctx.setLineDash([]);
    }
  }

  function pathFor(m) {
    var c, hw, hh, p1, p2, i;
    if (m.shape === 'polygon') {
      ctx.beginPath();
      for (i = 0; i < m.pts.length; i++) {
        c = toScreen(m.pts[i][0], m.pts[i][1]);
        if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
      }
      ctx.closePath();
      return;
    }
    if (m.shape === 'pose') {
      c = toScreen(m.cx - m.w / 2, m.cy - m.h / 2);
      p1 = toScreen(m.cx + m.w / 2, m.cy + m.h / 2);
      ctx.beginPath();
      ctx.rect(c.x, c.y, p1.x - c.x, p1.y - c.y);
      return;
    }
    if (m.shape === 'rect' || m.shape === 'ellipse') {
      c = toScreen(m.cx, m.cy);
      hw = Math.max((m.w / 2) * view.scale, .5);
      hh = Math.max((m.h / 2) * view.scale, .5);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(App.deg2rad(screenAngle(m)));
      ctx.beginPath();
      if (m.shape === 'rect') ctx.rect(-hw, -hh, hw * 2, hh * 2);
      else ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      ctx.restore();
      return;
    }
    if (m.shape === 'line') {
      p1 = toScreen(m.x1, m.y1); p2 = toScreen(m.x2, m.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      return;
    }
    c = toScreen(m.cx, m.cy);                    // point
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2);
  }

  /** Outlines only — the interior of every marker stays free canvas. */
  function drawMarker(m, selected, ghost) {
    var t = App.getType(m.typeId),
        color = t ? t.color : '#c3ccd8',
        doomed = isDeleteMode() && hoverBodyId === m.id,
        stroke = doomed ? '#ff4d4d' : color,
        active = hoverEdgeId === m.id,
        c, p1, p2;

    ctx.lineWidth = (selected || active) ? 2.5 : 2;
    ctx.strokeStyle = stroke;
    if (ghost) ctx.setLineDash([5, 4]);

    if (m.shape === 'point') {
      c = toScreen(m.cx, m.cy);
      ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = stroke; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, active || selected ? 10 : 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.shape === 'pose') {
      ctx.setLineDash(ghost ? [5, 4] : [6, 5]);   // the box is context, not the annotation
      ctx.lineWidth = 1.5;
      pathFor(m); ctx.stroke();
      ctx.setLineDash([]);
      drawSkeleton(m, stroke, active || selected);
    } else {
      pathFor(m); ctx.stroke();
    }
    ctx.setLineDash([]);

    if (ghost) return;

    /* selected markers keep a halo so a bulk selection stays readable */
    if (selected && m.shape !== 'point') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      pathFor(m); ctx.stroke();
      ctx.restore();
    }

    if ((active || selected) && !isDeleteMode()) drawHandles(m);
    void p1; void p2;
  }

  /** The polygon being clicked out, with a rubber band to the cursor. */
  function drawPending() {
    var color = pending.type.color, i, p, first, closable;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < pending.pts.length; i++) {
      p = toScreen(pending.pts[i][0], pending.pts[i][1]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    if (pending.cursor) {
      p = toScreen(pending.pts[pending.pts.length - 1][0], pending.pts[pending.pts.length - 1][1]);
      var c = toScreen(pending.cursor.x, pending.cursor.y);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = hexA(color, .8);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      if (pending.pts.length >= 2) {
        first = toScreen(pending.pts[0][0], pending.pts[0][1]);
        ctx.strokeStyle = hexA(color, .35);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(first.x, first.y); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    for (i = 0; i < pending.pts.length; i++) {
      p = toScreen(pending.pts[i][0], pending.pts[i][1]);
      closable = i === 0 && pending.pts.length >= 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, closable ? 6 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = closable ? '#fff' : color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = closable ? color : '#0e1116';
      ctx.stroke();
    }
  }

  /** Hollow "+" sitting on the edge, marking where a click adds a vertex. */
  function drawInsertGhost() {
    var t = App.getType(hoverInsert.marker.typeId),
        color = t ? t.color : '#c3ccd8',
        x = hoverInsert.x, y = hoverInsert.y;
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14,17,22,.85)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
    ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function hexA(hex, alpha) {
    var h = hex.replace('#', ''), r, g, b;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function readableOn(hex) {
    var h = hex.replace('#', ''), r, g, b;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#10141a' : '#ffffff';
  }

  /**
   * Bones, then keypoints. A point the user has not confirmed yet is drawn
   * hollow and faded, so a template that was dropped in and never adjusted
   * can never be mistaken for a finished annotation.
   */
  function drawSkeleton(m, color, active) {
    var t = App.getType(m.typeId), sk = t && t.skeleton, i, e, a, b, k, p, r, tag = null;
    if (!sk) return;

    ctx.lineWidth = 2;
    for (i = 0; i < sk.edges.length; i++) {
      e = sk.edges[i];
      a = m.kps[e[0]]; b = m.kps[e[1]];
      if (!a || !b || a[2] === App.VIS.ABSENT || b[2] === App.VIS.ABSENT) continue;
      ctx.strokeStyle = hexA(color, (a[3] && b[3]) ? 0.9 : 0.3);
      var pa = toScreen(a[0], a[1]), pb = toScreen(b[0], b[1]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }

    for (i = 0; i < m.kps.length; i++) {
      k = m.kps[i];
      p = toScreen(k[0], k[1]);
      r = active ? 5 : 4;

      if (k[2] === App.VIS.ABSENT) {                      // absent: a faint cross
        ctx.strokeStyle = hexA(color, .35);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - 3.5, p.y - 3.5); ctx.lineTo(p.x + 3.5, p.y + 3.5);
        ctx.moveTo(p.x + 3.5, p.y - 3.5); ctx.lineTo(p.x - 3.5, p.y + 3.5);
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (k[2] === App.VIS.VISIBLE && k[3]) {
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.stroke();
      } else {                                            // occluded, or untouched
        ctx.fillStyle = 'rgba(10,14,20,.65)'; ctx.fill();
        ctx.strokeStyle = hexA(color, k[3] ? .95 : .45);
        ctx.lineWidth = k[3] ? 2 : 1.5;
        if (!k[3]) ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      /* name the point the cursor is actually on — all 17 at once is noise.
         Held back to a second pass so later keypoints cannot paint over it. */
      if (hoverHandle && hoverHandle.marker === m && hoverHandle.id === 'k' + i && sk.keypoints[i]) {
        tag = { text: sk.keypoints[i].name + visSuffix(k[2]), x: p.x + 9, y: p.y - 8 };
      }
    }

    if (tag) drawTag(tag.text, tag.x, tag.y, color);
  }

  function visSuffix(v) {
    return v === App.VIS.OCCLUDED ? '  (occluded)' : (v === App.VIS.ABSENT ? '  (absent)' : '');
  }

  function drawTag(text, x, y, color) {
    ctx.font = '600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    var w = ctx.measureText(text).width + 10, h = 16;
    ctx.fillStyle = hexA(color, .95);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y - h / 2, w, h, 3); else ctx.rect(x, y - h / 2, w, h);
    ctx.fill();
    ctx.fillStyle = readableOn(color);
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y + .5);
  }

  function drawHandles(m) {
    var hs = handlesOf(m), i, h,
        /* A traced polygon can carry dozens of vertices spaced a handle-width
           apart; drawing them all hides the outline under its own dots. Show
           only the ones in reach of the cursor — every handle stays grabbable. */
        thin = m.shape === 'polygon' && m.pts.length > DENSE_VERTS && lastPointer;

    for (i = 0; i < hs.length; i++) {
      h = hs[i];
      if (thin && Math.hypot(h.x - lastPointer.x, h.y - lastPointer.y) > DENSE_RADIUS) continue;
      /* a pose keypoint is already drawn by the skeleton — a white blob on top
         of it would only hide the visibility state */
      if (h.kp) continue;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0e1116';
      ctx.lineWidth = 1;
      if (h.id === 'rot') {
        var edge = rotAnchor(m).edge;
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath();
        ctx.moveTo(edge.x, edge.y); ctx.lineTo(h.x, h.y);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(h.x, h.y, HANDLE_R + .5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#0e1116'; ctx.stroke();
      } else if (m.shape === 'line' || m.shape === 'point' || m.shape === 'polygon') {
        ctx.beginPath(); ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
        ctx.fill(); ctx.stroke();
      }
    }
  }

  /* --------------------------------------------------------------- handles */

  var RECT_HANDLES = [
    { id: 'nw', fx: -1, fy: -1 }, { id: 'n', fx: 0, fy: -1 }, { id: 'ne', fx: 1, fy: -1 },
    { id: 'e', fx: 1, fy: 0 },   { id: 'se', fx: 1, fy: 1 },  { id: 's', fx: 0, fy: 1 },
    { id: 'sw', fx: -1, fy: 1 }, { id: 'w', fx: -1, fy: 0 }
  ];

  function rotAnchor(m) {
    var top = App.toWorld(0, -m.h / 2, m.cx, m.cy, m.angle || 0),
        edge = toScreen(top.x, top.y),
        a = App.deg2rad(screenAngle(m) - 90);
    return {
      edge: edge,
      grip: { x: edge.x + Math.cos(a) * ROT_OFFSET, y: edge.y + Math.sin(a) * ROT_OFFSET }
    };
  }

  /** Screen-space handle positions for a marker. */
  function handlesOf(m) {
    var out = [], i, h, w, g;
    if (m.shape === 'point') {
      g = toScreen(m.cx, m.cy);
      return [{ id: 'c', x: g.x, y: g.y }];
    }
    if (m.shape === 'line') {
      var p1 = toScreen(m.x1, m.y1), p2 = toScreen(m.x2, m.y2);
      return [{ id: 'p1', x: p1.x, y: p1.y }, { id: 'p2', x: p2.x, y: p2.y }];
    }
    if (m.shape === 'polygon') {
      for (i = 0; i < m.pts.length; i++) {
        g = toScreen(m.pts[i][0], m.pts[i][1]);
        out.push({ id: 'v' + i, x: g.x, y: g.y });
      }
      return out;
    }
    if (m.shape === 'pose') {
      /* corners only — a pose already carries a handle per keypoint, and eight
         box handles on top of seventeen points is unusable */
      var cs = [['nw', -1, -1], ['ne', 1, -1], ['se', 1, 1], ['sw', -1, 1]];
      for (i = 0; i < cs.length; i++) {
        g = toScreen(m.cx + cs[i][1] * m.w / 2, m.cy + cs[i][2] * m.h / 2);
        out.push({ id: cs[i][0], x: g.x, y: g.y });
      }
      for (i = 0; i < m.kps.length; i++) {
        g = toScreen(m.kps[i][0], m.kps[i][1]);
        out.push({ id: 'k' + i, x: g.x, y: g.y, kp: true });
      }
      return out;
    }
    for (i = 0; i < RECT_HANDLES.length; i++) {
      h = RECT_HANDLES[i];
      w = App.toWorld(h.fx * m.w / 2, h.fy * m.h / 2, m.cx, m.cy, m.angle || 0);
      g = toScreen(w.x, w.y);
      out.push({ id: h.id, x: g.x, y: g.y });
    }
    var t = App.getType(m.typeId);
    if (t && t.rotatable) {
      g = rotAnchor(m).grip;
      out.push({ id: 'rot', x: g.x, y: g.y });
    }
    return out;
  }

  function handleAt(m, sx, sy) {
    if (!m) return null;
    var hs = handlesOf(m), i,
        r = m.shape === 'point' ? POINT_R : HANDLE_R + 3;
    for (i = 0; i < hs.length; i++) {
      if (Math.abs(sx - hs[i].x) <= r && Math.abs(sy - hs[i].y) <= r) {
        return { marker: m, id: hs[i].id };
      }
    }
    return null;
  }

  /** Markers whose handles are currently on screen. */
  function armedMarkers() {
    var out = [], i, m, sel = App.state.selection;
    if (hoverEdgeId) { m = App.getMarker(hoverEdgeId); if (m) out.push(m); }
    for (i = 0; i < sel.length; i++) {
      m = App.getMarker(sel[i]);
      if (m && out.indexOf(m) === -1) out.push(m);
    }
    return out;
  }

  function armedHandleAt(sx, sy) {
    var list = armedMarkers(), i, h;
    for (i = 0; i < list.length; i++) {
      h = handleAt(list[i], sx, sy);
      if (h) return h;
    }
    return null;
  }

  /* ---------------------------------------------------------- hit-testing */

  /** Cursor within `tol` image px of the marker's outline. */
  function nearOutline(m, ix, iy, tol) {
    var l, dx, dy, r, ex, ey, i, j;
    if (m.shape === 'point') return Math.hypot(ix - m.cx, iy - m.cy) <= tol;
    if (m.shape === 'line') return App.distToSegment(ix, iy, m.x1, m.y1, m.x2, m.y2) <= tol;

    if (m.shape === 'polygon') {
      for (i = 0, j = m.pts.length - 1; i < m.pts.length; j = i++) {
        if (App.distToSegment(ix, iy, m.pts[j][0], m.pts[j][1], m.pts[i][0], m.pts[i][1]) <= tol) return true;
      }
      return false;
    }

    if (m.shape === 'pose') {
      for (i = 0; i < m.kps.length; i++) {
        if (Math.hypot(ix - m.kps[i][0], iy - m.kps[i][1]) <= tol) return true;
      }
      dx = Math.abs(ix - m.cx) - m.w / 2;
      dy = Math.abs(iy - m.cy) - m.h / 2;
      if (dx <= 0 && dy <= 0) return Math.min(-dx, -dy) <= tol;
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= tol;
    }

    l = App.toLocal(ix, iy, m.cx, m.cy, m.angle || 0);
    if (m.shape === 'rect') {
      dx = Math.abs(l.x) - m.w / 2;
      dy = Math.abs(l.y) - m.h / 2;
      if (dx <= 0 && dy <= 0) return Math.min(-dx, -dy) <= tol;      // inside, near an edge
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= tol;     // outside
    }
    ex = Math.max(m.w / 2, .5); ey = Math.max(m.h / 2, .5);
    r = Math.sqrt((l.x * l.x) / (ex * ex) + (l.y * l.y) / (ey * ey));
    if (r === 0) return ex <= tol && ey <= tol;
    return Math.abs(1 - 1 / r) * Math.hypot(l.x, l.y) <= tol;
  }

  /** Cursor anywhere on the marker, interior included (delete / select). */
  function insideMarker(m, ix, iy, tol) {
    var l, ex, ey;
    if (m.shape === 'point') return Math.hypot(ix - m.cx, iy - m.cy) <= tol;
    if (m.shape === 'line') return App.distToSegment(ix, iy, m.x1, m.y1, m.x2, m.y2) <= tol;
    if (m.shape === 'polygon') {
      return App.pointInPolygon(ix, iy, m.pts) || nearOutline(m, ix, iy, tol);
    }
    if (m.shape === 'pose') {
      return Math.abs(ix - m.cx) <= m.w / 2 + tol && Math.abs(iy - m.cy) <= m.h / 2 + tol;
    }
    l = App.toLocal(ix, iy, m.cx, m.cy, m.angle || 0);
    if (m.shape === 'rect') return Math.abs(l.x) <= m.w / 2 + tol && Math.abs(l.y) <= m.h / 2 + tol;
    ex = Math.max(m.w / 2, .5); ey = Math.max(m.h / 2, .5);
    return (l.x * l.x) / (ex * ex) + (l.y * l.y) / (ey * ey) <= 1.06;
  }

  /**
   * Which marker should reveal its handles, topmost first. A handle position
   * counts even when that marker is not armed yet, so a grip can be picked up
   * by going straight to where it sits rather than by tracing the outline
   * first — an ellipse's corners are nowhere near its curve.
   */
  function armCandidate(p, ip) {
    var list = App.activeMarkers(), tol = EDGE_TOL / view.scale, i;
    for (i = list.length - 1; i >= 0; i--) if (handleAt(list[i], p.x, p.y)) return list[i];
    for (i = list.length - 1; i >= 0; i--) if (nearOutline(list[i], ip.x, ip.y, tol)) return list[i];
    return null;
  }

  /** Cursor still close enough to an armed marker to be reaching for a handle. */
  function withinReach(m, ip) {
    var b = App.bboxOf(m), pad = REACH_PAD / view.scale;
    return ip.x >= b.x1 - pad && ip.x <= b.x2 + pad &&
           ip.y >= b.y1 - pad && ip.y <= b.y2 + pad;
  }

  function topmost(ix, iy, test, tol) {
    var list = App.activeMarkers(), i;
    for (i = list.length - 1; i >= 0; i--) if (test(list[i], ix, iy, tol)) return list[i];
    return null;
  }

  function isDeleteMode() {
    return App.state.tool === 'delete' || App.state.ctrlDown;
  }
  Canvas.isDeleteMode = isDeleteMode;

  /* ------------------------------------------------------------- pointers */

  function onPointerDown(e) {
    var img = App.activeImage();
    if (!img || !img.w) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }

    var p = evPos(e), ip = toImage(p.x, p.y),
        panning = e.button === 2 || e.button === 1 || spaceDown;

    if (panning) {
      drag = { mode: 'pan', sx: p.x, sy: p.y, vx: view.x, vy: view.y };
      updateCursor();
      return;
    }
    if (e.button !== 0) return;

    /* a polygon in progress owns every click until it is closed or cancelled.
       addPendingVertex may close the shape, which clears `pending`. */
    if (pending) {
      addPendingVertex(p, ip);
      if (pending) pending.tracing = true;
      return;
    }

    /* delete mode: whatever is highlighted goes */
    if (isDeleteMode()) {
      var victim = topmost(ip.x, ip.y, insideMarker, HIT_TOL / view.scale);
      if (victim) {
        App.deleteMarkers([victim.id]);
        hoverBodyId = null; hoverEdgeId = null;
        refresh();
      }
      return;
    }

    /* a revealed handle always wins */
    var h = armedHandleAt(p.x, p.y);
    if (h) {
      /* Alt on a keypoint steps it through visible -> occluded -> absent */
      if (e.altKey && h.id.charAt(0) === 'k' && h.marker.shape === 'pose') {
        App.pushUndo();
        var kp = h.marker.kps[+h.id.slice(1)];
        kp[2] = (kp[2] + 2) % 3;     // 2 -> 1 -> 0 -> 2
        kp[3] = 1;
        refresh();
        return;
      }
      /* Alt on a polygon vertex removes it */
      if (e.altKey && h.id.charAt(0) === 'v' && h.marker.shape === 'polygon') {
        if (h.marker.pts.length <= MIN_POLY_PTS) {
          window.UI && window.UI.toast('A polygon needs at least ' + MIN_POLY_PTS + ' points');
          return;
        }
        App.pushUndo();
        h.marker.pts.splice(+h.id.slice(1), 1);
        hoverHandle = null;
        refresh();
        return;
      }
      App.pushUndo();
      drag = h.id === 'rot'
        ? { mode: 'rotate', m: h.marker }
        : { mode: 'resize', m: h.marker, handle: h.id, orig: JSON.parse(JSON.stringify(h.marker)) };
      return;
    }

    /* the ghost handle on a polygon edge: drop a vertex in and start dragging it */
    if (hoverInsert) {
      App.pushUndo();
      var mk = hoverInsert.marker, at = hoverInsert.index + 1;
      mk.pts.splice(at, 0, [hoverInsert.ix, hoverInsert.iy]);
      hoverInsert = null;
      hoverEdgeId = mk.id;
      drag = { mode: 'resize', m: mk, handle: 'v' + at, orig: JSON.parse(JSON.stringify(mk)) };
      refresh();
      return;
    }

    if (App.state.tool === 'select') {
      var hit = topmost(ip.x, ip.y, insideMarker, HIT_TOL / view.scale);
      if (hit) {
        var sel = App.state.selection, i = sel.indexOf(hit.id);
        if (e.shiftKey) { if (i === -1) sel.push(hit.id); else sel.splice(i, 1); }
        else if (i === -1) App.state.selection = [hit.id];
        refresh();
        return;
      }
      if (!e.shiftKey) App.state.selection = [];
      drag = { mode: 'band', sx: p.x, sy: p.y, mx: p.x, my: p.y, base: App.state.selection.slice() };
      refresh();
      return;
    }

    var type = App.activeType();
    if (!type) { window.UI && window.UI.toast('Create a marker type first'); return; }

    App.state.selection = [];

    if (type.shape === 'polygon') {
      /* `tracing` from the very first press, so the opening stroke can be a
         drag rather than only a click */
      pending = { type: type, pts: [[ip.x, ip.y]], cursor: { x: ip.x, y: ip.y }, tracing: true };
      hoverEdgeId = null;
      hoverInsert = null;
      refresh();
      return;
    }

    drag = { mode: 'create', type: type, sx: ip.x, sy: ip.y, preview: null };
    refresh();
  }

  /* ------------------------------------------------------ polygon building */

  function addPendingVertex(p, ip) {
    var first = toScreen(pending.pts[0][0], pending.pts[0][1]);
    if (pending.pts.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= CLOSE_TOL) {
      Canvas.commitPending();
      return;
    }
    var last = pending.pts[pending.pts.length - 1];
    if (Math.hypot(ip.x - last[0], ip.y - last[1]) < MIN_SIZE / view.scale) return;  // ignore a stutter
    pending.pts.push([ip.x, ip.y]);
    if (window.UI) window.UI.updateStatus();
    Canvas.render();
  }

  Canvas.hasPending = function () { return !!pending; };

  Canvas.commitPending = function () {
    if (!pending) return false;
    var pts = pending.pts, type = pending.type;
    pending = null;
    if (pts.length < 3) { refresh(); return false; }
    var m = { id: App.uid('m'), typeId: type.id, shape: 'polygon', angle: 0, pts: pts };
    App.addMarker(m);
    hoverEdgeId = m.id;
    refresh();
    return true;
  };

  Canvas.cancelPending = function () {
    if (!pending) return false;
    pending = null;
    refresh();
    return true;
  };

  Canvas.popPendingVertex = function () {
    if (!pending) return false;
    pending.pts.pop();
    if (!pending.pts.length) pending = null;
    refresh();
    return true;
  };

  Canvas.pendingCount = function () { return pending ? pending.pts.length : 0; };

  function onPointerMove(e) {
    var p = evPos(e), ip = toImage(p.x, p.y), img = App.activeImage();
    lastPointer = p;

    if (window.UI) {
      window.UI.setCursorReadout(ip, img);
      window.UI.moveBinCursor(e.clientX, e.clientY, isDeleteMode());
    }

    if (pending) {
      pending.cursor = ip;
      /* holding the button down traces a run of vertices along the drag —
         click for a corner, drag for a curve */
      if (pending.tracing && (e.buttons & 1)) {
        var last = pending.pts[pending.pts.length - 1],
            ls = toScreen(last[0], last[1]);
        if (Math.hypot(p.x - ls.x, p.y - ls.y) >= TRACE_STEP) {
          pending.pts.push([ip.x, ip.y]);
          pending.traced = true;
          if (window.UI) window.UI.updateStatus();
        }
      }
      var f = toScreen(pending.pts[0][0], pending.pts[0][1]);
      canvas.style.cursor = (pending.pts.length >= MIN_POLY_PTS && Math.hypot(p.x - f.x, p.y - f.y) <= CLOSE_TOL)
        ? 'pointer' : 'crosshair';
      Canvas.render();
      return;
    }

    if (!drag) { updateHover(p, ip); return; }

    if (drag.mode === 'pan') {
      view.x = drag.vx + (p.x - drag.sx);
      view.y = drag.vy + (p.y - drag.sy);
      Canvas.render();
      return;
    }
    if (drag.mode === 'band') {
      drag.mx = p.x; drag.my = p.y;
      applyBand();
      Canvas.render();
      return;
    }
    if (drag.mode === 'create') {
      drag.preview = buildShape(drag.type, drag.sx, drag.sy, ip.x, ip.y, e.shiftKey);
      Canvas.render();
      return;
    }
    if (drag.mode === 'resize') { doResize(ip, e.shiftKey); Canvas.render(); return; }
    if (drag.mode === 'rotate') {
      var m = drag.m,
          ang = Math.atan2(ip.y - m.cy, ip.x - m.cx) * 180 / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      m.angle = ((ang % 360) + 360) % 360;
      Canvas.render();
    }
  }

  function updateHover(p, ip) {
    var prevEdge = hoverEdgeId, prevBody = hoverBodyId,
        prevHandle = hoverHandle && hoverHandle.id, m;

    if (isDeleteMode()) {
      m = topmost(ip.x, ip.y, insideMarker, HIT_TOL / view.scale);
      hoverBodyId = m ? m.id : null;
      hoverEdgeId = null;
      hoverHandle = null;
    } else {
      hoverBodyId = null;
      var prev = prevEdge ? App.getMarker(prevEdge) : null;

      /* Handles do not sit on the outline: an ellipse's corner grips are out at
         the bounding-box corners, up to 0.41 r away from the curve, and the
         rotation grip floats clear of the shape entirely. Arming on outline
         proximity alone therefore drops the marker — and hides the handle —
         while the cursor is still travelling towards it. So once a marker is
         armed it stays armed until the cursor leaves its bounding box by a
         margin wide enough to contain every one of its handles. */
      if (prev && handleAt(prev, p.x, p.y)) m = prev;
      if (!m) m = armCandidate(p, ip);
      if (!m && prev && withinReach(prev, ip)) m = prev;

      hoverEdgeId = m ? m.id : null;
      hoverHandle = armedHandleAt(p.x, p.y);
    }

    var prevInsert = hoverInsert && (hoverInsert.marker.id + ':' + hoverInsert.index);
    hoverInsert = (!hoverHandle && !isDeleteMode()) ? insertPointAt(p, ip) : null;

    updateCursor();
    if (prevEdge !== hoverEdgeId || prevBody !== hoverBodyId ||
        prevHandle !== (hoverHandle && hoverHandle.id) ||
        prevInsert !== (hoverInsert && (hoverInsert.marker.id + ':' + hoverInsert.index)) ||
        hoverInsert) Canvas.render();
  }

  /**
   * Where a new vertex would land on an armed polygon: the closest point on the
   * edge under the cursor. Shown as a ghost handle so it is discoverable rather
   * than a hidden gesture.
   */
  function insertPointAt(p, ip) {
    var m = hoverEdgeId ? App.getMarker(hoverEdgeId) : null;
    if (!m || m.shape !== 'polygon') return null;
    var tol = EDGE_TOL / view.scale, i, j, a, b, t, len2, px, py, d, best = null;
    for (i = 0, j = m.pts.length - 1; i < m.pts.length; j = i++) {
      a = m.pts[j]; b = m.pts[i];
      len2 = (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]);
      if (!len2) continue;
      t = App.clamp(((ip.x - a[0]) * (b[0] - a[0]) + (ip.y - a[1]) * (b[1] - a[1])) / len2, 0, 1);
      px = a[0] + t * (b[0] - a[0]);
      py = a[1] + t * (b[1] - a[1]);
      d = Math.hypot(ip.x - px, ip.y - py);
      if (d > tol) continue;
      if (!best || d < best.d) best = { d: d, index: j, ix: px, iy: py };
    }
    if (!best) return null;
    var s = toScreen(best.ix, best.iy);
    /* never offer an insert on top of an existing vertex */
    for (i = 0; i < m.pts.length; i++) {
      var vs = toScreen(m.pts[i][0], m.pts[i][1]);
      if (Math.hypot(s.x - vs.x, s.y - vs.y) < HANDLE_R + 5) return null;
    }
    return { marker: m, index: best.index, ix: best.ix, iy: best.iy, x: s.x, y: s.y };
  }

  function onPointerUp(e) {
    if (pending) { pending.tracing = false; return; }
    if (!drag) return;
    var d = drag, img = App.activeImage();
    drag = null;

    if (d.mode === 'create') {
      var m = d.preview, b, c;
      if (d.type.shape === 'point') m = buildShape(d.type, d.sx, d.sy, d.sx, d.sy, false);
      if (!m) { refresh(); return; }
      if (d.type.shape !== 'point') {
        b = App.bboxOf(m);
        if ((b.x2 - b.x1) < MIN_SIZE && (b.y2 - b.y1) < MIN_SIZE) { refresh(); return; }
      }
      /* a pose box becomes a pre-posed skeleton the moment it is released */
      if (d.type.shape === 'pose') {
        b = App.bboxOf(m);
        m = App.makePose(d.type, b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      }
      c = App.centerOf(m);
      if (img && (c.x < 0 || c.y < 0 || c.x > img.w || c.y > img.h)) { refresh(); return; }
      App.addMarker(m);
      hoverEdgeId = m.id;
      refresh();
      return;
    }
    refresh();
    updateCursor();
    void e;
  }

  function onLeave() {
    hoverBodyId = null;
    hoverEdgeId = null;
    hoverHandle = null;
    hoverInsert = null;
    lastPointer = null;
    if (window.UI) { window.UI.moveBinCursor(0, 0, false); window.UI.setCursorReadout(null); }
    Canvas.render();
  }

  function onWheel(e) {
    e.preventDefault();
    var p = evPos(e), f = Math.pow(1.0015, -e.deltaY);
    Canvas.zoomAt(App.clamp(f, 0.2, 5), p.x, p.y);
    if (window.UI) window.UI.updateStatus();
  }

  /* ------------------------------------------------------------- building */

  function buildShape(type, x0, y0, x1, y1, square) {
    var m = { id: App.uid('m'), typeId: type.id, shape: type.shape, angle: 0 }, w, h, s;
    if (type.shape === 'point') { m.cx = x0; m.cy = y0; m.w = 0; m.h = 0; return m; }
    if (type.shape === 'line') { m.x1 = x0; m.y1 = y0; m.x2 = x1; m.y2 = y1; return m; }
    if (type.shape === 'pose') m.kps = [];        // filled in on release
    w = Math.abs(x1 - x0); h = Math.abs(y1 - y0);
    if (square) { s = Math.max(w, h); w = s; h = s; }
    m.cx = x0 + (x1 >= x0 ? w / 2 : -w / 2);
    m.cy = y0 + (y1 >= y0 ? h / 2 : -h / 2);
    m.w = w; m.h = h;
    return m;
  }

  function doResize(ip, keepRatio) {
    var m = drag.m, o = drag.orig, id = drag.handle, k;

    if (m.shape === 'line') {
      if (id === 'p1') { m.x1 = ip.x; m.y1 = ip.y; } else { m.x2 = ip.x; m.y2 = ip.y; }
      return;
    }
    if (m.shape === 'point') { m.cx = ip.x; m.cy = ip.y; return; }

    if (m.shape === 'polygon') {
      k = +id.slice(1);
      m.pts[k][0] = ip.x; m.pts[k][1] = ip.y;
      return;
    }

    if (m.shape === 'pose') {
      if (id.charAt(0) === 'k') {                 // dragging a keypoint confirms it
        k = +id.slice(1);
        m.kps[k][0] = ip.x; m.kps[k][1] = ip.y;
        m.kps[k][3] = 1;
        if (m.kps[k][2] === App.VIS.ABSENT) m.kps[k][2] = App.VIS.VISIBLE;
        return;
      }
      /* box corner — the keypoints stay put, the box is only the animal's extent */
      var left = o.cx - o.w / 2, right = o.cx + o.w / 2,
          top = o.cy - o.h / 2, bottom = o.cy + o.h / 2;
      if (id.indexOf('w') !== -1) left = Math.min(ip.x, right - MIN_SIZE);
      if (id.indexOf('e') !== -1) right = Math.max(ip.x, left + MIN_SIZE);
      if (id.indexOf('n') !== -1) top = Math.min(ip.y, bottom - MIN_SIZE);
      if (id.indexOf('s') !== -1) bottom = Math.max(ip.y, top + MIN_SIZE);
      m.cx = (left + right) / 2; m.cy = (top + bottom) / 2;
      m.w = right - left; m.h = bottom - top;
      return;
    }

    var l = App.toLocal(ip.x, ip.y, o.cx, o.cy, o.angle || 0),
        left = -o.w / 2, right = o.w / 2, top = -o.h / 2, bottom = o.h / 2,
        ratio = o.h ? o.w / o.h : 1, nw, nh, world;

    if (id.indexOf('w') !== -1) left = Math.min(l.x, right - MIN_SIZE);
    if (id.indexOf('e') !== -1) right = Math.max(l.x, left + MIN_SIZE);
    if (id.indexOf('n') !== -1) top = Math.min(l.y, bottom - MIN_SIZE);
    if (id.indexOf('s') !== -1) bottom = Math.max(l.y, top + MIN_SIZE);

    nw = right - left; nh = bottom - top;

    if (keepRatio && id.length === 2) {
      if (nw / nh > ratio) nw = nh * ratio; else nh = nw / ratio;
      if (id.indexOf('w') !== -1) left = right - nw; else right = left + nw;
      if (id.indexOf('n') !== -1) top = bottom - nh; else bottom = top + nh;
    }

    world = App.toWorld((left + right) / 2, (top + bottom) / 2, o.cx, o.cy, o.angle || 0);
    m.cx = world.x; m.cy = world.y; m.w = nw; m.h = nh;
  }

  function applyBand() {
    var a = toImage(drag.sx, drag.sy), b = toImage(drag.mx, drag.my),
        x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y),
        x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y),
        list = App.activeMarkers(), out = drag.base.slice(), i, bb;
    for (i = 0; i < list.length; i++) {
      bb = App.bboxOf(list[i]);
      if (bb.x2 >= x1 && bb.x1 <= x2 && bb.y2 >= y1 && bb.y1 <= y2) {
        if (out.indexOf(list[i].id) === -1) out.push(list[i].id);
      }
    }
    App.state.selection = out;
    if (window.UI) window.UI.updateStatus();
  }

  /* --------------------------------------------------------------- cursor */

  var COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  var CURSOR_FOR = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' };

  /** A handle's compass direction as the viewer sees it, under view rotation. */
  function apparent(id) {
    var i = COMPASS.indexOf(id);
    return i === -1 ? id : COMPASS[(i + 2 * view.rot) % 8];
  }

  function updateCursor() {
    if (!stage) return;
    var c = 'default';
    if (drag && drag.mode === 'pan') c = 'grabbing';
    else if (spaceDown) c = 'grab';
    else if (isDeleteMode()) c = 'default';
    else if (hoverInsert) c = 'copy';
    else if (hoverHandle) {
      var id = hoverHandle.id;
      if (id === 'rot') c = 'grab';
      else if (id === 'c' || id === 'p1' || id === 'p2' ||
               id.charAt(0) === 'v' || id.charAt(0) === 'k') c = 'move';
      else c = (CURSOR_FOR[apparent(id)] || 'nwse') + '-resize';
    } else if (App.state.tool === 'select') c = 'default';
    else if (App.activeType()) c = 'crosshair';
    canvas.style.cursor = c;
  }
  Canvas.updateCursor = updateCursor;

  function refresh() {
    if (window.UI) window.UI.refresh();
    Canvas.render();
  }

  /** Marker whose handles are currently showing, if any. */
  Canvas.armedId = function () { return hoverEdgeId; };

})();
