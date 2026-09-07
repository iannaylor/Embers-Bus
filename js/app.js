/* ==========================================================================
   Ember's Bus - the game
   Two scenes:
     OUTSIDE - the bus on the road. Drive, honk, wipers, lights, wash,
               pick a colour, stop at the crossing and help people cross.
     INSIDE  - rows of seats. Drag people onto seats, tap to buckle up.
   Everything is finger/touch friendly (Pointer Events) and works with a
   mouse on a laptop too.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function darken(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * (1 - amount));
    const g = Math.round(((n >> 8) & 255) * (1 - amount));
    const b = Math.round((n & 255) * (1 - amount));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2200);
  }

  const outside = $('#outside');
  const stage = $('.stage');
  const app = $('#app');

  /* --- pointer maths -------------------------------------------------------
     #app may be rotated (phone held upright) and/or counter-scaled (browser
     zoom). Everything inside is untransformed, so converting pointer
     positions into #app's own coordinate space makes all the game logic
     orientation-proof. */
  function appMatrix() {
    const t = getComputedStyle(app).transform;
    return (t && t !== 'none') ? new DOMMatrix(t) : new DOMMatrix();
  }
  function toLocal(clientX, clientY) {
    const p = new DOMPoint(clientX, clientY).matrixTransform(appMatrix().inverse());
    return { x: p.x, y: p.y };
  }
  function localRect(el) {
    const r = el.getBoundingClientRect();
    const inv = appMatrix().inverse();
    const a = new DOMPoint(r.left, r.top).matrixTransform(inv);
    const b = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
    const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  const inside = $('#inside');
  const busWrap = $('#bus-wrap');
  const busSvg = $('#bus');

  /* ------------------------------------------------------------- colours */
  const COLORS = [
    ['#ffcc00', 'Yellow'], ['#ff3b3b', 'Red'], ['#3b82ff', 'Blue'], ['#37c65a', 'Green'],
    ['#ff6fb5', 'Pink'], ['#9b5cff', 'Purple'], ['#ff8a1a', 'Orange'], ['#22c9c9', 'Teal'],
    ['#f4f4f4', 'White'], ['#555b6e', 'Grey'], ['#a0522d', 'Brown'], ['#b8ff3b', 'Lime']
  ];

  function applyColor(c) {
    document.documentElement.style.setProperty('--bus-color', c);
    document.documentElement.style.setProperty('--bus-dark', darken(c, 0.22));
    $$('.swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === c));
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = c;
  }

  function buildSwatches() {
    const wrap = $('#swatches');
    COLORS.forEach(([c, name]) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.dataset.color = c;
      b.setAttribute('aria-label', name);
      b.addEventListener('click', () => {
        Store.setColor(c);
        applyColor(c);
        Sound.tap();
        setTimeout(() => $('#color-sheet').classList.add('hidden'), 180);
      });
      wrap.appendChild(b);
    });
  }

  /* -------------------------------------------------------------- people */
  function faceEl(person, cls) {
    const face = document.createElement('div');
    face.className = 'face' + (cls ? ' ' + cls : '');
    if (person.img) {
      face.style.backgroundImage = `url("${person.img}")`;
    } else {
      const e = document.createElement('span');
      e.className = 'emoji';
      e.textContent = person.emoji || '🙂';
      face.appendChild(e);
    }
    return face;
  }

  function personEl(person) {
    const el = document.createElement('div');
    el.className = 'person';
    el.dataset.id = person.id;
    el.style.setProperty('--body-color', Store.bodyColor(person.id));
    el.appendChild(faceEl(person));
    const body = document.createElement('div');
    body.className = 'body';
    el.appendChild(body);
    const belt = document.createElement('div');
    belt.className = 'belt';
    el.appendChild(belt);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = person.name || '';
    el.appendChild(name);
    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '✖';
    remove.setAttribute('aria-label', 'Remove ' + (person.name || 'person'));
    el.appendChild(remove);
    return el;
  }

  /* ========================================================================
     INSIDE THE BUS
     ======================================================================== */
  const ROWS = 4;
  const SEAT_LETTERS = ['a', 'b', 'c', 'd'];

  function buildCabin() {
    const rows = $('#rows');
    for (let r = 1; r <= ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      SEAT_LETTERS.forEach((l, i) => {
        if (i === 2) {
          const aisle = document.createElement('div');
          aisle.className = 'aisle';
          row.appendChild(aisle);
        }
        const seat = document.createElement('div');
        seat.className = 'seat empty';
        seat.dataset.seat = `r${r}-${l}`;
        seat.innerHTML = '<div class="cushion"></div><div class="headrest"></div>';
        row.appendChild(seat);
      });
      rows.appendChild(row);
    }
  }

  function renderSeats() {
    $$('.seat').forEach(seat => {
      $$('.person', seat).forEach(p => p.remove());
      const pid = Store.occupant(seat.dataset.seat);
      const person = pid && Store.person(pid);
      seat.classList.toggle('empty', !person);
      if (person) {
        const el = personEl(person);
        el.classList.toggle('belted', Store.isBelted(seat.dataset.seat));
        makeDraggable(el, { from: 'seat', seat: seat.dataset.seat, id: person.id });
        seat.appendChild(el);
      }
    });
    renderBusFaces();
  }

  function updateTrayArrows() {
    const tray = $('#tray');
    const overflow = tray.scrollWidth > tray.clientWidth + 4 || tray.scrollHeight > tray.clientHeight + 4;
    $('.tray-wrap').classList.toggle('has-overflow', overflow);
  }
  function scrollTray(dir) {
    const tray = $('#tray');
    const vertical = tray.scrollHeight > tray.clientHeight + 4;
    tray.scrollBy({ left: vertical ? 0 : dir * tray.clientWidth * 0.7, top: vertical ? dir * tray.clientHeight * 0.7 : 0, behavior: 'smooth' });
  }

  function renderTray() {
    const tray = $('#tray');
    tray.innerHTML = '';
    const people = Store.people().filter(p => !Store.seatOf(p.id));
    if (people.length === 0) {
      const e = document.createElement('div');
      e.className = 'tray-empty';
      e.textContent = Store.people().length === 0 ? 'Nobody here yet' : 'Everyone is aboard 🚌';
      tray.appendChild(e);
      requestAnimationFrame(updateTrayArrows);
      return;
    }
    people.forEach(p => {
      const el = personEl(p);
      makeDraggable(el, { from: 'tray', id: p.id });
      tray.appendChild(el);
    });
    requestAnimationFrame(updateTrayArrows);
  }

  function renderInside() {
    renderSeats();
    renderTray();
  }

  /* ----------------------------------------------------------- dragging */
  const dragLayer = $('#drag-layer');

  /** The seat under the finger, or the nearest one within reach (small fingers wobble). */
  function seatNear(clientX, clientY) {
    const under = document.elementFromPoint(clientX, clientY);
    const direct = under && under.closest('.seat');
    if (direct) return direct;
    const p = toLocal(clientX, clientY);
    let best = null, bestD = 70; // px of forgiveness around a seat
    $$('.seat').forEach(seat => {
      const r = localRect(seat);
      const dx = Math.max(r.left - p.x, 0, p.x - r.right);
      const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = seat; }
    });
    return best;
  }

  /** Shared drag state machine: returns move/end/cancel for a drag that began at (sx, sy). */
  function startDrag(el, info, sx, sy) {
    let ghost = null;
    let overSeat = null;
    let lastX = sx, lastY = sy;
    const teardown = () => {
      $('#inside').classList.remove('drag-active');
      if (ghost) { ghost.remove(); ghost = null; }
      el.classList.remove('dragging');
      if (overSeat) { overSeat.classList.remove('over'); overSeat = null; }
    };
    return {
      move(x, y) {
        lastX = x; lastY = y;
        if (!ghost) {
          if (Math.hypot(x - sx, y - sy) < 12) return;
          ghost = el.cloneNode(true);
          ghost.classList.remove('dragging', 'belted');
          dragLayer.appendChild(ghost);
          el.classList.add('dragging');
          $('#inside').classList.add('drag-active');
        }
        const lp = toLocal(x, y);
        ghost.style.left = lp.x + 'px';
        ghost.style.top = lp.y + 'px';
        const seat = seatNear(x, y);
        if (seat !== overSeat) {
          if (overSeat) overSeat.classList.remove('over');
          overSeat = seat;
          if (overSeat) overSeat.classList.add('over');
        }
      },
      end(x, y) {
        if (x === undefined) { x = lastX; y = lastY; }
        const lifted = !!ghost;
        teardown();
        if (!lifted) { onTap(el, info); return; }
        const seat = seatNear(x, y);
        const travelled = Math.hypot(x - sx, y - sy);
        if (seat && info.from === 'seat' && seat.dataset.seat === info.seat) {
          // Wobbled but ended on the same seat: a short wobble is a tap, otherwise nothing.
          if (travelled < 40) onTap(el, info);
        } else if (seat) {
          dropOnSeat(info.id, seat.dataset.seat);
        } else if (info.from === 'seat' && travelled > 60) {
          Store.unseat(info.id);
          Sound.unbelt();
          toast(`${Store.person(info.id).name || 'Friend'} got off the bus`);
          renderInside();
        }
      },
      cancel() { teardown(); }
    };
  }

  function makeDraggable(el, info) {
    // Touch screens: raw touch events (the most dependable thing iOS has).
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('.remove')) return;
      e.preventDefault(); // this touch is ours: no scrolling, no zoom, no ghost clicks
      const t0 = e.touches[0];
      const id = t0.identifier;
      const d = startDrag(el, info, t0.clientX, t0.clientY);
      const find = ev => Array.from(ev.changedTouches).find(c => c.identifier === id);
      const move = ev => { const c = find(ev); if (!c) return; ev.preventDefault(); d.move(c.clientX, c.clientY); };
      const end = ev => { const c = find(ev); if (!c) return; cleanup(); d.end(c.clientX, c.clientY); };
      const cancel = ev => { const c = find(ev); if (!c) return; cleanup(); d.cancel(); };
      const cleanup = () => {
        el.removeEventListener('touchmove', move);
        el.removeEventListener('touchend', end);
        el.removeEventListener('touchcancel', cancel);
      };
      el.addEventListener('touchmove', move, { passive: false });
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', cancel);
    }, { passive: false });

    // Mouse / pen: pointer events.
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.remove')) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const d = startDrag(el, info, e.clientX, e.clientY);
      const move = ev => d.move(ev.clientX, ev.clientY);
      const finish = ev => { cleanup(); d.end(ev.clientX, ev.clientY); };
      const cancel = () => { cleanup(); d.cancel(); };
      const cleanup = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', finish);
        el.removeEventListener('pointercancel', cancel);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', finish);
      el.addEventListener('pointercancel', cancel);
    });
  }

  function dropOnSeat(personId, seatId) {
    const person = Store.person(personId);
    const bumped = Store.seat(personId, seatId);
    Sound.tap();
    if (seatId === 'driver') toast(`${person.name || 'Friend'} is driving the bus! 🚌`);
    else if (bumped) toast(`${Store.person(bumped).name || 'Someone'} swapped seats`);
    else toast(`${person.name || 'Friend'} sat down. Tap to buckle up!`);
    renderInside();
  }

  function onTap(el, info) {
    if (info.from === 'seat') {
      const on = Store.toggleBelt(info.seat);
      el.classList.toggle('belted', on);
      if (on) { Sound.beltClick(); toast(`Click! ${Store.person(info.id).name || 'Friend'} is buckled in 🙂`); }
      else { Sound.unbelt(); }
    } else if (inside.classList.contains('editing')) {
      openPersonSheet(info.id);
    } else {
      Sound.tap();
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 300 });
    }
  }

  /* ---------------------------------------------------- add / edit people */
  let sheetPersonId = null; // null = adding
  let pendingImg = null;    // data URL once a crop has been made

  /* --- photo cropper: drag to move, pinch / wheel / slider to zoom ------ */
  const crop = { img: null, zoom: 1, ox: 0, oy: 0, pointers: new Map() };
  const cropEl = $('#crop');
  const cropCanvas = $('#crop-canvas');
  const cropZoom = $('#crop-zoom');

  function cropGeom() {
    const V = cropCanvas.clientWidth;
    const w = crop.img.naturalWidth, h = crop.img.naturalHeight;
    const s = (V / Math.min(w, h)) * crop.zoom; // zoom 1 = photo just covers the circle
    return { V, w, h, s };
  }
  function cropClamp() {
    const { V, w, h, s } = cropGeom();
    const mx = Math.max(0, (w * s - V) / 2), my = Math.max(0, (h * s - V) / 2);
    crop.ox = clamp(crop.ox, -mx, mx);
    crop.oy = clamp(crop.oy, -my, my);
  }
  function cropDraw() {
    if (!crop.img) return;
    const { V, w, h, s } = cropGeom();
    const dpr = window.devicePixelRatio || 1;
    if (cropCanvas.width !== Math.round(V * dpr)) {
      cropCanvas.width = cropCanvas.height = Math.round(V * dpr);
    }
    const g = cropCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#ffe0c2';
    g.fillRect(0, 0, V, V);
    g.drawImage(crop.img, V / 2 - (w * s) / 2 + crop.ox, V / 2 - (h * s) / 2 + crop.oy, w * s, h * s);
  }
  /** Zoom to z keeping the photo point under (cx, cy) (relative to the centre) still. */
  function cropSetZoom(z, cx, cy) {
    const before = cropGeom().s;
    crop.zoom = clamp(z, 1, 5);
    const k = cropGeom().s / before;
    crop.ox = cx - (cx - crop.ox) * k;
    crop.oy = cy - (cy - crop.oy) * k;
    cropClamp();
    cropDraw();
    cropZoom.value = crop.zoom;
  }
  function cropStart(img) {
    cropReset();
    crop.img = img;
    crop.zoom = 1; crop.ox = 0; crop.oy = 0;
    cropZoom.value = 1;
    $('#preview-face').classList.add('hidden');
    cropEl.classList.remove('hidden');
    $('#crop-controls').classList.remove('hidden');
    cropDraw();
  }
  function cropReset() {
    if (crop.img) { URL.revokeObjectURL(crop.img.src); crop.img = null; }
    crop.pointers.clear();
    cropEl.classList.add('hidden');
    $('#crop-controls').classList.add('hidden');
    $('#preview-face').classList.remove('hidden');
  }
  function cropResult() {
    const { V, w, h, s } = cropGeom();
    const side = V / s;
    const sx = (w - side) / 2 - crop.ox / s;
    const sy = (h - side) / 2 - crop.oy / s;
    return Store.cropFace(crop.img, sx, sy, side);
  }
  function bindCropper() {
    const rel = e => {
      const r = localRect(cropCanvas);
      const p = toLocal(e.clientX, e.clientY);
      return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 };
    };
    cropEl.addEventListener('pointerdown', e => {
      if (!crop.img) return;
      e.preventDefault();
      try { cropEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      crop.pointers.set(e.pointerId, rel(e));
    });
    cropEl.addEventListener('pointermove', e => {
      if (!crop.img || !crop.pointers.has(e.pointerId)) return;
      const now = rel(e);
      const pts = Array.from(crop.pointers.entries());
      if (pts.length === 1) {
        const prev = pts[0][1];
        crop.ox += now.x - prev.x;
        crop.oy += now.y - prev.y;
        crop.pointers.set(e.pointerId, now);
        cropClamp();
        cropDraw();
      } else {
        const other = pts.find(([id]) => id !== e.pointerId)[1];
        const prev = crop.pointers.get(e.pointerId);
        const midBefore = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
        const midAfter = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
        const dBefore = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
        const dAfter = Math.hypot(now.x - other.x, now.y - other.y) || 1;
        crop.ox += midAfter.x - midBefore.x;
        crop.oy += midAfter.y - midBefore.y;
        crop.pointers.set(e.pointerId, now);
        cropSetZoom(crop.zoom * (dAfter / dBefore), midAfter.x, midAfter.y);
      }
    });
    const end = e => { crop.pointers.delete(e.pointerId); };
    cropEl.addEventListener('pointerup', end);
    cropEl.addEventListener('pointercancel', end);
    cropEl.addEventListener('wheel', e => {
      if (!crop.img) return;
      e.preventDefault();
      const p = rel(e);
      cropSetZoom(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), p.x, p.y);
    }, { passive: false });
    cropZoom.addEventListener('input', () => cropSetZoom(parseFloat(cropZoom.value), 0, 0));
    window.addEventListener('resize', cropDraw);
  }

  function openPersonSheet(id) {
    sheetPersonId = id || null;
    pendingImg = null;
    cropReset();
    const p = id ? Store.person(id) : null;
    $('#person-sheet-title').textContent = p ? 'Edit ' + (p.name || 'person') : 'Add a person';
    $('#name-input').value = p ? (p.name || '') : '';
    const preview = $('#preview-face');
    preview.innerHTML = '';
    preview.style.backgroundImage = p && p.img ? `url("${p.img}")` : '';
    if (!(p && p.img)) {
      const e = document.createElement('span');
      e.className = 'emoji';
      e.textContent = p && p.emoji ? p.emoji : '🙂';
      preview.appendChild(e);
    }
    $('#person-sheet').classList.remove('hidden');
  }

  function closePersonSheet() {
    cropReset();
    $('#person-sheet').classList.add('hidden');
    $('#name-input').blur();
  }

  function bindPersonSheet() {
    bindCropper();
    $('#btn-add').addEventListener('click', () => { Sound.tap(); openPersonSheet(null); });
    $('#tray-prev').addEventListener('click', () => scrollTray(-1));
    $('#tray-next').addEventListener('click', () => scrollTray(1));
    window.addEventListener('resize', () => requestAnimationFrame(updateTrayArrows));
    $('#btn-edit').addEventListener('click', () => {
      Sound.tap();
      const on = inside.classList.toggle('editing');
      $('#btn-edit').classList.toggle('active', on);
      toast(on ? 'Tap a person to change them, or ✖ to remove' : 'Done editing');
    });
    $('#btn-photo').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const img = await Store.loadImage(file);
        cropStart(img);
        Sound.pop();
      } catch (err) {
        toast('Sorry, that picture did not work');
      }
    });
    $('#btn-person-cancel').addEventListener('click', () => { Sound.tap(); closePersonSheet(); });
    $('#btn-person-save').addEventListener('click', () => {
      const name = $('#name-input').value.trim().slice(0, 16);
      if (crop.img) {
        try { pendingImg = cropResult(); } catch (err) { toast('Sorry, that picture did not work'); return; }
      }
      if (sheetPersonId) {
        const changes = { name };
        if (pendingImg) { changes.img = pendingImg; changes.emoji = undefined; }
        Store.updatePerson(sheetPersonId, changes);
      } else {
        const p = { id: Store.uid(), name: name || 'Friend' };
        if (pendingImg) p.img = pendingImg; else p.emoji = '🙂';
        Store.addPerson(p);
      }
      if (!Store.save()) toast('Storage is full - try removing some people');
      Sound.cheer();
      closePersonSheet();
      renderInside();
    });
    // remove buttons (delegated)
    $('#tray').addEventListener('click', e => {
      const btn = e.target.closest('.remove');
      if (!btn) return;
      const el = btn.closest('.person');
      const p = Store.person(el.dataset.id);
      if (p && window.confirm(`Remove ${p.name || 'this person'} from the game?`)) {
        Store.removePerson(p.id);
        renderInside();
      }
    });
    $('#person-sheet').addEventListener('click', e => { if (e.target === e.currentTarget) closePersonSheet(); });
  }

  /* ========================================================================
     OUTSIDE - faces in the windows
     ======================================================================== */
  const WINDOW_X = [70, 166, 262, 358];

  function svgFace(person, cx, cy, r, key) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'win-face');
    // When the bus drawing is mirrored, un-mirror the face so photos read correctly.
    const inner = document.createElementNS(SVG_NS, 'g');
    if (facing.left) inner.setAttribute('transform', `translate(${cx * 2} 0) scale(-1 1)`);
    // body
    const body = document.createElementNS(SVG_NS, 'rect');
    body.setAttribute('x', cx - r * 0.9);
    body.setAttribute('y', cy + r * 0.7);
    body.setAttribute('width', r * 1.8);
    body.setAttribute('height', r * 1.6);
    body.setAttribute('rx', r * 0.6);
    body.setAttribute('fill', Store.bodyColor(person.id));
    g.appendChild(body);
    if (person.img) {
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', 'fc-' + key);
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
      clip.appendChild(c);
      g.appendChild(clip);
      const img = document.createElementNS(SVG_NS, 'image');
      img.setAttribute('href', person.img);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', person.img);
      img.setAttribute('x', cx - r); img.setAttribute('y', cy - r);
      img.setAttribute('width', r * 2); img.setAttribute('height', r * 2);
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#fc-${key})`);
      inner.appendChild(img);
      g.appendChild(inner);
    } else {
      const bg = document.createElementNS(SVG_NS, 'circle');
      bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
      bg.setAttribute('fill', '#ffe0c2');
      g.appendChild(bg);
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', cx); t.setAttribute('y', cy + r * 0.45);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', r * 1.4);
      t.textContent = person.emoji || '🙂';
      inner.appendChild(t);
      g.appendChild(inner);
    }
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', r);
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#fff'); ring.setAttribute('stroke-width', 3);
    g.appendChild(ring);
    return g;
  }

  function renderBusFaces() {
    const wins = $('#win-faces');
    wins.innerHTML = '';
    // Row 1 is nearest the front (the windscreen end). Facing right we look at
    // the door side of the bus (seats a = window, b = aisle); turned round we
    // see the other side (d = window, c = aisle).
    const sideSeats = facing.left ? ['d', 'c'] : ['a', 'b'];
    for (let r = 1; r <= ROWS; r++) {
      const winIndex = ROWS - r;
      const x = WINDOW_X[winIndex];
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('clip-path', `url(#clip-win${winIndex + 1})`);
      const windowPid = Store.occupant(`r${r}-${sideSeats[0]}`);
      const aislePid = Store.occupant(`r${r}-${sideSeats[1]}`);
      const aisle = aislePid && Store.person(aislePid);
      const window_ = windowPid && Store.person(windowPid);
      // aisle-seat person sits a little further back, drawn first (behind)
      if (aisle) g.appendChild(svgFace(aisle, x + (window_ ? 60 : 43), 146, window_ ? 19 : 24, `w${r}b`));
      if (window_) g.appendChild(svgFace(window_, x + (aisle ? 30 : 43), 149, aisle ? 23 : 25, `w${r}a`));
      wins.appendChild(g);
    }
    const drv = $('#driver-face');
    drv.innerHTML = '';
    const driverId = Store.occupant('driver');
    const driver = driverId && Store.person(driverId);
    if (driver) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('clip-path', 'url(#clip-screen)');
      g.appendChild(svgFace(driver, 566, 156, 26, 'drv'));
      drv.appendChild(g);
    }
    // keep the destination sign readable when mirrored
    const sign = $('#sign-text');
    sign.setAttribute('transform', facing.left ? 'translate(370 0) scale(-1 1)' : '');
  }

  /* ---------------------------------------------------- turning around */
  const facing = { left: false, turning: false };
  const busTurn = $('#bus-turn');

  function turnAround(done) {
    if (facing.turning) return;
    facing.turning = true;
    stopDriving(true);
    if (crossing.active) endCrossing();
    if (wash.on) setWash(false);
    Sound.whoosh();
    busTurn.style.transform = 'rotateY(90deg)';
    setTimeout(() => {
      facing.left = !facing.left;
      busWrap.classList.toggle('facing-left', facing.left);
      $('#bus-content').setAttribute('transform', facing.left ? 'translate(640 0) scale(-1 1)' : '');
      renderBusFaces();
      busTurn.classList.add('snap');
      busTurn.style.transform = 'rotateY(-90deg)';
      void busTurn.offsetWidth;
      busTurn.classList.remove('snap');
      busTurn.style.transform = 'rotateY(0deg)';
      setTimeout(() => { facing.turning = false; if (done) done(); }, 400);
      if (!done) toast(facing.left ? 'Now you can see the other side 👀' : 'Back to the door side 🚪');
    }, 370);
  }

  /** Drive off towards `dir` ('left' or 'right'), turning round first if needed. */
  function goDirection(dir) {
    if (facing.turning) return;
    if (crossing.active && crossing.pedOnRoad) {
      Sound.horn();
      toast(`Wait! ${crossing.current.name || 'Someone'} is still crossing! ✋`);
      return;
    }
    const wantLeft = dir === 'left';
    if (wantLeft !== facing.left) turnAround(() => startDriving());
    else startDriving();
  }

  /* ========================================================================
     OUTSIDE - driving
     ======================================================================== */
  const drive = { on: false, speed: 0, offset: 0, cloud: 0, wheel: 0, last: 0, raf: null, dirtTimer: 0 };
  const layers = {
    clouds: $('.clouds'), hills: $('.hills'), houses: $('.houses'), lines: $('.road-lines')
  };
  const wheelSpins = $$('.wheel-spin');

  function frame(t) {
    if (!drive.last) drive.last = t;
    const dt = Math.min(0.05, (t - drive.last) / 1000);
    drive.last = t;
    const target = drive.on ? 1 : 0;
    drive.speed += (target - drive.speed) * Math.min(1, dt * 2.2);
    if (!drive.on && drive.speed < 0.01) drive.speed = 0;

    const px = drive.speed * 440 * dt;
    drive.offset += facing.left ? -px : px;
    drive.cloud += dt * 6 + px * 0.15;
    drive.wheel += px * 1.4;

    layers.clouds.style.backgroundPositionX = -drive.cloud + 'px';
    layers.hills.style.backgroundPositionX = -(drive.offset * 0.3) + 'px';
    layers.houses.style.backgroundPositionX = -(drive.offset * 0.6) + 'px';
    layers.lines.style.backgroundPositionX = -drive.offset + 'px';
    wheelSpins.forEach(w => { w.style.transform = `rotate(${drive.wheel}deg)`; });
    Sound.engineSpeed(drive.speed);

    if (drive.on) {
      drive.dirtTimer += dt;
      if (drive.dirtTimer > 3.5) { drive.dirtTimer = 0; addDirt(); }
    }
    drive.raf = requestAnimationFrame(frame);
  }

  function ensureLoop() {
    if (!drive.raf) { drive.last = 0; drive.raf = requestAnimationFrame(frame); }
  }

  function startDriving() {
    if (drive.on) return;
    if (crossing.active && crossing.pedOnRoad) {
      Sound.horn();
      toast(`Wait! ${crossing.current.name || 'Someone'} is still crossing! ✋`);
      return;
    }
    if (crossing.active) endCrossing();
    if (wash.on) setWash(false);
    if ($('#door').classList.contains('open')) closeDoor();
    drive.on = true;
    outside.classList.add('driving');
    busWrap.classList.add('driving');
    const btn = $('#btn-go');
    btn.classList.add('driving');
    btn.innerHTML = '⏹️<span>Stop</span>';
    Sound.engineStart();
    ensureLoop();
    toast('Off we go! 🚌💨');
  }

  function stopDriving(silent) {
    if (!drive.on) return;
    drive.on = false;
    outside.classList.remove('driving');
    busWrap.classList.remove('driving');
    const btn = $('#btn-go');
    btn.classList.remove('driving');
    btn.innerHTML = '▶️<span>Go!</span>';
    if (!silent) Sound.brake();
    Sound.engineStop();
    ensureLoop();
  }

  /* ------------------------------------------------------------- dirt */
  const MAX_DIRT = 12;
  function addDirt() {
    const g = $('#dirt');
    if (g.children.length >= MAX_DIRT) return;
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', 70 + Math.random() * 500);
    c.setAttribute('cy', 105 + Math.random() * 150);
    c.setAttribute('r', 7 + Math.random() * 9);
    g.appendChild(c);
  }

  /* ========================================================================
     OUTSIDE - door, horn, wipers, lights, music
     ======================================================================== */
  let doorTimer = null;
  function openDoor() {
    stopDriving();
    if (wash.on) setWash(false);
    const door = $('#door');
    if (door.classList.contains('open')) { showInside(); return; }
    door.classList.add('open');
    Sound.doorHiss();
    clearTimeout(doorTimer);
    doorTimer = setTimeout(showInside, 650);
  }
  function closeDoor() {
    const door = $('#door');
    if (!door.classList.contains('open')) return;
    door.classList.remove('open');
    Sound.doorHiss();
  }
  function showInside() {
    outside.classList.remove('active');
    inside.classList.add('active');
    renderInside();
    const unseated = Store.people().filter(p => !Store.seatOf(p.id)).length;
    if (Store.people().length === 0) toast('Tap ➕ to add a photo of someone!', 3500);
    else if (unseated === 0) toast('Everyone is on the bus! Tap them to buckle up 🙂', 3000);
    else toast('Drag someone onto a seat, then tap them to buckle up!', 3500);
  }
  function showOutside() {
    inside.classList.remove('active');
    inside.classList.remove('editing');
    $('#btn-edit').classList.remove('active');
    outside.classList.add('active');
    renderBusFaces();
    setTimeout(closeDoor, 150);
    const aboard = Object.keys(Store.state.seats).length;
    if (aboard) toast(`${aboard} on board. Doors closing! 🚪`);
  }

  function honk() {
    Sound.horn();
    busWrap.classList.remove('honk');
    void busWrap.offsetWidth; // restart animation
    busWrap.classList.add('honk');
  }

  let wiperTimer = null;
  function toggleWipers() {
    const on = outside.classList.toggle('wipers-on');
    $('#btn-wipers').classList.toggle('active', on);
    $('#rain').classList.toggle('hidden', !on);
    clearInterval(wiperTimer);
    if (on) {
      Sound.squeak();
      wiperTimer = setInterval(() => Sound.squeak(), 600);
      toast('Swish swish swish! 🌧️');
    }
  }

  function toggleLights() {
    const on = outside.classList.toggle('night');
    outside.classList.toggle('lights-on', on);
    $('#btn-lights').classList.toggle('active', on);
    if (on) { Sound.lightsOn(); toast('Lights on! It is night time 🌙'); }
    else { Sound.lightsOff(); toast('Good morning! ☀️'); }
  }

  function buildSongList() {
    const list = $('#song-list');
    Sound.songs().forEach(song => {
      const b = document.createElement('button');
      b.className = 'song';
      b.dataset.id = song.id;
      b.innerHTML = `${song.emoji}<span>${song.name}</span>`;
      b.addEventListener('click', () => playSong(song.id));
      list.appendChild(b);
    });
  }
  function refreshSongList() {
    const cur = Sound.currentSong();
    $$('.song').forEach(b => b.classList.toggle('playing', b.dataset.id === cur));
    $('#btn-music').classList.toggle('active', !!cur);
  }
  function playSong(id) {
    Sound.melodyStart(id);
    const song = Sound.songs().find(s => s.id === id);
    refreshSongList();
    toast(`🎵 ${song ? song.name : 'Music'}`);
    setTimeout(() => $('#music-sheet').classList.add('hidden'), 180);
  }
  function stopMusic() {
    Sound.melodyStop();
    refreshSongList();
  }
  function openMusic() {
    Sound.tap();
    refreshSongList();
    $('#music-sheet').classList.remove('hidden');
  }
  /** Keyboard / quick toggle: play the first song, or stop. */
  function toggleMusic() {
    if (Sound.isMelodyPlaying()) stopMusic(); else playSong('wheels');
  }

  /* ========================================================================
     OUTSIDE - washing
     ======================================================================== */
  const wash = { on: false, lastSplash: 0, lastBubble: 0, hadDirt: false };
  const sponge = $('#sponge');

  function setWash(on) {
    wash.on = on;
    outside.classList.toggle('washing', on);
    $('#btn-wash').classList.toggle('active', on);
    sponge.classList.toggle('hidden', !on);
    if (on) {
      stopDriving();
      wash.hadDirt = $('#dirt').children.length > 0;
      if (!wash.hadDirt) { addDirt(); addDirt(); addDirt(); wash.hadDirt = true; }
      toast('Rub the bus with the sponge! 🧽');
    }
  }

  /** Pointer position in the bus drawing's own coordinates (viewBox 640 x 340). */
  function svgPoint(clientX, clientY) {
    const lp = toLocal(clientX, clientY);
    const r = localRect(busSvg);
    return { x: (lp.x - r.left) / r.width * 640, y: (lp.y - r.top) / r.height * 340 };
  }

  function washAt(clientX, clientY) {
    const rect = localRect(stage);
    const lp = toLocal(clientX, clientY);
    sponge.style.left = (lp.x - rect.left) + 'px';
    sponge.style.top = (lp.y - rect.top) + 'px';
    const p = svgPoint(clientX, clientY);
    if (facing.left) p.x = 640 - p.x; // dirt lives inside the mirrored group
    const onBus = p.x > 30 && p.x < 610 && p.y > 50 && p.y < 320;
    if (!onBus) return;
    const now = performance.now();
    if (now - wash.lastBubble > 70) {
      wash.lastBubble = now;
      spawnBubble(lp.x - rect.left + (Math.random() - 0.5) * 50, lp.y - rect.top + (Math.random() - 0.5) * 30);
    }
    if (now - wash.lastSplash > 220) { wash.lastSplash = now; Sound.splash(); }
    let removed = false;
    $$('#dirt circle').forEach(c => {
      if (c.classList.contains('gone')) return;
      const dx = +c.getAttribute('cx') - p.x, dy = +c.getAttribute('cy') - p.y;
      if (Math.hypot(dx, dy) < 45) {
        c.classList.add('gone');
        setTimeout(() => c.remove(), 350);
        removed = true;
      }
    });
    if (removed) {
      Sound.pop();
      const left = $$('#dirt circle:not(.gone)').length;
      if (left === 0 && wash.hadDirt) {
        wash.hadDirt = false;
        Sound.sparkle();
        toast('Sparkling clean! ✨');
        for (let i = 0; i < 8; i++) setTimeout(spawnSparkle, i * 120);
      }
    }
  }

  function spawnBubble(x, y) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const s = 16 + Math.random() * 22;
    b.style.width = b.style.height = s + 'px';
    b.style.left = x + 'px'; b.style.top = y + 'px';
    $('#bubbles').appendChild(b);
    setTimeout(() => b.remove(), 1500);
  }
  function spawnSparkle() {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.textContent = '✨';
    s.style.left = (10 + Math.random() * 80) + '%';
    s.style.top = (10 + Math.random() * 70) + '%';
    $('#sparkles').appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }

  /* ========================================================================
     OUTSIDE - bus stop & zebra crossing
     ======================================================================== */
  const crossing = { active: false, queue: [], current: null, pedEl: null, pedOnRoad: false, timer: null };
  const crossingEl = $('#crossing');
  const pedsEl = $('#peds');

  function sceneH() { return localRect(stage).height; }

  function startCrossing() {
    stopDriving();
    if (wash.on) setWash(false);
    crossing.active = true;
    $('#btn-busstop').classList.add('active');
    // Put the crossing just in front of the bus.
    placeCrossing();
    crossingEl.classList.remove('hidden');

    let people = Store.people().filter(p => !Store.seatOf(p.id));
    if (people.length === 0) people = Store.people().slice();
    if (people.length === 0) people = [{ id: 'p-friend', name: 'Friend', emoji: '🙂' }];
    people.sort(() => Math.random() - 0.5);
    crossing.queue = people.slice(0, 5);
    toast('Bus stop! Help people cross the road 🚸');
    nextPed();
  }

  function placeCrossing() {
    const sr = localRect(stage);
    const br = localRect(busWrap);
    const left = facing.left ? br.left - sr.left - 20 - 90 : br.right - sr.left + 20;
    crossingEl.style.left = clamp(left, 0, sr.width - 100) + 'px';
  }

  function nextPed() {
    if (crossing.pedEl) { crossing.pedEl.remove(); crossing.pedEl = null; }
    crossing.current = null;
    crossing.pedOnRoad = false;
    if (!crossing.active) return;
    const person = crossing.queue.shift();
    if (!person) {
      toast('Everyone crossed safely! Ready to go 🎉');
      Sound.cheer();
      return;
    }
    crossing.current = person;
    const el = personEl(person);
    el.classList.add('ped', 'waiting');
    $('.remove', el).remove();
    $('.belt', el).remove();
    const hint = document.createElement('div');
    hint.className = 'pointer-hint';
    hint.textContent = '⬆️';
    el.appendChild(hint);
    const H = sceneH();
    const x = parseFloat(crossingEl.style.left) + 45;
    el.style.left = x + 'px';
    el.style.top = H * 0.96 + 'px';
    pedsEl.appendChild(el);
    crossing.pedEl = el;
    toast(`Help ${person.name || 'your friend'} cross the road! Drag them up ⬆️`);

    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.remove('waiting');
      hint.remove();
      const sr = localRect(stage);
      const move = ev => {
        const y = clamp(toLocal(ev.clientX, ev.clientY).y - sr.top, H * 0.62, H * 0.97);
        el.style.top = y + 'px';
        crossing.pedOnRoad = y > H * 0.66 && y < H * 0.88;
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        const y = parseFloat(el.style.top);
        if (y <= H * 0.67) pedCrossed(el, person);
        else if (crossing.pedOnRoad) toast('Keep going, nearly there! ⬆️');
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  function pedCrossed(el, person) {
    crossing.pedOnRoad = false;
    el.classList.add('crossed');
    el.style.pointerEvents = 'none';
    Sound.cheer();
    toast(`${person.name || 'Your friend'} crossed safely! 👋`);
    clearTimeout(crossing.timer);
    crossing.timer = setTimeout(nextPed, 2000);
  }

  function endCrossing() {
    crossing.active = false;
    crossing.queue = [];
    crossing.pedOnRoad = false;
    clearTimeout(crossing.timer);
    if (crossing.pedEl) { crossing.pedEl.remove(); crossing.pedEl = null; }
    crossingEl.classList.add('hidden');
    $('#btn-busstop').classList.remove('active');
  }

  /* ========================================================================
     OUTSIDE - gestures (swipe to go / stop, wash by rubbing)
     ======================================================================== */
  let lastDragEnd = 0; // so a push that started on the bus does not also honk / open the door
  function recentlyDragged() { return performance.now() - lastDragEnd < 350; }

  function bindOutsideGestures() {
    outside.addEventListener('pointerdown', e => {
      if (e.target.closest('button, .ped, .sheet')) return;
      if (wash.on) {
        e.preventDefault();
        washAt(e.clientX, e.clientY);
        const move = ev => washAt(ev.clientX, ev.clientY);
        const up = () => {
          outside.removeEventListener('pointermove', move);
          outside.removeEventListener('pointerup', up);
          outside.removeEventListener('pointercancel', up);
        };
        outside.addEventListener('pointermove', move);
        outside.addEventListener('pointerup', up);
        outside.addEventListener('pointercancel', up);
        return;
      }
      // Push the bus: it nudges along with the finger, then drives off that way.
      const onBus = !!e.target.closest('#bus-wrap');
      const start = toLocal(e.clientX, e.clientY);
      const sx = start.x, sy = start.y;
      let moved = false;
      const move = ev => {
        const dx = toLocal(ev.clientX, ev.clientY).x - sx;
        if (Math.abs(dx) > 10) moved = true;
        if (onBus && !facing.turning) {
          busTurn.style.transform = `translateX(${clamp(dx * 0.45, -60, 60)}px)`;
        }
      };
      const up = ev => {
        cleanup();
        const lp = toLocal(ev.clientX, ev.clientY);
        const dx = lp.x - sx, dy = lp.y - sy;
        if (onBus && !facing.turning) busTurn.style.transform = '';
        if (moved) lastDragEnd = performance.now();
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          goDirection(dx > 0 ? 'right' : 'left');
        }
      };
      const cancel = () => {
        cleanup();
        if (onBus && !facing.turning) busTurn.style.transform = '';
      };
      const cleanup = () => {
        outside.removeEventListener('pointermove', move);
        outside.removeEventListener('pointerup', up);
        outside.removeEventListener('pointercancel', cancel);
      };
      outside.addEventListener('pointermove', move);
      outside.addEventListener('pointerup', up);
      outside.addEventListener('pointercancel', cancel);
    });
    // Move the sponge around even before pressing (nice on a laptop).
    outside.addEventListener('pointermove', e => {
      if (!wash.on || e.pointerType !== 'mouse' || e.buttons) return;
      const rect = localRect(stage);
      const lp = toLocal(e.clientX, e.clientY);
      sponge.style.left = (lp.x - rect.left) + 'px';
      sponge.style.top = (lp.y - rect.top) + 'px';
    });

    $('#tap-door').addEventListener('click', () => { if (!wash.on && !recentlyDragged()) openDoor(); });
    $('#tap-horn').addEventListener('click', () => { if (!wash.on && !recentlyDragged()) honk(); });
  }

  /* ========================================================================
     wiring
     ======================================================================== */
  function bindButtons() {
    $('#btn-horn').addEventListener('click', honk);
    $('#btn-door').addEventListener('click', openDoor);
    $('#btn-close').addEventListener('click', showOutside);
    $('#btn-go').addEventListener('click', () => { if (drive.on) stopDriving(); else startDriving(); });
    $('#btn-busstop').addEventListener('click', () => {
      Sound.tap();
      if (crossing.active) { endCrossing(); toast('Bus stop finished'); }
      else startCrossing();
    });
    $('#btn-turn').addEventListener('click', () => turnAround());
    $('#btn-wipers').addEventListener('click', toggleWipers);
    $('#btn-lights').addEventListener('click', toggleLights);
    $('#btn-music').addEventListener('click', openMusic);
    $('#btn-music-stop').addEventListener('click', () => { Sound.tap(); stopMusic(); });
    $('#btn-music-done').addEventListener('click', () => { Sound.tap(); $('#music-sheet').classList.add('hidden'); });
    $('#music-sheet').addEventListener('click', e => { if (e.target === e.currentTarget) $('#music-sheet').classList.add('hidden'); });
    $('#btn-wash').addEventListener('click', () => { Sound.tap(); setWash(!wash.on); });
    $('#btn-color').addEventListener('click', () => { Sound.tap(); $('#color-sheet').classList.remove('hidden'); });
    $('#btn-color-done').addEventListener('click', () => { Sound.tap(); $('#color-sheet').classList.add('hidden'); });
    $('#color-sheet').addEventListener('click', e => { if (e.target === e.currentTarget) $('#color-sheet').classList.add('hidden'); });

    // keyboard for laptops
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (!outside.classList.contains('active')) { if (e.key === 'Escape') showOutside(); return; }
      switch (e.key) {
        case 'ArrowRight': goDirection('right'); break;
        case 'ArrowLeft': goDirection('left'); break;
        case ' ': stopDriving(); break;
        case 'h': case 'H': honk(); break;
        case 'w': case 'W': toggleWipers(); break;
        case 'l': case 'L': toggleLights(); break;
        case 'm': case 'M': toggleMusic(); break;
        case 't': case 'T': turnAround(); break;
        case 'Enter': openDoor(); break;
        default: return;
      }
      e.preventDefault();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopDriving(true);
        stopMusic();
      }
    });
    window.addEventListener('resize', () => {
      if (crossing.active) placeCrossing();
    });
  }

  /**
   * Grown-ups only: opening the game with ?export on the end of the address
   * downloads people.json with everyone in it. Put that file in the game
   * folder and every device loads them automatically.
   */
  function maybeExportPeople() {
    if (!/[?&]export\b/.test(location.search)) return;
    const blob = new Blob([Store.exportPeople()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'people.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Saved people.json with everyone in it 📤', 5000);
    history.replaceState(null, '', location.pathname);
  }

  /** people.json in the game folder holds the shared family: everyone gets them on every device. */
  function loadSharedPeople() {
    if (!location.protocol.startsWith('http')) return;
    fetch('people.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return;
        const added = Store.mergePeople(data.people || data, false, data);
        if (added) { renderInside(); renderBusFaces(); }
      })
      .catch(() => { /* no shared file yet, that is fine */ });
  }

  /** Installed on the home screen (any display mode that is not the plain browser). */
  function isInstalled() {
    return !!window.navigator.standalone || !matchMedia('(display-mode: browser)').matches;
  }

  /** Grown-ups: open the game with ?sound or ?debug on the address to see what the phone reports. */
  let badge = null;
  function soundBadge() {
    if (!/[?&](sound|debug)\b/.test(location.search)) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;left:8px;top:8px;z-index:999;background:#000;color:#0f0;font:bold 14px monospace;padding:6px 10px;border-radius:8px;pointer-events:none;';
      app.appendChild(badge);
    }
    const mode = ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find(m => matchMedia(`(display-mode: ${m})`).matches) || '?';
    const r = app.getBoundingClientRect();
    badge.textContent = `audio ${Sound.state()} · ${mode}${window.navigator.standalone ? '+apple' : ''} · inner ${window.innerWidth}x${window.innerHeight} · client ${document.documentElement.clientWidth}x${document.documentElement.clientHeight} · screen ${screen.width}x${screen.height} · app ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} · rot ${app.classList.contains('rotated')} ${app.style.width}x${app.style.height}`;
  }

  function init() {
    Store.load();
    loadSharedPeople();
    maybeExportPeople();
    buildSwatches();
    buildSongList();
    applyColor(Store.state.color);
    buildCabin();
    renderInside();
    renderBusFaces();
    bindButtons();
    bindPersonSheet();
    bindOutsideGestures();
    // Never let the page zoom: block every way in that a page is allowed to block.
    const block = e => { e.preventDefault(); };
    const inCrop = e => !!(e.target && e.target.closest && e.target.closest('#crop'));
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(n => document.addEventListener(n, block, { passive: false }));
    document.addEventListener('touchstart', e => { if (e.touches.length > 1 && !inCrop(e)) e.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', e => { if ((e.touches.length > 1 || (e.scale && e.scale !== 1)) && !inCrop(e)) e.preventDefault(); }, { passive: false });
    let lastTouchEnd = 0;
    document.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - lastTouchEnd < 320 && !e.target.closest('input')) e.preventDefault(); // double-tap zoom
      lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener('dblclick', block, { passive: false });
    document.addEventListener('wheel', e => { if ((e.ctrlKey || e.metaKey) && !inCrop(e)) e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', 'Add', 'Subtract'].includes(e.key)) e.preventDefault();
    });
    // Phones held upright: rotate the whole game so it is always landscape.
    // And if the browser zooms anyway, counter-scale the game to the visible
    // part of the page so zoom is harmless.
    const layoutApp = () => {
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth <= 900;
      app.classList.toggle('rotated', portrait);
      app.style.transformOrigin = '0 0';
      let base = '';
      if (portrait) {
        // Size to the part of the page that is really visible. Phones report
        // several different heights (and iOS home-screen apps clip a strip at
        // the bottom), so find the visible edge by probing with
        // elementFromPoint, which returns nothing outside the viewport.
        const vis = measureVisible();
        const H = vis.h, W = vis.w;
        app.style.width = H + 'px';
        app.style.height = W + 'px';
        base = 'rotate(90deg) translateY(-100%)';
      } else {
        app.style.width = '';
        app.style.height = '';
      }
      const vv = window.visualViewport;
      let zoom = '';
      if (vv && Math.abs(vv.scale - 1) >= 0.005) {
        zoom = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / vv.scale}) `;
      }
      app.style.transform = zoom + base;
      if (crossing.active) placeCrossing();
      soundBadge();
    };
    /** Largest visible width/height by binary-searching elementFromPoint. */
    const measureVisible = () => {
      const guessH = Math.max(window.innerHeight, document.documentElement.clientHeight, screen.height, 100);
      const guessW = Math.max(window.innerWidth, document.documentElement.clientWidth, screen.width, 100);
      const visibleAt = (x, y) => !!document.elementFromPoint(x, y);
      const search = (limit, test) => {
        let lo = 0, hi = limit + 4;
        if (test(limit)) return limit;
        for (let i = 0; i < 16 && hi - lo > 1; i++) {
          const mid = (lo + hi) / 2;
          if (test(mid)) lo = mid; else hi = mid;
        }
        return lo;
      };
      const h = search(guessH, y => visibleAt(2, y)) + 1;
      const w = search(guessW, x => visibleAt(x, 2)) + 1;
      // sanity: fall back to the reported size if probing gave nonsense
      return {
        h: h > 120 ? Math.round(h) : Math.max(window.innerHeight, document.documentElement.clientHeight),
        w: w > 120 ? Math.round(w) : Math.max(window.innerWidth, document.documentElement.clientWidth)
      };
    };
    window.addEventListener('resize', layoutApp);
    window.addEventListener('orientationchange', () => setTimeout(layoutApp, 60));
    window.addEventListener('pageshow', () => setTimeout(layoutApp, 60));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(layoutApp, 60); });
    [150, 500, 1500, 3000].forEach(ms => setTimeout(layoutApp, ms)); // iOS settles late on launch
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', layoutApp);
      window.visualViewport.addEventListener('scroll', layoutApp);
    }
    layoutApp();
    // Unlock audio on real user gestures (iOS wants touchend/click), and keep
    // trying until the context is actually running.
    const unlock = () => { if (!Sound.isRunning()) Sound.unlock(); soundBadge(); };
    ['touchstart', 'touchend', 'click', 'pointerup', 'keydown'].forEach(n => document.addEventListener(n, unlock, { passive: true }));
    // Coming back from the background (home-screen apps especially) can leave audio stuck.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(soundBadge, 100); });
    window.addEventListener('pageshow', () => setTimeout(soundBadge, 100));
    Sound.onState = soundBadge;
    ensureLoop(); // clouds drift even when parked
    setTimeout(() => toast('Push the bus with your finger to drive! 👉🚌', 3500), 1200);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
