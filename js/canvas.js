/* ============================================================================
   canvas.js — pan/zoom viewport, marker rendering, and all mouse interaction.

   Mouse map
     left  drag on empty canvas .... draw a new marker (annotate tool)
                                     rubber-band select (select tool)
     left  drag on a marker ........ move it
     left  drag on a handle ........ resize / rotate it
     right drag .................... pan          (middle drag and space+drag too)
     wheel ......................... zoom at cursor
     Ctrl held / delete tool ....... left click removes the marker under the cursor
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App;
  var Canvas = window.Canvas = {};

  var canvas, ctx, stage, dpr = 1;
  var view = Canvas.view = { scale: 1, x: 0, y: 0 };

  var HANDLE_R = 4.5;          // screen px, half-size of a resize handle
  var HIT_TOL = 7;             // screen px slack for hit-testing thin shapes
  var ROT_OFFSET = 26;         // screen px above the shape for the rotation grip
  var MIN_SIZE = 3;            // image px, smallest marker we will keep

  var imgCache = {};           // imageId -> HTMLImageElement

  /* interaction state */
  var drag = null;             // {mode, ...}
  var hoverId = null;
  var hoverHandle = null;
  var spaceDown = false;
  var cursorImg = null;        // last cursor position in image coords
  var rafPending = false;

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
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
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

  function toScreen(px, py) {
    return { x: px * view.scale + view.x, y: py * view.scale + view.y };
  }
  function toImage(sx, sy) {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
  }
  function evPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  Canvas.fit = function () {
    var img = App.activeImage();
    if (!img || !img.w) return;
    var r = stage.getBoundingClientRect(),
        pad = 48,
        s = Math.min((r.width - pad) / img.w, (r.height - pad - 26) / img.h);
    view.scale = Math.max(0.02, Math.min(s, 8));
    view.x = (r.width - img.w * view.scale) / 2;
    view.y = (r.height - 26 - img.h * view.scale) / 2;
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
    after = toImage(sx, sy);
    view.x += (after.x - before.x) * view.scale;
    view.y += (after.y - before.y) * view.scale;
    Canvas.render();
  };

  Canvas.resetZoom = function () {
    var r = stage.getBoundingClientRect();
    Canvas.zoomAt(1 / view.scale, r.width / 2, (r.height - 26) / 2);
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
    App.save();
    if (done) done();
  }

  Canvas.dropImage = function (imageId) {
    delete imgCache[imageId];
  };

  /* ---------------------------------------------------------------- render */

  Canvas.render = function () {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; draw(); });
  };

  function draw() {
    if (!ctx) return;
    var img = App.activeImage(), el = img ? imgCache[img.id] : null, i,
        markers = App.activeMarkers(), sel = App.state.selection;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    if (!img || !el || !el.complete || !img.w) return;

    /* image */
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    ctx.imageSmoothingEnabled = view.scale < 3;
    ctx.drawImage(el, 0, 0, img.w, img.h);
    ctx.restore();

    /* image border */
    var a = toScreen(0, 0), b = toScreen(img.w, img.h);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x + .5, a.y + .5, b.x - a.x, b.y - a.y);

    /* markers: unselected first so the selection always sits on top */
    for (i = 0; i < markers.length; i++) {
      if (sel.indexOf(markers[i].id) === -1) drawMarker(markers[i], false);
    }
    for (i = 0; i < markers.length; i++) {
      if (sel.indexOf(markers[i].id) !== -1) drawMarker(markers[i], true);
    }

    /* in-progress shape */
    if (drag && drag.mode === 'create' && drag.preview) drawMarker(drag.preview, false, true);

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
    var c, hw, hh, p1, p2;
    if (m.shape === 'rect' || m.shape === 'ellipse') {
      c = toScreen(m.cx, m.cy);
      hw = (m.w / 2) * view.scale;
      hh = (m.h / 2) * view.scale;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(App.deg2rad(m.angle || 0));
      ctx.beginPath();
      if (m.shape === 'rect') ctx.rect(-hw, -hh, hw * 2, hh * 2);
      else ctx.ellipse(0, 0, Math.max(hw, .5), Math.max(hh, .5), 0, 0, Math.PI * 2);
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

  function drawMarker(m, selected, ghost) {
    var t = App.getType(m.typeId),
        color = t ? t.color : '#c3ccd8',
        deleting = isDeleteMode() && hoverId === m.id,
        stroke = deleting ? '#ff4d4d' : color,
        c, p1, p2, b;

    ctx.lineWidth = selected ? 2.5 : 2;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = hexA(stroke, ghost ? .10 : (selected ? .20 : .12));
    if (ghost) ctx.setLineDash([5, 4]);

    if (m.shape === 'point') {
      c = toScreen(m.cx, m.cy);
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hexA(stroke, .35); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = stroke; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.shape === 'line') {
      pathFor(m); ctx.stroke();
      p1 = toScreen(m.x1, m.y1); p2 = toScreen(m.x2, m.y2);
      ctx.fillStyle = stroke;
      ctx.beginPath(); ctx.arc(p1.x, p1.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p2.x, p2.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      pathFor(m); ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);

    /* label */
    if (t && !ghost) {
      b = App.bboxOf(m);
      var s = toScreen(b.x1, b.y1),
          big = (b.x2 - b.x1) * view.scale > 34 || m.shape === 'point' || m.shape === 'line';
      if (big) drawLabel(t.name, s.x, s.y, stroke);
    }

    if (selected && !ghost) drawSelection(m);
  }

  function drawLabel(text, sx, sy, color) {
    ctx.font = '600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    var w = ctx.measureText(text).width + 10, h = 16, y = sy - h - 3;
    if (y < 2) y = sy + 3;
    ctx.fillStyle = hexA(color, .92);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sx, y, w, h, 3); else ctx.rect(sx, y, w, h);
    ctx.fill();
    ctx.fillStyle = readableOn(color);
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + 5, y + h / 2 + .5);
  }

  function drawSelection(m) {
    var hs = handlesOf(m), i, h;

    /* halo */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    if (m.shape === 'rect' || m.shape === 'ellipse') { pathFor(m); ctx.stroke(); }
    ctx.restore();

    for (i = 0; i < hs.length; i++) {
      h = hs[i];
      if (h.id === 'rot') {
        var c = toScreen(m.cx, m.cy), anchor = rotAnchor(m);
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(anchor.edge.x, anchor.edge.y);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(h.x, h.y, HANDLE_R + .5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#0e1116'; ctx.stroke();
        void c;
      } else {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#0e1116';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (m.shape === 'line' || m.shape === 'point') {
          ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
        } else {
          ctx.rect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
        }
        ctx.fill(); ctx.stroke();
      }
    }
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

  /* --------------------------------------------------------------- handles */

  var RECT_HANDLES = [
    { id: 'nw', fx: -1, fy: -1 }, { id: 'n', fx: 0, fy: -1 }, { id: 'ne', fx: 1, fy: -1 },
    { id: 'e', fx: 1, fy: 0 },   { id: 'se', fx: 1, fy: 1 },  { id: 's', fx: 0, fy: 1 },
    { id: 'sw', fx: -1, fy: 1 }, { id: 'w', fx: -1, fy: 0 }
  ];

  function rotAnchor(m) {
    var top = App.toWorld(0, -m.h / 2, m.cx, m.cy, m.angle || 0),
        edge = toScreen(top.x, top.y),
        a = App.deg2rad((m.angle || 0) - 90);
    return { edge: edge, grip: { x: edge.x + Math.cos(a) * ROT_OFFSET, y: edge.y + Math.sin(a) * ROT_OFFSET } };
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
    for (i = 0; i < RECT_HANDLES.length; i++) {
      h = RECT_HANDLES[i];
      w = App.toWorld(h.fx * m.w / 2, h.fy * m.h / 2, m.cx, m.cy, m.angle || 0);
      g = toScreen(w.x, w.y);
      out.push({ id: h.id, x: g.x, y: g.y, fx: h.fx, fy: h.fy });
    }
    var t = App.getType(m.typeId);
    if (t && t.rotatable) {
      g = rotAnchor(m).grip;
      out.push({ id: 'rot', x: g.x, y: g.y });
    }
    return out;
  }

  function handleAt(m, sx, sy) {
    var hs = handlesOf(m), i, r = HANDLE_R + 3;
    for (i = 0; i < hs.length; i++) {
      if (Math.abs(sx - hs[i].x) <= r && Math.abs(sy - hs[i].y) <= r) return hs[i];
    }
    return null;
  }

  /* ---------------------------------------------------------- hit-testing */

  function hitMarker(m, ix, iy) {
    var tol = HIT_TOL / view.scale, l, rx, ry;
    if (m.shape === 'point') {
      return Math.hypot(ix - m.cx, iy - m.cy) <= Math.max(tol, 10 / view.scale);
    }
    if (m.shape === 'line') {
      return App.distToSegment(ix, iy, m.x1, m.y1, m.x2, m.y2) <= tol;
    }
    l = App.toLocal(ix, iy, m.cx, m.cy, m.angle || 0);
    if (m.shape === 'rect') {
      return Math.abs(l.x) <= m.w / 2 + tol && Math.abs(l.y) <= m.h / 2 + tol;
    }
    rx = Math.max(m.w / 2, .5); ry = Math.max(m.h / 2, .5);
    return (l.x * l.x) / (rx * rx) + (l.y * l.y) / (ry * ry) <= 1.06;
  }

  /** Topmost marker under an image-space point. */
  function markerAt(ix, iy) {
    var list = App.activeMarkers(), i;
    for (i = list.length - 1; i >= 0; i--) if (hitMarker(list[i], ix, iy)) return list[i];
    return null;
  }

  function isDeleteMode() {
    return App.state.tool === 'delete' || App.state.ctrlDown;
  }

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

    /* delete mode */
    if (isDeleteMode()) {
      var victim = markerAt(ip.x, ip.y);
      if (victim) {
        App.deleteMarkers([victim.id]);
        hoverId = null;
        refresh();
      }
      return;
    }

    var sel = App.state.selection;

    /* a handle of an already-selected marker wins over everything else */
    if (sel.length === 1) {
      var m = App.getMarker(sel[0]);
      if (m) {
        var h = handleAt(m, p.x, p.y);
        if (h) {
          App.pushUndo();
          drag = h.id === 'rot'
            ? { mode: 'rotate', m: m }
            : { mode: 'resize', m: m, handle: h.id, orig: JSON.parse(JSON.stringify(m)) };
          return;
        }
      }
    }

    var hit = markerAt(ip.x, ip.y);

    if (hit) {
      if (e.shiftKey) {
        var i = sel.indexOf(hit.id);
        if (i === -1) sel.push(hit.id); else sel.splice(i, 1);
      } else if (sel.indexOf(hit.id) === -1) {
        App.state.selection = [hit.id];
      }
      App.pushUndo();
      drag = {
        mode: 'move', ix: ip.x, iy: ip.y, moved: false,
        items: App.state.selection.map(function (id) {
          return { m: App.getMarker(id), snap: JSON.parse(JSON.stringify(App.getMarker(id))) };
        }).filter(function (o) { return !!o.m; })
      };
      refresh();
      return;
    }

    /* empty canvas */
    if (App.state.tool === 'select') {
      if (!e.shiftKey) App.state.selection = [];
      drag = { mode: 'band', sx: p.x, sy: p.y, mx: p.x, my: p.y, base: App.state.selection.slice() };
      refresh();
      return;
    }

    var type = App.activeType();
    if (!type) { window.UI && window.UI.toast('Create a marker type first'); return; }

    App.state.selection = [];
    drag = { mode: 'create', type: type, sx: ip.x, sy: ip.y, mx: ip.x, my: ip.y, preview: null };
    refresh();
  }

  function onPointerMove(e) {
    var p = evPos(e), ip = toImage(p.x, p.y), img = App.activeImage();
    cursorImg = ip;

    if (window.UI) window.UI.setCursorReadout(ip, img);
    if (window.UI) window.UI.moveBinCursor(e.clientX, e.clientY, isDeleteMode());

    if (!drag) {
      var prevHover = hoverId, prevHandle = hoverHandle && hoverHandle.id;
      hoverHandle = null;
      var sel = App.state.selection;
      if (sel.length === 1 && !isDeleteMode()) {
        var sm = App.getMarker(sel[0]);
        if (sm) hoverHandle = handleAt(sm, p.x, p.y);
      }
      var hm = hoverHandle ? null : markerAt(ip.x, ip.y);
      hoverId = hm ? hm.id : null;
      updateCursor();
      if (prevHover !== hoverId || prevHandle !== (hoverHandle && hoverHandle.id)) Canvas.render();
      return;
    }

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
      drag.mx = ip.x; drag.my = ip.y;
      drag.preview = buildShape(drag.type, drag.sx, drag.sy, ip.x, ip.y, e.shiftKey);
      Canvas.render();
      return;
    }
    if (drag.mode === 'move') {
      var dx = ip.x - drag.ix, dy = ip.y - drag.iy, i, o;
      if (Math.abs(dx) > .5 || Math.abs(dy) > .5) drag.moved = true;
      for (i = 0; i < drag.items.length; i++) {
        o = drag.items[i];
        copyGeom(o.snap, o.m);
        App.translateMarker(o.m, dx, dy);
        if (img) App.clampMarker(o.m, img.w, img.h);
      }
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

  function onPointerUp(e) {
    if (!drag) return;
    var d = drag, img = App.activeImage();
    drag = null;

    if (d.mode === 'create') {
      var m = d.preview || buildShape(d.type, d.sx, d.sy, d.sx, d.sy, false), b;
      if (d.type.shape === 'point') {
        m = buildShape(d.type, d.sx, d.sy, d.sx, d.sy, false);
      } else {
        b = App.bboxOf(m);
        if ((b.x2 - b.x1) < MIN_SIZE && (b.y2 - b.y1) < MIN_SIZE) { refresh(); return; }
      }
      if (img) {
        var c = App.centerOf(m);
        if (c.x < 0 || c.y < 0 || c.x > img.w || c.y > img.h) { refresh(); return; }
      }
      App.addMarker(m);
      App.state.selection = [m.id];
      refresh();
      return;
    }
    if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'rotate') {
      App.save();
      refresh();
      return;
    }
    if (d.mode === 'band') { refresh(); return; }
    updateCursor();
    Canvas.render();
    void e;
  }

  function onPointerLeave() {
    hoverId = null;
    if (window.UI) { window.UI.moveBinCursor(0, 0, false); window.UI.setCursorReadout(null); }
    Canvas.render();
  }

  function onWheel(e) {
    e.preventDefault();
    var p = evPos(e), f = Math.pow(1.0015, -e.deltaY);
    Canvas.zoomAt(App.clamp(f, 0.2, 5), p.x, p.y);
  }

  /* ------------------------------------------------------------- building */

  function buildShape(type, x0, y0, x1, y1, square) {
    var m = { id: App.uid('m'), typeId: type.id, shape: type.shape, angle: 0 },
        w, h, s;
    if (type.shape === 'point') { m.cx = x0; m.cy = y0; m.w = 0; m.h = 0; return m; }
    if (type.shape === 'line') { m.x1 = x0; m.y1 = y0; m.x2 = x1; m.y2 = y1; return m; }
    w = Math.abs(x1 - x0); h = Math.abs(y1 - y0);
    if (square) { s = Math.max(w, h); w = s; h = s; }
    m.cx = x0 + (x1 >= x0 ? w / 2 : -w / 2);
    m.cy = y0 + (y1 >= y0 ? h / 2 : -h / 2);
    m.w = w; m.h = h;
    return m;
  }

  function copyGeom(from, to) {
    to.cx = from.cx; to.cy = from.cy; to.w = from.w; to.h = from.h;
    to.angle = from.angle; to.x1 = from.x1; to.y1 = from.y1; to.x2 = from.x2; to.y2 = from.y2;
  }

  function doResize(ip, keepRatio) {
    var m = drag.m, o = drag.orig, id = drag.handle;

    if (m.shape === 'line') {
      if (id === 'p1') { m.x1 = ip.x; m.y1 = ip.y; } else { m.x2 = ip.x; m.y2 = ip.y; }
      return;
    }
    if (m.shape === 'point') { m.cx = ip.x; m.cy = ip.y; return; }

    var l = App.toLocal(ip.x, ip.y, o.cx, o.cy, o.angle || 0),
        left = -o.w / 2, right = o.w / 2, top = -o.h / 2, bottom = o.h / 2,
        ratio = o.h ? o.w / o.h : 1, nw, nh, lcx, lcy, world;

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

    lcx = (left + right) / 2;
    lcy = (top + bottom) / 2;
    world = App.toWorld(lcx, lcy, o.cx, o.cy, o.angle || 0);
    m.cx = world.x; m.cy = world.y; m.w = nw; m.h = nh;
  }

  function applyBand() {
    var x1 = Math.min(drag.sx, drag.mx), y1 = Math.min(drag.sy, drag.my),
        x2 = Math.max(drag.sx, drag.mx), y2 = Math.max(drag.sy, drag.my),
        a = toImage(x1, y1), b = toImage(x2, y2),
        list = App.activeMarkers(), out = drag.base.slice(), i, bb;
    for (i = 0; i < list.length; i++) {
      bb = App.bboxOf(list[i]);
      if (bb.x2 >= a.x && bb.x1 <= b.x && bb.y2 >= a.y && bb.y1 <= b.y) {
        if (out.indexOf(list[i].id) === -1) out.push(list[i].id);
      }
    }
    App.state.selection = out;
    if (window.UI) window.UI.updateStatus();
  }

  /* --------------------------------------------------------------- cursor */

  var CURSORS = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' };

  function updateCursor() {
    if (!stage) return;
    var c = 'default';
    if (drag && drag.mode === 'pan') c = 'grabbing';
    else if (spaceDown) c = 'grab';
    else if (isDeleteMode()) c = 'none';
    else if (hoverHandle) {
      c = hoverHandle.id === 'rot' ? 'grab'
        : (CURSORS[hoverHandle.id] ? CURSORS[hoverHandle.id] + '-resize' : 'move');
    } else if (hoverId) c = 'move';
    else if (App.state.tool === 'select') c = 'crosshair';
    else if (App.activeType()) c = 'crosshair';
    canvas.style.cursor = c;
  }
  Canvas.updateCursor = updateCursor;

  function refresh() {
    if (window.UI) window.UI.refresh();
    Canvas.render();
  }

  Canvas.cursorImage = function () { return cursorImg; };

})();
