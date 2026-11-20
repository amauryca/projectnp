(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#gate-scene");
  const ctx = canvas.getContext("2d", { alpha: false });
  const tapeDialog = $("#tape-dialog");
  const sealDialog = $("#seal-dialog");
  const glitchScreen = $("#glitch-screen");
  const ruffleContainer = $("#ruffle-container");
  const SAVE_KEY = "np-gate-09-progress-v1";
  const PLAY_SECONDS = 300;
  const seals = [
    { name: "The Game", label: "RECOVERED MEDIA", note: "A children's game was found cached in the gate's dispatch system. Its last three seconds are missing from the official record." },
    { name: "Clock Drift", label: "TIME RECORD", note: "Four clocks disagree about the same arrival. The difference is stable. The explanation is not." },
    { name: "The Missing Image", label: "VISUAL ARCHIVE", note: "One frame is absent from a sequence of historical photographs. The ground beneath it has not changed." },
    { name: "Instrument 04", label: "3D RECONSTRUCTION", note: "A sleigh instrument was recovered with its faces turned inward. It has no visible maker's mark." },
    { name: "Night Signal", label: "AUDIO RECORD", note: "Two voices occupy the same recording. The louder one is dated after the tape was sealed." },
    { name: "The Fix", label: "POSITION REPORT", note: "Three bearings end at a point that does not appear on the map. All three reports name the same place." },
    { name: "Archive Copy", label: "VERSION HISTORY", note: "The stored page changed before it was created. Its earliest version contains the most recent date." },
    { name: "Route Loop", label: "PATH ANALYSIS", note: "The delivery path returns to its first stop. The first stop appears in the log before the campus existed." },
    { name: "Dispatch 09", label: "LIVE TRANSMISSION", note: "The scheduled messages arrive at :30. Their recorded receipt times are always one hour earlier." },
    { name: "Continuity", label: "FINAL RECONSTRUCTION", note: "The gate has ten seals. The station ledger has eleven names." }
  ];
  let progress = readProgress();
  let gamePlayer = null;
  let timerInterval = null;
  let lastTick = 0;
  let pointer = { down: false, x: 0, y: 0, yaw: -.14, pitch: -.06, targetYaw: -.14, targetPitch: -.06 };
  let width = 0, height = 0, dpr = 1, stars = [], snow = [], gateHitboxes = [];

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      return { seconds: Math.max(0, Math.min(PLAY_SECONDS, Number(saved.seconds) || 0)), revealed: Boolean(saved.revealed), seals: Array.isArray(saved.seals) ? saved.seals : [] };
    } catch { return { seconds: 0, revealed: false, seals: [] }; }
  }
  function saveProgress() { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }
  function updateClock() { $("#utc-clock").textContent = new Date().toISOString().slice(11, 19) + " UTC"; }

  function setupCanvas() {
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    width = rect.width; height = rect.height; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.floor(width * height / 5200) }, () => ({ x: Math.random() * width, y: Math.random() * height * .58, r: Math.random() * 1.2 + .2, a: Math.random() * .48 + .08, p: Math.random() * 6 }));
    snow = Array.from({ length: Math.floor(width * height / 3000) }, () => ({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.8 + .3, v: Math.random() * .42 + .1, drift: Math.random() * .4 - .2 }));
  }
  function rotate(v) {
    let [x, y, z] = v;
    const cy = Math.cos(pointer.yaw), sy = Math.sin(pointer.yaw); [x, z] = [x * cy - z * sy, x * sy + z * cy];
    const cp = Math.cos(pointer.pitch), sp = Math.sin(pointer.pitch); [y, z] = [y * cp - z * sp, y * sp + z * cp];
    return [x, y, z];
  }
  function project(v) {
    const p = rotate(v), camera = 13.5, scale = Math.min(width, height) * .67;
    const depth = camera - p[2];
    if (depth < 1) return null;
    return { x: width * .5 + p[0] * scale / depth, y: height * .51 - p[1] * scale / depth, z: p[2], scale: scale / depth };
  }
  function poly(points, color, alpha = 1, stroke = null) {
    const q = points.map(project); if (q.some(v => !v)) return;
    ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); q.slice(1).forEach(v => ctx.lineTo(v.x, v.y)); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .7; ctx.stroke(); } ctx.globalAlpha = 1;
    return q;
  }
  function box(cx, cy, cz, sx, sy, sz, palette) {
    const x0 = cx - sx/2, x1 = cx + sx/2, y0 = cy - sy/2, y1 = cy + sy/2, z0 = cz - sz/2, z1 = cz + sz/2;
    const f = [
      { p:[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],c:palette[0] },
      { p:[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],c:palette[1] },
      { p:[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],c:palette[2] },
      { p:[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],c:palette[3] },
      { p:[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],c:palette[4] }
    ];
    return f.sort((a,b)=>a.p.reduce((s,v)=>s+v[2],0)-b.p.reduce((s,v)=>s+v[2],0)).map(f=>poly(f.p,f.c,1,"rgba(213,229,232,.13)"));
  }
  function ring(cx, cy, cz, radius, tube, color, id = -1) {
    const segments = 32, quads = [], center = [cx, cy, cz];
    for (let i=0; i<segments; i++) {
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      for (let j=0; j<8; j++) {
        const c=j/8*Math.PI*2,d=(j+1)/8*Math.PI*2;
        const pt=(ang,off)=>[center[0]+(radius+Math.cos(off)*tube)*Math.cos(ang),center[1]+(radius+Math.cos(off)*tube)*Math.sin(ang),center[2]+Math.sin(off)*tube];
        const vertices=[pt(a,c),pt(b,c),pt(b,d),pt(a,d)];
        const depth=vertices.reduce((s,v)=>s+rotate(v)[2],0)/4;
        quads.push({vertices,depth});
      }
    }
    quads.sort((a,b)=>a.depth-b.depth).forEach((q,i)=>{
      const out=poly(q.vertices,(i%8===0)?"#9babb1":color,.96,"rgba(224,236,239,.22)");
      if(id>=0 && out){const box=out.reduce((a,v)=>({minX:Math.min(a.minX,v.x),maxX:Math.max(a.maxX,v.x),minY:Math.min(a.minY,v.y),maxY:Math.max(a.maxY,v.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});gateHitboxes[id]=box;}
    });
  }
  function drawScene(now) {
    ctx.clearRect(0,0,width,height);
    const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,"#111a23");sky.addColorStop(.55,"#1a2832");sky.addColorStop(1,"#080c11");ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    stars.forEach(s=>{ctx.globalAlpha=s.a*(.78+Math.sin(now/1800+s.p)*.22);ctx.fillStyle="#d5e6ec";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
    const aurora=ctx.createLinearGradient(0,height*.18,width,height*.55);aurora.addColorStop(0,"rgba(74,112,115,0)");aurora.addColorStop(.45,"rgba(82,124,125,.1)");aurora.addColorStop(.72,"rgba(73,97,118,.08)");aurora.addColorStop(1,"rgba(74,112,115,0)");ctx.fillStyle=aurora;ctx.fillRect(0,height*.12,width,height*.45);
    const horizon=height*.73;ctx.fillStyle="#0a1015";ctx.beginPath();ctx.moveTo(0,horizon+8);for(let x=0;x<=width;x+=width/12)ctx.lineTo(x,horizon+Math.sin(x*.012)*9+Math.cos(x*.021)*5);ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.fill();
    ctx.fillStyle="rgba(176,199,207,.045)";ctx.beginPath();ctx.ellipse(width*.5,height*.83,width*.43,height*.09,0,0,Math.PI*2);ctx.fill();
    // Snow mound beneath the iron threshold.
    poly([[-5,-.03,2],[5,-.03,2],[5,-.03,-3],[-5,-.03,-3]],"#bdcbd0",.12);
    // Massive stone-and-iron posts and lintel.
    box(-2.35,1.45,0,.48,3.15,.52,["#39434a","#202a31","#4b555b","#46545b","#1a2026"]);
    box(2.35,1.45,0,.48,3.15,.52,["#39434a","#202a31","#4b555b","#46545b","#1a2026"]);
    box(0,3.0,0,5.2,.52,.62,["#4b555b","#283239","#48545a","#67747a","#252d33"]);
    box(0,2.63,.02,3.95,.17,.54,["#171e24","#131a20","#374047","#535e64","#12181e"]);
    // Gate leaves, braces and frost-edged bars.
    box(-1.03,1.32,.18,1.96,2.46,.18,["#202a31","#151d23","#34414a","#56646c","#12191f"]);
    box(1.03,1.32,.18,1.96,2.46,.18,["#202a31","#151d23","#34414a","#56646c","#12191f"]);
    for(let k=0;k<7;k++){
      const x=-1.82+k*.52;
      box(x,1.34,.33,.045,2.28,.045,["#61727b","#39464d","#91a0a5","#a8b4b6","#344047"]);
      box(x,.96,.38,.1,.13,.1,["#75858b","#465157","#8d9ca2","#b8c4c7","#414d53"]);
    }
    // The ten rotating seals sit on a custom three-dimensional rail.
    gateHitboxes=[];
    for(let i=0;i<10;i++){
      const x=-1.58+(i%5)*.79, y=i<5?2.05:.65;
      const ready=i===0&&progress.revealed;
      ring(x,y,.56,.18,.027,ready?"#b9d1d8":"#71838a",i);
      const p=project([x,y,.78]);
      if(p){const r=Math.max(8,p.scale*.21);gateHitboxes[i]={minX:p.x-r,maxX:p.x+r,minY:p.y-r,maxY:p.y+r};ctx.fillStyle=ready?"#c4d9df":"#74838a";ctx.globalAlpha=ready?.92:.48;ctx.font=`${Math.max(7,Math.min(10,p.scale*5))}px IBM Plex Mono,monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(i+1).padStart(2,"0"),p.x,p.y);ctx.globalAlpha=1;}
    }
    // A distant red lamp marks the sealed side of the gate.
    const lamp=project([0,2.82,.8]);if(lamp){const pulse=.5+Math.sin(now/1100)*.16;ctx.fillStyle=`rgba(164,65,59,${pulse})`;ctx.shadowColor="#aa4640";ctx.shadowBlur=11;ctx.beginPath();ctx.arc(lamp.x,lamp.y,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    snow.forEach(f=>{f.y+=f.v;f.x+=f.drift;if(f.y>height){f.y=-4;f.x=Math.random()*width}if(f.x<0)f.x=width;if(f.x>width)f.x=0;ctx.fillStyle="rgba(213,226,231,.55)";ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();});
    pointer.yaw+=(pointer.targetYaw-pointer.yaw)*.08;pointer.pitch+=(pointer.targetPitch-pointer.pitch)*.08;
    requestAnimationFrame(drawScene);
  }
  function renderSealList() {
    const grid=$("#seal-grid");grid.replaceChildren();
    seals.forEach((seal,i)=>{const button=document.createElement("button");button.className="seal-cell"+(i===0&&progress.revealed?" ready":"");button.textContent=String(i+1).padStart(2,"0");button.setAttribute("aria-label",`Inspect seal ${i+1}: ${seal.name}`);button.addEventListener("click",()=>openSeal(i));grid.append(button);});
    const count=progress.revealed?"01":"00";$("#seal-status").textContent=`SEALS: ${count} / 10`;$("#seal-count").textContent=`${count}—10`;$("#gate-state").textContent=progress.revealed?"ONE SEAL RELEASED":"SEALED";
  }
  function openSeal(i) {
    const seal=seals[i];$("#seal-kicker").textContent=`SEAL ${String(i+1).padStart(2,"0")} / ${seal.label}`;$("#seal-heading").textContent=seal.name;$("#seal-description").textContent=seal.note;
    const ready=i===0&&progress.revealed;
    $("#seal-record").textContent=ready?"Recovered after active playback: ‘THE GAME DID NOT END. IT NOTICED YOU.’ The seal is warm." : i===0 ? "No data recovered. The archive tape may contain the missing record." : "The record has not been recovered. The seal is locked from the other side.";
    sealDialog.dataset.ready=String(ready);sealDialog.showModal();
  }
  function openTape() {
    tapeDialog.showModal();document.body.classList.remove("glitched");glitchScreen.classList.remove("active");glitchScreen.setAttribute("aria-hidden","true");
    if(progress.revealed){revealGlitch(false);return;}
    loadRuffle();startTimer();
  }
  function loadRuffle() {
    if(gamePlayer)return;
    const init=()=>{
      try {
        const ruffle=window.RufflePlayer?.newest();
        if(!ruffle)throw new Error("Ruffle runtime unavailable");
        gamePlayer=ruffle.createPlayer();gamePlayer.className="ruffle-game";gamePlayer.setAttribute("aria-label","Recovered Flash game");
        ruffleContainer.replaceChildren(gamePlayer);
        gamePlayer.ruffle().load("assets/christmas-cat-17945-lore.swf").then(()=>{$("#player-loading")?.remove();}).catch(()=>showPlayerError());
      } catch { showPlayerError(); }
    };
    if(window.RufflePlayer)init();else {const script=document.querySelector('script[src*="ruffle"]');script?.addEventListener("load",init,{once:true});script?.addEventListener("error",showPlayerError,{once:true});setTimeout(()=>{if(!gamePlayer&& !window.RufflePlayer)showPlayerError();},12000);}
  }
  function showPlayerError() {
    if($("#player-error"))return;
    const error=document.createElement("div");error.id="player-error";error.className="player-error";error.innerHTML='<span class="eyebrow">PLAYER COULD NOT INITIALIZE</span><p>The recording is available as a direct file. Try another browser or use the local download.</p><a href="assets/christmas-cat-17945-lore.swf" download>DOWNLOAD RECOVERED MEDIA ↗</a>';
    ruffleContainer.replaceChildren(error);
  }
  function startTimer() {
    if(timerInterval||progress.revealed)return;lastTick=Date.now();
    timerInterval=setInterval(()=>{
      const now=Date.now();if(!document.hidden&&tapeDialog.open)progress.seconds=Math.min(PLAY_SECONDS,progress.seconds+(now-lastTick)/1000);lastTick=now;saveProgress();renderTimer();
      if(progress.seconds>=PLAY_SECONDS){clearInterval(timerInterval);timerInterval=null;progress.revealed=true;progress.seals=[1];saveProgress();renderSealList();revealGlitch(true);}
    },250);
  }
  function renderTimer() {
    const s=Math.floor(progress.seconds),m=Math.floor(s/60),sec=s%60;$("#play-timer").textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")} / 05:00`;
    $("#timer-progress").style.width=`${Math.min(100,progress.seconds/PLAY_SECONDS*100)}%`;
  }
  function revealGlitch(first) {
    progress.revealed=true;saveProgress();renderSealList();glitchScreen.classList.add("active");glitchScreen.setAttribute("aria-hidden","false");document.body.classList.add("glitched");
    if(first){$("#transmission-card").innerHTML='<div class="transmission-header"><span>INCOMING / SOURCE: INSIDE</span><span class="rec-dot">● LIVE</span></div><p>“The game did not end. It noticed you.”</p><span class="transmission-footer">RECEIVED AT: 00:05:00</span>';}
  }
  function closeTape(){if(tapeDialog.open)tapeDialog.close();}
  function setGateTarget(i){
    if(i<0||i>9)return;pointer.targetYaw=(i%5-2)*.12;pointer.targetPitch=i<5?-.16:.03;
    const cell=$(".seal-cell:nth-child("+(i+1)+")");cell?.focus({preventScroll:true});openSeal(i);
  }
  canvas.addEventListener("pointerdown",e=>{pointer.down=true;pointer.x=e.clientX;pointer.y=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{if(!pointer.down)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer.targetYaw=Math.max(-.7,Math.min(.7,pointer.targetYaw+dx*.004));pointer.targetPitch=Math.max(-.32,Math.min(.32,pointer.targetPitch+dy*.002));pointer.x=e.clientX;pointer.y=e.clientY;});
  canvas.addEventListener("pointerup",e=>{pointer.down=false;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const hit=gateHitboxes.findIndex(b=>b&&x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY);if(hit>=0)setGateTarget(hit);});
  canvas.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"){pointer.targetYaw-=.08;e.preventDefault()}if(e.key==="ArrowRight"){pointer.targetYaw+=.08;e.preventDefault()}if(e.key==="Enter"||e.key===" "){setGateTarget(0);e.preventDefault()}});
  $("#recover-button").addEventListener("click",openTape);
  $("#close-tape").addEventListener("click",closeTape);
  $("#ack-glitch").addEventListener("click",()=>{closeTape();document.body.classList.remove("glitched");});
  $("#close-seal").addEventListener("click",()=>sealDialog.close());
  $("#seal-action").addEventListener("click",()=>{sealDialog.close();openTape();});
  tapeDialog.addEventListener("click",e=>{if(e.target===tapeDialog)closeTape();});
  sealDialog.addEventListener("click",e=>{if(e.target===sealDialog)sealDialog.close();});
  window.addEventListener("resize",setupCanvas);
  updateClock();setInterval(updateClock,1000);setupCanvas();renderSealList();renderTimer();requestAnimationFrame(drawScene);
})();
