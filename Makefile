# Copyright 2016 Takashi Toyoshima <toyoshim@gmail.com>. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

OUT	= out
DEPEND	= $(OUT)/depend
RUN68	= third_party/run68as/third_party/run68/src
MOD68	= third_party/run68as/mod
OPM	= third_party/X68Sound/X68Sound
ZMSC2	= src
CC	= emcc
DEFS	= -DFNC_TRACE -DENV_FROM_INI -DEMSCRIPTEN_KEEPR
INCS	= -include $(MOD68)/preinc.h -I $(RUN68) -I $(OPM) -I $(ZMSC2)/compat
OFLAGS  = -Oz
CFLAGS	= $(DEFS) $(INCS) $(OFLAGS)
CXXFLAGS= $(CFLAGS) -fno-operator-names
ZMFUNCS	= '_zmusic_init', '_zmusic_update', '_zmusic_trap', '_zmusic_copy'
RTFUNCS = '_main', '_mem_get', '_mem_set', '_async_done'
EXPORTS	= -s EXPORTED_FUNCTIONS="[$(RTFUNCS), $(ZMFUNCS)]"
RUNTIME	= --js-library $(ZMSC2)/runtime68.js
EMBED	= --embed-file x/ZMUSIC110.X@ZMUSIC110.X \
	  --embed-file x/ZMUSIC208.X@ZMUSIC208.X
LDFLAGS	= -lm $(OFLAGS) $(RUNTIME) $(EXPORTS) -s WASM=0 --memory-init-file 0 $(EMBED)
WFLAGS	= -lm $(OFLAGS) $(RUNTIME) $(EXPORTS) -s WASM=1 $(EMBED)
CSRCS	= \
	$(RUN68)/ansicolor-w32.c \
	$(RUN68)/calc.c \
	$(RUN68)/conditions.c \
	$(RUN68)/disassemble.c \
	$(RUN68)/eaaccess.c \
	$(RUN68)/exec.c \
	$(RUN68)/getini.c \
	$(RUN68)/key.c \
	$(RUN68)/line0.c \
	$(RUN68)/line2.c \
	$(RUN68)/line5.c \
	$(RUN68)/line6.c \
	$(RUN68)/line7.c \
	$(RUN68)/line8.c \
	$(RUN68)/line9.c \
	$(RUN68)/lineb.c \
	$(RUN68)/linec.c \
	$(RUN68)/lined.c \
	$(RUN68)/linee.c \
	$(RUN68)/load.c \
	$(MOD68)/line4.c \
	$(MOD68)/linef.c \
	$(MOD68)/mem.c \
	$(MOD68)/run68.c \
	$(ZMSC2)/doscall.c \
	$(ZMSC2)/iocscall.c \
	$(ZMSC2)/memop.c

CXXSRCS	= \
	$(ZMSC2)/zmusic.cpp \
	$(ZMSC2)/compat/compat.cpp \
	$(ZMSC2)/x68sound.cpp

OBJS	= \
	$(addprefix $(OUT)/, $(notdir $(CSRCS:.c=.o))) \
	$(addprefix $(OUT)/, $(notdir $(CXXSRCS:.cpp=.o)))

$(OUT)/%.o: $(ZMSC2)/%.c
	$(CC) $(CFLAGS) -o $@ $<

$(OUT)/%.o: $(ZMSC2)/%.cpp
	$(CC) $(CXXFLAGS) -o $@ $<

$(OUT)/%.o: $(ZMSC2)/compat/%.cpp
	$(CC) $(CXXFLAGS) -o $@ $<

$(OUT)/%.o: $(MOD68)/%.c
	$(CC) $(CFLAGS) -o $@ $<

$(OUT)/%.o: $(RUN68)/%.c
	$(CC) $(CFLAGS) -o $@ $<

.PHONY: all clean depend dist
all: $(DEPEND) zmusic.js zmusic.asm.js

clean:
	rm -rf $(OUT) zmusic.js zmusic.asm.js

depend: $(DEPEND)

dist: all
	cp zmusic.js zmusic.asm.js out/zmusic.wasm dist/

$(DEPEND): $(CSRCS) $(CXXSRCS) Makefile
	mkdir -p $(OUT)
	$(CC) $(CFLAGS) -MM $(CSRCS) $(CXXSRCS)> $@

zmusic.js: $(OUT)/zmusic.js $(ZMSC2)/prolog.js $(ZMSC2)/epilog.js
	cat $(ZMSC2)/prolog.js $(OUT)/zmusic.js $(ZMSC2)/epilog.js > $@

zmusic.asm.js: $(OUT)/zmusic.asm.js $(ZMSC2)/prolog.js $(ZMSC2)/epilog.js
	cat $(ZMSC2)/prolog.js $(OUT)/zmusic.asm.js $(ZMSC2)/epilog.js > $@

$(OUT)/zmusic.asm.js: $(OBJS) $(ZMSC2)/runtime68.js
	$(CC) -o $@ $(LDFLAGS) $(OBJS)

$(OUT)/zmusic.js: $(OBJS) $(ZMSC2)/runtime68.js
	$(CC) -o $@ $(WFLAGS) $(OBJS)

ifneq "$(MAKECMDGOALS)" "clean"
-include $(DEPEND)
endif
