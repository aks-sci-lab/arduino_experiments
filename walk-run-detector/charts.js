// canvas 그래프 (의존성 없음). 색은 style.css의 변수를 읽어 다크 모드에 맞춘다.
import { G } from './analysis.js';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const labelColor = label => css(label === 'run' ? '--run' : label === 'walk' ? '--walk' : '--still');

function fit(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

// 시계열: pts = [{ x(초), y }], 가로 범위 [x0, x1]. peaks = [{ x, y }]
export function drawSeries(canvas, pts, x0, x1, { peaks = [], xLabel = '시간 (초)' } = {}) {
  if (!canvas.clientWidth) return;
  const { ctx, w, h } = fit(canvas);
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  let yMax = 20;
  for (const p of pts) if (p.y > yMax) yMax = p.y;
  yMax = Math.ceil(yMax / 10) * 10;
  const X = v => pad.l + ((v - x0) / (x1 - x0)) * pw;
  const Y = v => pad.t + ph - (v / yMax) * ph;

  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = css('--muted');
  ctx.strokeStyle = css('--border');
  ctx.lineWidth = 1;
  for (let v = 0; v <= yMax; v += 10) {
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(v));
    ctx.lineTo(w - pad.r, Y(v));
    ctx.stroke();
    ctx.fillText(String(v), 4, Y(v) + 4);
  }
  ctx.fillText(xLabel, pad.l, h - 4);

  ctx.strokeStyle = css('--gref');
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.l, Y(G));
  ctx.lineTo(w - pad.r, Y(G));
  ctx.stroke();
  ctx.setLineDash([]);

  if (pts.length > 1) {
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.stroke();
  }
  ctx.fillStyle = css('--peak');
  for (const p of peaks) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 판정 타임라인: items = [{ t(ms), label }] (각 항목은 직전 항목 이후 구간의 판정)
export function drawTimeline(canvas, items, t0) {
  if (!canvas.clientWidth) return;
  const { ctx, w, h } = fit(canvas);
  if (!items.length) return;
  const span = Math.max(items[items.length - 1].t - t0, 1);
  let prevX = 0;
  for (const it of items) {
    const x = ((it.t - t0) / span) * w;
    ctx.fillStyle = labelColor(it.label);
    ctx.fillRect(prevX, 0, Math.max(1, x - prevX), h);
    prevX = x;
  }
}

// 산점도: points = [{ x, y, label, test }]. test는 속이 빈 점으로 그린다.
export function drawScatter(canvas, points, xName, yName, marker) {
  if (!canvas.clientWidth) return;
  const { ctx, w, h } = fit(canvas);
  const pad = { l: 56, r: 10, t: 10, b: 30 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  if (!points.length) {
    ctx.fillStyle = css('--muted');
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('학습 데이터가 없습니다', pad.l, h / 2);
    return;
  }
  const all = marker ? [...points, marker] : points;
  const range = key => {
    let lo = Infinity, hi = -Infinity;
    for (const p of all) { lo = Math.min(lo, p[key]); hi = Math.max(hi, p[key]); }
    const m = (hi - lo) * 0.06 || 1;
    return [lo - m, hi + m];
  };
  const [xa, xb] = range('x');
  const [ya, yb] = range('y');
  const X = v => pad.l + ((v - xa) / (xb - xa)) * pw;
  const Y = v => pad.t + ph - ((v - ya) / (yb - ya)) * ph;

  ctx.strokeStyle = css('--border');
  ctx.fillStyle = css('--muted');
  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.l, pad.t, pw, ph);
  for (let i = 0; i <= 4; i++) {
    const vx = xa + ((xb - xa) * i) / 4;
    const vy = ya + ((yb - ya) * i) / 4;
    ctx.textAlign = 'center';
    ctx.fillText(vx.toFixed(Math.abs(xb - xa) < 5 ? 2 : 1), X(vx), h - 16);
    ctx.textAlign = 'right';
    ctx.fillText(vy.toFixed(Math.abs(yb - ya) < 5 ? 2 : 1), pad.l - 5, Y(vy) + 4);
  }
  ctx.textAlign = 'left';
  ctx.fillText(xName, pad.l, h - 3);
  ctx.save();
  ctx.translate(11, pad.t + ph / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yName, 0, 0);
  ctx.restore();

  for (const p of points) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 3.6, 0, Math.PI * 2);
    ctx.strokeStyle = labelColor(p.label);
    ctx.fillStyle = labelColor(p.label);
    ctx.globalAlpha = 0.75;
    if (p.test) { ctx.lineWidth = 1.6; ctx.stroke(); } else ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (marker) {
    ctx.fillStyle = css('--text');
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('★', X(marker.x) - 7, Y(marker.y) + 6);
  }
}
