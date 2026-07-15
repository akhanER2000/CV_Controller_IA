/* ============================================================================
   CORPUS · aurora.js — el shader del fondo vivo
   WebGL2 crudo, cero dependencias. fBm + domain warping.
   Minerales: pátina (dominante) · cobre y plata (atmósfera escasa) sobre grafito.
   API: CorpusAurora.mount({state}) · setState('calm'|'active') ·
        pause(reason) · resume(reason) · setStrength(n)
   Reglas: se pausa al enfocar un input (lo cablea motion.js), al ocultar la
   pestaña, y con prefers-reduced-motion cae al fallback estático de aurora.css.

   PORTE LITERAL de corpus-design/02-sistema/aurora.js — NO adaptar.
   ============================================================================ */
window.CorpusAurora=(function(){
'use strict';
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const VERT='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG=`#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uT;uniform vec2 uMouse;uniform float uStr;uniform float uAct;
out vec4 o;
float h21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(.8,.6,-.6,.8);
  for(int k=0;k<5;k++){v+=a*vn(p);p=m*p*2.02;a*=.5;}return v;}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
  vec2 p=uv*1.4+uMouse*.22;
  float t=uT;
  vec2 q=vec2(fbm(p+t*.06),fbm(p+vec2(5.2,1.3)-t*.045));
  vec2 r=vec2(fbm(p+3.1*q+vec2(1.7,9.2)+t*.11),fbm(p+3.1*q+vec2(8.3,2.8)-t*.09));
  float f=fbm(p+2.9*r);
  float mCu=smoothstep(.58,.86,fbm(p*.62+r*1.4+vec2(11.3,4.7)));
  float mAg=smoothstep(.62,.90,fbm(p*.85-q*1.1+vec2(3.1,17.9)));
  vec3 patina=vec3(.263,.702,.627);   /* #43B3A0 */
  vec3 deep  =vec3(.090,.340,.290);   /* pátina profunda */
  vec3 copper=vec3(.722,.451,.200);   /* #B87333 — solo atmósfera */
  vec3 silver=vec3(.678,.714,.761);   /* #ADB6C2 — solo atmósfera */
  vec3 col=mix(deep,patina,smoothstep(.25,.95,f));
  col=mix(col,copper,mCu*.38);
  col=mix(col,silver,mAg*.24);
  float a=smoothstep(.38,1.05,f+.10*uAct*sin(t*.9+f*6.2832));
  a*=uStr*.34*(1.+.45*uAct);
  a*=smoothstep(1.6,.35,length(uv));
  o=vec4(col*a,a);
}`;
const S={el:null,gl:null,raf:0,t:7,last:0,speed:.35,speedT:.35,act:0,actT:0,
  mx:0,my:0,mxT:0,myT:0,str:.55,paused:new Set(),U:null,ok:false};
function readStrength(){
  const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--aurora-strength'));
  if(!isNaN(v))S.str=v;
}
function compile(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn('aurora shader:',gl.getShaderInfoLog(s));return null}return s}
function fallback(){
  const d=document.createElement('div');d.className='c-aurora-fallback';S.el.appendChild(d);
}
function mount(opts){
  opts=opts||{};
  if(S.el)return api;
  let el=document.querySelector('.c-aurora');
  if(!el){el=document.createElement('div');el.className='c-aurora';el.setAttribute('aria-hidden','true');
    document.body.prepend(el)}
  S.el=el;readStrength();
  if(RM.matches){fallback();return api}
  const cv=document.createElement('canvas');el.appendChild(cv);
  const gl=cv.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:true});
  if(!gl){cv.remove();fallback();return api}
  const vs=compile(gl,gl.VERTEX_SHADER,VERT),fs=compile(gl,gl.FRAGMENT_SHADER,FRAG);
  if(!vs||!fs){cv.remove();fallback();return api}
  const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){cv.remove();fallback();return api}
  gl.useProgram(pr);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  S.gl=gl;S.cv=cv;S.ok=true;
  S.U={res:gl.getUniformLocation(pr,'uRes'),t:gl.getUniformLocation(pr,'uT'),
    m:gl.getUniformLocation(pr,'uMouse'),s:gl.getUniformLocation(pr,'uStr'),a:gl.getUniformLocation(pr,'uAct')};
  resize();addEventListener('resize',resize,{passive:true});
  addEventListener('pointermove',e=>{S.mxT=(e.clientX/innerWidth-.5)*2;S.myT=-(e.clientY/innerHeight-.5)*2},{passive:true});
  document.addEventListener('visibilitychange',()=>{document.hidden?pause('hidden'):resume('hidden')});
  setState(opts.state||'calm');
  S.last=performance.now();loop(S.last);
  return api;
}
function resize(){
  if(!S.ok)return;
  const SCALE=.55,dpr=Math.min(devicePixelRatio||1,2);
  S.cv.width=Math.max(2,Math.round(innerWidth*dpr*SCALE));
  S.cv.height=Math.max(2,Math.round(innerHeight*dpr*SCALE));
  S.gl.viewport(0,0,S.cv.width,S.cv.height);
}
function frame(now){
  const gl=S.gl,dt=Math.min(.05,(now-S.last)/1000);S.last=now;
  S.speed+=(S.speedT-S.speed)*Math.min(1,dt*2);
  S.act+=(S.actT-S.act)*Math.min(1,dt*2);
  S.mx+=(S.mxT-S.mx)*Math.min(1,dt*3);S.my+=(S.myT-S.my)*Math.min(1,dt*3);
  S.t+=dt*S.speed;
  gl.uniform2f(S.U.res,S.cv.width,S.cv.height);
  gl.uniform1f(S.U.t,S.t);
  gl.uniform2f(S.U.m,S.mx,S.my);
  gl.uniform1f(S.U.s,S.str);
  gl.uniform1f(S.U.a,S.act);
  gl.drawArrays(gl.TRIANGLES,0,3);
}
function loop(now){
  if(!S.ok||S.paused.size)return;
  frame(now);
  S.raf=requestAnimationFrame(loop);
}
function pause(reason){
  if(!S.ok)return;
  S.paused.add(reason||'user');
  cancelAnimationFrame(S.raf);
}
function resume(reason){
  if(!S.ok)return;
  S.paused.delete(reason||'user');
  if(!S.paused.size){S.last=performance.now();S.raf=requestAnimationFrame(loop)}
}
/* calm: la aurora respira. active: la máquina está pensando (solo ingesta). */
function setState(name){
  if(name==='active'){S.speedT=1.5;S.actT=1}
  else{S.speedT=.35;S.actT=0}
  if(S.el)S.el.dataset.state=name;
}
function setStrength(v){document.documentElement.style.setProperty('--aurora-strength',v);S.str=v}
const api={mount,setState,pause,resume,setStrength,get running(){return S.ok&&!S.paused.size}};
return api;
})();
