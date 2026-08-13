/* ============================================================================
   skeleton.js — pose blueprints: presets, JSON import/export, and the editor.

   A blueprint is the shape of an animal as far as the annotator is concerned:

     {
       name:      "Seal",
       keypoints: [ { name, side: "L"|"R"|"C", tx, ty }, ... ],  // order matters
       edges:     [ [i, j], ... ],   // drawn between keypoints, never exported
       flip:      [ [i, j], ... ]    // pairs that swap under a mirror
     }

   `tx`/`ty` are the template pose: where each point sits inside the bounding
   box, 0..1. Placing a new pose drops the whole skeleton in pre-posed, which is
   far quicker than clicking every point from scratch.

   The keypoint order is the export order, so it is frozen once anything has
   been annotated with the type — see `locked` in open().
   ========================================================================== */
(function () {
  'use strict';

  var Skeleton = window.Skeleton = {};

  /* ---------------------------------------------------------------- presets */

  function kp(name, side, tx, ty) { return { name: name, side: side, tx: tx, ty: ty }; }

  Skeleton.PRESETS = {
    quadruped: {
      name: 'Quadruped',
      keypoints: [
        kp('nose', 'C', 0.06, 0.34), kp('left_eye', 'L', 0.13, 0.27), kp('right_eye', 'R', 0.13, 0.37),
        kp('ear_base', 'C', 0.20, 0.22), kp('neck', 'C', 0.29, 0.31), kp('withers', 'C', 0.39, 0.27),
        kp('back', 'C', 0.55, 0.27), kp('hip', 'C', 0.72, 0.30), kp('tail_base', 'C', 0.80, 0.33),
        kp('tail_tip', 'C', 0.95, 0.24),
        kp('left_front_paw', 'L', 0.35, 0.90), kp('right_front_paw', 'R', 0.43, 0.90),
        kp('left_hind_paw', 'L', 0.70, 0.90), kp('right_hind_paw', 'R', 0.78, 0.90)
      ],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9],
              [5, 10], [5, 11], [7, 12], [7, 13]],
      flip: [[1, 2], [10, 11], [12, 13]]
    },

    pinniped: {
      name: 'Pinniped',
      keypoints: [
        kp('nose', 'C', 0.05, 0.46), kp('left_eye', 'L', 0.13, 0.39), kp('right_eye', 'R', 0.13, 0.53),
        kp('head', 'C', 0.20, 0.46), kp('neck', 'C', 0.30, 0.46),
        kp('left_fore_flipper', 'L', 0.40, 0.18), kp('right_fore_flipper', 'R', 0.40, 0.74),
        kp('mid_body', 'C', 0.55, 0.46),
        kp('left_hind_flipper', 'L', 0.86, 0.26), kp('right_hind_flipper', 'R', 0.86, 0.66),
        kp('tail', 'C', 0.93, 0.46)
      ],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [4, 6], [4, 7], [7, 8], [7, 9], [7, 10]],
      flip: [[1, 2], [5, 6], [8, 9]]
    },

    bird: {
      name: 'Bird',
      keypoints: [
        kp('beak_tip', 'C', 0.04, 0.28), kp('head', 'C', 0.15, 0.22),
        kp('left_eye', 'L', 0.12, 0.18), kp('right_eye', 'R', 0.17, 0.25),
        kp('neck', 'C', 0.25, 0.32), kp('breast', 'C', 0.33, 0.46), kp('back', 'C', 0.44, 0.28),
        kp('left_wing_tip', 'L', 0.55, 0.05), kp('right_wing_tip', 'R', 0.55, 0.55),
        kp('tail_tip', 'C', 0.94, 0.34),
        kp('left_foot', 'L', 0.38, 0.92), kp('right_foot', 'R', 0.48, 0.92)
      ],
      edges: [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [4, 6], [6, 7], [6, 8], [6, 9], [5, 10], [5, 11]],
      flip: [[2, 3], [7, 8], [10, 11]]
    },

    fish: {
      name: 'Fish',
      keypoints: [
        kp('snout', 'C', 0.03, 0.48), kp('left_eye', 'L', 0.12, 0.41), kp('right_eye', 'R', 0.12, 0.55),
        kp('operculum', 'C', 0.24, 0.48),
        kp('dorsal_origin', 'C', 0.42, 0.20), kp('dorsal_end', 'C', 0.62, 0.25),
        kp('pectoral_fin', 'C', 0.31, 0.63), kp('pelvic_fin', 'C', 0.45, 0.78), kp('anal_fin', 'C', 0.63, 0.73),
        kp('caudal_peduncle', 'C', 0.80, 0.48),
        kp('caudal_upper', 'C', 0.97, 0.27), kp('caudal_lower', 'C', 0.97, 0.69)
      ],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [5, 9], [9, 10], [9, 11],
              [3, 6], [6, 7], [7, 8], [8, 9]],
      flip: [[1, 2]]
    },

    human: {
      name: 'Human (COCO-17)',
      keypoints: [
        kp('nose', 'C', 0.50, 0.07), kp('left_eye', 'L', 0.46, 0.05), kp('right_eye', 'R', 0.54, 0.05),
        kp('left_ear', 'L', 0.41, 0.07), kp('right_ear', 'R', 0.59, 0.07),
        kp('left_shoulder', 'L', 0.38, 0.22), kp('right_shoulder', 'R', 0.62, 0.22),
        kp('left_elbow', 'L', 0.32, 0.38), kp('right_elbow', 'R', 0.68, 0.38),
        kp('left_wrist', 'L', 0.28, 0.53), kp('right_wrist', 'R', 0.72, 0.53),
        kp('left_hip', 'L', 0.43, 0.54), kp('right_hip', 'R', 0.57, 0.54),
        kp('left_knee', 'L', 0.42, 0.75), kp('right_knee', 'R', 0.58, 0.75),
        kp('left_ankle', 'L', 0.41, 0.96), kp('right_ankle', 'R', 0.59, 0.96)
      ],
      edges: [[15, 13], [13, 11], [16, 14], [14, 12], [11, 12], [5, 11], [6, 12], [5, 6],
              [5, 7], [6, 8], [7, 9], [8, 10], [0, 1], [0, 2], [1, 3], [2, 4]],
      flip: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]]
    }
  };

  Skeleton.blank = function () {
    return { name: 'Skeleton', keypoints: [], edges: [], flip: [] };
  };

  Skeleton.clone = function (sk) { return JSON.parse(JSON.stringify(sk)); };

  Skeleton.summary = function (sk) {
    if (!sk || !sk.keypoints.length) return 'no keypoints yet';
    return sk.keypoints.length + ' point' + (sk.keypoints.length === 1 ? '' : 's') +
           ' · ' + sk.edges.length + ' bone' + (sk.edges.length === 1 ? '' : 's');
  };

  /* ------------------------------------------------------- import / export */

  /** Accepts anything plausible and returns a clean blueprint, or throws. */
  Skeleton.validate = function (raw) {
    if (!raw || typeof raw !== 'object') throw new Error('not a JSON object');
    var kps = raw.keypoints || raw.points;
    if (!Array.isArray(kps) || !kps.length) throw new Error('no "keypoints" array');

    var out = { name: String(raw.name || 'Skeleton').slice(0, 60), keypoints: [], edges: [], flip: [] },
        seen = {}, i, k, name, side;

    for (i = 0; i < kps.length; i++) {
      k = kps[i];
      name = String((typeof k === 'string' ? k : k.name) || ('point_' + (i + 1))).trim().slice(0, 40);
      if (!name) name = 'point_' + (i + 1);
      while (seen[name]) name = name + '_2';
      seen[name] = true;
      side = (k && k.side) ? String(k.side).toUpperCase().charAt(0) : '';
      if (side !== 'L' && side !== 'R') side = 'C';
      out.keypoints.push({
        name: name,
        side: side,
        tx: clamp01(k && k.tx, 0.5),
        ty: clamp01(k && k.ty, 0.5)
      });
    }

    out.edges = cleanPairs(raw.edges || raw.skeleton, out.keypoints.length);
    out.flip = cleanPairs(raw.flip || raw.flip_pairs, out.keypoints.length);
    if (!out.flip.length) out.flip = derivePairs(out.keypoints);
    return out;
  };

  function clamp01(v, dflt) {
    var n = Number(v);
    if (!isFinite(n)) return dflt;
    return n < 0 ? 0 : (n > 1 ? 1 : n);
  }

  function cleanPairs(list, n) {
    var out = [], seen = {}, i, a, b, key;
    if (!Array.isArray(list)) return out;
    for (i = 0; i < list.length; i++) {
      if (!Array.isArray(list[i]) || list[i].length < 2) continue;
      a = list[i][0] | 0; b = list[i][1] | 0;
      if (a === b || a < 0 || b < 0 || a >= n || b >= n) continue;
      key = Math.min(a, b) + ':' + Math.max(a, b);
      if (seen[key]) continue;
      seen[key] = true;
      out.push([a, b]);
    }
    return out;
  }

  /** Pair up left_x / right_x by name, so mirrored training images stay honest. */
  function derivePairs(kps) {
    var byBase = {}, out = [], i, n, base, side;
    for (i = 0; i < kps.length; i++) {
      n = kps[i].name.toLowerCase();
      side = null;
      if (/^left[_-]/.test(n)) { side = 'L'; base = n.replace(/^left[_-]/, ''); }
      else if (/^right[_-]/.test(n)) { side = 'R'; base = n.replace(/^right[_-]/, ''); }
      else if (/[_-]left$/.test(n)) { side = 'L'; base = n.replace(/[_-]left$/, ''); }
      else if (/[_-]right$/.test(n)) { side = 'R'; base = n.replace(/[_-]right$/, ''); }
      else continue;
      if (!byBase[base]) byBase[base] = {};
      byBase[base][side] = i;
    }
    for (base in byBase) {
      if (byBase[base].L !== undefined && byBase[base].R !== undefined) {
        out.push([byBase[base].L, byBase[base].R]);
      }
    }
    return out;
  }
  Skeleton.autoPair = function (sk) { sk.flip = derivePairs(sk.keypoints); return sk; };

  Skeleton.toJSON = function (sk) {
    return JSON.stringify({
      name: sk.name,
      keypoints: sk.keypoints,
      edges: sk.edges,
      flip: sk.flip,
      /* handy for anyone wiring this straight into ultralytics */
      kpt_shape: [sk.keypoints.length, 3],
      flip_idx: flipIdx(sk)
    }, null, 2);
  };

  /** ultralytics wants a permutation: index i maps to its mirror. */
  function flipIdx(sk) {
    var idx = [], i;
    for (i = 0; i < sk.keypoints.length; i++) idx.push(i);
    for (i = 0; i < sk.flip.length; i++) {
      idx[sk.flip[i][0]] = sk.flip[i][1];
      idx[sk.flip[i][1]] = sk.flip[i][0];
    }
    return idx;
  }
  Skeleton.flipIdx = flipIdx;

  /* =============================================================== editor */

  var $ = function (id) { return document.getElementById(id); };
  var work = null, onDone = null, locked = false;
  var selIdx = -1, dragIdx = -1, dragMoved = false, backdrop = null;
  var pad, pctx, wired = false;

  var PAD_INSET = 26;

  /**
   * @param {object}   sk       blueprint to edit (cloned internally)
   * @param {object}   opts     { locked: bool, lockReason: string }
   * @param {function} done     called with the edited blueprint, or null on cancel
   */
  Skeleton.open = function (sk, opts, done) {
    work = Skeleton.clone(sk && sk.keypoints ? sk : Skeleton.blank());
    onDone = done;
    locked = !!(opts && opts.locked);
    selIdx = -1; dragIdx = -1; backdrop = null;

    pad = $('skel-pad');
    pctx = pad.getContext('2d');
    if (!wired) { wire(); wired = true; }

    $('skel-name').value = work.name;
    $('skel-lock').hidden = !locked;
    $('skel-lock').textContent = (opts && opts.lockReason) || '';
    $('skel-preset').value = '';
    fillBackdrops();
    render();
    window.UI.openModalStacked('modal-skeleton');
  };

  function wire() {
    $('skel-name').addEventListener('input', function () { work.name = this.value; });

    $('skel-preset').addEventListener('change', function () {
      var p = Skeleton.PRESETS[this.value];
      if (!p) return;
      if (locked) { window.UI.toast('Points are locked — this type already has poses'); this.value = ''; return; }
      work = Skeleton.clone(p);
      $('skel-name').value = work.name;
      selIdx = -1;
      render();
    });

    $('skel-backdrop').addEventListener('change', function () {
      var img = null, list = window.App.state.images, i;
      for (i = 0; i < list.length; i++) if (list[i].id === this.value) img = list[i];
      if (!img) { backdrop = null; render(); return; }
      var el = new Image();
      el.onload = function () { backdrop = el; render(); };
      el.src = img.url;
    });

    $('skel-autopair').addEventListener('click', function () {
      Skeleton.autoPair(work);
      render();
      window.UI.toast(work.flip.length + ' mirror pair' + (work.flip.length === 1 ? '' : 's') + ' found');
    });

    $('skel-export').addEventListener('click', function () {
      window.UI.downloadText(
        Skeleton.toJSON(work),
        (work.name || 'skeleton').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_skeleton.json',
        'application/json'
      );
    });

    $('skel-import').addEventListener('click', function () { $('skel-file').click(); });

    $('skel-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var parsed;
        try { parsed = Skeleton.validate(JSON.parse(r.result)); }
        catch (err) { window.UI.toast('Could not read that skeleton: ' + err.message); return; }
        if (locked && parsed.keypoints.length !== work.keypoints.length) {
          window.UI.toast('That skeleton has ' + parsed.keypoints.length + ' points, this type is locked to ' + work.keypoints.length);
          return;
        }
        work = parsed;
        $('skel-name').value = work.name;
        selIdx = -1;
        render();
        window.UI.toast('Loaded “' + work.name + '”');
      };
      r.readAsText(f);
    });

    $('skel-clear').addEventListener('click', function () {
      if (locked) { window.UI.toast('Points are locked — this type already has poses'); return; }
      work.keypoints = []; work.edges = []; work.flip = [];
      selIdx = -1;
      render();
    });

    $('skel-save').addEventListener('click', function () {
      if (!work.keypoints.length) { window.UI.toast('Add at least one keypoint'); return; }
      work.name = ($('skel-name').value || 'Skeleton').trim();
      var cb = onDone; onDone = null;
      window.UI.closeModalStacked();
      if (cb) cb(work);
    });

    $('modal-skeleton').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) {
        var cb = onDone; onDone = null;
        window.UI.closeModalStacked();
        if (cb) cb(null);
      }
    });

    /* Never re-render the list from its own input events — rebuilding the rows
       would tear out the <input> the user is typing into. */
    $('skel-list').addEventListener('input', function (e) {
      var row = e.target.closest('[data-i]');
      if (!row || !e.target.classList.contains('kp-name')) return;
      work.keypoints[+row.dataset.i].name = e.target.value;
      drawSummary();
    });

    $('skel-list').addEventListener('change', function (e) {
      var row = e.target.closest('[data-i]');
      if (!row || !e.target.classList.contains('kp-side')) return;
      work.keypoints[+row.dataset.i].side = e.target.value;
      drawPad();                              // side drives the dot colour
      drawSummary();
    });

    $('skel-list').addEventListener('click', function (e) {
      var row = e.target.closest('[data-i]');
      if (!row) return;
      var i = +row.dataset.i;
      if (e.target.closest('[data-act="del"]')) { removePoint(i); return; }
      selIdx = (selIdx === i) ? -1 : i;
      render();
    });

    pad.addEventListener('pointerdown', onPadDown);
    pad.addEventListener('pointermove', onPadMove);
    pad.addEventListener('pointerup', onPadUp);
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function fillBackdrops() {
    var list = window.App.state.images,
        html = '<option value="">No backdrop</option>', i;
    for (i = 0; i < list.length; i++) {
      html += '<option value="' + list[i].id + '">' + esc(list[i].name) + '</option>';
    }
    $('skel-backdrop').innerHTML = html;
  }

  /* -------------------------------------------------------------- pad math */

  function padRect() {
    return { x: PAD_INSET, y: PAD_INSET, w: pad.width - PAD_INSET * 2, h: pad.height - PAD_INSET * 2 };
  }
  function toPad(k) { var r = padRect(); return { x: r.x + k.tx * r.w, y: r.y + k.ty * r.h }; }
  function fromPad(x, y) {
    var r = padRect();
    return { tx: clamp01((x - r.x) / r.w, 0.5), ty: clamp01((y - r.y) / r.h, 0.5) };
  }
  function padPos(e) {
    var b = pad.getBoundingClientRect();
    return { x: (e.clientX - b.left) * (pad.width / b.width), y: (e.clientY - b.top) * (pad.height / b.height) };
  }
  function pointAt(x, y) {
    var i, p;
    for (i = work.keypoints.length - 1; i >= 0; i--) {
      p = toPad(work.keypoints[i]);
      if (Math.hypot(x - p.x, y - p.y) <= 11) return i;
    }
    return -1;
  }

  /* ---------------------------------------------------------- pad handlers */

  function onPadDown(e) {
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    var p = padPos(e);
    dragIdx = pointAt(p.x, p.y);
    dragMoved = false;
  }

  function onPadMove(e) {
    if (dragIdx === -1) return;
    var p = padPos(e), t = fromPad(p.x, p.y), k = work.keypoints[dragIdx];
    if (Math.abs(t.tx - k.tx) > 0.004 || Math.abs(t.ty - k.ty) > 0.004) dragMoved = true;
    if (!dragMoved) return;
    k.tx = t.tx; k.ty = t.ty;
    render();
  }

  function onPadUp(e) {
    var p = padPos(e), hit = dragIdx, moved = dragMoved;
    dragIdx = -1; dragMoved = false;
    if (moved) return;

    if (hit === -1) { addPoint(p); return; }

    /* click a point, then click another, to toggle the bone between them */
    if (selIdx === -1 || selIdx === hit) { selIdx = (selIdx === hit) ? -1 : hit; }
    else { toggleEdge(selIdx, hit); selIdx = -1; }
    render();
  }

  function addPoint(p) {
    if (locked) { window.UI.toast('Points are locked — this type already has poses'); return; }
    var t = fromPad(p.x, p.y), n = work.keypoints.length + 1, name = 'point_' + n;
    while (nameTaken(name)) { n += 1; name = 'point_' + n; }
    work.keypoints.push({ name: name, side: 'C', tx: t.tx, ty: t.ty });
    /* chain onto whatever was selected, so drawing a limb is one click each */
    if (selIdx !== -1) toggleEdge(selIdx, work.keypoints.length - 1);
    selIdx = work.keypoints.length - 1;
    render();
  }

  function nameTaken(n) {
    for (var i = 0; i < work.keypoints.length; i++) if (work.keypoints[i].name === n) return true;
    return false;
  }

  function removePoint(i) {
    if (locked) { window.UI.toast('Points are locked — this type already has poses'); return; }
    work.keypoints.splice(i, 1);
    work.edges = reindex(work.edges, i);
    work.flip = reindex(work.flip, i);
    if (selIdx === i) selIdx = -1; else if (selIdx > i) selIdx -= 1;
    render();
  }

  function reindex(pairs, removed) {
    var out = [], i, a, b;
    for (i = 0; i < pairs.length; i++) {
      a = pairs[i][0]; b = pairs[i][1];
      if (a === removed || b === removed) continue;
      out.push([a > removed ? a - 1 : a, b > removed ? b - 1 : b]);
    }
    return out;
  }

  function toggleEdge(a, b) {
    var i;
    for (i = 0; i < work.edges.length; i++) {
      if ((work.edges[i][0] === a && work.edges[i][1] === b) ||
          (work.edges[i][0] === b && work.edges[i][1] === a)) {
        work.edges.splice(i, 1);
        return;
      }
    }
    work.edges.push([a, b]);
  }

  /* -------------------------------------------------------------- painting */

  function render() {
    drawPad();
    drawList();
    drawSummary();
  }

  function drawSummary() {
    $('skel-summary').textContent = Skeleton.summary(work) + ' · ' +
      work.flip.length + ' mirror pair' + (work.flip.length === 1 ? '' : 's');
  }

  function drawPad() {
    var w = pad.width, h = pad.height, i, e, a, b, p, k;
    pctx.clearRect(0, 0, w, h);

    pctx.fillStyle = '#0b1017';
    pctx.fillRect(0, 0, w, h);

    if (backdrop) {
      var r = padRect(),
          s = Math.min(r.w / backdrop.naturalWidth, r.h / backdrop.naturalHeight),
          dw = backdrop.naturalWidth * s, dh = backdrop.naturalHeight * s;
      pctx.globalAlpha = 0.45;
      pctx.drawImage(backdrop, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
      pctx.globalAlpha = 1;
    }

    /* template frame */
    var fr = padRect();
    pctx.strokeStyle = 'rgba(255,255,255,.12)';
    pctx.setLineDash([4, 4]);
    pctx.lineWidth = 1;
    pctx.strokeRect(fr.x + .5, fr.y + .5, fr.w, fr.h);
    pctx.setLineDash([]);

    /* bones */
    pctx.strokeStyle = 'rgba(120,160,220,.85)';
    pctx.lineWidth = 2;
    for (i = 0; i < work.edges.length; i++) {
      e = work.edges[i];
      if (!work.keypoints[e[0]] || !work.keypoints[e[1]]) continue;
      a = toPad(work.keypoints[e[0]]); b = toPad(work.keypoints[e[1]]);
      pctx.beginPath(); pctx.moveTo(a.x, a.y); pctx.lineTo(b.x, b.y); pctx.stroke();
    }

    /* points */
    for (i = 0; i < work.keypoints.length; i++) {
      k = work.keypoints[i];
      p = toPad(k);
      pctx.beginPath();
      pctx.arc(p.x, p.y, i === selIdx ? 7.5 : 5.5, 0, Math.PI * 2);
      pctx.fillStyle = k.side === 'L' ? '#ffd93d' : (k.side === 'R' ? '#4cc9f0' : '#ffffff');
      pctx.fill();
      pctx.lineWidth = i === selIdx ? 2.5 : 1.5;
      pctx.strokeStyle = i === selIdx ? '#4c9aff' : '#0b1017';
      pctx.stroke();

      pctx.fillStyle = 'rgba(230,237,243,.75)';
      pctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      pctx.fillText(String(i), p.x + 8, p.y - 6);
    }

    if (!work.keypoints.length) {
      pctx.fillStyle = 'rgba(139,152,168,.85)';
      pctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      pctx.textAlign = 'center';
      pctx.fillText('Click to place the first keypoint', w / 2, h / 2);
      pctx.textAlign = 'left';
    }
  }

  function drawList() {
    var html = '', i, k;
    for (i = 0; i < work.keypoints.length; i++) {
      k = work.keypoints[i];
      html += '<div class="kp-row' + (i === selIdx ? ' active' : '') + '" data-i="' + i + '">' +
                '<span class="kp-idx">' + i + '</span>' +
                '<input class="kp-name" type="text" value="' + esc(k.name) + '" maxlength="40" spellcheck="false">' +
                '<select class="kp-side" title="Side, used for mirror pairing">' +
                  '<option value="C"' + (k.side === 'C' ? ' selected' : '') + '>–</option>' +
                  '<option value="L"' + (k.side === 'L' ? ' selected' : '') + '>L</option>' +
                  '<option value="R"' + (k.side === 'R' ? ' selected' : '') + '>R</option>' +
                '</select>' +
                (locked ? '' : '<button class="iconbtn tiny danger" data-act="del" title="Remove">' +
                  window.svgIcon('trash', 13) + '</button>') +
              '</div>';
    }
    $('skel-list').innerHTML = html ||
      '<p class="panel-empty">No keypoints yet.<br>Click on the pad to place them.</p>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

})();
