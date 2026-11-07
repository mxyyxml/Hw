// =============================================================================
//  tools/build-play.mjs — makes play.html: ONE self-contained file with the
//  game code, three.js and the CSS inlined. It works by double-clicking
//  (file://), offline, and on networks that block CDNs.
//
//  Usage (needs Node.js):   npm install three@0.160.0 esbuild@0.24.0 @dimforge/rapier3d-compat@0.12.0
//                           node tools/build-play.mjs
// =============================================================================
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = await build({
  entryPoints: ['js/main.js'],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('css/style.css', 'utf8');

// embed every file in assets/ (textures, sky) as a data URI
const assets = {};
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jpe?g|png)$/i.test(f)) {
      const mime = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
      assets[p.split('\\').join('/')] = `data:${mime};base64,${readFileSync(p).toString('base64')}`;
    }
  }
};
walk('assets');
const assetScript = `<script>window.__LBS_ASSETS = ${JSON.stringify(assets)};</script>`;
let html = readFileSync('index.html', 'utf8');
html = html
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<!-- three\.js[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="js\/main\.js"><\/script>/, () => `${assetScript}\n<script>\n${js}\n</script>`);
writeFileSync('play.html', html);
console.log('play.html written:', (html.length / 1024).toFixed(0), 'KB');
