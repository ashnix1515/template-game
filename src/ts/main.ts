import './sw-register';
import './build-info';

// Minimal game loop scaffold. Replace update()/render() with your game;
// everything else (canvas sizing, the rAF loop, deltaTime) is meant to stay.

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas context unavailable');

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const box = { x: 40, y: 40, size: 48, vx: 220, vy: 160 };

function update(dtSeconds: number): void {
  const w = window.innerWidth;
  const h = window.innerHeight;

  box.x += box.vx * dtSeconds;
  box.y += box.vy * dtSeconds;

  if (box.x <= 0 || box.x + box.size >= w) box.vx *= -1;
  if (box.y <= 0 || box.y + box.size >= h) box.vy *= -1;
}

function render(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx!.clearRect(0, 0, w, h);
  ctx!.fillStyle = '#2563eb';
  ctx!.fillRect(box.x, box.y, box.size, box.size);
}

let lastTime = performance.now();
function frame(now: number): void {
  const dtSeconds = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dtSeconds);
  render();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
