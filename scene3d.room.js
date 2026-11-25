import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function fabricGeometry(w,h,seed=1){
  const g=new THREE.PlaneGeometry(w,h,32,20),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin(x*11+seed)*.025+Math.sin(y*17+x*4+seed)*.018+Math.sin(x*28-y*13)*.009);}
  g.computeVertexNormals();return g;
}
function textTexture(text,color="#ddc9a1"){
  const c=document.createElement("canvas");c.width=256;c.height=128;const x=c.getContext("2d");x.clearRect(0,0,256,128);x.fillStyle="rgba(32,17,13,.94)";x.fillRect(8,8,240,112);x.strokeStyle="#9c7653";x.strokeRect(12,12,232,104);x.fillStyle=color;x.font="bold 42px Georgia";x.textAlign="center";x.textBaseline="middle";x.fillText(text,128,66);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function createCryptexViewer(canvas,initial=["0","0","0","0","0"],onChange=()=>{}){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"low-power"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.4));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,30);camera.position.set(0,.65,4.5);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffe6c1,0x25100b,2));const key=new THREE.DirectionalLight(0xffcf82,3.3);key.position.set(-3,4,4);scene.add(key);
  const gold=new THREE.MeshStandardMaterial({color:0x99703a,metalness:.86,roughness:.27}),dark=new THREE.MeshStandardMaterial({color:0x37251a,metalness:.72,roughness:.4}),ivory=new THREE.MeshStandardMaterial({color:0xf1e5cc,metalness:.1,roughness:.36});
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,2.05,48),dark);core.rotation.z=Math.PI/2;scene.add(core);const rings=[],digits=[...initial].slice(0,5).map(x=>String(x));
  const digitMap=new THREE.CanvasTexture((()=>{const c=document.createElement("canvas");c.width=10*100;c.height=128;const x=c.getContext("2d");for(let i=0;i<10;i++){x.fillStyle=i%2?"#eee2c8":"#dfd0b1";x.fillRect(i*100,0,100,128);x.fillStyle="#4a2b1c";x.font="bold 66px Georgia";x.textAlign="center";x.textBaseline="middle";x.fillText(String(i),(i+.5)*100,66);}return c;})());digitMap.colorSpace=THREE.SRGBColorSpace;
  for(let i=0;i<5;i++){const g=new THREE.Group();g.position.x=(i-2)*.34;const mat=new THREE.MeshStandardMaterial({map:digitMap,metalness:.14,roughness:.33});const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.61,.61,.29,64,1,false),[mat,gold,gold]);wheel.rotation.z=Math.PI/2;g.add(wheel);const rim=new THREE.Mesh(new THREE.TorusGeometry(.61,.035,8,48),gold);rim.position.x=-.145;rim.rotation.y=Math.PI/2;g.add(rim);g.userData.wheel=wheel;g.userData.i=i;scene.add(g);rings.push(g);}
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.53,.53,.23,64),gold);cap.rotation.z=Math.PI/2;cap.position.x=-1.05;scene.add(cap);const cap2=cap.clone();cap2.position.x=1.05;scene.add(cap2);
  const tick=()=>{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;try{const ctx=tick.ctx||(tick.ctx=new AC()),n=Math.floor(ctx.sampleRate*.025),b=ctx.createBuffer(1,n,ctx.sampleRate),a=b.getChannelData(0);for(let j=0;j<n;j++)a[j]=(Math.random()*2-1)*(1-j/n);const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),v=ctx.createGain();s.buffer=b;f.type="bandpass";f.frequency.value=1100;v.gain.value=.028;s.connect(f).connect(v).connect(ctx.destination);s.start();}catch{}};
  const targets=Array(5).fill(0);const sync=()=>{rings.forEach((r,i)=>{targets[i]=-(Number(digits[i])||0)*Math.PI*2/10;});onChange([...digits]);};
  const resize=()=>{const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();};resize();const observer=new ResizeObserver(resize);observer.observe(canvas);
  let down=false,lastX=0,rot=0;const downFn=e=>{down=true;lastX=e.clientX;canvas.setPointerCapture?.(e.pointerId);},move=e=>{if(down){rot+=(e.clientX-lastX)*.008;lastX=e.clientX;}},up=()=>down=false;canvas.addEventListener("pointerdown",downFn);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  let raf;const draw=()=>{raf=requestAnimationFrame(draw);rings.forEach((r,i)=>{let delta=targets[i]-r.rotation.x;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;r.rotation.x+=delta*.17;r.rotation.y=rot;});renderer.render(scene,camera);};draw();
  return {turn(i,d){digits[i]=String((Number(digits[i])+d+10)%10);tick();sync();},getCode(){return digits.join("");},dispose(){cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener("pointerdown",downFn);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);renderer.dispose();},resize};
}

export function createGateScene(canvas,onSelect=()=>{},onItemFound=()=>{},onFocus=()=>{}){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"low-power"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x120b0b);scene.fog=new THREE.FogExp2(0x160c0c,.035);
  const camera=new THREE.PerspectiveCamera(68,1,.08,90);camera.position.set(0,1.62,5.2);
  scene.add(new THREE.HemisphereLight(0xc3b6a3,0x21100c,1.5));const ambient=new THREE.AmbientLight(0x8d4335,.38);scene.add(ambient);
  const roomLight=new THREE.PointLight(0xffa45c,50,19,1.7);roomLight.position.set(0,4.2,0);scene.add(roomLight);
  const reds=[];for(const [x,z] of [[-5,-3],[5,-3],[0,5]]){const l=new THREE.PointLight(0x8c2024,15,10,2);l.position.set(x,2.8,z);scene.add(l);reds.push(l);}
  const gold=new THREE.MeshStandardMaterial({color:0x74412c,roughness:.72}),wood=new THREE.MeshStandardMaterial({color:0x251713,roughness:.65}),trim=new THREE.MeshStandardMaterial({color:0x927044,metalness:.55,roughness:.36}),ivory=new THREE.MeshStandardMaterial({color:0xf1e5cc,roughness:.54}),floorMat=new THREE.MeshStandardMaterial({color:0x211815,roughness:.92}),wallMat=new THREE.MeshStandardMaterial({color:0x281717,roughness:.94}),fabric=new THREE.MeshStandardMaterial({color:0x514746,roughness:1,side:THREE.DoubleSide}),redFabric=new THREE.MeshStandardMaterial({color:0x681d20,roughness:.83,side:THREE.DoubleSide}),glass=new THREE.MeshStandardMaterial({color:0x402c24,roughness:.3,metalness:.25});
  const room=new THREE.Group();scene.add(room);const box=(w,h,d,mat,x,y,z,cast=true)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;room.add(m);return m;};
  box(16,.3,14,floorMat,0,-.18,0);box(16,.25,14,wood,0,5.9,0);
  box(16,6,.28,wallMat,0,2.85,-7);box(16,6,.28,wallMat,0,2.85,7);box(.28,6,14,wallMat,-8,2.85,0);box(.28,6,14,wallMat,8,2.85,0);
  // Paneled wainscoting and aged gold rails.
  for(let z of [-6.82,6.82]){box(15.5,1.2,.1,wood,0,.72,z,false);box(15.5,.08,.13,trim,0,1.35,z,false);box(15.5,.06,.13,trim,0,.15,z,false);for(let x=-7;x<=7;x+=1.4)box(.045,1,.12,trim,x,.74,z,false);}
  for(let x of [-7.82,7.82]){box(.1,1.2,13.5,wood,x,.72,0,false);box(.13,.08,13.5,trim,x,1.35,0,false);for(let z=-6;z<=6;z+=1.4)box(.12,1,.045,trim,x,.74,z,false);}
  // Rug and the red canopy bed, with a low crawl gap beneath it.
  const rug=box(8,.035,6,new THREE.MeshStandardMaterial({color:0x431d1e,roughness:1}),0,.015,-.6,false);rug.rotation.y=.05;
  box(4.2,.14,2.65,wood,0,.82,-3.3);box(4.1,.18,2.55,redFabric,0,.98,-3.3);box(4.5,1.5,.22,wood,0,1.45,-4.85);box(4.7,.16,.22,trim,0,2.2,-4.85);
  for(const x of [-2.08,2.08])for(const z of [-4.58,-2.02]){box(.14,2.5,.14,trim,x,1.3,z);box(.13,.78,.13,wood,x,.39,z);const orb=new THREE.Mesh(new THREE.SphereGeometry(.13,12,10),trim);orb.position.set(x,2.58,z);room.add(orb);}
  const canopy=new THREE.Mesh(fabricGeometry(4.4,3.1,3),redFabric);canopy.position.set(0,3.65,-3.3);canopy.rotation.x=-Math.PI/2;room.add(canopy);
  for(const x of [-2.08,2.08]){const drape=new THREE.Mesh(fabricGeometry(3.1,2.45,x),redFabric);drape.position.set(x,2.55,-3.3);drape.rotation.y=Math.PI/2;room.add(drape);}
  // Covered furniture with folded, irregular cloth surfaces.
  const covered=(x,z,w,d,h,seed)=>{box(w,.14,d,wood,x,.86,z);for(const sx of [-1,1])for(const sz of [-1,1])box(.12,.82,.12,wood,x+sx*(w/2-.12),.43,z+sz*(d/2-.12));const top=new THREE.Mesh(fabricGeometry(w+.4,d+.4,seed),fabric);top.rotation.x=-Math.PI/2;top.position.set(x,.96,z);room.add(top);for(const s of [-1,1]){const side=new THREE.Mesh(fabricGeometry(d+.3,h,seed+s),fabric);side.rotation.y=Math.PI/2;side.position.set(x+s*w*.49,.48,z);room.add(side);}const back=new THREE.Mesh(fabricGeometry(w,h,seed+2),fabric);back.position.set(x,.48,z-d*.48);room.add(back);return top;};
  covered(-5,-1.5,2.5,2,1.45,2);covered(4.9,-2.1,2.8,2.1,1.65,4);covered(-4,4,2.2,1.7,1.15,7);
  // Desk and drawers, cabinet, wall mirror and window.
  box(2.5,.18,1.05,wood,-5,1.2,-4.6);box(2.2,.12,.9,trim,-5,1.36,-4.6);for(const x of [-6,-4])box(.16,1.2,.16,wood,x,.62,-4.6);
  box(1.6,2.5,.75,wood,6,1.25,-4.9);box(1.65,.12,.8,trim,6,2.52,-4.9);for(let y of [.7,1.35,2]){box(1.35,.04,.05,trim,6,y,-4.48);box(.08,.08,.07,trim,6,y,-4.4);}
  box(2.3,2.7,.12,wood,5.9,2.95,6.78);box(1.95,2.35,.04,glass,5.9,2.95,6.69);box(.08,2.35,.08,trim,5.9,2.95,6.65);box(1.95,.08,.08,trim,5.9,2.95,6.65);
  const mirror=new THREE.Mesh(new THREE.CircleGeometry(.62,40),glass);mirror.position.set(-6.25,3.45,-6.78);room.add(mirror);const rim=new THREE.Mesh(new THREE.TorusGeometry(.69,.075,10,48),trim);rim.position.copy(mirror.position);room.add(rim);
  // Chandelier, candles and fireplace glow.
  const chandelier=new THREE.Group();chandelier.position.set(0,5.25,0);scene.add(chandelier);const chain=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.8,8),trim);chain.position.y=.4;chandelier.add(chain);const hoop=new THREE.Mesh(new THREE.TorusGeometry(.85,.045,8,32),trim);hoop.rotation.x=Math.PI/2;chandelier.add(hoop);for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*.7,z=Math.sin(a)*.7;const candle=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.34,8),ivory);candle.position.set(x,-.12,z);chandelier.add(candle);const flame=new THREE.PointLight(0xffbd72,4,3,2);flame.position.set(x,.12,z);chandelier.add(flame);}
  const fireplace=box(2.3,2.2,.45,wood,-.3,-.0,-6.7);box(1.55,1.25,.12,new THREE.MeshStandardMaterial({color:0x160a07,emissive:0x9b2b16,emissiveIntensity:1.2}),-.3,.66,-6.43);
  const fire=new THREE.PointLight(0xff5126,15,7,2);fire.position.set(-.3,1,-5.5);scene.add(fire);
  // Interactive props are placed as evidence someone hid, not as puzzle markers.
  const evidenceMat=new THREE.MeshStandardMaterial({color:0x5c3924,metalness:.45,roughness:.45,emissive:0x100604});
  const items=[];const addItem=(id,x,y,z,{hidden=false,under=false,rot=0}={})=>{const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rot;const numeric=typeof id==="number";let shape,mark;
    if(id==="flashlight"){shape=new THREE.CylinderGeometry(.075,.09,.42,12);mark="LAMP";}
    else if(id==="gate_tooth"){shape=new THREE.TorusGeometry(.09,.035,7,16);mark="BRASS";}
    else if(numeric&&id%3===0){shape=new THREE.BoxGeometry(.25,.035,.18);mark="12·24";}
    else if(numeric&&id%3===1){shape=new THREE.CylinderGeometry(.09,.1,.18,12);mark="NPTA";}
    else{shape=new THREE.BoxGeometry(.18,.07,.12);mark="12·24";}
    const core=new THREE.Mesh(shape,evidenceMat);core.castShadow=true;if(id==="flashlight")core.rotation.z=Math.PI/2;if(id==="gate_tooth")core.rotation.x=Math.PI/2;g.add(core);
    if(id==="flashlight"){const lens=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.06,12),trim);lens.rotation.z=Math.PI/2;lens.position.x=.21;g.add(lens);}
    if(numeric){const label=new THREE.Mesh(new THREE.PlaneGeometry(.18,.09),new THREE.MeshBasicMaterial({map:textTexture(mark,"#d9bd8b"),transparent:true,side:THREE.DoubleSide}));label.position.y=.045;label.rotation.x=-.35;g.add(label);}
    g.userData={id,hidden,under};room.add(g);items.push(g);return g;};
  addItem("flashlight",-5,1.48,-4.6,{rot:.6});addItem("gate_tooth",-.3,.13,-6.15,{hidden:true});
  // Evidence appears across the room in sequence. Several are tucked below furniture.
  const spots=[[-5.1,.16,-4.1,{under:true}],[.8,.13,-3.3,{under:true}],[5.05,.13,-2.15,{under:true}],[6.3,.25,-4.2,{}],[-6.1,.12,-1.4,{under:true}],[-2.7,.2,4.3,{}],[5.7,.16,5.7,{under:true}],[3.9,.16,-2.4,{under:true}],[-5.4,.15,4.1,{}]];
  spots.forEach((s,i)=>addItem(i,...s.slice(0,3),s[3]));
  const door=box(2.4,3.8,.22,wood,0,1.9,-6.8);door.material=wood;for(const x of [-1.05,1.05])box(.08,3.8,.08,trim,x,1.9,-6.62);const knob=new THREE.Mesh(new THREE.SphereGeometry(.09,12,10),trim);knob.position.set(.78,1.5,-6.54);room.add(knob);
  const ray=new THREE.Raycaster(),center=new THREE.Vector2(0,0),clock=new THREE.Clock(),keys=new Set(),move={forward:false,back:false,left:false,right:false};let yaw=0,pitch=0,paused=false,crouched=false,flashlightOn=false,solved=0,finished=false,register=false,focused=null,focusNear=false,found=new Set(),touchLook=null;
  const flashlight=new THREE.SpotLight(0xffe3ad,0,17,Math.PI/7,.45,1.3);camera.add(flashlight);flashlight.position.set(0,0,0);flashlight.target.position.set(0,0,-1);camera.add(flashlight.target);
  const colliders=[[-5,-1.5,1.7,1.2],[4.9,-2.1,1.8,1.3],[-4,4,1.5,1.1],[0,-3.3,2.2,1.15],[-5,-4.6,1.6,.65],[6,-4.9,1.1,.55]];
  const setFocus=it=>{if(focused!==it){focused=it;onFocus(it?it.userData.id:null);}};
  function inspect(){if(!focused)return;const id=focused.userData.id;if(id==="flashlight"||id==="gate_tooth"){if(found.has(id))return;found.add(id);focused.visible=false;onItemFound(id);return;}if(typeof id==="number"&&register&&id===solved-1&&id<9){onSelect(id+1);}}
  const targetPos=new THREE.Vector3();
  function refreshEvidence(){items.forEach(item=>{if(typeof item.userData.id==="number")item.visible=register&&item.userData.id===solved-1;});}
  function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.04);if(!paused){let f=(keys.has("KeyW")||keys.has("ArrowUp")||move.forward?1:0)-(keys.has("KeyS")||keys.has("ArrowDown")||move.back?1:0),s=(keys.has("KeyD")||keys.has("ArrowRight")||move.right?1:0)-(keys.has("KeyA")||keys.has("ArrowLeft")||move.left?1:0);const speed=(crouched?1.55:3.1)*dt;let nx=camera.position.x+(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed,nz=camera.position.z+(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed;nx=clamp(nx,-7.35,7.35);nz=clamp(nz,-6.35,6.35);for(const [x,z,w,d] of colliders){if(Math.abs(nx-x)<w&&Math.abs(nz-z)<d){const underBed=crouched&&Math.abs(x)<2.5&&z<-2.2,underDesk=crouched&&Math.abs(x+5)<1.1&&z<-4,underCovered=crouched&&((Math.abs(x+5)<1.8&&Math.abs(z+1.5)<1.25)||(Math.abs(x-4.9)<2&&Math.abs(z+2.1)<1.5)||(Math.abs(x+4)<1.7&&Math.abs(z-4)<1.4));if(underBed||underDesk||underCovered)continue;nx=camera.position.x;nz=camera.position.z;}}camera.position.x=nx;camera.position.z=nz;}
    camera.position.y=THREE.MathUtils.damp(camera.position.y,crouched?.78:1.62,10,dt);camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;door.rotation.y=THREE.MathUtils.damp(door.rotation.y,finished?-.82:0,2.4,dt);
    ray.setFromCamera(center,camera);const hits=ray.intersectObjects(items.filter(i=>i.visible),true);let candidate=null;if(hits.length&&hits[0].distance<3.4){let o=hits[0].object;while(o&&o.userData.id===undefined&&o.parent)o=o.parent;if(o?.userData.id!==undefined){const id=o.userData.id,active=(id==="flashlight"&&!found.has(id))||(id==="gate_tooth"&&!found.has(id)&&flashlightOn)||(typeof id==="number"&&register&&id===solved-1&&id<9);const under=o.userData.under;const lowEnough=!under||(crouched&&flashlightOn);if(active&&lowEnough)candidate=o;}}
    setFocus(candidate);const t=performance.now()*.001;roomLight.intensity=48+Math.sin(t*1.3)*2;fire.intensity=14+Math.sin(t*7)*1.8;reds.forEach((l,i)=>l.intensity=(9+solved*1.6)+Math.sin(t*1.2+i)*1.4);renderer.render(scene,camera);}
  const resize=()=>{const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();};resize();const ro=new ResizeObserver(resize);ro.observe(canvas);
  const down=e=>{if(e.button===0){canvas.focus();try{canvas.setPointerCapture(e.pointerId);}catch{}touchLook={x:e.clientX,y:e.clientY,id:e.pointerId};}};const drag=e=>{if(touchLook?.id===e.pointerId){const dx=e.clientX-touchLook.x,dy=e.clientY-touchLook.y;touchLook.x=e.clientX;touchLook.y=e.clientY;if(Math.abs(dx)+Math.abs(dy)>1){yaw-=dx*.0045;pitch=clamp(pitch-dy*.0035,-1.15,1.15);}}};const up=e=>{if(touchLook?.id===e.pointerId)touchLook=null;};
  canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",drag);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  const keydown=e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==="KeyE")inspect();if(e.code==="KeyC"||e.code==="ControlLeft"||e.code==="ControlRight")crouched=true;};const keyup=e=>{keys.delete(e.code);if(e.code==="KeyC"||e.code==="ControlLeft"||e.code==="ControlRight")crouched=false;};window.addEventListener("keydown",keydown);window.addEventListener("keyup",keyup);
  document.querySelectorAll("[data-move]").forEach(b=>{const k=b.dataset.move;b.addEventListener("pointerdown",e=>{e.preventDefault();move[k]=true;});["pointerup","pointerleave","pointercancel"].forEach(ev=>b.addEventListener(ev,()=>move[k]=false));});canvas.addEventListener("click",()=>inspect());
  loop();
  return {setRegisterActive(v){register=Boolean(v);refreshEvidence();},setSolvedCount(n,done=false){solved=n;finished=done;refreshEvidence();},setCollectedItems(ids){ids.forEach(x=>found.add(x));items.forEach(x=>{if(typeof x.userData.id==="string"&&found.has(x.userData.id))x.visible=false;});refreshEvidence();},setFlashlight(v){flashlightOn=Boolean(v);flashlight.intensity=flashlightOn?23:0;},setPaused(v){paused=Boolean(v);},setCrouching(v){crouched=Boolean(v);},setCryptexVisible(){},resize,setCryptexLetters(){},dispose(){ro.disconnect();renderer.dispose();}};
}
