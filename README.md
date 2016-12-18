# z-music.js
Z-MUSIC v1.10 and v2.08 for the web

## How to build
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
</html>
```

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

### mobile Safari specific notice
Since mobile Safari does not allow us to playback any audio without user
actions, you need to call the first play() or compileAndPlay() call inside the
event handler for user actions.

### ZMUSIC.js API
See src/prolog.js
