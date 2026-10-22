import { fragmentSource, vertexSource } from "./flow-wave-shaders.ts";

export interface WaveController {
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}
type Vec3 = [number, number, number];
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length) as Vec3;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function view(eye: Vec3, target: Vec3) {
  const z = normalize(eye.map((v, i) => v - target[i]) as Vec3),
    x = normalize(cross([0, 1, 0], z)),
    y = cross(z, x);
  return {
    x,
    y,
    z,
    matrix: new Float32Array([
      x[0],
      y[0],
      z[0],
      0,
      x[1],
      y[1],
      z[1],
      0,
      x[2],
      y[2],
      z[2],
      0,
      -dot(x, eye),
      -dot(y, eye),
      -dot(z, eye),
      1,
    ]),
  };
}
function perspective(aspect: number) {
  const f = 1 / Math.tan(Math.PI / 8),
    near = 0.1,
    far = 400;
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
}
const hash = (x: number, z: number) => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  let fx = x - ix,
    fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  return (
    mix(
      mix(hash(ix, iz), hash(ix + 1, iz), fx),
      mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx),
      fz,
    ) *
      2 -
    1
  );
}

/** Same procedural surface as preview v2, with bounded resolution and full unmount cleanup. */
export function createFlowWave(
  canvas: HTMLCanvasElement,
  fallbackCanvas: HTMLCanvasElement,
  initiallyPaused: boolean,
): WaveController {
  let gl: WebGLRenderingContext | null = null,
    context: CanvasRenderingContext2D | null = null;
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null;
  const shaders: WebGLShader[] = [];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  let raf = 0,
    last = performance.now(),
    time = 0,
    stream = 0,
    scrollCurrent = 0,
    scrollSmooth = 0;
  let paused = initiallyPaused,
    disposed = false,
    visible = !document.hidden,
    count = 0,
    compact: boolean | null = null;
  let mouse = { x: 0, y: 0 },
    target = { x: 0, y: 0 },
    pointerActive = false,
    lastMove = 0,
    activity = 0;
  let cursor: Vec3 = [0, 0, 0];
  const events = new AbortController();
  const small = () => innerWidth < 741;
  const scrollFraction = () =>
    clamp(
      window.scrollY /
        Math.max(1, document.documentElement.scrollHeight - innerHeight),
      0,
      1,
    );
  function freeGL() {
    if (!gl) return;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach((s) => gl?.deleteShader(s));
    shaders.length = 0;
    buffer = null;
    program = null;
  }
  function useFallback() {
    freeGL();
    gl = null;
    canvas.hidden = true;
    fallbackCanvas.hidden = false;
    context = fallbackCanvas.getContext("2d");
    fallbackCanvas.dataset.renderer = context ? "canvas2d" : "static";
  }
  function compile(type: number, source: string) {
    if (!gl) throw new Error("No context");
    const shader = gl.createShader(type);
    if (!shader) throw new Error("No shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error("Shader unavailable");
    return shader;
  }
  function init() {
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      });
      if (!gl) {
        useFallback();
        return;
      }
      const vs = compile(gl.VERTEX_SHADER, vertexSource),
        fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      if (!program) throw new Error("No program");
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Link unavailable");
      gl.useProgram(program);
      for (const name of [
        "projectionMatrix",
        "viewMatrix",
        "modelMatrix",
        "uTime",
        "uStream",
        "uSize",
        "uWaveHeight",
        "uFlow",
        "uScale",
        "uColLow",
        "uColHigh",
        "uOpacity",
        "uBrightness",
        "uAppear",
        "uCursor",
        "uRepelRadius",
        "uRepelStrength",
        "uActivity",
      ])
        uniforms[name] = gl.getUniformLocation(program, name);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("No buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const location = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(
        uniforms.modelMatrix,
        false,
        new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      );
      gl.uniform3fv(uniforms.uColLow, [2 / 255, 22 / 255, 12 / 255]);
      gl.uniform3fv(uniforms.uColHigh, [52 / 255, 232 / 255, 154 / 255]);
      for (const [name, value] of Object.entries({
        uSize: 5.5,
        uFlow: 1,
        uScale: 0.275,
        uOpacity: 0.26,
        uBrightness: 0.45,
        uRepelRadius: 7,
        uRepelStrength: 0.9,
      }))
        gl.uniform1f(uniforms[name], value);
      canvas.dataset.renderer = "webgl";
    } catch {
      useFallback();
    }
  }
  function geometry() {
    if (!gl || compact === small()) return;
    compact = small();
    const width = compact ? 72 : 160,
      height = compact ? 140 : 360;
    const points = new Float32Array((width + 1) * (height + 1) * 3);
    let i = 0;
    for (let y = 0; y <= height; y++)
      for (let x = 0; x <= width; x++) {
        const u = x / width,
          v = y / height;
        points[i++] = -4.2 * Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
        points[i++] = 4.2 * Math.cos(v * Math.PI);
        points[i++] = 4.2 * Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      }
    count = points.length / 3;
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    canvas.dataset.points = String(count);
  }
  function draw() {
    if (disposed) return;
    scrollSmooth = mix(scrollSmooth, scrollFraction(), 0.1);
    scrollCurrent = mix(scrollCurrent, scrollSmooth, 0.06);
    mouse = {
      x: mix(mouse.x, target.x, 0.06),
      y: mix(mouse.y, target.y, 0.06),
    };
    const a = Math.min(scrollCurrent / 0.35, 1),
      e = a * a * (3 - 2 * a);
    const eye: Vec3 = [
        mouse.x * 1.2,
        mix(7, 0.8, e) + mouse.y * 0.36,
        mix(16, -2, e),
      ],
      aim: Vec3 = [mouse.x * 0.6, mix(0, 0.6, e), mix(2, -16, e)],
      basis = view(eye, aim);
    if (gl) {
      gl.uniformMatrix4fv(uniforms.viewMatrix, false, basis.matrix);
      const f = Math.tan(Math.PI / 8),
        aspect = innerWidth / innerHeight;
      const dir = normalize(
        basis.z.map(
          (v, i) =>
            -v + basis.x[i] * mouse.x * f * aspect + basis.y[i] * mouse.y * f,
        ) as Vec3,
      );
      let nextCursor: Vec3 = [0, 0, 0];
      const distance = -eye[2] / dir[2];
      if (
        pointerActive &&
        Math.abs(dir[2]) > 1e-4 &&
        distance > 0 &&
        Number.isFinite(distance)
      )
        nextCursor = eye.map((v, i) => v + dir[i] * distance) as Vec3;
      cursor = cursor.map((v, i) => mix(v, nextCursor[i], 0.12)) as Vec3;
      activity = mix(
        activity,
        pointerActive && performance.now() - lastMove < 3000 ? 1 : 0,
        0.06,
      );
      gl.uniform3fv(uniforms.uCursor, cursor);
      gl.uniform1f(uniforms.uActivity, activity);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uStream, stream);
      gl.uniform1f(uniforms.uWaveHeight, 3 * (1 + scrollCurrent));
      gl.uniform1f(
        uniforms.uAppear,
        paused ? 1 : clamp((time - 0.2) / 1.4, 0, 1),
      );
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
    } else if (context) {
      const c = context,
        w = fallbackCanvas.width,
        h = fallbackCanvas.height,
        f = h / (2 * Math.tan(Math.PI / 8)),
        nx = small() ? 48 : 84,
        nz = small() ? 50 : 70;
      c.clearRect(0, 0, w, h);
      c.globalCompositeOperation = "lighter";
      const appear = paused ? 1 : clamp((time - 0.2) / 1.4, 0, 1);
      for (let row = 0; row < nz; row++)
        for (let col = 0; col < nx; col++) {
          const z = -38 + (row * 55) / (nz - 1),
            x = -23 + (col * 46) / (nx - 1);
          let y =
            (noise(x * 0.29, (z + stream * 0.275) * 0.29 + time * 0.07) * 2 +
              noise(x * 0.58, (z + stream * 0.275) * 0.58 - time * 0.04) *
                0.8) *
            0.825 *
            (1 + scrollCurrent);
          if (pointerActive && !paused) {
            const dx = x / 23 - mouse.x,
              dz = z / 20 - mouse.y;
            y -= Math.exp(-(dx * dx + dz * dz) * 3) * 0.35;
          }
          const v: Vec3 = [x - eye[0], y - eye[1], z - eye[2]],
            depth = -dot(v, basis.z);
          if (depth < 0.25 || depth > 65) continue;
          const sx = w * 0.5 + (dot(v, basis.x) * f) / depth,
            sy = h * 0.5 - (dot(v, basis.y) * f) / depth;
          if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
          const alpha = clamp(
              (0.38 + Math.max(0, y) * 0.075) * (1 - depth / 70) * appear,
              0.015,
              0.5,
            ),
            r = clamp(55 / depth, 0.8, 4.5);
          c.fillStyle = `rgba(52,232,154,${alpha})`;
          c.beginPath();
          c.arc(sx, sy, r, 0, Math.PI * 2);
          c.fill();
        }
      c.globalCompositeOperation = "source-over";
    }
  }
  function resize() {
    if (disposed) return;
    if (gl) {
      const dpr = Math.min(devicePixelRatio || 1, small() ? 1 : 1.35);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniformMatrix4fv(
        uniforms.projectionMatrix,
        false,
        perspective(innerWidth / innerHeight),
      );
      geometry();
    } else {
      fallbackCanvas.width = innerWidth;
      fallbackCanvas.height = innerHeight;
    }
    draw();
  }
  function tick(now: number) {
    raf = 0;
    if (disposed || paused || !visible) return;
    const interval = 1000 / (small() ? 24 : 30);
    if (now - last >= interval) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      stream += dt * 8;
      draw();
    }
    raf = requestAnimationFrame(tick);
  }
  function resume() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = performance.now();
    if (!disposed && !paused && visible && (gl || context))
      raf = requestAnimationFrame(tick);
    else if (!disposed) draw();
  }
  window.addEventListener("resize", resize, {
    passive: true,
    signal: events.signal,
  });
  window.addEventListener(
    "scroll",
    () => {
      if (paused) {
        scrollSmooth = scrollCurrent = scrollFraction();
        draw();
      }
    },
    { passive: true, signal: events.signal },
  );
  window.addEventListener(
    "pointermove",
    (event) => {
      if (paused || event.pointerType === "touch") return;
      target = {
        x: (event.clientX / innerWidth) * 2 - 1,
        y: 1 - (event.clientY / innerHeight) * 2,
      };
      pointerActive = true;
      lastMove = performance.now();
    },
    { passive: true, signal: events.signal },
  );
  document.addEventListener(
    "pointerleave",
    () => {
      pointerActive = false;
      target = { x: 0, y: 0 };
    },
    { signal: events.signal },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      visible = !document.hidden;
      resume();
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      useFallback();
      resize();
      resume();
    },
    { signal: events.signal },
  );
  init();
  resize();
  resume();
  return {
    setPaused(next) {
      paused = next;
      resume();
    },
    dispose() {
      disposed = true;
      events.abort();
      cancelAnimationFrame(raf);
      freeGL();
    },
  };
}
