// Copyright 2016 Takashi Toyoshima <toyoshim@gmail.com>. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
(function () {

var bPrintBuffer = '';
var bRe = /\x1b\[(m|(\d\d\x6d))/g;
var bEscape = function(s) {
  var code = [];
  s = s.replace(/\ubb9b[^{\udedb]+\udedb\x33\x33\x6d/,
      'Z-mu$iC version 1.10');
  // db8b, dcee, db83, dcf8, 20
  s = s.replace(/\udb17[^\udb8b]+\udb8b\udcee\udb83\udcf8/,
      'Z-mu$iC version 2.08');
  s = s.replace(/\udff6\udfc1/, '-A');
  s = s.replace('PCM8.X (C)H.ETOH', 'X68Sound');
  var rs = s.replace(bRe, '');
  return rs;
};

var bPrint = function(s) {
  bPrintBuffer += s;
  var lines = bPrintBuffer.split('\n');
  for (var i = 0; i < lines.length - 1; ++i) {
    if (lines[i].indexOf('has been released from your system.') >= 0)
      continue;
    console.info(bEscape(lines[i]));
  }
  bPrintBuffer = lines[lines.length - 1];
};

var audioContext = null;
var audioBufferSize = 2048;
var scriptProcessor = null;
var zmusicResolver = null;
var zmusicBuffer = 0;
var zmusicPlaying = false;
var zmusicReady = function (code) {
  if (code != 0) {
    zmusicResolver.reject(code);
    return;
  }
  audioContext = new (window.AudioContext || webkitAudioContext);
  zmusicBuffer = Module._zmusic_init(audioContext.sampleRate, audioBufferSize);
  scriptProcessor = audioContext.createScriptProcessor(audioBufferSize, 2, 2);
  scriptProcessor.connect(audioContext.destination);
  scriptProcessor.addEventListener('audioprocess', function (e) {
    if (!zmusicPlaying)
      return;
    var work = Module._zmusic_update();
    var si = work >> 1;
    var s = Module.HEAP16;
    var l = e.outputBuffer.getChannelData(0);
    var r = e.outputBuffer.getChannelData(1);
    for (var di = 0; di < audioBufferSize; ++di) {
      l[di] = s[si++] / 32768;
      r[di] = s[si++] / 32768;
    }
  }, false);
  window.ZMUSIC.state =
      zmusicPlaying ? window.ZMUSIC.ACTIVE : window.ZMUSIC.WAITING;
  // TODO: Puts iOS workaround here.
  zmusicPlaying = false;
  zmusicResolver.resolve();
};

var Module = {
  // Default arguments.
  arguments: [
    'ZMUSIC208.X',
    '-T0',    // Allocate 0kB for track buffer.
    '-P0',    // Allocate 0kB for ADPCM data buffer.
    '-W100',  // Allocate 100kB for work area.
  ],
  preInit: function() {
    Module.addRunDependency("initialize");
  }
};

window.ZMUSIC = {
  INACTIVE: "inactive",  // not initialized yet
  STARTING: "starting",  // install() is called, and initialing
  WAITING: "waiting",    // started but autostart was false
  ACTIVE: "active",      // started and autostart was true or start() is called,
                         // or stop() is called after plating
  PLAYING: "playing",    // started and play() is called

  state: "inactive",
  version: "0.9.0",

  /**
   * Initializes Z-MUSIC system to accept other requests.
   * @param {Array<string>} args (null: use default arguments)
   * @param {Object} options {
   *     autostart: {boolean} start audio playback immediately (default: true)
   *     buffer: {number} audio playback buffer size in bytes (default: 2048)
   * }
   * @return {Promise}
   */
  install: function (args, options) {
    return new Promise(function(resolve, reject) {
      var opt = options || {};
      zmusicPlaying = opt.autostart || true;
      audioBufferSize = opt.buffer || 2048;
      if (args)
        Module.arguments = args;
      state = window.ZMUSIC.STARTING;
      zmusicResolver = { resolve: resolve, reject: reject };
      Module.removeRunDependency("initialize");
    });
  },

  /**
   * Starts audio loop.
   */
  start: function () {
    if (window.ZMUSIC.state != window.ZMUSIC.WAITING)
      return;
    window.ZMUSIC.state = window.ZMUSIC.ACTIVE;
    // TODO: Puts iOS workaround here.
  },

  /**
   * Plays ZMD data with ZPD. If ZPD isn't specified, previous data will be
   * reused.
   * @param {ArrayBuffer} zmd ZMD data
   * @param {ArrayBuffer} zpd ZPD data (optional)
   */
  play: function (zmd, zpd) {
    if (zmusicPlaying)
      window.ZMUSIC.stop();
    window.ZMUSIC.state = window.ZMUSIC.PLAYING;

    if (zpd) {
      var p8 = new Uint8Array(zpd);
      for (var i = 0; i < zpd.byteLength; ++i)
        Module.HEAPU8[zmusicBuffer + i] = p8[i];
      Module._zmusic_trap(0x46, 0, 0, 0, 0x100008, null);
    }

    var m8 = new Uint8Array(zmd);
    for (var i = 0; i < zmd.byteLength; ++i)
      Module.HEAPU8[zmusicBuffer + 0x080000 + i] = m8[i];
    Module._zmusic_trap(0x11, 0, 0, 0, 0x180007, null);
    zmusicPlaying = true;
  },

  /**
   * Stops ZMD playback.
   */
  stop: function () {
    if (!zmusicPlaying)
      return;
    window.ZMUSIC.state = window.ZMUSIC.ACTIVE;

    Module._zmusic_trap(0x0a, 0, 0, 0, 0, null);
    zmusicPlaying = false;
  }

  // TODO: ZMS and fade-in/out support
};
