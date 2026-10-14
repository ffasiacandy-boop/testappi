import { TShirtAdapter } from './tshirt.js';
import { ShirtAdapter, PantAdapter, SareeAdapter, DressAdapter, KurtiAdapter } from './categories.js';

// These are browser-side 2D garment overlays anchored to pose landmarks, not cloth-physics 3D simulation.
const registry = {
  tshirt: TShirtAdapter,
  shirt: ShirtAdapter,
  pant: PantAdapter,
  pants: PantAdapter,
  saree: SareeAdapter,
  dress: DressAdapter,
  kurti: KurtiAdapter,
  chudidar: KurtiAdapter,
};
export const getAdapter = (category) => registry[String(category || '').toLowerCase()] || null;
export const supportedCategories = () => [...new Set(Object.keys(registry))];
