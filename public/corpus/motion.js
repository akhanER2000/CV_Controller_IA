/* ============================================================================
   CORPUS · motion.js — utilidades de movimiento
   IntersectionObserver (solo documentos de lectura) · escalonado con tope ·
   wordReveal/charReveal · contadores · EL shimmer (autolimitado) · rayos-X ·
   pausa de aurora al escribir · spotlight de tarjetas.
   Con prefers-reduced-motion cada utilidad degrada a su equivalencia
   documentada en motion.md: pierde el movimiento, nunca la información.

   PORTE LITERAL de corpus-design/02-sistema/motion.js — NO adaptar.
   ============================================================================ */
window.CorpusMotion=(function(){
'use strict';
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const rm=()=>RM.matches;
const raf2=fn=>requestAnimationFrame(()=>requestAnimationFrame(fn));

/* Muestra un elemento [data-reveal] (o un .c-divider) ya presente en el DOM */
function show(el){el.setAttribute('data-visible','')}

/* Reveal de montaje: marca y dispara en el siguiente frame */
function reveal(el,delay){
  el.setAttribute('data-reveal',el.getAttribute('data-reveal')||'');
  if(delay)el.style.setProperty('--d',delay+'ms');
  raf2(()=>show(el));
}

/* Escalonado con tope: step ms entre hermanos, cap items máximo y el resto
   de golpe (con 100 items, escalonarlos todos es tortura, no magia). */
function stagger(el,o){
  o=o||{};const step=o.step??80,cap=o.cap??24,base=o.base??0;
  const kids=o.items||el.children;
  let i=0;
  for(const k of kids){
    k.setAttribute('data-reveal',k.getAttribute('data-reveal')||'soft');
    k.style.setProperty('--d',(base+Math.min(i,cap)*step)+'ms');i++;
  }
  raf2(()=>{for(const k of kids)show(k)});
}

/* IO — PERMITIDO SOLO en documentos largos de lectura. Nunca en la app. */
function io(scope){
  const els=(scope||document).querySelectorAll('[data-io]');
  if(rm()){els.forEach(show);return}
  const ob=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){show(e.target);ob.unobserve(e.target)}
  }),{rootMargin:'0px 0px -8% 0px'});
  els.forEach(e=>{e.setAttribute('data-reveal',e.getAttribute('data-reveal')||'');ob.observe(e)});
}

/* wordReveal / charReveal — titulares ceremoniales. Con reduce-motion no
   se fragmenta el texto: queda intacto y visible. */
function split(el,mode){
  if(rm())return;
  let i=0;
  const walk=node=>{
    [...node.childNodes].forEach(ch=>{
      if(ch.nodeType===3){
        const frag=document.createDocumentFragment();
        const parts=mode==='ch'?[...ch.textContent]:ch.textContent.split(/(\s+)/);
        parts.forEach(p=>{
          if(!p)return;
          if(/^\s+$/.test(p)){frag.appendChild(document.createTextNode(p));return}
          const s=document.createElement('span');
          s.className=mode==='ch'?'c-ch':'c-w';
          s.style.setProperty('--i',i++);s.textContent=p;
          frag.appendChild(s);
        });
        node.replaceChild(frag,ch);
      }else if(ch.nodeType===1)walk(ch);
    });
  };
  walk(el);
}
const words=el=>split(el,'w');
const chars=el=>split(el,'ch');

/* Contador honesto: anima hacia un número REAL. Jamás inventes el destino. */
function counter(el,to,o){
  o=o||{};
  const fmt=o.fmt||(n=>Math.round(n).toLocaleString('es-CL'));
  if(rm()){el.textContent=fmt(to);return}
  const from=o.from??(parseFloat((el.textContent||'0').replace(/\./g,''))||0);
  const dur=o.dur??900,t0=performance.now();
  const ease=x=>1-Math.pow(2,-10*x);
  (function tick(now){
    const k=Math.min(1,(now-t0)/dur);
    el.textContent=fmt(from+(to-from)*ease(k));
    if(k<1)requestAnimationFrame(tick);
  })(t0);
}

/* EL shimmer. Autolimitado: UNO por carga de producto. */
let shimmerUsed=false;
function shimmer(el){
  if(shimmerUsed||rm())return false;
  shimmerUsed=true;
  el.classList.add('c-shimmer','is-play');
  el.addEventListener('animationend',()=>el.classList.remove('is-play'),{once:true});
  return true;
}

/* Rayos-X: alterna documento ⇄ texto crudo del parser. */
function xray(root,mode){
  root.dataset.mode=mode??(root.dataset.mode==='raw'?'doc':'raw');
  return root.dataset.mode;
}

/* Cambio de vista dentro de una pantalla (C2) */
function enter(el){
  el.hidden=false;
  if(rm())return;
  el.classList.add('c-enter');
  el.addEventListener('animationend',()=>el.classList.remove('c-enter'),{once:true});
}

/* Dibuja todos los hairlines y reveals estáticos de un scope, escalonados */
function boot(scope){
  const root=scope||document;
  root.querySelectorAll('.c-divider').forEach(d=>raf2(()=>show(d)));
  root.querySelectorAll('[data-reveal]:not([data-visible])').forEach(e=>raf2(()=>show(e)));
}

/* El editor es sagrado: el fondo se pausa al enfocar cualquier campo. */
document.addEventListener('focusin',e=>{
  if(e.target.matches('input,textarea,select,[contenteditable="true"],[contenteditable=""]'))
    window.CorpusAurora&&window.CorpusAurora.pause('focus');
});
document.addEventListener('focusout',()=>{
  window.CorpusAurora&&window.CorpusAurora.resume('focus');
});

/* Spotlight de tarjetas (.c-spot) — un listener, coordenadas por CSS vars */
document.addEventListener('pointermove',e=>{
  const c=e.target&&e.target.closest&&e.target.closest('.c-spot');
  if(!c)return;
  const r=c.getBoundingClientRect();
  c.style.setProperty('--mx',(e.clientX-r.left)+'px');
  c.style.setProperty('--my',(e.clientY-r.top)+'px');
},{passive:true});

return {rm,show,reveal,stagger,io,words,chars,counter,shimmer,xray,enter,boot};
})();
