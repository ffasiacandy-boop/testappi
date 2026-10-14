// Bundles src/index.js into dist/vto.js (readable) and dist/vto.min.js (minified, no source maps).
const path = require('path');
const esbuild = require('esbuild');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const common = {
  entryPoints: [path.join(__dirname, 'src/index.js')],
  bundle: true, format: 'iife', target: ['es2020'], sourcemap: false, legalComments: 'none',
  external: ['https://*'],
  define: { __VTO_API_URL__: JSON.stringify((process.env.SDK_API_URL || '').replace(/\/$/, '')) },
};
(async () => {
  await esbuild.build({ ...common, outfile: path.join(__dirname, 'dist/vto.js'), minify: false });
  await esbuild.build({ ...common, outfile: path.join(__dirname, 'dist/vto.min.js'), minify: true });
  console.log('SDK built: dist/vto.js, dist/vto.min.js');
})().catch((e) => { console.error(e); process.exit(1); });
