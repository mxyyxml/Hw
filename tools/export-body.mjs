// Writes the game's body mesh (male & female shapes, with the skin UVs) as OBJ
// for Blender: node tools/export-body.mjs <out-folder>
import fs from 'fs';
import { HUMAN } from '../js/humanData.js';
const dec = (b64, T) => { const b = Buffer.from(b64, 'base64'); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const P = dec(HUMAN.positions, Float32Array), FD = dec(HUMAN.femaleDelta, Int16Array);
const I = dec(HUMAN.indices, Uint16Array), CUV = dec(HUMAN.cornerUV, Uint16Array), UV = dec(HUMAN.uv, Float32Array);
const out = process.argv[2];
for (const shape of ['male', 'female']) {
  let s = '';
  for (let i = 0; i < P.length; i += 3) {
    const d = shape === 'female' ? [FD[i], FD[i + 1], FD[i + 2]].map((v) => v / 1000) : [0, 0, 0];
    s += `v ${P[i] + d[0]} ${P[i + 1] + d[1]} ${P[i + 2] + d[2]}\n`;
  }
  for (let i = 0; i < UV.length; i += 2) s += `vt ${UV[i]} ${UV[i + 1]}\n`;
  for (let k = 0; k < I.length; k += 3) s += `f ${I[k] + 1}/${CUV[k] + 1} ${I[k + 1] + 1}/${CUV[k + 1] + 1} ${I[k + 2] + 1}/${CUV[k + 2] + 1}\n`;
  fs.writeFileSync(`${out}/skin_${shape}.obj`, s);
}
