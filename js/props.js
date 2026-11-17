// =============================================================================
//  props.js — photo-scanned street props from Poly Haven (CC0): metal trash
//  cans, a utility box, oil drums, an old tyre, trash bags and wooden crates.
//  Each model is loaded once (glTF, textures shrunk to 256 px by hand) and
//  drawn GPU-instanced at every placement. Collision is added by world.js.
// =============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from './textures.js';

export const PROP_MODELS = ['metal_trash_can', 'utility_box_01', 'barrel_03', 'old_tyre', 'trashbag', 'wooden_crate_02'];

export class Props {
  constructor(scene) {
    this.scene = scene;
    this.list = {};                               // model → [{x,y,z,yaw,s}]
    this.group = new THREE.Group();
    scene.add(this.group);
  }
  add(model, x, z, yaw = 0, s = 1, y = 0) { (this.list[model] || (this.list[model] = [])).push({ x, y, z, yaw, s }); }

  load(onDone) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((u) => assetURL(u));
    const loader = new GLTFLoader(manager);
    let left = 0;
    for (const name of Object.keys(this.list)) {
      left++;
      loader.load(`assets/models/${name}/${name}.gltf`, (gltf) => {
        this._instance(gltf.scene, this.list[name]);
        if (--left === 0 && onDone) onDone();
      }, undefined, () => { if (--left === 0 && onDone) onDone(); });
    }
  }

  _instance(root, places) {
    root.updateMatrixWorld(true);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const im = new THREE.InstancedMesh(g, o.material, places.length);
      places.forEach((it, i) => { M.compose(p.set(it.x, it.y, it.z), q.setFromAxisAngle(up, it.yaw), sc.setScalar(it.s)); im.setMatrixAt(i, M); });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    });
  }

  // Low graphics: swap the PBR materials for cheap Lambert ones (same textures)
  setQuality(level) {
    const pbr = level !== 'low';
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.pbr) o.userData.pbr = o.material;
      if (!pbr && !o.userData.lambert) {
        const m = o.userData.pbr;
        o.userData.lambert = new THREE.MeshLambertMaterial({ map: m.map, color: m.color });
      }
      o.material = pbr ? o.userData.pbr : o.userData.lambert;
    });
    this.level = level;
  }
}
