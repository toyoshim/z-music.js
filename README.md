# z-music.js
Z-MUSIC v1.10 and v2.08 for the web

## How to build
emcc should be installed via emsdk (Emscripten) beforehand.
```
% git clone https://github.com/toyoshim/z-music.js.git
% cd z-music.js
% git submodule update --init --recursive
% make
```

## How to use
```
<html>
<head>
<script src="dist/zmusic.js"></script>
<script>
// Make XHR to support Promise.
function xhr (url) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.addEventListener('load', e => {
      resolve(xhr.response);
      xhr.abort();
    }, false);
    xhr.send();
  });
}

Promise.all([
    ZMUSIC.install(),
    xhr('data/bgm1.zmd'),
    xhr('data/bgm.zpd')]).then(results => {
  ZMUSIC.play(results[1], results[2]);
});
</script>
</head>
<body><button onclick="ZMUSIC.resume()">Unmute</button></body>
</html>
```

## WebAssembly
Now, z-music.js relies on WebAssembly by default. dist/zmusic.asm.js is still
available for users who are not ready for WebAssembly, but not maintained well.

## Initialize with detailed parameters

### Use Z-MUSIC v1.10
```
ZMUSIC.install(['ZMUSIC110.X']);
```

### Use Z-MUSIC v2.08 (default)
```
ZMUSIC.install(['ZMUSIC208.X']);
```

### With Z-MUSIC options
```
ZMUSIC.install(['ZMUSIC110.X', '-n', '-u', -'t0', '-w0']);
```

### With specified audio buffer size
```
ZMUSIC.install(null, { buffer: 8192 });
```

### Redirect output to another AudioNode
```
ZMUSIC.install(null, { context: myAudioContext });
ZMUSIC.connect(myAudioNodeCreatedFromMyAudioContext);
```

### Compile ZMS and play
```
Promise.all([
    ZMUSIC.install(),
    xhr('data/bgm1.zms')]).then(results => {
  ZMUSIC.compileAndPlay(results[1]);
});
```

### .adpcm_block_data
If .adpcm_block_data command is used in ZMS and ZMD, play() or compileAndPlay()
call will be asynchronously done. It returns Pomise to notify its completion.

The filename for the ZPD would be converted to a name in capitals. Since this
is performed inside ZMUSIC.X, I have no plan to fix this problem.
E.g., FooBar.zpd will be accessed by FOOBAR.ZPD and /FOOBAR.ZPD.

If someone request, I would add an asynchronous interface to handle ZPD file
reads in a customized way.

### Requires a user initiated interaction.
#### mobile Safari
Since mobile Safari does not allow us to playback any audio without user
actions, you need to call the first play() or compileAndPlay() call inside an
event handler for user actions.

#### Others
Today, other browsers have the same restriction with mobile Safari. You can
resume audio playback at anytime after you call ZMUSIC.install() by calling
ZMUSIC.resume() in an event handler for user actions.
```
<button onclick="ZMUSIC.resume()">Unmute</button>
```

### ZMUSIC.js API
See src/prolog.js
