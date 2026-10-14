# Integration guide (for your clients)

Add this one line before `</body>` on every page of the site (or in the theme footer):

```html
<script src="https://YOUR-CDN/vto.js" data-api-key="vto_xxxxxxxxxxxxxxxx" defer></script>
```

That is all. On every product page a **Virtual Try-On** button appears next to "Add to Cart". The product name, price,
image and garment type (t-shirt / pant / saree ...) are read from the page automatically.

## Requirements
* The site's domain must be added to the client by the administrator.
* HTTPS (camera access requires it).
* Best results: product pages with schema.org `Product` JSON-LD (most Shopify / WooCommerce / Magento themes have it) and a clean, front-facing garment image on a plain background.
* If you use a Content-Security-Policy: allow `script-src` + `connect-src` for the SDK/API host, `https://cdn.jsdelivr.net`, `https://storage.googleapis.com`; `worker-src blob:`, `'wasm-unsafe-eval'`.

## Optional attributes on the script tag
| Attribute | Meaning |
|---|---|
| `data-button-text` | Button label (default "Virtual Try-On") |
| `data-button-color` | Hex colour, e.g. `#e11d48` |
| `data-selector` | CSS selector; the button is inserted right after this element |
| `data-position="floating"` | Floating button at the bottom-right instead of next to Add to Cart |
| `data-auto="false"` | Disable auto mode and call `VirtualTryOn.init({ apiKey })` yourself |

## Manual override (rarely needed)
```js
VirtualTryOn.init({ apiKey: "vto_...", product: { category: "saree", garmentImage: "https://.../saree.png" }, trigger: "#my-button" });
```
Anything you leave out of `product` is still detected from the page.

## Debugging
Run `await VirtualTryOn.detect()` in the browser console to see what was detected (name, price, image, category, and whether the category came from text or from the image).

## What shoppers see
| Situation | Result |
|---|---|
| API key disabled / invalid | No button is shown |
| Expired | Virtual Try-On access has expired. Please contact the store. |
| Domain not allowed | Virtual Try-On is not configured for this website. |
| Camera permission denied | Camera access is required for Virtual Try-On. Please allow camera permission and try again. |
