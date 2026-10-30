import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {AdditiveBlending,DoubleSide,Group,InstancedBufferAttribute,InstancedMesh,Matrix4,PlaneGeometry,Quaternion,ShaderMaterial,Vector3} from 'three';
import {rainCount,rainSample} from './welcomeOptics';
import {useWelcome} from './welcome';
import {welcomePlayback} from '../../../packages/shared/src/welcome';
import mapping from './data/vehicle-mapping.json';

export function WelcomeRain({model}:{model:Group}){
 const particles=useMemo(()=>{
  const geometry=new PlaneGeometry(1,1),power=new InstancedBufferAttribute(new Float32Array(rainCount*2),1);geometry.setAttribute('rainPower',power);
  const material=new ShaderMaterial({transparent:true,blending:AdditiveBlending,depthWrite:false,side:DoubleSide,toneMapped:false,vertexShader:`attribute float rainPower;varying vec2 vUv;varying float vPower;void main(){vUv=uv;vPower=rainPower;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;varying float vPower;void main(){vec2 d=abs(vUv-.5);float core=(1.-smoothstep(.30,.42,d.x))*(1.-smoothstep(.41,.49,d.y));float halo=.12*exp(-pow(d.x/.48,2.))*(1.-smoothstep(.4,.5,d.y));float a=(core+halo)*vPower;gl_FragColor=vec4(vec3(.66,.84,1.)*2.5,a);}`});
  const mesh=new InstancedMesh(geometry,material,rainCount*2);mesh.name='WELCOME_AIR_METEORS';mesh.frustumCulled=false;mesh.visible=false;mesh.userData.welcomeEmitter=true;
  return {mesh,geometry,material,power};
 },[]);
 useEffect(()=>{const root=model.getObjectByName('SU7_ROOT')!;root.add(particles.mesh);return()=>{particles.mesh.removeFromParent();particles.geometry.dispose();particles.material.dispose();};},[model,particles]);
 useFrame(({camera,gl})=>{
  const welcome=useWelcome.getState(),playback=welcomePlayback(welcome.snapshot,Date.now()+welcome.offset),elapsed=playback.elapsedMs,active=playback.active,root=model.getObjectByName('SU7_ROOT')!;
  particles.mesh.visible=active;if(!active){gl.domElement.setAttribute('data-welcome-rain',JSON.stringify({active:false,airParticles:0,groundProjectors:0}));return;}
  const eye=camera.position.clone().applyMatrix4(new Matrix4().copy(root.matrixWorld).invert()),records=[];
  for(const [index,side]of [-1,1].entries())for(let i=0;i<rainCount;i++){
   const p=rainSample(elapsed,i,side,playback.persistent),origin=new Vector3(...mapping.materialRoles.headlights[index===0?'left':'right'].lightPosition).add(new Vector3(0,0,-.025)),end=new Vector3(p.x,-.01,p.z);
   const progress=.08+.92*p.p,point=origin.clone().lerp(end,progress),axis=end.clone().sub(origin).normalize();
   const right=new Vector3().crossVectors(axis,eye.clone().sub(point)).normalize(),normal=new Vector3().crossVectors(right,axis).normalize(),q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right,axis,normal));
   particles.mesh.setMatrixAt(index*rainCount+i,new Matrix4().compose(point,q,new Vector3(.026,.26+.15*p.p,1)));particles.power.setX(index*rainCount+i,p.power*(welcome.snapshot?.brightness??1));
   if(i%7===0)records.push({side,position:point.toArray(),ndc:point.clone().applyMatrix4(root.matrixWorld).project(camera).toArray(),ground:[p.x,p.z],groundNdc:end.clone().applyMatrix4(root.matrixWorld).project(camera).toArray(),power:p.power});
  }
  particles.mesh.instanceMatrix.needsUpdate=true;particles.power.needsUpdate=true;
  gl.domElement.setAttribute('data-welcome-rain',JSON.stringify({active:true,airParticles:particles.mesh.count,groundProjectors:2,samples:records}));
 },.6);
 return null;
}
