/**
 * Castle symbols drawn on canvas at runtime (no external sprite dependency).
 *  castle-intact  — solid tower (surviving / in use)
 *  castle-ruin    — tower with broken top (ruin)
 *  castle-lost    — hollow mound (lost, demolished or earthwork only)
 *  castle-undated — small hollow diamond (record with no known construction date)
 */
import type { Map as MlMap } from 'maplibre-gl';

const SIZE = 36; // device pixels (pixelRatio 2 → 18 CSS px)

interface Colours {
  fill: string;
  ruin: string;
  stroke: string;
  halo: string;
}

const NORMAL: Colours = { fill: '#3b3226', ruin: '#7b6a52', stroke: '#2a231a', halo: '#f4eddc' };
const CONTRAST: Colours = { fill: '#000000', ruin: '#5a4a32', stroke: '#000000', halo: '#ffffff' };

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return [c, c.getContext('2d')!];
}

function towerPath(ctx: CanvasRenderingContext2D, broken: boolean) {
  const x0 = 9, x1 = 27, top = 8, base = 29;
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.lineTo(x0, top);
  // crenellations
  const merlons = [[9, 13], [16, 20], [23, 27]];
  ctx.lineTo(merlons[0][1], top);
  ctx.lineTo(merlons[0][1], top + 4);
  ctx.lineTo(merlons[1][0], top + 4);
  if (broken) {
    ctx.lineTo(merlons[1][0], top + 1);
    ctx.lineTo(19, top + 3);
    ctx.lineTo(21, top + 7);
    ctx.lineTo(24, top + 9);
    ctx.lineTo(x1, top + 12);
  } else {
    ctx.lineTo(merlons[1][0], top);
    ctx.lineTo(merlons[1][1], top);
    ctx.lineTo(merlons[1][1], top + 4);
    ctx.lineTo(merlons[2][0], top + 4);
    ctx.lineTo(merlons[2][0], top);
    ctx.lineTo(x1, top);
  }
  ctx.lineTo(x1, base);
  ctx.closePath();
}

function drawTower(c: Colours, broken: boolean) {
  const [, ctx] = canvas();
  ctx.lineJoin = 'round';
  towerPath(ctx, broken);
  ctx.strokeStyle = c.halo;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = broken ? c.ruin : c.fill;
  ctx.fill();
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // doorway
  ctx.fillStyle = c.halo;
  ctx.beginPath();
  ctx.arc(18, 25, 2.6, Math.PI, 0);
  ctx.rect(15.4, 25, 5.2, 4);
  ctx.fill();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function drawMound(c: Colours) {
  const [, ctx] = canvas();
  ctx.beginPath();
  ctx.moveTo(6, 27);
  ctx.quadraticCurveTo(18, 6, 30, 27);
  ctx.closePath();
  ctx.strokeStyle = c.halo;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = c.halo;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.setLineDash([3, 2]);
  ctx.strokeStyle = c.ruin;
  ctx.lineWidth = 2;
  ctx.stroke();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function drawDiamond(c: Colours) {
  const [, ctx] = canvas();
  ctx.beginPath();
  ctx.moveTo(18, 11);
  ctx.lineTo(25, 18);
  ctx.lineTo(18, 25);
  ctx.lineTo(11, 18);
  ctx.closePath();
  ctx.fillStyle = c.halo;
  ctx.fill();
  ctx.strokeStyle = c.ruin;
  ctx.lineWidth = 2;
  ctx.stroke();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

export function addCastleIcons(map: MlMap, highContrast: boolean) {
  const c = highContrast ? CONTRAST : NORMAL;
  const images: [string, ImageData][] = [
    ['castle-intact', drawTower(c, false)],
    ['castle-ruin', drawTower(c, true)],
    ['castle-lost', drawMound(c)],
    ['castle-undated', drawDiamond(c)],
  ];
  for (const [id, img] of images) {
    if (map.hasImage(id)) map.updateImage(id, img);
    else map.addImage(id, img, { pixelRatio: 2 });
  }
}

/** Data URL versions for the legend. */
export function iconDataUrl(kind: 'intact' | 'ruin' | 'lost' | 'undated', highContrast = false): string {
  const c = highContrast ? CONTRAST : NORMAL;
  const img = kind === 'intact' ? drawTower(c, false) : kind === 'ruin' ? drawTower(c, true) : kind === 'lost' ? drawMound(c) : drawDiamond(c);
  const [cv, ctx] = canvas();
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}
