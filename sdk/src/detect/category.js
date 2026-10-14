// Garment category detection from text (product name, breadcrumbs, schema.org category, URL, image alt/filename).
// Returns one of: tshirt | shirt | pant | saree | dress | kurti | chudidar  (or null when nothing matches).
const RULES = [
  ['kurti', /\b(kurti|kurtis|kurta|kurtas|anarkali|salwar|salwar\s*kameez|churidar|chudidar|chudithar|patiala|sharara)\b/],
  ['saree', /\b(saree|sarees|sari|saris|sarong|lehenga\s*saree|pattu|kanjeevaram|kanchipuram|banarasi)\b/],
  ['pant', /\b(pant|pants|trouser|trousers|jeans|jean|denim|jogger|joggers|chino|chinos|legging|leggings|palazzo|cargo|cargos|track\s*pant|bottom\s*wear|bottoms|slacks|shorts|jeggings)\b/],
  ['dress', /\b(dress|dresses|gown|gowns|frock|frocks|maxi|jumpsuit|midi|bodycon)\b/],
  ['tshirt', /\b(t[\s-]?shirt|t[\s-]?shirts|tshirt|tshirts|tee|tees|polo|polos|tank\s*top|tank|sweatshirt|hoodie|hoodies|henley|crop\s*top|top|tops|jersey)\b/],
  ['shirt', /\b(shirt|shirts|blouse|blouses|kurta\s*shirt|flannel|oxford)\b/],
];

const WEIGHTS = { name: 4, category: 3, breadcrumb: 3, url: 1.5, alt: 1 };

export function classifyText(parts) {
  const scores = {};
  for (const [source, raw] of Object.entries(parts)) {
    const text = String(raw || '').toLowerCase().replace(/[_/+]+/g, ' ');
    if (!text.trim()) continue;
    for (const [cat, re] of RULES) {
      if (re.test(text)) scores[cat] = (scores[cat] || 0) + (WEIGHTS[source] || 1);
    }
  }
  // "t-shirt" also contains the word "shirt"; make sure the more specific tshirt rule wins over plain shirt.
  if (scores.tshirt && scores.shirt && scores.tshirt >= scores.shirt * 0.5) delete scores.shirt;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}
