import {CanvasTexture,HalfFloatType,Matrix4,ShaderMaterial,Vector3,WebGLRenderTarget} from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';

export const rainCount=42;
export function rainSample(ms:number,index:number,side:number,persistent=false){
 const n=index+3,seed=((n*n*n*17+n*31)%997)/997,t=ms/1000,p=((t*.64+seed)%1+1)%1;
 const lane=((n*n*37+n*113+17)%991)/991;
 const x=side*(.25+lane*1.7)*(.65+p*.35),z=-2.85-p*5.4;
 const envelope=Math.min(1,Math.max(0,t/.22))*(persistent?1:Math.min(1,Math.max(0,(4.8-t)/.8)));
 return {x,z,p,power:envelope*Math.pow(Math.sin(p*Math.PI),.45)};
}
/** Native vector mark: rounded white badge, dark mi cutout, no text substitution. */
export function miTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d')!;
 c.fillStyle='#000';c.fillRect(0,0,512,512);c.fillStyle='#fff';c.beginPath();c.roundRect(60,60,392,392,105);c.fill();
 c.save();c.translate(60,60);c.scale(3.92,3.92);c.fillStyle='#000';
 const mark=new Path2D('M25 27 H50 Q60 27 60 37 V70 H51 V38 Q51 36 49 36 H34 V70 H25 Z M40 45 H48 V70 H40 Z M67 27 H76 V70 H67 Z');c.fill(mark);c.restore();
 const texture=new CanvasTexture(canvas);texture.anisotropy=4;return texture;
}
/** Pre-warp a physical gobo so its oblique projection is square on the ground. */
export function createWelcomeGobos(logo:CanvasTexture){
 const material=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{logo:{value:logo},inverseLight:{value:new Matrix4()},rootInverse:{value:new Matrix4()},origin:{value:new Vector3()},center:{value:new Vector3()},side:{value:1},mode:{value:0},time:{value:0}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`varying vec2 vUv;uniform sampler2D logo;uniform mat4 inverseLight,rootInverse;uniform vec3 origin,center;uniform float side,time;uniform int mode;
void main(){vec4 farPoint=inverseLight*vec4(vUv*2.-1.,1.,1.);vec3 ray=farPoint.xyz/farPoint.w-origin;
 if(ray.y>=-.0001){gl_FragColor=vec4(0.);return;}float distance=(-.0145-origin.y)/ray.y;
 vec3 p=(rootInverse*vec4(origin+ray*distance,1.)).xyz;float glow=0.;
 if(mode==0){vec2 d=vec2(p.z-center.z,p.x-center.x),uv=-d*side/.30+.5;
 float radius=length(d);glow=.035*exp(-dot(d,d)/.042)*(1.-smoothstep(.23,.33,radius));
 if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.))))glow+=texture2D(logo,uv).r;}
 else{for(int i=0;i<42;i++){float n=float(i)+3.,seed=mod(n*n*n*17.+n*31.,997.)/997.,progress=fract(time*.64+seed);
 float lane=mod(n*n*37.+n*113.+17.,991.)/991.;float x=side*(.25+lane*1.7)*(.65+progress*.35),z=-2.85-progress*5.4;
 float dx=abs(p.x-x),dz=p.z-z;
 float rectangle=(1.-smoothstep(.014,.025,dx))*(1.-smoothstep(.15,.19,abs(dz-.12)));
 float halo=.13*exp(-pow(dx/.065,2.)-pow((dz-.12)/.27,2.));
 glow=max(glow,(rectangle+halo)*pow(sin(progress*3.141593),.45));}}
 gl_FragColor=vec4(vec3(glow),1.);}`});
 return {material,quad:new FullScreenQuad(material),targets:Array.from({length:6},(_,i)=>new WebGLRenderTarget(i<4?512:384,i<4?512:384,{depthBuffer:false,type:HalfFloatType})),dispose(){material.dispose();this.quad.dispose();this.targets.forEach(t=>t.dispose());}};
}
