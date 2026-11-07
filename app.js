(function(){
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DEG=Math.PI/180;
const SWATCHES=['#E8684A','#F2B12A','#5DBB7A','#4FA3D9','#9B7BD8','#F28DB2','#E9E4DA','#3C4250'];
const STORE='badee.v1';
const COARSE=matchMedia('(pointer:coarse)').matches;

/* ---------- shapes ---------- */
const TYPES={
  cube:{label:'Cube',y:.5,geo:()=>new THREE.BoxGeometry(1,1,1),
    icon:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'},
  ball:{label:'Ball',y:.5,geo:()=>new THREE.SphereGeometry(.5,48,32),
    icon:'<circle cx="12" cy="12" r="8.5"/><path d="M3.6 12c2.6 2.4 14.2 2.4 16.8 0"/>'},
  cylinder:{label:'Cylinder',y:.5,geo:()=>new THREE.CylinderGeometry(.5,.5,1,48),
    icon:'<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/>'},
  cone:{label:'Cone',y:.5,geo:()=>new THREE.ConeGeometry(.5,1,48),
    icon:'<path d="M12 3L5 18.4M12 3l7 15.4"/><ellipse cx="12" cy="18.4" rx="7" ry="2.4"/>'},
  pyramid:{label:'Pyramid',y:.5,geo:()=>{const g=new THREE.ConeGeometry(.62,1,4);g.rotateY(Math.PI/4);return g},
    icon:'<path d="M12 3L3.5 17l8.5 4 8.5-4z"/><path d="M12 3v18"/>'},
  ring:{label:'Ring',y:.56,geo:()=>new THREE.TorusGeometry(.4,.16,24,64),
    icon:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/>'}
};
const geoCache={},edgeCache={};
const geo=t=>geoCache[t]||(geoCache[t]=TYPES[t].geo());
const edges=t=>edgeCache[t]||(edgeCache[t]=new THREE.EdgesGeometry(geo(t),25));
const lib=$('.lib');
for(const [k,t] of Object.entries(TYPES)){
  const b=document.createElement('button');
  b.className='shape';b.title='Add a '+t.label.toLowerCase();
  b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${t.icon}</svg>${t.label}`;
  b.onclick=()=>addShape(k);
  lib.appendChild(b);
}

/* ---------- state ---------- */
const state={objects:[],selected:null,frame:1,length:24,fps:12,playing:false,loop:true,record:true,ease:'smooth',
  tool:'translate',snap:false,sceneName:'Bouncing ball',
  onion:{on:true,before:2,after:2,spacing:2,opacity:.35,path:true}};
let nextId=1;
const colors={};

/* ---------- three ---------- */
const view=$('#view');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(40,1,.1,200);
const HOME={pos:new THREE.Vector3(5.2,4.4,9),target:new THREE.Vector3(0,.9,-.3)};
camera.position.copy(HOME.pos);
const orbit=new THREE.OrbitControls(camera,renderer.domElement);
orbit.target.copy(HOME.target);orbit.enableDamping=true;orbit.dampingFactor=.12;
orbit.maxPolarAngle=Math.PI*.495;orbit.minDistance=2;orbit.maxDistance=40;orbit.update();

scene.add(new THREE.HemisphereLight(0xffffff,0x8a8f99,.75));
const sun=new THREE.DirectionalLight(0xffffff,.85);
sun.position.set(4,9,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:30});sun.shadow.bias=-.0005;
scene.add(sun);
const fill=new THREE.DirectionalLight(0xffffff,.25);fill.position.set(-6,3,-4);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.ShadowMaterial({opacity:.16}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
let grid=null;
const onionGroup=new THREE.Group();scene.add(onionGroup);
const dotGeo=new THREE.SphereGeometry(.055,12,8);

const tc=new THREE.TransformControls(camera,renderer.domElement);
tc.setSize(COARSE?1.4:1.05);scene.add(tc);
['gesturestart','gesturechange','gestureend'].forEach(t=>view.addEventListener(t,e=>e.preventDefault(),{passive:false}));
view.addEventListener('touchmove',e=>{ if(e.touches.length>1) e.preventDefault(); },{passive:false});
let dragStart=null;
tc.addEventListener('dragging-changed',e=>{
  orbit.enabled=!e.value;
  const o=state.selected;
  if(e.value){ if(state.playing) stop(); dragStart=o?JSON.stringify(poseOf(o.mesh)):null; }
  else if(o && JSON.stringify(poseOf(o.mesh))!==dragStart) commitEdit(o);
});
tc.addEventListener('objectChange',()=>{
  const m=state.selected&&state.selected.mesh; if(!m) return;
  ['x','y','z'].forEach(a=>{ if(m.scale[a]<.05) m.scale[a]=Math.max(.05,Math.abs(m.scale[a])); });
});

function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
function applyTheme(){
  scene.background=new THREE.Color(css('--stage'));
  if(grid){scene.remove(grid);grid.geometry.dispose();grid.material.dispose();}
  grid=new THREE.GridHelper(20,40,new THREE.Color(css('--grid-major')),new THREE.Color(css('--grid')));
  grid.position.y=.002;scene.add(grid);
  colors.past=css('--past');colors.future=css('--future');colors.accent=css('--accent');colors.path=css('--ink-3');
  if(state.selected) highlight(state.selected,true);
  updateOnion();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
let lastW=0,lastH=0;
function resize(){
  const r=view.getBoundingClientRect();
  const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));
  if(w===lastW&&h===lastH) return;
  lastW=w;lastH=h;
  // resizing a WebGL canvas clears it; draw straight away so no blank (black) frame gets painted
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
}

/* ---------- objects & poses ---------- */
function r4(v){return Math.round(v*1e4)/1e4} function r6(v){return Math.round(v*1e6)/1e6}
const poseOf=m=>({p:m.position.toArray().map(r4),q:m.quaternion.toArray().map(r6),s:m.scale.toArray().map(r4)});
function applyPose(m,P){m.position.fromArray(P.p);m.quaternion.fromArray(P.q);m.scale.fromArray(P.s)}
const byId=id=>state.objects.find(o=>String(o.id)===String(id));
function createObject(d){
  const mat=new THREE.MeshStandardMaterial({color:d.color,roughness:.62,metalness:0});
  const mesh=new THREE.Mesh(geo(d.type),mat);mesh.castShadow=mesh.receiveShadow=true;
  applyPose(mesh,d);
  const o={id:d.id!=null?d.id:nextId++,type:d.type,name:d.name,color:d.color,mesh,keys:new Map(d.keys||[])};
  nextId=Math.max(nextId,o.id+1);
  mesh.userData.obj=o;scene.add(mesh);state.objects.push(o);return o;
}
function removeObject(o){scene.remove(o.mesh);o.mesh.material.dispose();state.objects=state.objects.filter(x=>x!==o)}
const _qa=new THREE.Quaternion(),_qb=new THREE.Quaternion();
const lerpA=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function evalPose(o,f){
  if(!o.keys.size) return null;
  const fr=[...o.keys.keys()].sort((a,b)=>a-b);
  if(f<=fr[0]) return o.keys.get(fr[0]);
  if(f>=fr[fr.length-1]) return o.keys.get(fr[fr.length-1]);
  let a=fr[0],b=fr[fr.length-1];
  for(const k of fr){ if(k<=f) a=k; if(k>f){b=k;break;} }
  if(a===f) return o.keys.get(a);
  let t=(f-a)/(b-a); if(state.ease==='smooth') t=t*t*(3-2*t);
  const A=o.keys.get(a),B=o.keys.get(b);
  _qa.fromArray(A.q).slerp(_qb.fromArray(B.q),t);
  return {p:lerpA(A.p,B.p,t),q:_qa.toArray(),s:lerpA(A.s,B.s,t)};
}
function samePose(A,B){
  if(!A||!B) return false;
  for(let i=0;i<3;i++){ if(Math.abs(A.p[i]-B.p[i])>.004||Math.abs(A.s[i]-B.s[i])>.004) return false; }
  return Math.abs(A.q[0]*B.q[0]+A.q[1]*B.q[1]+A.q[2]*B.q[2]+A.q[3]*B.q[3])>.99995;
}
const isAnimated=o=>o.keys.size>1;

/* ---------- frame ---------- */
function setFrame(f){ f=clamp(Math.round(f),1,state.length); if(f===state.frame) return; state.frame=f; applyFrame(); }
function applyFrame(){
  for(const o of state.objects){const P=evalPose(o,state.frame);if(P) applyPose(o.mesh,P);}
  updateOnion();renderTimelineState();updateHud();
}

/* ---------- onion skin ---------- */
function ghostFrames(){
  const g={past:[],future:[]};
  if(!state.onion.on) return g;
  const {before,after,spacing}=state.onion;
  for(let k=1;k<=before;k++){const f=state.frame-k*spacing;if(f>=1)g.past.push(f)}
  for(let k=1;k<=after;k++){const f=state.frame+k*spacing;if(f<=state.length)g.future.push(f)}
  return g;
}
function clearOnion(){
  for(const c of [...onionGroup.children]){
    onionGroup.remove(c);
    c.traverse(n=>{ if(n.material) n.material.dispose(); if(n.userData.ownGeo) n.geometry.dispose(); });
  }
}
function updateOnion(){
  clearOnion();
  if(state.playing) return;
  const {on,opacity,path}=state.onion;
  const g=ghostFrames();
  for(const o of state.objects){
    if(!isAnimated(o)) continue;
    const cur=evalPose(o,state.frame);
    if(on){
      [[g.past,colors.past],[g.future,colors.future]].forEach(([list,col])=>{
        list.forEach((f,i)=>{
          const P=evalPose(o,f); if(samePose(P,cur)) return;
          const a=opacity*(1-i/Math.max(1,list.length)*.6);
          const m=new THREE.Mesh(o.mesh.geometry,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:a,depthWrite:false}));
          m.add(new THREE.LineSegments(edges(o.type),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:Math.min(1,a*1.9),depthWrite:false})));
          applyPose(m,P);m.renderOrder=-1;onionGroup.add(m);
        });
      });
    }
    if(on&&path){
      const sel=o===state.selected,col=sel?colors.accent:colors.path;
      const pts=[];for(let f=1;f<=state.length;f++) pts.push(new THREE.Vector3().fromArray(evalPose(o,f).p));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:sel?.95:.5,depthWrite:false}));
      line.userData.ownGeo=true;onionGroup.add(line);
      for(const [f,P] of o.keys){ if(f>state.length) continue;
        const d=new THREE.Mesh(dotGeo,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:sel?1:.6}));
        d.position.fromArray(P.p);onionGroup.add(d);}
    }
  }
}

/* ---------- selection ---------- */
function highlight(o,on){ if(o) o.mesh.material.emissive.set(on?colors.accent:'#000').multiplyScalar(on?.16:0); }
function select(o){
  if(state.selected) highlight(state.selected,false);
  state.selected=o||null;
  if(o){ highlight(o,true); tc.attach(o.mesh); } else tc.detach();
  renderSelbar();
  $$('.row.obj').forEach(r=>r.classList.toggle('sel',!!o&&r.dataset.id===String(o.id)));
  renderTimelineState();updateOnion();updateHud();
}
const sw=$('#swatches');
sw.innerHTML=SWATCHES.map(c=>`<button data-c="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="false"></button>`).join('');
sw.addEventListener('click',e=>{
  const b=e.target.closest('button'),o=state.selected;if(!b||!o) return;
  o.color=b.dataset.c;o.mesh.material.color.set(o.color);
  const dot=$(`.row.obj[data-id="${o.id}"] .lab i`);if(dot) dot.style.background=o.color;
  renderSelbar();pushHistory();
});
function renderSelbar(){
  const o=state.selected;
  $('#selbar').hidden=!o||state.playing;
  if(!o) return;
  $('#selName').textContent=o.name;
  $$('#swatches button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.c.toLowerCase()===o.color.toLowerCase())));
}

/* ---------- edits ---------- */
function commitEdit(o){
  if(state.record){ o.keys.set(state.frame,poseOf(o.mesh)); }
  else if(isAnimated(o)){ toast('Record is off, so this change will be lost.',{label:'Keep it',fn:()=>{o.keys.set(state.frame,poseOf(o.mesh));pushHistory();renderTimeline();updateOnion();}}); }
  else if(o.keys.size===1){ o.keys.set([...o.keys.keys()][0],poseOf(o.mesh)); }
  pushHistory();renderTimeline();updateOnion();
}
function freeSpot(){
  const ring=[[0,0],[1.6,0],[-1.6,0],[0,1.6],[0,-1.6],[1.6,1.6],[-1.6,1.6],[1.6,-1.6],[-1.6,-1.6],[3.2,0],[-3.2,0],[0,3.2]];
  for(const [x,z] of ring){ if(state.objects.every(o=>Math.hypot(o.mesh.position.x-x,o.mesh.position.z-z)>1.2)) return [x,z]; }
  return [(Math.random()-.5)*6,(Math.random()-.5)*6];
}
function uniqueName(base){
  const names=new Set(state.objects.map(o=>o.name));
  if(!names.has(base)) return base;
  let i=2;while(names.has(base+' '+i)) i++;return base+' '+i;
}
function addShape(type){
  if(state.playing) stop();
  const [x,z]=freeSpot();
  const o=createObject({type,name:uniqueName(TYPES[type].label),color:SWATCHES[state.objects.length%SWATCHES.length],
    p:[x,TYPES[type].y,z],q:[0,0,0,1],s:[1,1,1]});
  setTool('translate');select(o);pushHistory();renderTimeline();
}
function deleteSelected(){
  const o=state.selected;if(!o) return;
  select(null);removeObject(o);pushHistory();renderTimeline();updateOnion();
  toast(`Deleted ${o.name}`,{label:'Undo',fn:undo});
}
function duplicateSelected(){
  const s=state.selected;if(!s) return;
  const off=[.8,0,.8];
  const shift=P=>({p:P.p.map((v,i)=>r4(v+off[i])),q:P.q.slice(),s:P.s.slice()});
  const o=createObject({type:s.type,name:uniqueName(s.name.replace(/ \d+$/,'')),color:s.color,...shift(poseOf(s.mesh)),
    keys:[...s.keys].map(([f,P])=>[f,shift(P)])});
  select(o);pushHistory();renderTimeline();
}
function toggleKey(){
  const o=state.selected;if(!o){toast('Tap a shape first');return}
  if(o.keys.has(state.frame)){ o.keys.delete(state.frame); applyFrame(); }
  else o.keys.set(state.frame,poseOf(o.mesh));
  pushHistory();renderTimeline();updateOnion();
}

/* ---------- history & storage ---------- */
const hist={stack:[],i:-1};
function snap(){return {objects:state.objects.map(o=>({id:o.id,type:o.type,name:o.name,color:o.color,...poseOf(o.mesh),keys:[...o.keys]})),sel:state.selected?state.selected.id:null}}
function pushHistory(){
  const s=JSON.stringify(snap());
  if(hist.stack[hist.i]===s) return;
  hist.stack=hist.stack.slice(0,hist.i+1);hist.stack.push(s);
  if(hist.stack.length>80) hist.stack.shift();
  hist.i=hist.stack.length-1;updateUndo();save();
}
function restore(s){
  const d=JSON.parse(s);
  select(null);
  for(const o of [...state.objects]) removeObject(o);
  for(const od of d.objects) createObject(od);
  select(byId(d.sel));applyFrame();renderTimeline();
}
function undo(){ if(hist.i>0){hist.i--;restore(hist.stack[hist.i]);updateUndo();save();} }
function redo(){ if(hist.i<hist.stack.length-1){hist.i++;restore(hist.stack[hist.i]);updateUndo();save();} }
function updateUndo(){ $('#undoBtn').disabled=hist.i<=0; $('#redoBtn').disabled=hist.i>=hist.stack.length-1; }
let saveT=null;
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(()=>{
    try{
      const {frame,length,fps,loop,record,ease,onion,sceneName,snap:sn}=state;
      localStorage.setItem(STORE,JSON.stringify({v:1,scene:snap(),settings:{frame,length,fps,loop,record,ease,onion,sceneName,snap:sn}}));
    }catch(e){}
  },250);
}

/* ---------- sample scene ---------- */
const Q=(x,y,z)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x*DEG,y*DEG,z*DEG)).toArray().map(r6);
function sample(){
  const I=[0,0,0,1];
  createObject({type:'cube',name:'Cube',color:'#4FA3D9',p:[-1.7,.5,-1.9],q:Q(0,25,0),s:[1,1,1]});
  createObject({type:'pyramid',name:'Pyramid',color:'#9B7BD8',p:[2,.5,-1.9],q:I,s:[1,1,1],keys:[
    [1,{p:[2,.5,-1.9],q:I,s:[1,1,1]}],
    [12,{p:[2,1.5,-1.9],q:Q(0,60,12),s:[1,1,1]}],
    [24,{p:[2,.5,-1.9],q:Q(0,120,0),s:[1,1,1]}]]});
  createObject({type:'ball',name:'Ball',color:'#E8684A',p:[-3,2.6,0],q:I,s:[1,1,1],keys:[
    [1,{p:[-3,2.6,0],q:I,s:[1,1,1]}],
    [7,{p:[-1.5,.4,0],q:I,s:[1.2,.8,1.2]}],
    [13,{p:[0,1.9,0],q:I,s:[.94,1.1,.94]}],
    [19,{p:[1.5,.43,0],q:I,s:[1.15,.85,1.15]}],
    [24,{p:[2.8,.5,.4],q:I,s:[1,1,1]}]]});
  state.frame=9;
  return state.objects.find(o=>o.name==='Ball');
}

/* ---------- timeline ---------- */
const tracks=$('#tracks'),tinner=$('#tinner');
let cw=24;
const LW=()=>window.innerWidth<640?92:128;
function layoutTimeline(){ cw=Math.max(COARSE?22:18,Math.floor((tracks.clientWidth-LW()-2)/state.length)); renderTimeline(); }
function renderTimeline(){
  const L=state.length,lw=LW();
  tinner.style.setProperty('--cw',cw+'px');tinner.style.setProperty('--lw',lw+'px');tinner.style.setProperty('--tw',(L*cw)+'px');
  tinner.style.width=(lw+L*cw)+'px';
  const step=cw>=26?1:2;
  let h='<div class="row ruler"><div class="lab">Frame</div><div class="lane">';
  for(let f=1;f<=L;f++) h+=`<div class="cell" data-f="${f}" style="left:${(f-1)*cw}px">${(f===1||f%step===0)?f:''}</div>`;
  h+='</div></div>';
  if(!state.objects.length) h+='<div class="row obj"><div class="lab"></div><div class="lane empty">Add a shape to start.</div></div>';
  for(const o of state.objects){
    const fr=[...o.keys.keys()].filter(f=>f<=L).sort((a,b)=>a-b);
    h+=`<div class="row obj${o===state.selected?' sel':''}" data-id="${o.id}"><div class="lab"><i style="background:${o.color}"></i><span>${esc(o.name)}</span></div><div class="lane">`;
    if(fr.length>1) h+=`<div class="hold" style="left:${(fr[0]-.5)*cw}px;width:${(fr[fr.length-1]-fr[0])*cw}px"></div>`;
    for(const f of fr) h+=`<div class="key" data-f="${f}" data-id="${o.id}" style="left:${(f-.5)*cw}px" title="Keyframe at ${f}. Drag to move."></div>`;
    h+='</div></div>';
  }
  h+='<div class="playhead" id="playhead"></div>';
  tinner.innerHTML=h;
  renderTimelineState();
}
function renderTimelineState(){
  const ph=$('#playhead');
  if(ph){ph.style.left=(LW()+(state.frame-1)*cw)+'px';ph.style.width=cw+'px';}
  const g=ghostFrames();
  $$('.ruler .cell').forEach(c=>{const f=+c.dataset.f;
    c.classList.toggle('cur',f===state.frame);c.classList.toggle('gp',g.past.includes(f));c.classList.toggle('gf',g.future.includes(f));});
  $$('.key').forEach(k=>k.classList.toggle('now',+k.dataset.f===state.frame));
  $('#fNow').textContent=state.frame;$('#fLen').textContent=state.length;
  const o=state.selected,has=o&&o.keys.has(state.frame);
  $('#keyTxt').textContent=has?'Remove key':'Add key';
  $('#keyBtn').disabled=!o;
  if(state.playing){
    const x=LW()+(state.frame-1)*cw;
    if(x<tracks.scrollLeft+LW()||x>tracks.scrollLeft+tracks.clientWidth-cw) tracks.scrollLeft=x-LW()-20;
  }
}
tinner.addEventListener('pointerdown',e=>{
  const lab=e.target.closest('.lab'),lane=e.target.closest('.lane'),key=e.target.closest('.key');
  if(lab){const row=lab.closest('.row.obj');if(row&&row.dataset.id) select(byId(row.dataset.id));return;}
  if(!lane||lane.classList.contains('empty')) return;
  e.preventDefault();
  if(state.playing) stop();
  const fx=x=>{
    const tr=tracks.getBoundingClientRect();
    if(x>tr.right-28) tracks.scrollLeft+=cw; else if(x<tr.left+LW()+28) tracks.scrollLeft-=cw;
    return clamp(Math.floor((x-lane.getBoundingClientRect().left)/cw)+1,1,state.length);
  };
  const off=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
  let mv,up;
  if(key){
    const o=byId(key.dataset.id),from=+key.dataset.f,sx=e.clientX;let to=from,moved=false;
    mv=ev=>{ if(Math.abs(ev.clientX-sx)>4) moved=true; if(!moved) return; to=fx(ev.clientX); key.style.left=((to-.5)*cw)+'px'; key.classList.add('drag'); };
    up=()=>{ off();
      if(moved&&to!==from){ const P=o.keys.get(from);o.keys.delete(from);o.keys.set(to,P);
        if(o!==state.selected) select(o); state.frame=to; applyFrame(); pushHistory(); renderTimeline(); }
      else { renderTimeline(); if(o!==state.selected) select(o); setFrame(from); } };
  } else {
    const row=lane.closest('.row.obj');
    if(row){const o=byId(row.dataset.id);if(o&&o!==state.selected) select(o);}
    setFrame(fx(e.clientX));
    mv=ev=>setFrame(fx(ev.clientX)); up=off;
  }
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
});

/* ---------- playback ---------- */
let acc=0;
function play(){ if(state.length<2) return; if(state.frame>=state.length) state.frame=1; state.playing=true; acc=0; tc.enabled=false; tc.visible=false; updatePlayBtn(); renderSelbar(); applyFrame(); }
function stop(){ state.playing=false; tc.enabled=true; tc.visible=true; updatePlayBtn(); renderSelbar(); updateOnion(); updateHud(); save(); }
function updatePlayBtn(){
  $('#playIco').innerHTML=state.playing?'<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>':'<path d="M7 4.8v14.4a1 1 0 001.5.9l11.3-7.2a1 1 0 000-1.8L8.5 3.9A1 1 0 007 4.8z"/>';
  $('#bPlay').setAttribute('aria-label',state.playing?'Pause':'Play');
}
function advance(){
  if(state.frame>=state.length){ if(state.loop) state.frame=1; else { stop(); return; } }
  else state.frame++;
  applyFrame();
}
let last=performance.now();
function tick(now){
  requestAnimationFrame(tick);
  const dt=Math.min(.25,(now-last)/1000);last=now;
  if(state.playing){acc+=dt;const st=1/state.fps;while(acc>=st&&state.playing){acc-=st;advance();}}
  orbit.update();renderer.render(scene,camera);
}

/* ---------- picking ---------- */
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,gizmo:tc.axis!=null&&!!state.selected};});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||down.gizmo||tc.dragging){down=null;return}
  if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){down=null;return}
  down=null;
  const r=renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);
  const hit=ray.intersectObjects(state.objects.map(o=>o.mesh),false)[0];
  select(hit?hit.object.userData.obj:null);
});

/* ---------- settings ---------- */
[12,24,36,48,72,96].forEach(n=>$('#lenSel').insertAdjacentHTML('beforeend',`<option value="${n}">${n} frames</option>`));
[6,8,12,24].forEach(n=>$('#fpsSel').insertAdjacentHTML('beforeend',`<option value="${n}">${n} per second</option>`));
$('#lenSel').onchange=e=>{state.length=+e.target.value;state.frame=Math.min(state.frame,state.length);layoutTimeline();applyFrame();save();};
$('#fpsSel').onchange=e=>{state.fps=+e.target.value;save();};
$('#easeSeg').onclick=e=>{const b=e.target.closest('button');if(!b) return;state.ease=b.dataset.v;syncSettings();applyFrame();save();};
$('#loopSw').onclick=()=>{state.loop=!state.loop;syncSettings();save();};
$('#snapSw').onclick=()=>{state.snap=!state.snap;syncSettings();save();};
$('#pathSw').onclick=()=>{state.onion.path=!state.onion.path;syncSettings();updateOnion();save();};
$('#spaceSel').onchange=e=>{state.onion.spacing=+e.target.value;updateOnion();renderTimelineState();save();};
$('#opRange').oninput=e=>{state.onion.opacity=+e.target.value/100;$('#opVal').textContent=e.target.value+'%';updateOnion();save();};
$$('.stepper button').forEach(b=>b.onclick=()=>{const k=b.dataset.k;state.onion[k]=clamp(state.onion[k]+ +b.dataset.d,0,6);state.onion.on=true;syncSettings();updateOnion();renderTimelineState();save();});
function syncSettings(){
  $('#lenSel').value=state.length;$('#fpsSel').value=state.fps;
  $$('#easeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===state.ease)));
  $('#loopSw').setAttribute('aria-checked',String(state.loop));
  $('#snapSw').setAttribute('aria-checked',String(state.snap));
  $('#pathSw').setAttribute('aria-checked',String(state.onion.path));
  $('#spaceSel').value=state.onion.spacing;
  $('#opRange').value=Math.round(state.onion.opacity*100);$('#opVal').textContent=Math.round(state.onion.opacity*100)+'%';
  $('#onionBtn').setAttribute('aria-pressed',String(state.onion.on));
  $('#obN').textContent=state.onion.before;$('#oaN').textContent=state.onion.after;
  $('#recBtn').setAttribute('aria-pressed',String(state.record));
  $('#sceneName').value=state.sceneName;
  tc.setTranslationSnap(state.snap?.25:null);tc.setRotationSnap(state.snap?15*DEG:null);tc.setScaleSnap(state.snap?.25:null);
}

/* ---------- buttons ---------- */
function setTool(mode){state.tool=mode;tc.setMode(mode);$$('.tool[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));updateHud();}
$$('.tool[data-mode]').forEach(b=>b.onclick=()=>setTool(b.dataset.mode));
$('#homeBtn').onclick=()=>{camera.position.copy(HOME.pos);orbit.target.copy(HOME.target);orbit.update();};
$('#dupBtn').onclick=duplicateSelected;$('#delBtn').onclick=deleteSelected;
$('#bPlay').onclick=()=>state.playing?stop():play();
$('#bPrev').onclick=()=>{if(state.playing)stop();setFrame(state.frame-1)};
$('#bNext').onclick=()=>{if(state.playing)stop();setFrame(state.frame+1)};
$('#recBtn').onclick=()=>{state.record=!state.record;syncSettings();updateHud();save();toast(state.record?'Recording: changes save keyframes':'Record off');};
$('#keyBtn').onclick=toggleKey;
$('#onionBtn').onclick=()=>{state.onion.on=!state.onion.on;syncSettings();updateOnion();renderTimelineState();save();};
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
$('#sceneName').addEventListener('input',e=>{state.sceneName=e.target.value;save();});
const pops=[['#newBtn','#newPop'],['#setBtn','#setPop']];
function closePops(except){pops.forEach(([b,p])=>{if(p!==except){$(p).hidden=true;$(b).setAttribute('aria-expanded','false');}});}
pops.forEach(([b,p])=>$(b).addEventListener('click',()=>{const el=$(p);const open=el.hidden;closePops(p);el.hidden=!open;$(b).setAttribute('aria-expanded',String(open));}));
document.addEventListener('pointerdown',e=>{ if(!e.target.closest('.pop')&&!e.target.closest('#newBtn,#setBtn')) closePops(); });
$('#newCancel').onclick=()=>closePops();
$('#newOk').onclick=()=>{closePops();if(state.playing)stop();select(null);for(const o of [...state.objects])removeObject(o);
  state.frame=1;state.sceneName='Untitled scene';$('#sceneName').value=state.sceneName;applyFrame();renderTimeline();pushHistory();
  toast('New scene',{label:'Undo',fn:undo});};

/* ---------- hud, hint, toast ---------- */
function updateHud(){
  $('#hFrame').textContent=state.frame;
  $('#hRec').hidden=!state.record;
  const h=$('#hint');
  h.hidden=!!state.selected||state.playing;
  h.textContent=COARSE?'Tap a shape to edit it · drag to look around · pinch to zoom':'Click a shape to edit it · drag to look around · scroll to zoom';
}
let toastT=null;
function toast(msg,action){
  const t=$('#toast');t.innerHTML='<span>'+esc(msg)+'</span>'+(action?`<button>${esc(action.label)}</button>`:'');
  if(action) t.querySelector('button').onclick=()=>{action.fn();t.classList.remove('show');};
  t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),action?5000:2200);
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown',e=>{
  const tg=e.target;if(tg.closest&&tg.closest('input,select,textarea,[contenteditable]')) return;
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if(mod&&k==='y'){e.preventDefault();redo();return}
  if(mod&&k==='d'){e.preventDefault();duplicateSelected();return}
  if(mod) return;
  if(k===' '){e.preventDefault();state.playing?stop():play();}
  else if(k==='arrowleft'){e.preventDefault();if(state.playing)stop();setFrame(state.frame-1);}
  else if(k==='arrowright'){e.preventDefault();if(state.playing)stop();setFrame(state.frame+1);}
  else if(k==='m') setTool('translate');
  else if(k==='t') setTool('rotate');
  else if(k==='s') setTool('scale');
  else if(k==='k') toggleKey();
  else if(k==='o') $('#onionBtn').click();
  else if(k==='delete'||k==='backspace'){if(state.selected){e.preventDefault();deleteSelected();}}
  else if(k==='escape'){select(null);closePops();}
});

/* ---------- boot ---------- */
let saved=null;
try{saved=JSON.parse(localStorage.getItem(STORE)||'null');}catch(e){saved=null}
let first=null;
if(saved&&saved.scene&&saved.settings){
  try{
    const st=saved.settings;
    Object.assign(state,{frame:st.frame||1,length:st.length||24,fps:st.fps||12,loop:st.loop!==false,record:st.record!==false,
      ease:st.ease||'smooth',sceneName:st.sceneName||'Untitled scene',snap:!!st.snap});
    Object.assign(state.onion,st.onion||{});
    for(const od of saved.scene.objects) createObject(od);
    first=byId(saved.scene.sel);
  }catch(e){ for(const o of [...state.objects]) removeObject(o); first=sample(); }
} else first=sample();

applyTheme();syncSettings();setTool('translate');updatePlayBtn();resize();
select(first);
layoutTimeline();applyFrame();
hist.stack=[JSON.stringify(snap())];hist.i=0;updateUndo();
let lastTW=0;
function relayoutIfNeeded(){ if(tracks.clientWidth!==lastTW){ lastTW=tracks.clientWidth; layoutTimeline(); } }
new ResizeObserver(()=>{resize();relayoutIfNeeded();}).observe(view);
window.addEventListener('resize',relayoutIfNeeded);
requestAnimationFrame(tick);
})();
