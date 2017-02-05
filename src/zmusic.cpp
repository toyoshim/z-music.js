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

//#define fprintf(...)
#define CYCLE_LIMIT 1000000
#define RESULT_ERROR -1
#define RESULT_ASYNC -2

#include "x68sound.h"

#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

extern "C" void jsrt_resolve(int result);

namespace {

short* opm_buffer = NULL;
int opm_count = 0;
struct {
  UChar reg;
  UChar val;
} preset[1024];
int presets = 0;

void run_with_limit(int limit) {
  OPBuf_clear();
  EXEC_INSTRUCTION_INFO info;
  int cycles = 0;
  while (pc && (cycles < limit)) {
    info.pc = pc;
    info.code = *((unsigned short*)(prog_ptr + pc));
    if (FALSE != prog_exec())
      return;
    OPBuf_insert(&info);
    cycles++;
  }
  if (cycles == limit) {
    printf("VM68 is unexpectedly still running after %d cycles\n", limit);
    err68a("abort", __FILE__, __LINE__);
  }
}

int run() {
  int result = FALSE;
  while (pc && FALSE == result)
    result = prog_exec();
  return result;
}

enum suspendable_state {
  STATE_IDLE,
  STATE_COPY_DATA,
  STATE_COPY_EOF,
  STATE_TRAP3,
} state = STATE_IDLE;

ULong strategy = 0;
ULong interrupt = 0;
ULong a5 = 0;

struct fsm_state {
  enum suspendable_state state;
  ULong strategy;
  ULong interrupt;
  ULong a5;
  ULong pc;
} saved_state;

void push_state() {
  saved_state.state = state;
  saved_state.strategy = strategy;
  saved_state.interrupt = interrupt;
  saved_state.a5 = a5;
  saved_state.pc = pc;
}

void pop_state() {
  state = saved_state.state;
  strategy = saved_state.strategy;
  interrupt = saved_state.interrupt;
  a5 = saved_state.a5;
  pc = saved_state.pc;

  saved_state.state = STATE_IDLE;
}

int run_fsm() {
  for (;;) {
    if (state == STATE_IDLE)
      return 0;
    int result = run();
    if (result == RESULT_ASYNC)
      return result;
  
    switch (state) {
      case STATE_COPY_DATA: {
        UChar errorLow = zmusic_work[a5 + 3];
        UChar errorHigh = zmusic_work[a5 + 4];
        if (result != FALSE || errorLow != 0 || errorHigh != 0) {
          printf("COPY to OPM ERROR: $%02x%02x\n", errorHigh, errorLow);
          break;
        }
        // Send EOF. 
        ra[5] = a5;
        mem_set(ra[5] + 0, 26, S_BYTE);
        mem_set(ra[5] + 2, 8, S_BYTE);
        mem_set(ra[5] + 14, 0, S_LONG);
        mem_set(ra[5] + 18, 0, S_LONG);

        pc = 0;
        ra[7] -= 4;
        mem_set(ra[7], pc, S_LONG);
        pc = strategy;
        result = run();
        if (result != FALSE)
          err68a("abort", __FILE__, __LINE__);

        pc = 0;
        ra[7] -= 4;
        mem_set(ra[7], pc, S_LONG);
        pc = interrupt;
        SR_S_ON();
        state = STATE_COPY_EOF;
        continue;
      }
      case STATE_COPY_EOF: {
        UChar errorLow = zmusic_work[a5 + 3];
        UChar errorHigh = zmusic_work[a5 + 4];
        if (errorLow != 0 || errorHigh != 0)
          printf("COPY to OPM ERROR: $%02x%02x\n", errorHigh, errorLow);
        break;
      }
      case STATE_TRAP3:
        pop_state();
        fprintf(stderr, "TRAP3 LEAVE => $%08x\n", rd[0]);
        continue;
    } /* switch */
    state = STATE_IDLE;
  }
  err68a("abort", __FILE__, __LINE__);
  return RESULT_ERROR;
}

// TODO: Wire X68Sound_OpmPeek
void timerb() {
  if (state != STATE_IDLE)
    return;

  // Virtual stack to return 0.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  ra[7] -= 2;
  mem_set(ra[7], sr, S_WORD);
  pc = zmusic_timer;
  SR_S_ON();
  run();
}


}  // namespace

extern "C" void async_done(int code) {
  fprintf(stderr, "ASYNC => %d\n", code);
  rd[0] = code;
  int result = run_fsm();
  if (result != RESULT_ASYNC)
    jsrt_resolve(result);
}

extern "C" char* zmusic_init(int rate, int count) {
  X68Sound_StartPcm(rate);
  zmusic_work = (char*)malloc(0x100000);
  opm_count = count;
  opm_buffer = (short*)malloc(count * 2 * 2);
  for (int i = 0; i < presets; ++i) {
    X68Sound_OpmReg(preset[i].reg);
    X68Sound_OpmPoke(preset[i].val);
  }
  X68Sound_OpmInt(timerb);
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

extern "C" int zmusic_call() {
  fprintf(stderr, "TRAP3 ENTER: d1=$%08x, d2=$%08x, d3=$%08x, d4=$%08x, "
      "a1=$%08x\n", rd[1], rd[2], rd[3], rd[4], ra[1]);
  
  // Virtual stack to return 0.
  push_state();
  
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  ra[7] -= 2;
  mem_set(ra[7], sr, S_WORD);
  pc = zmusic_trap3;
  SR_S_ON();
  state = STATE_TRAP3;
  return run_fsm();

}

extern "C" int zmusic_trap(ULong d1, ULong d2, ULong d3, ULong d4, ULong a1) {
  if (state != STATE_IDLE) {
    printf("previous call wasn't finished.\n");
    return RESULT_ERROR;
  }
  // Destroy them all.
  rd[1] = d1;
  rd[2] = d2;
  rd[3] = d3;
  rd[4] = d4;
  ra[1] = a1;
  
  return zmusic_call();
}

extern "C" int zmusic_copy(ULong size) {
  if (state != STATE_IDLE) {
    printf("previous call wasn't finished.\n");
    return RESULT_ERROR;
  }
 
  if (prog_ptr[zmusic_driver + 14] != 'O' ||
      prog_ptr[zmusic_driver + 15] != 'P' ||
      prog_ptr[zmusic_driver + 16] != 'M' ||
      prog_ptr[zmusic_driver + 17] != ' ') {
    printf("OPM dirver not found\n");
    return RESULT_ERROR;
  }
  strategy = mem_get(zmusic_driver + 6, S_LONG);
  interrupt = mem_get(zmusic_driver + 10, S_LONG);

  // Setup the request.
  a5 = (0x100000 + size + 1) & ~1;
  ra[5] = a5;
  mem_set(ra[5] + 0, 26, S_BYTE);
  mem_set(ra[5] + 2, 8, S_BYTE);
  mem_set(ra[5] + 14, 0x100000, S_LONG);
  mem_set(ra[5] + 18, size, S_LONG);

  // Stores a request of A5 by calling strategy entry.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  pc = strategy;
  if (FALSE != run())
    err68a("abort", __FILE__, __LINE__);

  // Calls interrupt entry that serves a queued reuqest.
  pc = 0;
  ra[7] -= 4;
  mem_set(ra[7], pc, S_LONG);
  pc = interrupt;
  SR_S_ON();
  state = STATE_COPY_DATA;
  return run_fsm();
}

extern "C" int pcm8_call() {
  switch (rd[0] & 0xffff) {
    case 0x000:  // Normal play at ch.0
    case 0x001:  // Normal play at ch.1
    case 0x002:  // Normal play at ch.2
    case 0x003:  // Normal play at ch.3
    case 0x004:  // Normal play at ch.4
    case 0x005:  // Normal play at ch.5
    case 0x006:  // Normal play at ch.6
    case 0x007:  // Normal play at ch.7
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
