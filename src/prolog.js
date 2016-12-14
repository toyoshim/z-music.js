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
var zmusicReady = function (code) {
  audioContext = new AudioContext;
  zmusicBuffer = Module._zmusic_init(audioContext.sampleRate, audioBufferSize);
  scriptProcessor = audioContext.createScriptProcessor(audioBufferSize, 2, 2);
  scriptProcessor.connect(audioContext.destination);
  scriptProcessor.addEventListener('audioprocess', function (e) {
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
  zmusicResolver();
};

var Module = {
  arguments: [
    'ZMUSIC208.X',
    '-T0',    // Allocate 0kB for track buffer.
    '-P0',    // Allocate 0kB for ADPCM data buffer.
    '-W100',  // Allocate 100kB for work area.
  ]
};

window.ZMUSIC = {
  ready: new Promise(function (resolve, reject) {
    zmusicResolver = resolve;
  }),

  setZpd: function (zpd) {
    var u8 = new Uint8Array(zpd);
    for (var i = 0; i < zpd.byteLength; ++i)
      Module.HEAPU8[zmusicBuffer + i] = u8[i];
    Module._zmusic_trap(0x46, 0, 0, 0, 0x100008, null);
    console.info('set_zpd_tbl: done');
  },

  playZmd: function (zmd) {
    var u8 = new Uint8Array(zmd);
    for (var i = 0; i < zmd.byteLength; ++i)
      Module.HEAPU8[zmusicBuffer + 0x080000 + i] = u8[i];
    Module._zmusic_trap(0x11, 0, 0, 0, 0x180007, null);
    console.info('play_cnv_data: done');
  },

  // TODO: playZms

  stop: function () {
    Module._zmusic_trap(0x0a, 0, 0, 0, 0, null);
    console.info('m_stop: done');
    Module._zmusic_trap(0x00, 0, 0, 0, 0, null);
    console.info('m_init: done');
  },
};
