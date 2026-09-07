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
        seat.innerHTML = '<div class="seat-back"></div><div class="seat-base"></div>';
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

  function renderTray() {
    const tray = $('#tray');
    tray.innerHTML = '';
    const people = Store.people().filter(p => !Store.seatOf(p.id));
    if (people.length === 0) {
      const e = document.createElement('div');
      e.className = 'tray-empty';
      e.textContent = Store.people().length === 0 ? 'Nobody here yet' : 'Everyone is aboard 🚌';
      tray.appendChild(e);
      return;
    }
    people.forEach(p => {
      const el = personEl(p);
      makeDraggable(el, { from: 'tray', id: p.id });
      tray.appendChild(el);
    });
  }

  function renderInside() {
    renderSeats();
    renderTray();
  }

  /* ----------------------------------------------------------- dragging */
  const dragLayer = $('#drag-layer');

  function makeDraggable(el, info) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.remove')) return; // delete button handles itself
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let ghost = null;
      let overSeat = null;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      const move = ev => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!ghost) {
          if (Math.hypot(dx, dy) < 10) return;
          ghost = el.cloneNode(true);
          ghost.classList.remove('dragging', 'belted');
          dragLayer.appendChild(ghost);
          el.classList.add('dragging');
          $('#inside').classList.add('drag-active');
        }
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const seat = under && under.closest('.seat');
        if (seat !== overSeat) {
          if (overSeat) overSeat.classList.remove('over');
          overSeat = seat;
          if (overSeat) overSeat.classList.add('over');
        }
      };

      const finish = ev => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', finish);
        el.removeEventListener('pointercancel', cancel);
        $('#inside').classList.remove('drag-active');
        if (!ghost) { onTap(el, info); return; }
        ghost.remove();
        el.classList.remove('dragging');
        if (overSeat) overSeat.classList.remove('over');
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const seat = under && under.closest('.seat');
        if (seat) {
          dropOnSeat(info.id, seat.dataset.seat);
        } else if (info.from === 'seat') {
          Store.unseat(info.id);
          Sound.unbelt();
          toast(`${Store.person(info.id).name || 'Friend'} got off the bus`);
          renderInside();
        }
      };

      const cancel = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', finish);
        el.removeEventListener('pointercancel', cancel);
        $('#inside').classList.remove('drag-active');
        if (ghost) ghost.remove();
        el.classList.remove('dragging');
        if (overSeat) overSeat.classList.remove('over');
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
  let pendingImg = null;

  function openPersonSheet(id) {
    sheetPersonId = id || null;
    pendingImg = null;
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
    $('#person-sheet').classList.add('hidden');
    $('#name-input').blur();
  }

  function bindPersonSheet() {
    $('#btn-add').addEventListener('click', () => { Sound.tap(); openPersonSheet(null); });
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
        pendingImg = await Store.fileToFace(file);
        const preview = $('#preview-face');
        preview.innerHTML = '';
        preview.style.backgroundImage = `url("${pendingImg}")`;
        Sound.pop();
      } catch (err) {
        toast('Sorry, that picture did not work');
      }
    });
    $('#btn-person-cancel').addEventListener('click', () => { Sound.tap(); closePersonSheet(); });
    $('#btn-person-save').addEventListener('click', () => {
      const name = $('#name-input').value.trim().slice(0, 16);
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
    // delete from the edit sheet is not needed: tray ✖ does it.
    $('#person-sheet').addEventListener('click', e => { if (e.target === e.currentTarget) closePersonSheet(); });
  }

  /* ========================================================================
     OUTSIDE - faces in the windows
     ======================================================================== */
  const WINDOW_X = [70, 166, 262, 358];

  function svgFace(person, cx, cy, r, key) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'win-face');
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
      g.appendChild(img);
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
      g.appendChild(t);
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
    for (let r = 1; r <= ROWS; r++) {
      const seated = SEAT_LETTERS.map(l => Store.occupant(`r${r}-${l}`)).filter(Boolean).slice(0, 2);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('clip-path', `url(#clip-win${r})`);
      seated.forEach((pid, i) => {
        const person = Store.person(pid);
        if (!person) return;
        const cx = WINDOW_X[r - 1] + (seated.length === 1 ? 43 : 24 + i * 40);
        g.appendChild(svgFace(person, cx, 150, 19, `w${r}${i}`));
      });
      wins.appendChild(g);
    }
    const drv = $('#driver-face');
    drv.innerHTML = '';
    const driverId = Store.occupant('driver');
    const driver = driverId && Store.person(driverId);
    if (driver) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('clip-path', 'url(#clip-screen)');
      g.appendChild(svgFace(driver, 568, 158, 22, 'drv'));
      drv.appendChild(g);
    }
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
    drive.offset += px;
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

  function toggleMusic() {
    const on = Sound.melodyToggle();
    $('#btn-music').classList.toggle('active', on);
    if (on) toast('🎵 The wheels on the bus go round and round…');
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

  function svgPoint(clientX, clientY) {
    const pt = busSvg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = busSvg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
  }

  function washAt(clientX, clientY) {
    const rect = outside.getBoundingClientRect();
    sponge.style.left = (clientX - rect.left) + 'px';
    sponge.style.top = (clientY - rect.top) + 'px';
    const p = svgPoint(clientX, clientY);
    const onBus = p.x > 30 && p.x < 610 && p.y > 50 && p.y < 320;
    if (!onBus) return;
    const now = performance.now();
    if (now - wash.lastBubble > 70) {
      wash.lastBubble = now;
      spawnBubble(clientX - rect.left + (Math.random() - 0.5) * 50, clientY - rect.top + (Math.random() - 0.5) * 30);
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

  function sceneH() { return outside.getBoundingClientRect().height; }

  function startCrossing() {
    stopDriving();
    if (wash.on) setWash(false);
    crossing.active = true;
    $('#btn-busstop').classList.add('active');
    // Put the crossing just in front of the bus.
    const sr = outside.getBoundingClientRect();
    const br = busWrap.getBoundingClientRect();
    const left = clamp(br.right - sr.left + 20, 0, sr.width - 100);
    crossingEl.style.left = left + 'px';
    crossingEl.classList.remove('hidden');

    let people = Store.people().filter(p => !Store.seatOf(p.id));
    if (people.length === 0) people = Store.people().slice();
    if (people.length === 0) people = [{ id: 'p-friend', name: 'Friend', emoji: '🙂' }];
    people.sort(() => Math.random() - 0.5);
    crossing.queue = people.slice(0, 5);
    toast('Bus stop! Help people cross the road 🚸');
    nextPed();
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
      const sr = outside.getBoundingClientRect();
      const move = ev => {
        const y = clamp(ev.clientY - sr.top, H * 0.62, H * 0.97);
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
      const sx = e.clientX, sy = e.clientY;
      const up = ev => {
        outside.removeEventListener('pointerup', up);
        outside.removeEventListener('pointercancel', cancel);
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx > 0) startDriving(); else stopDriving();
        }
      };
      const cancel = () => {
        outside.removeEventListener('pointerup', up);
        outside.removeEventListener('pointercancel', cancel);
      };
      outside.addEventListener('pointerup', up);
      outside.addEventListener('pointercancel', cancel);
    });
    // Move the sponge around even before pressing (nice on a laptop).
    outside.addEventListener('pointermove', e => {
      if (!wash.on || e.pointerType !== 'mouse' || e.buttons) return;
      const rect = outside.getBoundingClientRect();
      sponge.style.left = (e.clientX - rect.left) + 'px';
      sponge.style.top = (e.clientY - rect.top) + 'px';
    });

    $('#tap-door').addEventListener('click', () => { if (!wash.on) openDoor(); });
    $('#tap-horn').addEventListener('click', () => { if (!wash.on) honk(); });
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
    $('#btn-wipers').addEventListener('click', toggleWipers);
    $('#btn-lights').addEventListener('click', toggleLights);
    $('#btn-music').addEventListener('click', toggleMusic);
    $('#btn-wash').addEventListener('click', () => { Sound.tap(); setWash(!wash.on); });
    $('#btn-color').addEventListener('click', () => { Sound.tap(); $('#color-sheet').classList.remove('hidden'); });
    $('#btn-color-done').addEventListener('click', () => { Sound.tap(); $('#color-sheet').classList.add('hidden'); });
    $('#color-sheet').addEventListener('click', e => { if (e.target === e.currentTarget) $('#color-sheet').classList.add('hidden'); });

    // keyboard for laptops
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (!outside.classList.contains('active')) { if (e.key === 'Escape') showOutside(); return; }
      switch (e.key) {
        case 'ArrowRight': startDriving(); break;
        case 'ArrowLeft': case ' ': stopDriving(); break;
        case 'h': case 'H': honk(); break;
        case 'w': case 'W': toggleWipers(); break;
        case 'l': case 'L': toggleLights(); break;
        case 'm': case 'M': toggleMusic(); break;
        case 'Enter': openDoor(); break;
        default: return;
      }
      e.preventDefault();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopDriving(true);
        if (Sound.isMelodyPlaying()) toggleMusic();
      }
    });
    window.addEventListener('resize', () => {
      if (crossing.active) {
        const sr = outside.getBoundingClientRect();
        const br = busWrap.getBoundingClientRect();
        crossingEl.style.left = clamp(br.right - sr.left + 20, 0, sr.width - 100) + 'px';
      }
    });
  }

  function init() {
    Store.load();
    buildSwatches();
    applyColor(Store.state.color);
    buildCabin();
    renderInside();
    renderBusFaces();
    bindButtons();
    bindPersonSheet();
    bindOutsideGestures();
    // unlock audio on the very first touch/click
    const unlock = () => { Sound.unlock(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    ensureLoop(); // clouds drift even when parked

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
