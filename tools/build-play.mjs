// =============================================================================
//  tools/build-play.mjs — makes play.html: ONE self-contained file with the
//  game code, three.js and the CSS inlined. It works by double-clicking
//  (file://), offline, and on networks that block CDNs.
//
//  Usage (needs Node.js):   npm install three@0.160.0 esbuild@0.24.0
//                           node tools/build-play.mjs
// =============================================================================
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const threePath = require.resolve('three').replace(/three\.cjs$/, 'three.module.js');

const out = await build({
  entryPoints: ['js/main.js'],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  alias: { three: threePath },
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('css/style.css', 'utf8');
let html = readFileSync('index.html', 'utf8');
html = html
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<!-- three\.js pinned[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="js\/main\.js"><\/script>/, () => `<script>\n${js}\n</script>`);
writeFileSync('play.html', html);
console.log('play.html written:', (html.length / 1024).toFixed(0), 'KB');
