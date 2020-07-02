// Copyright 2016 Takashi Toyoshima <toyoshim@gmail.com>. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

mergeInto(LibraryManager.library, {
  jsrt_dos_keepr: function(code) {
    zmusicReady(code);
  },
  jsrt_dos_open: function(filename_adr) {
    fileOpen(AsciiToString(filename_adr));
  },
  jsrt_dos_seek: function(fileno, offset, mode) {
    return fileSeek(fileno, offset, mode);
  },
  jsrt_dos_read: function(fileno, buffer_adr, len) {
    return fileRead(fileno, buffer_adr, len);
  },
  jsrt_dos_close: function(fileno) {
    return fileClose(fileno);
  },
  jsrt_iocs_b_print: function(s) {
    bPrint(AsciiToString(s));
  },
  jsrt_resolve: function(result) {
    resolve(result);
  },
  jsrt_midi_out: function(data) {
    midiOut(data);
  },
  magic2_call: function(cmd_adr) {
    console.error("magic2_call: should not be called.");
    return -1;
  },
  zmusic_call: function() {
    console.error("zmusic_call: should not be called.");
    return -1;
  }
});
