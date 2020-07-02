// Copyright 2016 Takashi Toyoshima <toyoshim@gmail.com>. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
(function () {

var bPrintBuffer = '';
var bEscape = function (s) {
  // Replace custom characters for "Z-mu$iC"
  s = s.replace(/\xeb\xee/, 'Z');
  s = s.replace(/\xeb\xef\xeb\xf0/, 'mu');
  s = s.replace(/\xeb\xf1/, '$');
  s = s.replace(/\xeb\xf2\xeb\xf3/, 'iC ');

  // Strip unsupported escape sequences.
  s = s.replace(/\xf3/g, '');
  s = s.replace(/\x1b\[m/g, '');

  // Replace X68k specific Japanese characters.
  s = s.replace(/\xa5/g, '\u2022');
  return s;
};

var bPrint = function (s) {
  bPrintBuffer += s;
  var lines = bPrintBuffer.split('\n');
  for (var i = 0; i < lines.length - 1; ++i) {
    if (lines[i].indexOf('has been released from your system.') >= 0)
      continue;
    console.info(bEscape(lines[i]));
  }
  bPrintBuffer = lines[lines.length - 1];
};

var fdBase = 1024;
var files = [];
var fileOpenCallback = null;

var fileSet = function (data) {
  var fd;
  for (fd = 0; fd < files.length; ++fd) {
    if (!files[fd].opened)
      break;
  }
  if (files.length == fd)
    files.push({ offset: 0, buffer: null, opened: false });
  files[fd].offset = 0;
  files[fd].buffer = new Uint8Array(data);
  files[fd].opened = true;
  return fd + fdBase;
}

var fileOpen = function (filename) {
  if (fileOpenCallback) {
    fileOpenCallback(filename).then(data => Module._async_done(fileSet(data)));
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', filename, true);
  xhr.responseType = 'arraybuffer';
  xhr.addEventListener('load', e => {
    var result = -1;
    if (xhr.status == 200)
      result = fileSet(xhr.response);
    xhr.abort();
    Module._async_done(result);
  }, false);
  xhr.send();
};

var fileSeek = function (fileno, offset, mode) {
  var fd = fileno - fdBase;
  if (fd < 0 || !files[fd] || !files[fd].opened)
    return -1;
  if (0 == mode)
    files[fd].offset = offset;
  else if (1 == mode)
    files[fd].offset += offset;
  else if (2 == mode)
    files[fd].offset = files[fd].buffer.byteLength + offset;
  else
    return -1;
  return files[fd].offset;
};

var fileRead = function (fileno, bufferAdr, len) {
  var fd = fileno - fdBase;
  if (fd < 0 || !files[fd] || !files[fd].opened)
    return -1;
  for (var i = 0; i < len; ++i) {
    Module.HEAPU8[bufferAdr + i] = files[fd].buffer[files[fd].offset];
    if (files[fd].offset + 1 == files[fd].buffer.byteLength)
      return i + 1;
    files[fd].offset++;
  }
  return len;
};

var fileClose = function (fileno) {
  var fd = fileno - fdBase;
  if (fd < 0 || !files[fd] || !files[fd].opened)
    return -1;
  files[fd].offset = 0;
  files[fd].buffer = null;
  files[fd].opened = false;
  return 0;
};

var resolver = null;
var resolve = function (result) {
  if (!resolver) {
    console.error('resolve was called, but there is no pending Promise. (code: '
        + result + ')');
    return;
  }
  var resolve = resolver;
  resolver = null;
  resolve(result);
}

var midiAccess = null;
var midiData = [];
var midiRunningStatus = 0;
var midiLengthTable = [
// 8x 9x ax bx cx dx ex fx
    3, 3, 3, 3, 2, 2, 3, 0  // ex should be 3
];
var midiFxLengthTable = [
// f0 f1 f2 f3 f4 f5 f6 f7 f8 f9 fa fb fc fd fe ff
    0, 2, 3, 2, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1
];

var midiSend = function (data) {
  for (var pair of midiAccess.outputs) {
    var port = pair[1];
    port.send(data);
  }
};

var midiOut = function (d) {
  if (!midiAccess)
    return;
  // Parse MIDI sequence.
  if (midiData.length == 0) {
    if ((d & 0x80) == 0) {
      // Running status.
      midiData.push(midiRunningStatus);
    }
    midiData.push(d);
  } else {
    if ((d & 0x80) != 0) {
      if ((midiData[0] & 0xf0) == 0xe0) {
        // Workaround for Z-MUSIC Pitch bend bug.
        d &= 0x7f;
      } else if (d >= 0xf8) {
        // Realtime message.
        midiSend([d]);
        return;
      } else if (d == 0xf7 && midiData[0] == 0xf0) {
        // Permits SysEx => EndOfEx
      } else {
        console.warn('Invalid MIDI sequence: $' + d.toString(16) + ' follows' +
            ' $' + midiData[0].toString(16) + ' (length = ' + midiData.length +
            ') ; reset');
        midiData = [];
      }
    }
    midiData.push(d);
  }
  var status = midiData[0];
  var length = 0;
  if (status == 0xf0) {  // SysEx
    if (midiData[midiData.length - 1] == 0xf7) {
      if (midiAccess.sysexEnabled)
        midiSend(midiData);
      midiData = [];
    }
  } else if (status > 0xf0) {  // System messages
    length = midiFxLengthTable[status & 0x0f];
    console.assert(length != 0, 'ERROR: midiFxLengthTable returns 0');
    if (midiData.length == length) {
      midiSend(midiData);
      midiData = [];
    }
  } else {
    length = midiLengthTable[(status >> 4) - 8];
    console.assert(length != 0, 'ERROR: midiLengthTable returns 0');
    if (midiData.length == length) {
      midiRunningStatus = status;
      midiSend(midiData);
      midiData = [];
    }
  }
};

var audioContext = null;
var audioBufferSize = 2048;
var scriptProcessor = null;
var bufferSource = null;
var zmusicResolver = null;
var zmusicBuffer = 0;
var zmusicBufferStart = 0x100000;
var zmusicBufferSize = 0x100000;
var zmusicBufferEnd = zmusicBufferStart + zmusicBufferSize - 1;
var zmusicPrerenderBuffer = [
    new Float32Array(audioBufferSize), new Float32Array(audioBufferSize)];
var zmusicPrerenderBufferReady = false;
var zmusicPlaying = false;
var zmusicPrerender = function () {
  if (zmusicPrerenderBufferReady)
    return;

  var work = Module._zmusic_update();
  var si = work >> 1;
  var s = Module.HEAP16;
  var l = zmusicPrerenderBuffer[0];
  var r = zmusicPrerenderBuffer[1];
  for (var di = 0; di < audioBufferSize; ++di) {
    l[di] = s[si++] / 32768;
    r[di] = s[si++] / 32768;
  }

  zmusicPrerenderBufferReady = true;
};

var zmusicReady = function (code) {
  if (code != 0) {
    zmusicResolver.reject(code);
    return;
  }
  if (!audioContext)
    audioContext = new (window.AudioContext || webkitAudioContext);
  zmusicBuffer = Module._zmusic_init(audioContext.sampleRate, audioBufferSize);
  scriptProcessor = audioContext.createScriptProcessor(audioBufferSize, 2, 2);
  scriptProcessor.connect(audioContext.destination);
  scriptProcessor.addEventListener('audioprocess', function (e) {
    if (!zmusicPlaying)
      return;
    if (!zmusicPrerenderBufferReady)
      zmusicPrerender();

    var sl = zmusicPrerenderBuffer[0];
    var sr = zmusicPrerenderBuffer[1];
    var dl = e.outputBuffer.getChannelData(0);
    var dr = e.outputBuffer.getChannelData(1);
    for (var i = 0; i < audioBufferSize; ++i) {
      dl[i] = sl[i];
      dr[i] = sr[i];
    }

    zmusicPrerenderBufferReady = false;
    setTimeout(zmusicPrerender, 0);
  }, false);
  ZMUSIC.state = zmusicPlaying ? ZMUSIC.ACTIVE : ZMUSIC.WAITING;
  if (!window.AudioContext) {
    // Safari still privides old API.
    bufferSource = audioContext.createBufferSource();
    bufferSource.connect(scriptProcessor);
    if (zmusicPlaying)
      bufferSource.noteOn(0);
  }
  zmusicPlaying = false;
  zmusicResolver.resolve();
};

var Module = {
  // Default arguments.
  arguments: [
    'ZMUSIC208.X',
    '-T100',  // Allocate 100kB for track buffer.
    '-P400',  // Allocate 400kB for ADPCM data buffer.
    '-W100',  // Allocate 100kB for work area.
  ],
  preInit: function () {
    Module.addRunDependency("initialize");
  },
  // Dirty hacks to replace previously evaluated Module.arguments during
  // Module.run().
  onRuntimeInitialized: function () {
    // Resets |calledRun| as this was already set in doRun().
    calledRun = false;
    // Resets this function so that this should not be called recursively during
    // the following run().
    Module.onRuntimeInitialized = null;
    // Calls run() again, but with the revised arguments.
    run(Module.arguments);
    // Restores the original |shouldRunNow| so that doRun() does not call main()
    // again with the original arguments after this function finishes.
    // |calledRun| should be already restored during the run() call above.
    shouldRunNow = false;
  }
};

ZMUSIC = {
  INACTIVE: "inactive",  // not initialized yet
  STARTING: "starting",  // install() is called, and initialing
  WAITING: "waiting",    // started but autostart was false
  ACTIVE: "active",      // started and autostart was true or play() is called,
                         // or stop() is called after plating
  PLAYING: "playing",    // started and play() is called

  state: "inactive",
  version: "1.3.0.0",

  /**
   * Initializes Z-MUSIC system to accept other requests.
   * @param {Array<string>} args (null: use default arguments)
   * @param {Object} options {
   *     autostart: {boolean} start audio playback immediately (default: true)
   *     buffer: {number} audio playback buffer size in bytes (default: 2048)
   *     context: {AudioContext} AudioContext instance (default: create new)
   * }
   * @return {Promise}
   */
  install: function (args, options) {
    return new Promise(function (resolve, reject) {
      var opt = options || {};
      var isMobileSafari = navigator.userAgent.indexOf('iPhone') >= 0;
      zmusicPlaying = opt.autostart || !isMobileSafari;
      audioBufferSize = opt.buffer || 2048;
      audioContext = opt.context;
      if (opt.midi !== false && navigator.requestMIDIAccess) {
        navigator.permissions.query({ name: "midi", sysex: true }).then(p => {
          var sysex = p.state != "denied";
          navigator.requestMIDIAccess({ sysex: sysex }).then(a => {
            midiAccess = a;
          });
        });
      }
      if (args)
        Module.arguments = args;
      state = ZMUSIC.STARTING;
      zmusicResolver = { resolve: resolve, reject: reject };
      Module.removeRunDependency("initialize");
    });
  },

  /**
   * Resumes AudioContext if it is not running, or suspended. Should be called
   * from an event handler for user initiated inteactions.
   */
  resume: function () {
    if (audioContext)
      audioContext.resume();
  },

  /**
   * Plays ZMD data with ZPD. If ZPD isn't specified, previous data will be
   * reused.
   * @param {ArrayBuffer} zmd ZMD data
   * @param {ArrayBuffer} zpd ZPD data (optional)
   * @return {Promise<number>} promise
   */
  play: function (zmd, zpd) {
    if (resolver)
      return null;

    return new Promise(function (success, error) {
      if (zmusicPlaying)
        ZMUSIC.stop();
      if (ZMUSIC.state == ZMUSIC.WAITING && !window.AudioContext)
        bufferSource.noteOn(0);
      ZMUSIC.state = ZMUSIC.PLAYING;

      var zpdPromise = null;
      if (zpd) {
        zpdPromise = new Promise(function (success, error) {
          fileOpenCallback = function (filename) {
            return new Promise(function (success, error) { success(zpd); });
          }
          resolver = () => success();
          var name = new Uint8Array([0x40, 0x00]).buffer;
          ZMUSIC.trap(0x39, 0, 0, 0, zmusicBufferEnd - 2, name, 0, 2);
        });
      } else {
        zpdPromise = new Promise(function (success, error) { success(); });
      }

      zpdPromise.then(() => {
        if (zmd) {
          resolver = function (code) {
            if (code) {
              error(code);
            } else {
              zmusicPlaying = true;
              success(0);
            }
          };
          var result = ZMUSIC.trap(0x11, 0, 0, 0, zmusicBufferStart + 1, zmd, 7,
              zmd.byteLength - 7);
          if (result != -2)
            resolve(result);
        } else {
          success(0);
        }
      });
    });
  },

  /**
   * Stops ZMD playback.
   */
  stop: function () {
    if (!zmusicPlaying)
      return;
    ZMUSIC.state = ZMUSIC.ACTIVE;

    ZMUSIC.trap(0x0a, 0, 0, 0, 0, null);
    zmusicPlaying = false;
  },

  /**
   * Plays ZMS data after compiling it.
   * @param {ArrayBuffer} data to write
   * @return {Promise<number>} promise
   */
  compileAndPlay: function (data) {
    if (resolver)
      return;

    return new Promise(function (success, error) {
      if (zmusicPlaying)
        ZMUSIC.stop();
      if (ZMUSIC.state == ZMUSIC.WAITING && !window.AudioContext)
        bufferSource.noteOn(0);
      ZMUSIC.state = ZMUSIC.PLAYING;

      var d8 = new Uint8Array(data);
      for (var i = 0; i < data.byteLength; ++i)
        Module.HEAPU8[zmusicBuffer + i] = d8[i];
      resolver = code => {
        if (code == 0) {
          ZMUSIC.trap(0x08, 0, 0, 0, 0, null);
          zmusicPlaying = true;
          success(0);
        } else {
          error(code);
        }
      };
      var result = Module._zmusic_copy(data.byteLength);
      if (result != -2)
        resolve(result);
    });
  },

  /**
   * Connects audio output node to |node| instead of default destination.
   * @param {AudioNode} node AudioNode to connect for outputs
   */
  connect: function (node) {
    scriptProcessor.connect(node);
  },

  /**
   * Disconnects audio output node.
   * @param {AudioNode} node AudioNode to disconnect if specified (optional)
   */
  disconnect: function (node) {
    scriptProcessor.disconnect(node);
  },

  /**
   * Emulates trap #3 with specified register values set.
   * @param d1 {number} d1 register value
   * @param d2 {number} d2 register value
   * @param d3 {number} d3 register value
   * @param d4 {number} d4 register value
   * @param a1 {number} a1 register value, could be [0x100000:0x1FFFFF]
   * @param data {ArrayBuffer} data that should be stored at a1 address
   * @param offset {number} offset of data (default: 0)
   * @param length {number} length of data from offset (default: data.length)
   */
  trap: function (d1, d2, d3, d4, a1, data, offset, length) {
    if (a1 && zmusicBufferStart <= a1 && a1 <= zmusicBufferEnd && data) {
      if (!offset)
        offset= 0;
      if (!length)
        length = data.byteLength;
      var d8 = new Uint8Array(data);
      for (var i = 0; i < length; ++i) {
        Module.HEAPU8[zmusicBuffer + a1 - zmusicBufferStart + i] =
            d8[offset + i];
      }
    }
    return Module._zmusic_trap(d1, d2, d3, d4, a1);
  }
};

/* Unexpected token here should be resolved by epilog.js */