/* ==========================================================================
   Ember's Bus - sounds
   Everything is synthesised with the Web Audio API, so there are no sound
   files to download and it works offline.
   ========================================================================== */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let noise = null;          // shared white-noise buffer
  let engine = null;         // { osc, osc2, gain, filter }
  let melodyTimer = null;
  let melodyNodes = [];
  let melodyPlaying = false;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer() {
    if (noise) return noise;
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  function env(gainNode, t, attack, peak, decay, sustain) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + attack + decay);
  }

  function tone(freq, type, start, dur, peak, opts) {
    opts = opts || {};
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, start + dur);
    let dest = master;
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lowpass;
      f.connect(master);
      dest = f;
    }
    osc.connect(g);
    g.connect(dest);
    env(g, start, opts.attack || 0.01, peak, dur, 0.0001);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    return osc;
  }

  function noiseBurst(start, dur, peak, filterType, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.value = freq || 1000;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(master);
    env(g, start, 0.01, peak, dur, 0.0001);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  const Sound = {
    /** Call on the first user gesture so iOS lets us make noise. */
    unlock() { ensure(); },

    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.9;
    },
    isMuted() { return muted; },

    horn() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      // beep beep!
      [0, 0.32].forEach(d => {
        tone(311, 'sawtooth', t + d, 0.22, 0.34, { lowpass: 1000, attack: 0.02 });
        tone(392, 'sawtooth', t + d, 0.22, 0.3, { lowpass: 1000, attack: 0.02 });
        tone(156, 'square', t + d, 0.22, 0.14, { lowpass: 600, attack: 0.02 });
      });
    },

    doorHiss() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noiseBurst(t, 0.55, 0.25, 'bandpass', 2400, 0.8);
      tone(180, 'triangle', t + 0.45, 0.12, 0.15);
    },

    beltClick() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noiseBurst(t, 0.05, 0.4, 'highpass', 3000, 1);
      tone(1400, 'square', t + 0.02, 0.06, 0.12);
      tone(900, 'square', t + 0.08, 0.05, 0.1);
    },

    unbelt() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(700, 'square', t, 0.06, 0.1);
      noiseBurst(t + 0.05, 0.2, 0.15, 'bandpass', 1800, 1);
    },

    tap() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(660, 'sine', t, 0.08, 0.18);
    },

    pop() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(500 + Math.random() * 400, 'sine', t, 0.1, 0.18, { glideTo: 1200 });
    },

    splash() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noiseBurst(t, 0.25, 0.18, 'bandpass', 1200 + Math.random() * 800, 0.6);
    },

    squeak() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(420, 'sine', t, 0.25, 0.07, { glideTo: 640, attack: 0.05 });
    },

    brake() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(900, 'sawtooth', t, 0.5, 0.06, { glideTo: 500, lowpass: 2000, attack: 0.05 });
      noiseBurst(t, 0.5, 0.1, 'bandpass', 3000, 2);
    },

    whoosh() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noiseBurst(t, 0.7, 0.2, 'bandpass', 600, 0.7);
      tone(200, 'sine', t, 0.7, 0.08, { glideTo: 90, attack: 0.1 });
    },

    lightsOn() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(880, 'sine', t, 0.12, 0.15);
      tone(1320, 'sine', t + 0.1, 0.18, 0.15);
    },
    lightsOff() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(1320, 'sine', t, 0.12, 0.15);
      tone(880, 'sine', t + 0.1, 0.18, 0.15);
    },

    cheer() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', t + i * 0.1, 0.35, 0.2));
      noiseBurst(t + 0.3, 0.5, 0.06, 'highpass', 4000, 1);
    },

    sparkle() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [1568, 1975, 2349, 3136].forEach((f, i) => tone(f, 'sine', t + i * 0.07, 0.3, 0.12));
    },

    /* --- engine ---------------------------------------------------- */
    engineStart() {
      if (!ensure() || engine) return;
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      osc.frequency.value = 55;
      osc2.frequency.value = 27.5;
      f.type = 'lowpass';
      f.frequency.value = 220;
      osc.connect(f);
      osc2.connect(f);
      f.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.6);
      osc.start();
      osc2.start();
      engine = { osc, osc2, gain: g, filter: f };
    },
    engineSpeed(speed) {
      if (!engine) return;
      const t = ctx.currentTime;
      engine.osc.frequency.setTargetAtTime(55 + speed * 45, t, 0.2);
      engine.osc2.frequency.setTargetAtTime(27.5 + speed * 22, t, 0.2);
      engine.filter.frequency.setTargetAtTime(220 + speed * 260, t, 0.2);
    },
    engineStop() {
      if (!engine) return;
      const e = engine;
      engine = null;
      const t = ctx.currentTime;
      e.gain.gain.cancelScheduledValues(t);
      e.gain.gain.setValueAtTime(e.gain.gain.value, t);
      e.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      e.osc.stop(t + 0.7);
      e.osc2.stop(t + 0.7);
    },

    /* --- music: a choice of songs with a drum beat and bass ------------- */
    songs() { return SONGS.map(s => ({ id: s.id, name: s.name, emoji: s.emoji })); },
    currentSong() { return melodyPlaying ? currentSong.id : null; },
    isMelodyPlaying() { return melodyPlaying; },

    /** Start a song by id (restarts if already playing something). */
    melodyStart(id) {
      if (!ensure()) return;
      Sound.melodyStop();
      currentSong = SONGS.find(s => s.id === id) || SONGS[0];
      melodyPlaying = true;
      scheduleMelody();
    },
    melodyStop() {
      melodyPlaying = false;
      if (melodyTimer) { clearTimeout(melodyTimer); melodyTimer = null; }
      const t = ctx ? ctx.currentTime : 0;
      melodyNodes.forEach(n => { try { n.stop(t + 0.05); } catch (e) { /* already stopped */ } });
      melodyNodes = [];
    }
  };

  // note name -> frequency
  const NOTE = {
    G3: 196.00, A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25
  };

  // Each song: notes as [note, beats], beat length in seconds, and a bass root note.
  const WHEELS_A = [['G3', 0.5], ['C4', 1], ['C4', 0.5], ['C4', 0.5], ['C4', 1], ['E4', 1], ['G4', 1], ['E4', 0.5], ['C4', 1.5]];
  const WHEELS_B = [['D4', 1], ['B3', 1], ['G3', 2]];
  const WHEELS_C = [['D4', 1], ['G3', 1], ['B3', 1], ['C4', 2]];
  const TWINKLE_A = [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]];
  const TWINKLE_B = [['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2]];
  const MAC_A = [['G4', 1], ['G4', 1], ['G4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['D4', 2], ['B4', 1], ['B4', 1], ['A4', 1], ['A4', 1], ['G4', 2]];
  const MAC_B = [['D4', 1], ['G4', 1], ['G4', 1], ['G4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['D4', 2], ['B4', 1], ['B4', 1], ['A4', 1], ['A4', 1], ['G4', 2]];
  const BRIDGE_A = [['G4', 1.5], ['A4', 0.5], ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 2]];
  const BRIDGE_B = [['D4', 1], ['E4', 1], ['F4', 2], ['E4', 1], ['F4', 1], ['G4', 2]];
  const BRIDGE_C = [['D4', 2], ['G4', 1], ['E4', 1], ['C4', 2]];

  const SONGS = [
    { id: 'wheels', name: 'The Wheels on the Bus', emoji: '🚌', beat: 0.4, bass: 'C4',
      notes: [].concat(WHEELS_A, WHEELS_B, WHEELS_B, WHEELS_A, WHEELS_C) },
    { id: 'twinkle', name: 'Twinkle Twinkle', emoji: '⭐', beat: 0.42, bass: 'C4',
      notes: [].concat(TWINKLE_A, TWINKLE_B, TWINKLE_B, TWINKLE_A) },
    { id: 'macdonald', name: 'Old MacDonald', emoji: '🐮', beat: 0.38, bass: 'G3',
      notes: [].concat(MAC_A, MAC_B) },
    { id: 'bridge', name: 'London Bridge', emoji: '🌉', beat: 0.4, bass: 'C4',
      notes: [].concat(BRIDGE_A, BRIDGE_B, BRIDGE_A, BRIDGE_C) }
  ];
  let currentSong = SONGS[0];

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.3);
    melodyNodes.push(o);
  }
  function snare(t) {
    noiseBurst(t, 0.16, 0.5, 'bandpass', 1800, 0.8);
    const o = tone(190, 'triangle', t, 0.12, 0.3);
    melodyNodes.push(o);
  }
  function hihat(t, accent) {
    noiseBurst(t, accent ? 0.07 : 0.04, accent ? 0.22 : 0.14, 'highpass', 7000, 1);
  }

  function scheduleMelody() {
    if (!melodyPlaying) return;
    const song = currentSong;
    const BEAT = song.beat;
    const start = ctx.currentTime + 0.05;
    let t = start;
    melodyNodes = [];
    // lead + a soft octave-down layer
    song.notes.forEach(([n, beats]) => {
      const dur = beats * BEAT;
      melodyNodes.push(tone(NOTE[n], 'sawtooth', t, dur * 0.85, 0.42, { attack: 0.02, lowpass: 2200 }));
      melodyNodes.push(tone(NOTE[n], 'triangle', t, dur * 0.85, 0.3, { attack: 0.02 }));
      t += dur;
    });
    // drums and bass for the whole length, 4 beats to the bar
    const totalBeats = song.notes.reduce((a, [, b]) => a + b, 0);
    const bars = Math.ceil(totalBeats / 4);
    const bassFreq = NOTE[song.bass] / 2;
    for (let b = 0; b < bars * 4; b++) {
      const bt = start + b * BEAT;
      if (bt >= t) break;
      if (b % 2 === 0) kick(bt); else snare(bt);
      hihat(bt, true);
      hihat(bt + BEAT / 2, false);
      // bouncy bass: root, fifth
      const f = (b % 4 === 2) ? bassFreq * 1.5 : bassFreq;
      melodyNodes.push(tone(f, 'square', bt, BEAT * 0.45, 0.28, { attack: 0.01, lowpass: 500 }));
    }
    const total = (t - start) * 1000;
    melodyTimer = setTimeout(scheduleMelody, total + 300);
  }

  window.Sound = Sound;
})();
