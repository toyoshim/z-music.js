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
<script src="zmusic.js"></script>
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

### Use ZMUSIC v1.10
```
ZMUSIC.install(['ZMUSIC110.X']);
```

### Use ZMUSIC v2.08 (default)
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

### ZMUSIC.js API
See src/prolog.js
