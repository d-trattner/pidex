import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
varying vec2 v_uv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(13.7, 4.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float t = u_time * 0.035;

  float flowA = fbm(p * 1.55 + vec2(t, -t * 0.35));
  float flowB = fbm(p * 2.2 + vec2(-t * 0.55, t * 0.75) + flowA * 0.55);
  float wave = sin((p.x * 2.1 - p.y * 1.35 + flowA * 2.4 + t * 2.0)) * 0.5 + 0.5;

  vec3 deep = vec3(0.015, 0.035, 0.085);
  vec3 blue = vec3(0.02, 0.22, 0.68);
  vec3 cyan = vec3(0.0, 0.84, 1.0);
  vec3 violet = vec3(0.42, 0.12, 0.95);
  vec3 magenta = vec3(0.9, 0.12, 0.82);

  vec3 color = mix(deep, blue, smoothstep(0.05, 0.95, flowA));
  color = mix(color, cyan, smoothstep(0.48, 0.95, wave) * 0.42);
  color = mix(color, violet, smoothstep(0.22, 0.9, flowB) * 0.48);
  color = mix(color, magenta, smoothstep(0.72, 1.0, flowA * flowB + wave * 0.35) * 0.22);

  float radial = 1.0 - smoothstep(0.15, 1.15, length(p));
  color += cyan * radial * 0.08;
  color += violet * pow(max(0.0, 1.0 - length(p - vec2(0.45, -0.25))), 2.0) * 0.12;

  float grain = hash(uv * u_resolution + u_time) - 0.5;
  color += grain * 0.018;

  gl_FragColor = vec4(color, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Shader compile failed', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return undefined;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return undefined;

    const program = gl.createProgram();
    if (!program) return undefined;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Shader link failed', gl.getProgramInfoLog(program));
      return undefined;
    }

    const position = gl.getAttribLocation(program, 'a_position');
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    let frame = 0;
    let start = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const render = (now: number) => {
      resize();
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reduceMotion ? 0 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reduceMotion) frame = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize, { passive: true });
    render(start);
    if (!reduceMotion) frame = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (frame) cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="shader-background" aria-hidden="true" />;
}
