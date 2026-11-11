'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const dest = path.join(root, 'www');
fs.mkdirSync(dest, {recursive: true});
const files = [
  'index.html', 'privacy.html', 'planner.html', 'settings.html',
  'styles.css', 'ui.css', 'math.js', 'share.js', 'regions.js', 'csv.js',
  'theme.js', 'version.js', 'app.js', 'entitlement.js', 'pro-core.js', 'pro.js',
  'planner.js', 'settings.js', 'billing-ui.js', 'pwa.js', 'sw.js', 'manifest.webmanifest'
];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(dest, file));
fs.cpSync(path.join(root, 'icons'), path.join(dest, 'icons'), {recursive: true});
fs.cpSync(path.join(root, 'data'), path.join(dest, 'data'), {recursive: true});

let bundled = false;
try {
  require('esbuild').buildSync({
    entryPoints: [path.join(root, 'native-bridge.mjs')],
    bundle: true,
    format: 'iife',
    outfile: path.join(dest, 'native-bridge.js'),
    minify: true
  });
  bundled = true;
} catch (error) {
  console.warn('native-bridge.js was not bundled (' + error.message + '). The Android app needs esbuild and the Capacitor packages before a device build.');
}

const billingTag = '<script defer src="billing-ui.js"></script>';
for (const file of ['index.html', 'planner.html', 'settings.html']) {
  let html = fs.readFileSync(path.join(dest, file), 'utf8');
  if (bundled && !html.includes('native-bridge.js')) html = html.replace('<head>', '<head><script src="native-bridge.js"></script>');
  if (!html.includes('billing-ui.js')) {
    if (html.includes('</body>')) html = html.replace('</body>', billingTag + '</body>');
    else throw Error(file + ' has no </body>; update sync-web.js');
  }
  fs.writeFileSync(path.join(dest, file), html);
}
console.log('Copied app assets to www. Purchase UI is injected only into that copy.');
