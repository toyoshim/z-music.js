// Copyright 2016 Takashi Toyoshima <toyoshim@gmail.com>. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
extern "C" {
#include "run68.h"

ULong zmusic_trap3 = 0;
ULong zmusic_timer = 0;
ULong zmusic_driver = 0xFFFFFFFF;
char* zmusic_work = NULL;

}

#include "x68sound.h"

#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

namespace {

short* opm_buffer = NULL;
int opm_count = 0;
struct {
  UChar reg;
  UChar val;
} preset[1024];
int presets = 0;

// TODO: Wire X68Sound_OpmPeek
void zmusic_timerb() {
  // Virtual stack to return 0.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  ra[7] -= 2;
  mem_set(ra[7], sr, S_WORD);
  pc = zmusic_timer;
  SR_S_ON();
  while (pc && FALSE == prog_exec());
}

}  // namespace

extern "C" char* zmusic_init(int rate, int count) {
  X68Sound_StartPcm(rate);
  zmusic_work = (char*)malloc(0x100000);
  opm_count = count;
  opm_buffer = (short*)malloc(count * 2 * 2);
  for (int i = 0; i < presets; ++i) {
    X68Sound_OpmReg(preset[i].reg);
    X68Sound_OpmPoke(preset[i].val);
  }
  X68Sound_OpmInt(zmusic_timerb);
  return zmusic_work;
}

extern "C" void zmusic_set_reg(UChar reg) {
  if (opm_buffer == NULL) {
    if (presets == 1024) {
      printf("presets overflow\n");
      return;
    }
    preset[presets].reg = reg;
  } else {
    X68Sound_OpmReg(reg);
  }
}

extern "C" void zmusic_set_val(UChar val) {
  if (opm_buffer == NULL) {
    if (presets == 1024) {
      printf("presets overflow\n");
      return;
    }
    preset[presets].val = val;
    presets++;
    if (presets != 1024)
      preset[presets].reg = preset[presets - 1].reg;
  } else {
    X68Sound_OpmPoke(val);
  }
}

extern "C" short* zmusic_update() {
  X68Sound_GetPcm(opm_buffer, opm_count);
  return opm_buffer;
}

extern "C" void zmusic_trap(
    ULong d1, ULong d2, ULong d3, ULong d4, ULong a1, const char* data) {
  //printf("ZMUSIC ENTER: d1=$%08x, d2=$%08x, d3=$%08x, d4=$%08x, a1=$%08x(%s)\n",
  //    d1, d2, d3, d4, a1, data);
  // Destroy them all.
  rd[1] = d1;
  rd[2] = d2;
  rd[3] = d3;
  rd[4] = d4;
  ra[1] = a1;

  // Virtual stack to return 0.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  ra[7] -= 2;
  mem_set(ra[7], sr, S_WORD);
  pc = zmusic_trap3;
  SR_S_ON();
  while (pc && FALSE == prog_exec());
  //printf("ZMUSIC LEAVE => $%08x\n", rd[0]);
}

extern "C" void zmusic_copy(ULong size) {
  if (prog_ptr[zmusic_driver + 14] != 'O' ||
      prog_ptr[zmusic_driver + 15] != 'P' ||
      prog_ptr[zmusic_driver + 16] != 'M' ||
      prog_ptr[zmusic_driver + 17] != ' ') {
    printf("OPM dirver not found\n");
  }
  ULong strategy = mem_get(zmusic_driver + 6, S_LONG);
  ULong interrupt = mem_get(zmusic_driver + 10, S_LONG);

  // Setup the request.
  ra[5] = 0x200000 - size - 22;
  mem_set(ra[5] + 0, 26, S_BYTE);
  mem_set(ra[5] + 2, 8, S_BYTE);
  mem_set(ra[5] + 14, ra[5] + 22, S_LONG);
  mem_set(ra[5] + 18, size, S_LONG);

  // Stores a request of A5 by calling strategy entry.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  pc = strategy;
  while (pc && FALSE == prog_exec());
  

  // Calls interrupt entry that serves a queued reuqest.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  pc = interrupt;
  SR_S_ON();
  while (pc && FALSE == prog_exec());

  UChar errorLow = zmusic_work[0x100000 - size - 22 + 3];
  UChar errorHigh = zmusic_work[0x100000 - size - 22 + 4];
  if (errorLow != 0 || errorHigh != 0) {
    printf("COPY to OPM ERROR: $%02x%02x\n", errorHigh, errorLow);
    return;
  }

  // Send EOF. 
  ra[5] = 0x200000 - 22;
  mem_set(ra[5] + 0, 26, S_BYTE);
  mem_set(ra[5] + 2, 8, S_BYTE);
  mem_set(ra[5] + 14, 0, S_LONG);
  mem_set(ra[5] + 18, 0, S_LONG);
  
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  pc = strategy;
  while (pc && FALSE == prog_exec());

  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  pc = interrupt;
  SR_S_ON();
  while (pc && FALSE == prog_exec());
  
  errorLow = zmusic_work[0x100000 - size - 22 + 3];
  errorHigh = zmusic_work[0x100000 - size - 22 + 4];
  if (errorLow != 0 || errorHigh != 0)
    printf("COPY to OPM ERROR: $%02x%02x\n", errorHigh, errorLow);
}

extern "C" int pcm8_call() {
  switch (rd[0] & 0xffff) {
    case 0x000:  // Normal play at ch.0
    case 0x001:  // Normal play at ch.1
    case 0x002:  // Normal play at ch.2
    case 0x003:  // Normal play at ch.3
      X68Sound_Pcm8_Out(rd[0] % 0xffff, &prog_ptr[ra[1]], rd[1], rd[2]);
      break;
    case 0x100:  // Stop
    case 0x101:  // Pause
      X68Sound_Pcm8_Abort();
      break;
    case 0x1FE:  // Lock
      break;
    default:
      printf("$%06x PCM8($%08x)\n", pc - 2, rd[0]);
      break;
  }
  return 0;
}
