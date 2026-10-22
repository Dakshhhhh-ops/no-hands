import { useEffect, useRef } from 'react';
import { isAutomated, prefersReducedMotion } from '../../hooks/useMotion.ts';

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Fourteen waveform lines, like a voice print, flowing across the hero. The cursor
// swells the lines near it and warms them to the accent color.
const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_dark;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float x = uv.x * aspect;
  float t = u_time * 0.22;
  float ink = 0.0;
  float hot = 0.0;

  // pow() is undefined for a negative base in GLSL, so square by multiplying.
  float dx = (uv.x - u_mouse.x) * 3.2;
  float near = exp(-dx * dx);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float spread = (fi - 6.5) * 0.024;
    float amp = (0.05 + 0.04 * sin(fi * 1.7 + t)) * (1.0 + near * 1.6);
    float y = 0.34 + spread
      + amp * sin(x * 2.1 + t * 1.7 + fi * 0.42) * sin(x * 0.8 - t + fi * 0.9)
      + near * 0.03 * sin(t * 4.0 + fi);
    float width = 0.0014 + 0.0010 * (0.5 + 0.5 * sin(fi * 2.3 + t));
    // smoothstep needs edge0 < edge1; reversed edges are undefined and render solid on some GPUs.
    float line = 1.0 - smoothstep(0.0, width * 2.2, abs(uv.y - y));
    float fade = smoothstep(0.0, 0.3, uv.x) * (1.0 - smoothstep(0.78, 1.0, uv.x));
    ink += line * (0.2 + 0.8 * fade);
    hot += line * near;
  }

  // Lines are plain ink on paper (light) or paper on charcoal (dark); only the
  // lines under the cursor warm to the vermilion accent. No gradients, no glow.
  vec3 base = mix(vec3(0.08, 0.08, 0.07), vec3(0.93, 0.91, 0.87), u_dark);
  vec3 accent = mix(vec3(0.91, 0.28, 0.05), vec3(1.0, 0.42, 0.17), u_dark);
  float heat = clamp(hot / max(ink, 0.0001), 0.0, 1.0);
  vec3 col = mix(base, accent, heat * 0.85);
  float a = clamp(ink, 0.0, 1.0) * mix(0.32, 0.42, u_dark);
  gl_FragColor = vec4(col * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: GLenum, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/**
 * Hand-written WebGL background (no 3D library). Pauses when off screen or when
 * the tab is hidden; renders one still frame with reduced motion; renders nothing
 * if WebGL is unavailable, leaving the CSS aurora as the fallback.
 */
export default function VoiceField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Skipped in tests and automated browsers, where it only costs CPU.
    if (!canvas || isAutomated()) return undefined;
    const gl: WebGLRenderingContext | null | undefined = canvas.getContext?.('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, powerPreference: 'low-power' });
    if (!gl || typeof gl.createShader !== 'function') return undefined;
    // React development mode mounts effects twice. Never reuse a lost context: hide the
    // canvas and let the CSS aurora show instead.
    if (gl.isContextLost()) {
      canvas.style.display = 'none';
      return undefined;
    }
    canvas.style.display = '';

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return undefined;
    const program: WebGLProgram | null = gl.createProgram();
    if (!program) return undefined;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
    gl.useProgram(program);

    const buffer: WebGLBuffer | null = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc: GLint = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    // A null location is a no-op for gl.uniform*, so these need no early return.
    const u: Record<'res' | 'time' | 'mouse' | 'dark', WebGLUniformLocation | null> = {
      res: gl.getUniformLocation(program, 'u_res'),
      time: gl.getUniformLocation(program, 'u_time'),
      mouse: gl.getUniformLocation(program, 'u_mouse'),
      dark: gl.getUniformLocation(program, 'u_dark'),
    };

    const mouse = { x: 0.7, y: 0.5, tx: 0.7, ty: 0.5 };
    let frame = 0;
    let running = false;
    let visible = true;
    const start = performance.now();
    const still = prefersReducedMotion();

    const resize = () => {
      // Rendered below full resolution and scaled up by CSS: the lines are soft glows, and
      // the lower pixel count keeps slow GPUs (and software renderers) well within budget.
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (now: DOMHighResTimeStamp) => {
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, still ? 8 : (now - start) / 1000);
      gl.uniform2f(u.mouse, mouse.x, mouse.y);
      gl.uniform1f(u.dark, document.documentElement.dataset.theme === 'light' ? 0 : 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const loop = (now: DOMHighResTimeStamp) => {
      draw(now);
      frame = running ? requestAnimationFrame(loop) : 0;
    };
    const setRunning = (next: boolean) => {
      if (still) return;
      running = next && visible && !document.hidden;
      if (running && !frame) frame = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = (event.clientX - rect.left) / rect.width;
      mouse.ty = 1 - (event.clientY - rect.top) / rect.height;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? visible;
      setRunning(true);
    });
    const onVisibility = () => setRunning(true);
    // If the GPU drops the context, hide the canvas; the CSS aurora remains as the fallback.
    // 'webglcontextlost' is not in HTMLElementEventMap, so the listener receives a plain Event.
    const onLost = (event: Event) => {
      event.preventDefault();
      running = false;
      canvas.style.display = 'none';
    };
    canvas.addEventListener('webglcontextlost', onLost);

    resize();
    draw(performance.now());
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    setRunning(true);

    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      // The context is not force-released: a remount reuses this canvas and its context.
    };
  }, []);

  return <canvas ref={canvasRef} className="va-voice-field" aria-hidden="true" />;
}
