import { GarmentAdapter } from './base.js';

const LS = 11, RS = 12, LH = 23, RH = 24, LK = 25, RK = 26, LA = 27, RA = 28;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

class TorsoAdapter extends GarmentAdapter {
  fit(pose) {
    const ls = pose.get(LS), rs = pose.get(RS);
    if (!ls || !rs) return null;
    const [a, b] = ls.x < rs.x ? [ls, rs] : [rs, ls];
    const sw = dist(a, b);
    if (sw < pose.width * 0.06) return null;
    const ang = angle(a, b), shoulders = mid(a, b);
    const lh = pose.get(LH), rh = pose.get(RH);
    const hips = lh && rh ? mid(lh, rh) : { x: shoulders.x - Math.sin(ang) * sw * 1.35, y: shoulders.y + Math.cos(ang) * sw * 1.35 };
    const vx = hips.x - shoulders.x, vy = hips.y - shoulders.y;
    const torsoLength = Math.max(sw * 1.05, Math.hypot(vx, vy));
    const width = sw * this.constructor.widthFactor * this.cal.widthRatio;
    return {
      cx: shoulders.x + vx * this.constructor.anchorAlong + Math.cos(ang) * this.cal.offsetX * width - Math.sin(ang) * this.cal.offsetY * width,
      cy: shoulders.y + vy * this.constructor.anchorAlong + Math.sin(ang) * this.cal.offsetX * width + Math.cos(ang) * this.cal.offsetY * width,
      width: Math.max(width, torsoLength * this.constructor.minWidthFromLength), angle: ang,
    };
  }
}

export class ShirtAdapter extends TorsoAdapter {
  static category = 'shirt'; static widthFactor = 1.95; static anchorAlong = 0.10; static minWidthFromLength = 0.72;
  static defaults = { anchorX: 0.5, anchorY: 0.12, heightRatio: 1.08 };
}
export class DressAdapter extends TorsoAdapter {
  static category = 'dress'; static widthFactor = 2.15; static anchorAlong = 0.12; static minWidthFromLength = 0.86;
  static defaults = { anchorX: 0.5, anchorY: 0.10, heightRatio: 1.35 };
}
export class KurtiAdapter extends TorsoAdapter {
  static category = 'kurti'; static widthFactor = 2.0; static anchorAlong = 0.12; static minWidthFromLength = 0.82;
  static defaults = { anchorX: 0.5, anchorY: 0.10, heightRatio: 1.25 };
}
export class SareeAdapter extends TorsoAdapter {
  static category = 'saree'; static widthFactor = 2.35; static anchorAlong = 0.08; static minWidthFromLength = 0.95;
  static defaults = { anchorX: 0.5, anchorY: 0.08, heightRatio: 1.55 };
}

export class PantAdapter extends GarmentAdapter {
  static category = 'pant';
  static defaults = { anchorX: 0.5, anchorY: 0.05, heightRatio: 1.0 };
  fit(pose) {
    const lh = pose.get(LH), rh = pose.get(RH);
    if (!lh || !rh) return null;
    const hips = mid(lh, rh), hipWidth = dist(lh, rh);
    if (hipWidth < pose.width * 0.045) return null;
    const lk = pose.get(LK), rk = pose.get(RK);
    const la = pose.get(LA), ra = pose.get(RA);
    const knees = lk && rk ? mid(lk, rk) : null;
    const ankles = la && ra ? mid(la, ra) : null;
    let lowerLength = knees ? dist(hips, knees) * 2 : hipWidth * 2.5;
    if (ankles) lowerLength = Math.max(lowerLength, dist(hips, ankles));
    const a = knees ? angle(hips, knees) - Math.PI / 2 : 0;
    return {
      cx: hips.x + Math.cos(a) * this.cal.offsetX * hipWidth - Math.sin(a) * this.cal.offsetY * hipWidth,
      cy: hips.y + Math.sin(a) * this.cal.offsetX * hipWidth + Math.cos(a) * this.cal.offsetY * hipWidth,
      width: Math.max(hipWidth * 1.8, lowerLength * 0.55) * this.cal.widthRatio,
      angle: a,
    };
  }
}
