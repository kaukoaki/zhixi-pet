'use strict';
// Animate the painted texture itself; no vector reconstruction of the character.
(() => {
  const host = document.querySelector('[data-qiqi-art]');
  if (!host) return;
  const poster = new Image();
  poster.className = 'portrait-poster';
  poster.alt = '知栖：银白渐青长发、紫色眼睛的二次元桌宠';
  poster.src = '../assets/character/qiqi-chibi-v5-knot-sprout.png';
  const portraitScale = .86;
  host.append(poster);
  const canvas = document.createElement('canvas');
  canvas.className = 'portrait-canvas'; canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const paused = new Set();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let gl, program, frame = 0, elapsed = 0, last = 0, ready = false, fixed = null;
  let alpha, imageWidth = 0, imageHeight = 0;
  const api = window.qiqiIdle = {
    actions: [], current: 'base', ready: false, frames: 0, mode: 'loading',
    start() { paused.delete('manual'); schedule(); },
    stop() { paused.add('manual'); cancelAnimationFrame(frame); frame = 0; },
    pause(reason) { paused.add(reason); cancelAnimationFrame(frame); frame = 0; },
    resume(reason) { paused.delete(reason); last = 0; schedule(); },
    touch() {}, play() { /* Click response is a small whole-character bounce. */ },
    pose(_id, time = 0) { fixed = time; draw(time); },
    hitTest(x, y) {
      if (!alpha) return x > .2 && x < .8 && y > .05 && y < .98;
      const rect = host.getBoundingClientRect();
      const fit = Math.min(rect.width / imageWidth, rect.height / imageHeight) * portraitScale;
      const ix = Math.floor((x * rect.width - (rect.width - imageWidth * fit) / 2) / fit);
      const iy = Math.floor((y * rect.height - (rect.height - imageHeight * fit) / 2) / fit);
      return ix >= 0 && iy >= 0 && ix < imageWidth && iy < imageHeight && alpha[(iy * imageWidth + ix) * 4 + 3] > 24;
    }
  };
  function shader(type, source) {
    const result = gl.createShader(type); gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  }
  function init() {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 uv; varying vec2 tex; uniform float time; uniform vec2 fit;
      void main() {
        tex = uv; vec2 p = uv;
        float breath = sin(time * 1.75);
        float anchor = pow(1.0 - uv.y, 1.6);
        p.x += sin(time * 1.15) * .006 * anchor;
        p.y -= breath * .005 * anchor;
        float side = smoothstep(.10, .30, abs(uv.x - .5));
        float hair = smoothstep(.18, .4, uv.y) * (1.0 - smoothstep(.75, .95, uv.y));
        p.x += sin(time * 1.65 + uv.y * 5.0) * .007 * side * hair;
        p.y += sin(time * 1.4 + uv.x * 5.0) * .002 * side * hair;
        gl_Position = vec4((p.x * 2.0 - 1.0) * fit.x, (1.0 - p.y * 2.0) * fit.y, 0.0, 1.0);
      }`));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float; varying vec2 tex; uniform sampler2D portrait;
      void main() { gl_FragColor = texture2D(portrait, tex); }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const points = [], cells = 48;
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const a = x / cells, b = y / cells, c = (x + 1) / cells, d = (y + 1) / cells;
      points.push(a,b,c,b,a,d,a,d,c,b,c,d);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    const uv = gl.getAttribLocation(program, 'uv'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    // A power-of-two runtime texture enables mipmaps for arbitrary imagegen sizes.
    // The original PNG stays unchanged; aspect ratio is preserved by the mesh fit.
    const texture = document.createElement('canvas');
    texture.width = Math.min(2048, 2 ** Math.floor(Math.log2(imageWidth)));
    texture.height = Math.min(2048, 2 ** Math.floor(Math.log2(imageHeight)));
    const textureContext = texture.getContext('2d');
    textureContext.imageSmoothingQuality = 'high';
    textureContext.drawImage(poster, 0, 0, texture.width, texture.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.clearColor(0,0,0,0);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); ready = false; api.mode = 'static-fallback'; host.classList.remove('mesh-ready'); });
    canvas.addEventListener('webglcontextrestored', () => { init(); ready = true; host.classList.add('mesh-ready'); schedule(); });
    ready = true; api.mode = 'painted-mesh'; draw(0); host.classList.add('mesh-ready');
  }
  function draw(time) {
    if (!ready) return;
    const rect = host.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0,0,width,height);
    const fit = Math.min(width / imageWidth, height / imageHeight) * portraitScale;
    gl.uniform2f(gl.getUniformLocation(program, 'fit'), imageWidth * fit / width, imageHeight * fit / height);
    gl.uniform1f(gl.getUniformLocation(program, 'time'), reduce.matches ? 0 : time);
    gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 48 * 48 * 6); api.frames++;
  }
  function tick(now) {
    frame = 0;
    if (last) elapsed += Math.min((now - last) / 1000, .05);
    last = now; draw(fixed ?? elapsed); schedule();
  }
  function schedule() { if (ready && !frame && !paused.size && !document.hidden && fixed === null && !reduce.matches) frame = requestAnimationFrame(tick); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) api.pause('hidden'); else api.resume('hidden'); });
  reduce.addEventListener('change', () => { draw(elapsed); schedule(); });
  new ResizeObserver(() => draw(fixed ?? elapsed)).observe(host);
  poster.decode().then(() => {
    imageWidth = poster.naturalWidth; imageHeight = poster.naturalHeight;
    const sample = document.createElement('canvas'); sample.width = imageWidth; sample.height = imageHeight;
    const ctx = sample.getContext('2d', { willReadFrequently: true }); ctx.drawImage(poster,0,0); alpha = ctx.getImageData(0,0,imageWidth,imageHeight).data;
    api.ready = true;
    try { init(); schedule(); } catch (error) { api.mode = 'static-fallback'; console.warn('Portrait fallback:', error.message); }
  }).catch(error => { api.mode = 'missing-asset'; window.__qiqiErrors?.push('角色素材加载失败：' + error.message); });
})();
