/* ==========================================================================
   Ember's Bus - storage & photo helpers
   People, seats, belts and bus colour are saved in localStorage so the bus
   is exactly how she left it next time.
   ========================================================================== */
(function () {
  'use strict';

  const KEY = 'embers-bus-v1';
  const FACE_SIZE = 220; // px - small enough to keep many photos in storage

  const BODY_COLORS = ['#ff8a5c', '#5cc8ff', '#ff6fb5', '#8be26b', '#ffd25c', '#b48cff', '#5ce0c8', '#ff5c5c'];

  const DEFAULT_STATE = {
    color: '#ffcc00',
    people: [
      { id: 'p-teddy', name: 'Teddy', emoji: '🧸' },
      { id: 'p-dog', name: 'Dog', emoji: '🐶' },
      { id: 'p-cat', name: 'Cat', emoji: '🐱' }
    ],
    seats: {},   // seatId -> personId
    belts: {}    // seatId -> true
  };

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign({}, DEFAULT_STATE, parsed);
        state.people = parsed.people || [];
        state.seats = parsed.seats || {};
        state.belts = parsed.belts || {};
        return state;
      }
    } catch (e) {
      console.warn('Could not load saved bus', e);
    }
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Could not save bus', e);
      return false;
    }
  }

  function uid() {
    return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function bodyColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return BODY_COLORS[h % BODY_COLORS.length];
  }

  /** Load a chosen photo into an <img>. Caller revokes img.src (an object URL) when done. */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that picture')); };
      img.src = url;
    });
  }

  /**
   * Cut a square (sx, sy, side in image pixels) out of an image and return a
   * small JPEG data URL for the face.
   */
  function cropFace(img, sx, sy, side) {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_SIZE;
    canvas.height = FACE_SIZE;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffe0c2';
    g.fillRect(0, 0, FACE_SIZE, FACE_SIZE);
    g.drawImage(img, sx, sy, side, side, 0, 0, FACE_SIZE, FACE_SIZE);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  window.Store = {
    load, save, uid, bodyColor, loadImage, cropFace,
    get state() { return state; },

    people() { return state.people; },
    person(id) { return state.people.find(p => p.id === id) || null; },

    addPerson(p) {
      state.people.push(p);
      save();
    },
    updatePerson(id, changes) {
      const p = this.person(id);
      if (p) Object.assign(p, changes);
      save();
    },
    removePerson(id) {
      state.people = state.people.filter(p => p.id !== id);
      Object.keys(state.seats).forEach(seat => {
        if (state.seats[seat] === id) { delete state.seats[seat]; delete state.belts[seat]; }
      });
      save();
    },

    seatOf(personId) {
      return Object.keys(state.seats).find(s => state.seats[s] === personId) || null;
    },
    occupant(seatId) { return state.seats[seatId] || null; },

    /** Put a person in a seat; returns the id of anyone who was bumped out. */
    seat(personId, seatId) {
      const bumped = state.seats[seatId] && state.seats[seatId] !== personId ? state.seats[seatId] : null;
      const old = this.seatOf(personId);
      if (old) { delete state.seats[old]; delete state.belts[old]; }
      state.seats[seatId] = personId;
      delete state.belts[seatId];
      save();
      return bumped;
    },
    unseat(personId) {
      const s = this.seatOf(personId);
      if (s) { delete state.seats[s]; delete state.belts[s]; save(); }
    },
    toggleBelt(seatId) {
      if (!state.seats[seatId]) return false;
      if (state.belts[seatId]) delete state.belts[seatId]; else state.belts[seatId] = true;
      save();
      return !!state.belts[seatId];
    },
    isBelted(seatId) { return !!state.belts[seatId]; },

    setColor(c) { state.color = c; save(); }
  };
})();
