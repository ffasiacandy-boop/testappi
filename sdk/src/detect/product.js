// Reads the product (name, price, image, id, category hints) straight from the page the shopper is viewing.
// Sources, best first: schema.org JSON-LD -> Open Graph / product meta tags -> microdata -> visible DOM.
import { classifyText } from './category.js';

const CURRENCY_RE = /(?:₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP|AED|SAR)\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:₹|Rs\.?|INR)/i;
const text = (el) => (el && (el.textContent || '').replace(/\s+/g, ' ').trim()) || '';
const meta = (sel) => { const m = document.querySelector(sel); return m ? (m.getAttribute('content') || '').trim() : ''; };
const abs = (u) => { try { return u ? new URL(u, location.href).href : ''; } catch { return ''; } };
const isTypeOf = (n, t) => { const x = n && n['@type']; return Array.isArray(x) ? x.includes(t) : x === t; };

function jsonLdProducts() {
  const found = [];
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    if (isTypeOf(node, 'Product') || isTypeOf(node, 'ProductGroup')) found.push(node);
    if (node['@graph']) visit(node['@graph'], depth + 1);
    if (node.mainEntity) visit(node.mainEntity, depth + 1);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try { visit(JSON.parse(s.textContent), 0); } catch { /* malformed JSON-LD */ }
  });
  return found;
}

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
function ldImage(p) {
  let i = firstOf(p.image);
  if (i && typeof i === 'object') i = i.url || i.contentUrl;
  return typeof i === 'string' ? i : '';
}
function ldOffer(p) {
  let o = firstOf(p.offers);
  if (!o || typeof o !== 'object') return {};
  if (o.priceSpecification) { const ps = firstOf(o.priceSpecification); if (ps && ps.price !== undefined) o = { ...o, price: ps.price, priceCurrency: ps.priceCurrency || o.priceCurrency }; }
  const price = o.price !== undefined ? o.price : o.lowPrice;
  return { price: price !== undefined ? String(price) : '', currency: o.priceCurrency || '' };
}

export function formatPrice(price, currency) {
  const n = Number(String(price).replace(/,/g, ''));
  if (!price || !Number.isFinite(n)) return String(price || '');
  if (currency) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch { /* unknown currency */ } }
  return String(price);
}

function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function domPrice() {
  const sel = '[itemprop="price"],[class*="price" i],[id*="price" i],[data-price]';
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el) || el.closest('[class*="related" i],[class*="recommend" i],[class*="carousel" i],footer,nav')) continue;
    const c = el.getAttribute('content') || el.getAttribute('data-price');
    if (c && /\d/.test(c)) return { price: c, currency: '' };
    const m = text(el).match(CURRENCY_RE);
    if (m) return { price: m[0].trim(), currency: '' };
  }
  return { price: '', currency: '' };
}

function domImage(name) {
  let best = null, bestArea = 0;
  const words = String(name || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  for (const img of document.images) {
    if (!visible(img) || img.closest('header,footer,nav,[class*="related" i],[class*="recommend" i],[class*="thumb" i]')) continue;
    const r = img.getBoundingClientRect();
    let area = r.width * r.height;
    if (r.width < 120 || r.height < 120) continue;
    const alt = (img.alt || '').toLowerCase();
    if (words.some((w) => alt.includes(w))) area *= 1.5;
    if (area > bestArea) { bestArea = area; best = img; }
  }
  return best ? (best.currentSrc || best.src) : '';
}

const ADD_TO_CART = /add[\s_-]*to[\s_-]*(cart|bag|basket)|buy[\s_-]*(it[\s_-]*)?now|add[\s_-]*to[\s_-]*trolley/i;
export function findCartButton() {
  const nodes = document.querySelectorAll('button,input[type="submit"],input[type="button"],a[role="button"],a.btn,a[class*="button" i],[class*="add-to-cart" i],[id*="add-to-cart" i],[name="add"]');
  for (const n of nodes) {
    if (!visible(n)) continue;
    const label = `${text(n)} ${n.value || ''} ${n.getAttribute('aria-label') || ''} ${n.id} ${n.className && n.className.baseVal === undefined ? n.className : ''} ${n.name || ''}`;
    if (ADD_TO_CART.test(label)) return n;
  }
  return null;
}

/** True when the current page is a single-product page (not a listing / home / cart). */
export function looksLikeProductPage() {
  if (jsonLdProducts().length === 1) return true;
  if (/product/i.test(meta('meta[property="og:type"]')) || meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]')) return true;
  if (document.querySelector('[itemtype*="schema.org/Product" i]')) return true;
  // Fallback heuristic for sites without structured data: an "add to cart" button + one h1 + a price on the page.
  return !!(findCartButton() && document.querySelectorAll('h1').length >= 1 && domPrice().price);
}

export function extractProduct() {
  const ld = jsonLdProducts()[0] || null;
  const o = ld ? ldOffer(ld) : {};
  const h1 = text(document.querySelector('h1'));
  const name = (ld && ld.name) || meta('meta[property="og:title"]') || text(document.querySelector('[itemprop="name"]')) || h1 || document.title || '';
  let price = o.price || meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]') || (document.querySelector('[itemprop="price"]') || {}).content || '';
  let currency = o.currency || meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]');
  if (!price) ({ price, currency } = domPrice());
  const cleanName = String(name).replace(/\s*\|\s*[^|]{1,40}$/, '').trim().slice(0, 150);
  const image = abs((ld && ldImage(ld)) || meta('meta[property="og:image:secure_url"]') || meta('meta[property="og:image"]') || meta('meta[itemprop="image"]') || (document.querySelector('[itemprop="image"]') || {}).src || domImage(cleanName));
  const crumbs = [...document.querySelectorAll('[class*="breadcrumb" i] a,[class*="breadcrumb" i] li,nav[aria-label*="breadcrumb" i] a')].map(text).join(' ');
  const ldCat = ld ? [ld.category, ld.name, ld.description && String(ld.description).slice(0, 200)].filter(Boolean).join(' ') : '';
  const alt = (() => { const im = [...document.images].find((i) => abs(i.currentSrc || i.src) === image); return im ? im.alt : ''; })();
  const textCategory = classifyText({ name: cleanName, category: `${(ld && ld.category) || ''} ${meta('meta[property="product:category"]')}`, breadcrumb: crumbs, url: decodeURIComponent(location.pathname), alt: `${alt} ${image.split('/').pop()}` });
  const id = (ld && (ld.sku || ld.productID || ld.mpn)) || meta('meta[property="product:retailer_item_id"]') || (location.pathname.split('/').filter(Boolean).pop() || 'product');
  return {
    id: String(id).slice(0, 64), name: cleanName || 'Product', price: formatPrice(price, currency), garmentImage: image,
    category: textCategory, categorySource: textCategory ? 'text' : null,
    _ld: !!ld, _ldCat: ldCat,
  };
}
