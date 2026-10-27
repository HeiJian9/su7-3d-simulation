import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3, type Material } from 'three';
import mapping from './data/window-mapping.json';
import { actualValues, completeExecutions, corners, useVehicle, windowPoses, type Corner } from './vehicle';

interface Binding {
  corner: Corner; control: Group; glass: Mesh; closed: Vector3; travel: Vector3; door: Group;
  clip: Plane; localClip: Plane; pick: Mesh; outline: LineSegments; originalMaterials: Material | Material[]; materials: Material[];
  companions: Array<{mesh:Mesh;original:Material|Material[];materials:Material[]}>;
}
export function WindowMechanism({ model }: { model: Group }) {
  const { camera, gl } = useThree();
  const bindings = useRef<Binding[]>([]);
  const interval = useRef(0);
  useEffect(() => {
    model.updateMatrixWorld(true);
    const items: Binding[] = [];
    const previousClipping = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    for (const corner of corners) {
      const config = mapping.windows[corner];
      const control = model.getObjectByName(config.node) as Group | undefined;
      const glass = model.getObjectByName(config.glass) as Mesh | undefined;
      const door = model.getObjectByName(config.parent) as Group | undefined;
      if (!control || !glass?.isMesh || !door) continue;
      const closed = control.position.clone();
      const plane = new Plane(new Vector3().fromArray(config.clipPlane), config.clipPlane[3]).normalize();
      const clip = plane.clone().applyMatrix4(door.matrixWorld);
      const originalMaterials = glass.material;
      const materials = (Array.isArray(glass.material) ? glass.material : [glass.material]).map((source) => {
        const material = source.clone(); material.clippingPlanes = [clip]; material.clipShadows = true;
        material.side = DoubleSide; material.depthWrite = false; return material;
      });
      glass.material = Array.isArray(originalMaterials) ? materials : materials[0];
      const companions=(config.companionGlass??[]).flatMap(name=>{
        const mesh=model.getObjectByName(name) as Mesh|undefined;if(!mesh?.isMesh)return [];
        const original=mesh.material;const materials=(Array.isArray(original)?original:[original]).map(source=>{const m=source.clone();m.clippingPlanes=[clip];m.side=DoubleSide;return m;});
        mesh.material=Array.isArray(original)?materials:materials[0];return [{mesh,original,materials}];
      });
      glass.userData.windowCorner = corner;
      const matrix = new Matrix4().copy(door.matrixWorld).invert().multiply(glass.matrixWorld);
      const pick = new Mesh(glass.geometry.clone(), new MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: DoubleSide }));
      pick.name = `WINDOW_${corner.toUpperCase()}_PICK`;
      pick.userData.windowCorner = corner; pick.matrixAutoUpdate = false; pick.matrix.copy(matrix); door.add(pick);
      const outline = new LineSegments(new EdgesGeometry(glass.geometry, 20), new LineBasicMaterial({ color: '#72dccb', transparent: true, opacity: .85 }));
      outline.matrixAutoUpdate = false; outline.matrix.copy(matrix); outline.visible = false; door.add(outline);
      windowPoses[corner] = 0;
      items.push({ corner, control, glass, closed, travel: new Vector3().fromArray(config.travel), door, clip, localClip: plane, pick, outline, originalMaterials, materials,companions });
    }
    bindings.current = items;
    useVehicle.getState().register(items.map((b) => b.corner));
    const raycaster = new Raycaster();
    const select = (event: Event) => {
      const { clientX, clientY } = (event as CustomEvent<{ clientX: number; clientY: number }>).detail;
      const rect = gl.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
      for (const hit of raycaster.intersectObject(model, true)) {
        if (!(hit.object instanceof Mesh)) continue;
        const corner = hit.object.userData.windowCorner as Corner | undefined;
        if (corner) { useVehicle.getState().select(corner); break; }
        const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
        if (materials.every((m) => m.transparent && m.opacity < .95)) continue;
        break;
      }
    };
    gl.domElement.addEventListener('su7:scene-click', select);
    return () => {
      bindings.current = []; useVehicle.getState().register([]);
      gl.domElement.removeEventListener('su7:scene-click', select); gl.localClippingEnabled = previousClipping;
      for (const b of items) {
        b.control.position.copy(b.closed); b.glass.material = b.originalMaterials; delete b.glass.userData.windowCorner;
        for(const c of b.companions){c.mesh.material=c.original;c.materials.forEach(m=>m.dispose());}
        b.materials.forEach((m) => m.dispose()); b.pick.removeFromParent(); b.pick.geometry.dispose(); (b.pick.material as Material).dispose();
        b.outline.removeFromParent(); (b.outline.geometry as BufferGeometry).dispose(); (b.outline.material as Material).dispose();
      }
    };
  }, [model, gl, camera]);
  useFrame((_, delta) => {
    const state = useVehicle.getState();
    const rect = gl.domElement.getBoundingClientRect();
    for (const b of bindings.current) {
      const target = state.preview[b.corner] ?? state.state.windows[b.corner].openness;
      const previous = windowPoses[b.corner];
      const value = Math.abs(target - previous) <= delta * 1.6 ? target : previous + Math.sign(target - previous) * delta * 1.6;
      windowPoses[b.corner] = value;
      actualValues[`window:${b.corner}:openness`] = value;
      b.control.position.copy(b.closed).addScaledVector(b.travel, value);
      b.clip.copy(b.localClip).applyMatrix4(b.door.matrixWorld);
      b.outline.visible = state.selected === b.corner;
      b.pick.geometry.computeBoundingBox();
      const screen = b.pick.geometry.boundingBox!.getCenter(new Vector3()).applyMatrix4(b.pick.matrixWorld).project(camera);
      gl.domElement.setAttribute(`data-window-${b.corner}-hitpoint`, `${((screen.x + 1) / 2 * rect.width).toFixed(1)},${((-screen.y + 1) / 2 * rect.height).toFixed(1)}`);
      gl.domElement.setAttribute(`data-window-${b.corner}-position`, b.control.position.toArray().map((n) => n.toFixed(6)).join(','));
      gl.domElement.setAttribute(`data-window-${b.corner}-openness`, value.toFixed(4));
    }
    completeExecutions();
    interval.current += delta;
    if (interval.current > .12) { interval.current = 0; state.sample(); }
  },-1);
  return null;
}
