import { GarmentAdapter } from './base.js';

const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
// Pose landmarks sit on the shoulder joints; a T-shirt (with sleeves) is wider than that distance.
const WIDTH_FACTOR = 1.75;

export class TShirtAdapter extends GarmentAdapter {
  static category = 'tshirt';

  /**
   * Body anchor = point on the torso line at `anchorY` (0 = shoulders, 1 = hips). The garment image point
   * (anchorX, anchorY) is pinned to it, so the garment scales, rotates and moves with the torso.
   */
  fit(pose) {
    const ls = pose.get(L_SHOULDER), rs = pose.get(R_SHOULDER);
    if (!ls || !rs) return null;
    const [a, b] = ls.x < rs.x ? [ls, rs] : [rs, ls];       // a = left on screen
    const dx = b.x - a.x, dy = b.y - a.y;
    const shoulderWidth = Math.hypot(dx, dy);
    if (shoulderWidth < pose.width * 0.08) return null;     // too far away / not a usable detection
    const angle = Math.atan2(dy, dx);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    // Torso direction: shoulders -> hips when visible, otherwise perpendicular to the shoulder line.
    let tx = -Math.sin(angle) * shoulderWidth * 1.45, ty = Math.cos(angle) * shoulderWidth * 1.45;
    const lh = pose.get(L_HIP), rh = pose.get(R_HIP);
    if (lh && rh) {
      const vx = (lh.x + rh.x) / 2 - mid.x, vy = (lh.y + rh.y) / 2 - mid.y;
      if (Math.hypot(vx, vy) > shoulderWidth * 0.6) { tx = vx; ty = vy; }
    }
    const width = shoulderWidth * WIDTH_FACTOR * this.cal.widthRatio;
    const { anchorY, offsetX, offsetY } = this.cal;
    const ux = Math.cos(angle), uy = Math.sin(angle);          // along shoulders
    const dxn = -Math.sin(angle), dyn = Math.cos(angle);       // "down" in the garment frame
    return {
      cx: mid.x + tx * anchorY + (ux * offsetX + dxn * offsetY) * width,
      cy: mid.y + ty * anchorY + (uy * offsetX + dyn * offsetY) * width,
      width, angle,
    };
  }
}
