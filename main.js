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
  const IDLE_CUE_MS = 15000;
  const AWAY_CUE_MS = 30000;
  const VOICE_KEY = "np-gate-09-voice-v1";
  let voiceEnabled = localStorage.getItem(VOICE_KEY) !== "off";
  let lastActivityAt = Date.now();
  let awaySince = document.hidden ? Date.now() : null;
  let lastVoiceCueAt = 0;
  let idleCueTimer = null;
  const puzzles = window.NP_PUZZLES;
  let progress = readProgress();
  let gamePlayer = null;
  let timerInterval = null;
  let lastTick = 0;
  let pointer = { down: false, x: 0, y: 0, yaw: -.14, pitch: -.06, targetYaw: -.14, targetPitch: -.06 };
  const GATE_SPACING = 9.5;
  let width = 0, height = 0, dpr = 1, stars = [], snow = [], gateHitboxes = [];
  let currentPuzzle = -1, cameraProgress = progress.solved.length * GATE_SPACING, lastFrameTime = 0;
  const doorOpenLevels = Array.from({ length: 10 }, (_, i) => i < progress.solved.length ? 1 : 0);

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      const revealed = Boolean(saved.revealed);
      const solved = Array.isArray(saved.solved) ? [...new Set(saved.solved.filter(n => Number.isInteger(n) && n >= 0 && n < 10))] : [];
      return { seconds: Math.max(0, Math.min(PLAY_SECONDS, Number(saved.seconds) || 0)), revealed, unlocked: Math.max(Number(saved.unlocked) || 0, revealed ? 1 : 0, solved.length ? Math.max(...solved) + 2 : 0), solved, hints: saved.hints && typeof saved.hints === "object" ? saved.hints : {}, fragments: Array.isArray(saved.fragments) ? saved.fragments.slice(0,10) : [], finished: Boolean(saved.finished) };
    } catch { return { seconds: 0, revealed: false, unlocked: 0, solved: [], hints: {}, fragments: [], finished: false }; }
  }
  function saveProgress() { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }
  function updateClock() { $("#utc-clock").textContent = new Date().toISOString().slice(11, 19) + " UTC"; }

  function updateVoiceControl() {
    const button = $("#voice-toggle");
    if (!button) return;
    button.textContent = `VOICE: ${voiceEnabled ? "ON" : "OFF"}`;
    button.setAttribute("aria-pressed", String(voiceEnabled));
  }
  function speakPlayCue() {
    if (!voiceEnabled || Date.now() - lastVoiceCueAt < 90000) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance("play the game");
    utterance.volume = 0.12;
    utterance.rate = 0.82;
    utterance.pitch = 0.62;
    utterance.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    lastVoiceCueAt = Date.now();
  }
  function scheduleIdleCue() {
    clearTimeout(idleCueTimer);
    if (document.hidden) return;
    const remaining = Math.max(0, IDLE_CUE_MS - (Date.now() - lastActivityAt));
    idleCueTimer = setTimeout(() => {
      if (!document.hidden && Date.now() - lastActivityAt >= IDLE_CUE_MS) speakPlayCue();
    }, remaining);
  }
  function noteActivity() {
    lastActivityAt = Date.now();
    if (!document.hidden) scheduleIdleCue();
  }
  function markAway() {
    if (awaySince === null) awaySince = Date.now();
    clearTimeout(idleCueTimer);
  }
  function returnToPage() {
    const awayDuration = awaySince === null ? 0 : Date.now() - awaySince;
    awaySince = null;
    if (awayDuration >= AWAY_CUE_MS) speakPlayCue();
    lastActivityAt = Date.now();
    scheduleIdleCue();
  }
  function initializePresenceCue() {
    const voiceButton = $("#voice-toggle");
    updateVoiceControl();
    voiceButton?.addEventListener("click", () => {
      voiceEnabled = !voiceEnabled;
      localStorage.setItem(VOICE_KEY, voiceEnabled ? "on" : "off");
      if (!voiceEnabled) window.speechSynthesis?.cancel();
      updateVoiceControl();
      noteActivity();
    });
    ["pointermove", "pointerdown", "keydown", "touchstart", "wheel", "click"].forEach(type => {
      window.addEventListener(type, noteActivity, { passive: type !== "keydown" });
    });
    document.addEventListener("visibilitychange", () => document.hidden ? markAway() : returnToPage());
    window.addEventListener("blur", markAway);
    window.addEventListener("focus", () => { if (!document.hidden) returnToPage(); });
    if (document.hidden) markAway(); else scheduleIdleCue();
  }

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
    const p = rotate([v[0], v[1] - 1.45, v[2] + cameraProgress]), camera = 8.4, scale = Math.min(width, height) * 1.2;
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
  function transformLeafPoint(x, y, z, hingeX, angle) {
    const dx = x - hingeX, c = Math.cos(angle), sn = Math.sin(angle);
    return [hingeX + dx * c, y, z - dx * sn];
  }
  function drawDoorLeaf(hingeX, side, y0, y1, z, amount, creep) {
    const angle = amount * 1.32 * (side === "left" ? 1 : -1);
    const freeX = side === "left" ? 0 : hingeX;
    const outerX = side === "left" ? hingeX : 0;
    const frontZ = z + .14;
    const face = [
      transformLeafPoint(outerX, y0, frontZ, hingeX, angle),
      transformLeafPoint(freeX, y0, frontZ, hingeX, angle),
      transformLeafPoint(freeX, y1, frontZ, hingeX, angle),
      transformLeafPoint(outerX, y1, frontZ, hingeX, angle)
    ];
    const edge = [
      transformLeafPoint(outerX, y0, z - .05, hingeX, angle),
      transformLeafPoint(outerX, y1, z - .05, hingeX, angle),
      transformLeafPoint(outerX, y1, frontZ, hingeX, angle),
      transformLeafPoint(outerX, y0, frontZ, hingeX, angle)
    ];
    const base = Math.round(38 - creep * 18), red = Math.round(48 + creep * 42);
    poly(edge, `rgb(${base},${base + 8},${base + 12})`, 1, "rgba(195,215,220,.24)");
    poly(face, `rgb(${base - 6},${base},${base + 6})`, 1, `rgba(${135 + red},${160 - creep * 55},${170 - creep * 75},.42)`);
    for (let rail = 0; rail < 3; rail++) {
      const y = y0 + .32 + rail * .82;
      const a = transformLeafPoint(outerX + (side === "left" ? .16 : -.16), y, frontZ + .012, hingeX, angle);
      const b = transformLeafPoint(freeX + (side === "left" ? -.16 : .16), y, frontZ + .012, hingeX, angle);
      const c = transformLeafPoint(freeX + (side === "left" ? -.16 : .16), y + .035, frontZ + .012, hingeX, angle);
      const d = transformLeafPoint(outerX + (side === "left" ? .16 : -.16), y + .035, frontZ + .012, hingeX, angle);
      poly([a,b,c,d], creep > .45 ? "#593b3d" : "#71818a", .78);
    }
    const braceA = transformLeafPoint(outerX, y0 + .18, frontZ + .02, hingeX, angle);
    const braceB = transformLeafPoint(freeX, y1 - .18, frontZ + .02, hingeX, angle);
    const braceC = transformLeafPoint(freeX, y1 - .22, frontZ + .02, hingeX, angle);
    const braceD = transformLeafPoint(outerX, y0 + .14, frontZ + .02, hingeX, angle);
    poly([braceA,braceB,braceC,braceD], creep > .55 ? "#75413e" : "#42515a", .8);
  }
  function drawGate(index, z, amount, creep, active) {
    const iron = creep > .72 ? ["#3a282a","#231c20","#503539","#674448","#17171b"] : ["#39434a","#202a31","#4b555b","#46545b","#1a2026"];
    // A black throat behind every door makes the next opening feel deep.
    poly([[-1.78,.2,z-.12],[1.78,.2,z-.12],[1.78,3.18,z-.12],[-1.78,3.18,z-.12]], creep > .5 ? "#09080b" : "#080d12", 1);
    box(-2.05,1.67,z,.42,3.5,.5,iron);
    box(2.05,1.67,z,.42,3.5,.5,iron);
    box(0,3.36,z,4.55,.42,.5,iron);
    box(-1.78,1.65,z+.05,.14,3.12,.62,["#71828a","#38464c","#8b9ba0","#9ba8ab","#3b464b"]);
    box(1.78,1.65,z+.05,.14,3.12,.62,["#71828a","#38464c","#8b9ba0","#9ba8ab","#3b464b"]);
    box(0,3.08,z+.04,3.62,.12,.58,["#64747b","#303c42","#8b999e","#a3afb2","#323c42"]);
    drawDoorLeaf(-1.68,"left",.12,3.12,z,amount,creep);
    drawDoorLeaf(1.68,"right",.12,3.12,z,amount,creep);
    // Hinges, rivets and a changing warning mark make each threshold distinct.
    for (let side of [-1,1]) {
      for (let y of [.48,1.28,2.08,2.88]) {
        box(side*1.68,y,z+.34,.13,.16,.1,creep > .6 ? ["#8b5149","#3b292b","#b05c50","#bd7864","#36272a"] : ["#82949a","#48565c","#aab7ba","#b5c0c2","#414c51"]);
      }
    }
    if (creep > .18) {
      const spread = .18 + creep * .32;
      poly([[-1.78,2.95,z+.3],[-1.78-spread,2.2,z+.3],[-1.72,1.7,z+.3],[-1.86-spread,1.05,z+.3],[-1.78,.35,z+.3]], "#572f34", .56);
      poly([[1.78,2.85,z+.3],[1.78+spread,2.2,z+.3],[1.73,1.55,z+.3],[1.9+spread,.8,z+.3],[1.78,.35,z+.3]], "#572f34", .5);
    }
    if (active) {
      const solved = progress.solved.includes(index), tint = solved ? "#c8dedf" : creep > .65 ? "#b7574d" : "#98b5bd";
      ring(0,1.65,z+.53,.28,.055,tint,index);
      const p = project([0,1.65,z+.82]);
      if (p) {
        const r = Math.max(13,p.scale*.42);
        gateHitboxes[index] = { minX:p.x-r, maxX:p.x+r, minY:p.y-r, maxY:p.y+r };
        ctx.fillStyle = tint; ctx.globalAlpha = .92; ctx.font = `600 ${Math.max(9,Math.min(15,p.scale*7))}px IBM Plex Mono,monospace`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(String(index+1).padStart(2,"0"),p.x,p.y); ctx.globalAlpha=1;
      }
    }
  }
  function drawScene(now) {
    const dt = lastFrameTime ? Math.min(.05,(now-lastFrameTime)/1000) : 0;
    lastFrameTime = now;
    const completed = Math.min(10,progress.solved.length);
    const targetProgress = completed >= 10 ? 10 * GATE_SPACING + 6 : completed * GATE_SPACING + 3.1;
    if (dt) cameraProgress += Math.sign(targetProgress-cameraProgress) * Math.min(Math.abs(targetProgress-cameraProgress),dt*1.05);
    const creep = Math.min(1,completed/9);
    const red = Math.round(10+creep*25), ice = Math.round(34-creep*18);
    ctx.clearRect(0,0,width,height);
    const sky=ctx.createLinearGradient(0,0,0,height);
    sky.addColorStop(0,`rgb(${14+red},${22- creep*8},${30- creep*10})`);
    sky.addColorStop(.5,`rgb(${17+red},${31- creep*11},${39- creep*12})`);
    sky.addColorStop(1,"#050609");ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    stars.forEach(s=>{ctx.globalAlpha=s.a*(.78+Math.sin(now/1800+s.p)*.22);ctx.fillStyle=creep>.65&&s.p>3?"#bd6b62":"#d5e6ec";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
    const aurora=ctx.createLinearGradient(0,height*.18,width,height*.55);aurora.addColorStop(0,"rgba(74,112,115,0)");aurora.addColorStop(.45,`rgba(${82+red},${124-creep*75},${125-creep*70},${.1+creep*.08})`);aurora.addColorStop(.72,"rgba(73,97,118,.08)");aurora.addColorStop(1,"rgba(74,112,115,0)");ctx.fillStyle=aurora;ctx.fillRect(0,height*.12,width,height*.45);
    const nearZ=6-cameraProgress,farZ=-74-cameraProgress;
    // The hall floor and walls are projected as perspective planes, so the camera really travels through them.
    poly([[-3.25,-.08,nearZ],[3.25,-.08,nearZ],[3.25,-.08,farZ],[-3.25,-.08,farZ]],`rgb(${10+ice},${15+ice},${19+ice})`,1,"rgba(159,179,186,.12)");
    poly([[-3.25,0,nearZ],[-3.25,0,farZ],[-3.25,4.1,farZ],[-3.25,4.1,nearZ]],`rgb(${17+ice},${23+ice},${28+ice})`,1,"rgba(160,181,187,.11)");
    poly([[3.25,0,nearZ],[3.25,4.1,nearZ],[3.25,4.1,farZ],[3.25,0,farZ]],`rgb(${13+ice},${18+ice},${23+ice})`,1,"rgba(160,181,187,.11)");
    poly([[-3.25,4.1,nearZ],[3.25,4.1,nearZ],[3.25,4.1,farZ],[-3.25,4.1,farZ]],`rgb(${12+ice},${18+ice},${23+ice})`,.88);
    // Repeating ribs, floor seams and lamps create a long sense of forward motion.
    for(let step=0;step<16;step++){
      const z=6-cameraProgress-step*4.5;
      box(-3.08,2.05,z,.2,4.1,.2,["#252f35","#171d22","#3e4a50","#4a555b","#151a1f"]);
      box(3.08,2.05,z,.2,4.1,.2,["#252f35","#171d22","#3e4a50","#4a555b","#151a1f"]);
      poly([[-3.18,2.1,z+.04],[-3.2,2.1,z-.12],[-3.2,2.7,z-.12],[-3.18,2.7,z+.04]],creep>.5?"#7b403c":"#75919b",.16+creep*.22);
      if(step%2===0) box(0,3.92,z,6.3,.1,.18,["#344148","#1b242a","#56636a","#657279","#1a2026"]);
    }
    // Door leaves open with a slow hinge swing as a seal clears; the corridor advances to the next threshold.
    gateHitboxes=[];
    for(let i=9;i>=0;i--){
      const target=i<completed?1:0;
      doorOpenLevels[i]+=(target-doorOpenLevels[i])*Math.min(1,dt*.72);
      if(Math.abs(target-doorOpenLevels[i])<.002)doorOpenLevels[i]=target;
      drawGate(i,-i*GATE_SPACING,doorOpenLevels[i],creep,i===Math.min(9,completed));
    }
    // Close red light and small drifting ice flecks intensify with each recovered record.
    const lamp=project([0,3.55,3.8-cameraProgress]);
    if(lamp){const pulse=.42+Math.sin(now/(920-creep*300))*(.12+creep*.1);ctx.fillStyle=`rgba(175,${70-creep*34},${65-creep*28},${pulse})`;ctx.shadowColor=creep>.35?"#b23d38":"#aa4640";ctx.shadowBlur=10+creep*20;ctx.beginPath();ctx.arc(lamp.x,lamp.y,2+creep*3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    snow.forEach(f=>{f.y+=f.v*(1+creep*.5);f.x+=f.drift;if(f.y>height){f.y=-4;f.x=Math.random()*width}if(f.x<0)f.x=width;if(f.x>width)f.x=0;ctx.fillStyle=creep>.75&&f.r>1.2?"rgba(190,92,82,.46)":"rgba(213,226,231,.48)";ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();});
    pointer.yaw+=(pointer.targetYaw-pointer.yaw)*.06;pointer.pitch+=(pointer.targetPitch-pointer.pitch)*.06;
    requestAnimationFrame(drawScene);
  }
  function renderSealList() {
    const grid=$("#seal-grid");grid.replaceChildren();
    puzzles.forEach((puzzle,i)=>{const button=document.createElement("button");const solved=progress.solved.includes(i),available=i<progress.unlocked;button.className="seal-cell"+(available?" ready":"")+(solved?" solved":"")+(available&&!solved?" available":"");button.textContent=String(i+1).padStart(2,"0");button.setAttribute("aria-label",`${solved?"Solved":available?"Available":"Locked"} puzzle ${i+1}: ${puzzle.name}`);button.addEventListener("click",()=>openSeal(i));grid.append(button);});
    const count=String(progress.solved.length).padStart(2,"0");$("#seal-status").textContent=`SEALS: ${count} / 10`;$("#seal-count").textContent=`${count}—10`;$("#gate-state").textContent=progress.finished?"OPEN / RECORDING":""+(progress.solved.length?`${String(progress.solved.length).padStart(2,"0")} SEALS RELEASED`:progress.revealed?"FIRST SEAL RELEASED":"SEALED");
  }
  function openSeal(i) {
    const puzzle=puzzles[i],available=i<progress.unlocked,solved=progress.solved.includes(i);
    $("#seal-kicker").textContent=`SEAL ${String(i+1).padStart(2,"0")} / ${puzzle.label}`;$("#seal-heading").textContent=puzzle.name;$("#seal-description").textContent=puzzle.note;
    const body=$("#puzzle-body"),form=$("#puzzle-form"),hint=$("#hint-button"),record=$("#seal-record");
    currentPuzzle=i;
    if(!available){body.innerHTML='<div class="locked-record"><span class="locked-glyph">×</span><b>NO AUTHORIZED ENTRY</b><span>The previous seal has not released this record.</span></div>';form.hidden=true;hint.hidden=true;record.textContent="THE LOCK IS COLD.";}
    else {
      body.innerHTML=puzzle.html;form.hidden=solved;hint.hidden=solved;record.textContent=solved?`RECOVERED FRAGMENT: ${progress.fragments[i]||puzzle.fragment}`:"Each solved record leaves one fragment in the gate.";
      $("#puzzle-answer").value="";$("#puzzle-feedback").textContent=solved?"SEAL ALREADY RELEASED.":"";
      const hintCount=Number(progress.hints[i])||0;hint.textContent=hintCount>=puzzle.hints.length?"HINT FILES EXHAUSTED":`REQUEST HINT ${String(hintCount+1).padStart(2,"0")} / 0${puzzle.hints.length}`;hint.disabled=hintCount>=puzzle.hints.length;
      initializePuzzleWidget(i,body);
    }
    sealDialog.showModal();
  }
  function openTape() {
    tapeDialog.showModal();document.body.classList.remove("glitched");glitchScreen.classList.remove("active");glitchScreen.setAttribute("aria-hidden","true");
    loadRuffle();if(progress.revealed){revealGlitch(false);return;}startTimer();
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
      if(progress.seconds>=PLAY_SECONDS){clearInterval(timerInterval);timerInterval=null;progress.revealed=true;saveProgress();renderSealList();revealGlitch(true);}
    },250);
  }
  function renderTimer() {
    const s=Math.floor(progress.seconds),m=Math.floor(s/60),sec=s%60;$("#play-timer").textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")} / 05:00`;
    $("#timer-progress").style.width=`${Math.min(100,progress.seconds/PLAY_SECONDS*100)}%`;
  }
  function revealGlitch(first) {
    progress.revealed=true;progress.unlocked=Math.max(progress.unlocked,1);saveProgress();renderSealList();glitchScreen.classList.add("active");glitchScreen.setAttribute("aria-hidden","false");document.body.classList.add("glitched");
    if(first){$("#transmission-card").innerHTML='<div class="transmission-header"><span>INCOMING / SOURCE: INSIDE</span><span class="rec-dot">● LIVE</span></div><p>“The game did not end. It noticed you.”</p><span class="transmission-footer">RECEIVED AT: 00:05:00</span>';}
  }
  function normalizedAnswer(value){return value.toUpperCase().replace(/[^A-Z0-9]/g,"");}
  async function answerDigest(value){const data=new TextEncoder().encode(value),digest=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  async function solveCurrentPuzzle(event){
    event.preventDefault();if(currentPuzzle<0||currentPuzzle>=puzzles.length)return;
    const puzzle=puzzles[currentPuzzle],answer=normalizedAnswer($("#puzzle-answer").value);
    try{if(await answerDigest(answer)!==puzzle.answerHash){$("#puzzle-feedback").textContent="NO MATCH. THE SEAL REMAINS COLD.";$("#puzzle-feedback").classList.add("error");return;}}catch{$("#puzzle-feedback").textContent="SECURE SUBMISSION REQUIRES HTTPS OR LOCALHOST.";$("#puzzle-feedback").classList.add("error");return;}
    $("#puzzle-feedback").classList.remove("error");$("#puzzle-feedback").textContent=`RECORD ACCEPTED. FRAGMENT RECOVERED: ${puzzle.fragment}`;
    if(!progress.solved.includes(currentPuzzle))progress.solved.push(currentPuzzle);
    progress.fragments[currentPuzzle]=puzzle.fragment;progress.unlocked=Math.max(progress.unlocked,Math.min(10,currentPuzzle+2));
    if(currentPuzzle===9){progress.finished=true;$("#transmission-card").innerHTML='<div class="transmission-header"><span>INCOMING / GATE 09</span><span class="rec-dot">● OPEN</span></div><p>“The route was looking for its beginning. It found the side we were standing on.”</p><span class="transmission-footer">SOURCE: INSIDE · FINAL ENTRY</span>';}
    saveProgress();renderSealList();$("#seal-record").textContent=`RECOVERED FRAGMENT: ${puzzle.fragment}`;$("#puzzle-form").hidden=true;$("#hint-button").hidden=true;
    setTimeout(()=>{if(sealDialog.open)sealDialog.close();},1200);
  }
  function requestHint(){
    const puzzle=puzzles[currentPuzzle],count=Number(progress.hints[currentPuzzle])||0;
    if(!puzzle||count>=puzzle.hints.length)return;
    $("#puzzle-feedback").classList.remove("error");$("#puzzle-feedback").textContent=`HINT ${count+1}: ${puzzle.hints[count]}`;
    progress.hints[currentPuzzle]=count+1;saveProgress();
    $("#hint-button").textContent=count+1>=puzzle.hints.length?"HINT FILES EXHAUSTED":`REQUEST HINT ${String(count+2).padStart(2,"0")} / 0${puzzle.hints.length}`;
    $("#hint-button").disabled=count+1>=puzzle.hints.length;
  }
  function initializePuzzleWidget(index,body){
    if(index===1){
      const slider=body.querySelector("#year-slider"),years=["2008","2016","2024"];
      slider?.addEventListener("input",()=>{const year=years[Number(slider.value)];body.querySelector("#year-readout").textContent=year;body.querySelector("#shadow-caption").textContent=`FRAME ${year} / TRACE 0${Number(slider.value)+1}`;body.querySelector("#shadow-shape").style.transform=`rotate(${[-34,0,29][Number(slider.value)]}deg)`;body.querySelector(".shadow-ground").dataset.frame=year;});
    }
    if(index===2){
      const yaw=body.querySelector("#yaw-dial"),pitch=body.querySelector("#pitch-dial"),model=body.querySelector("#instrument-model"),out=body.querySelector("#instrument-output");
      const update=()=>{const y=Number(yaw.value),p=Number(pitch.value);body.querySelector("#yaw-readout").textContent=`${y}°`;body.querySelector("#pitch-readout").textContent=`${p}°`;model.style.transform=`rotateY(${y}deg) rotateX(${p}deg)`;const aligned=Math.abs(y-142)<=2&&Math.abs(p-27)<=2;out.textContent=aligned?"NORTH":"NO SIGHTLINE";out.classList.toggle("revealed",aligned);};yaw?.addEventListener("input",update);pitch?.addEventListener("input",update);
      let dragging=false,lastX=0,lastY=0;model?.addEventListener("pointerdown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;model.setPointerCapture(e.pointerId);});model?.addEventListener("pointermove",e=>{if(!dragging)return;yaw.value=(Number(yaw.value)+Math.round((e.clientX-lastX)*1.4)+360)%360;pitch.value=Math.max(0,Math.min(89,Number(pitch.value)+Math.round((e.clientY-lastY)*.8)));lastX=e.clientX;lastY=e.clientY;update();});model?.addEventListener("pointerup",()=>dragging=false);update();
    }
    if(index===3){
      const wave=body.querySelector("#wave-canvas"),dial=body.querySelector("#phase-dial"),out=body.querySelector("#phase-readout"),decoded=body.querySelector("#decoded-line");
      const draw=()=>{if(!wave)return;const rect=wave.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,1.5);wave.width=rect.width*scale;wave.height=120*scale;const c=wave.getContext("2d");c.setTransform(scale,0,0,scale,0,0);const w=rect.width,h=120,phase=Number(dial.value)*Math.PI/180;c.clearRect(0,0,w,h);c.strokeStyle="rgba(174,193,201,.13)";c.lineWidth=1;c.beginPath();c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();[["#82a9bb",0],["#ad5750",phase]].forEach(([color,offset])=>{c.beginPath();for(let x=0;x<w;x++){const y=h/2+Math.sin(x/w*Math.PI*8+offset)*27;if(x===0)c.moveTo(x,y);else c.lineTo(x,y)}c.strokeStyle=color;c.lineWidth=1.7;c.stroke()});const aligned=Math.abs(Number(dial.value)-180)<=2;decoded.textContent=aligned?"DO NOT ANSWER":"[NO CARRIER LOCK]";decoded.classList.toggle("revealed",aligned);};
      dial?.addEventListener("input",()=>{out.textContent=`${dial.value}°`;draw();});
      if(window.ResizeObserver)new ResizeObserver(draw).observe(wave);else window.addEventListener("resize",draw);
      body.querySelector("#play-tone")?.addEventListener("click",async()=>{try{const AC=window.AudioContext||window.webkitAudioContext,ac=new AC();await ac.resume();for(const [freq,delay] of [[220,0],[330,.22]]){const osc=ac.createOscillator(),gain=ac.createGain();osc.frequency.value=freq;osc.type="sine";gain.gain.setValueAtTime(.0001,ac.currentTime+delay);gain.gain.exponentialRampToValueAtTime(.06,ac.currentTime+delay+.02);gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+delay+.45);osc.connect(gain).connect(ac.destination);osc.start(ac.currentTime+delay);osc.stop(ac.currentTime+delay+.48);}setTimeout(()=>ac.close(),1200);}catch{decoded.textContent="AUDIO UNAVAILABLE — USE THE WAVEFORM."}});
      draw();
    }
    if(index===4){
      const grid=body.querySelector("#campus-grid");if(grid){const letters="ABCDEFGH";for(let row=8;row>=1;row--)for(let col=0;col<8;col++){const cell=document.createElement("button");cell.type="button";cell.className="map-cell";cell.textContent=letters[col]+row;cell.setAttribute("aria-label",`Grid ${letters[col]}${row}`);cell.addEventListener("click",()=>{grid.querySelectorAll(".selected").forEach(n=>n.classList.remove("selected"));cell.classList.add("selected");let output=body.querySelector("#cell-selected");if(!output){output=document.createElement("div");output.id="cell-selected";output.className="query-result";grid.after(output);}output.textContent=`PLOTTED FIX: ${cell.textContent}`;});grid.append(cell);}}
    }
    if(index===5){
      const variants=[
        ["The first campus buildings are being planned. Ground will be broken in 1958.","PAPER COPY / DATE STAMP: 1958"],
        ["The first campus buildings were completed in 1960. The initial class arrived that fall.","REVISED COPY / DATE STAMP: 1960"],
        ["The first buildings had already been planned before the route was logged.","DUPLICATE / DATE STAMP: 1998"]
      ];
      body.querySelectorAll(".version-tab").forEach(tab=>tab.addEventListener("click",()=>{body.querySelectorAll(".version-tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");const v=variants[Number(tab.dataset.version)];body.querySelector("#version-text").textContent=`“${v[0]}”`;body.querySelector("#version-note").textContent=v[1];}));
    }
    if(index===6){
      const rows=[{id:"LANTERN-04",destination:"GATE-09",variance:"+1"},{id:"BELL-12",destination:"GATE-09",variance:"0"},{id:"KEY-03",destination:"HANGAR-2",variance:"+1"},{id:"RIBBON-07",destination:"RETURN",variance:"-1"},{id:"STAR-02",destination:"GATE-09",variance:"-1"}];
      const draw=()=>{const dest=body.querySelector("#destination-filter").value,varia=body.querySelector("#variance-filter").value;const matches=rows.filter(r=>(dest==="ALL"||r.destination===dest)&&(varia==="ALL"||r.variance===varia));body.querySelector("#inventory-table").innerHTML=`<div class="inventory-head"><span>ITEM ID</span><span>DESTINATION</span><span>VARIANCE</span></div>`+matches.map(r=>`<div class="inventory-row"><span>${r.id}</span><span>${r.destination}</span><span>${r.variance}</span></div>`).join("");body.querySelector("#query-result").textContent=`${matches.length} MATCHING RECORD${matches.length===1?"":"S"}`;};
      body.querySelectorAll("#destination-filter,#variance-filter").forEach(el=>el.addEventListener("change",draw));draw();
    }
    if(index===7){
      const route=body.querySelector("#route-sequence"),letters="ABCDE";if(route){for(let n=0;n<5;n++){const select=document.createElement("select");select.setAttribute("aria-label",`Route stop ${n+1}`);select.innerHTML='<option value="">—</option>'+[...letters].map(l=>`<option value="${l}">${l}</option>`).join("");route.append(select);}route.addEventListener("change",()=>{const value=[...route.querySelectorAll("select")].map(s=>s.value||"·").join(" → ");body.querySelector(".edge-key").textContent=`CURRENT ROUTE: ${value}  /  CHECK: C < D < B < E.`;});}
    }
    if(index===8){
      const list=body.querySelector("#dispatch-list");if(list){const messages=[{time:"03:30",text:"At dawn, the route returned empty."},{time:"00:30",text:"Inside the frozen frame, a second shadow."},{time:"05:30",text:"Do not answer the last transmission."},{time:"02:30",text:"We were not at the outer gate."},{time:"01:30",text:"No entry was made from outside."},{time:"04:30",text:"Read the east-facing ledger."}];
        function draw(){list.innerHTML=messages.map((m,i)=>{const hour=Number(m.time.slice(0,2)),received=`${String((hour+23)%24).padStart(2,"0")}:30`;return `<div class="dispatch-card"><span class="dispatch-index">${String(i+1).padStart(2,"0")}</span><span class="dispatch-message">SENT ${m.time} / RECEIVED ${received}<b>${m.text}</b></span><span class="dispatch-controls"><button type="button" data-move="-1" data-index="${i}" aria-label="Move up">↑</button><button type="button" data-move="1" data-index="${i}" aria-label="Move down">↓</button></span></div>`}).join("");list.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>{const i=Number(btn.dataset.index),j=i+Number(btn.dataset.move);if(j<0||j>=messages.length)return;[messages[i],messages[j]]=[messages[j],messages[i]];draw();}));}
        draw();
      }
    }
    if(index===9){
      const tray=body.querySelector("#fragment-tray");if(tray){tray.innerHTML=progress.fragments.slice(0,9).map((f,i)=>`<span class="fragment-chip ${f?"found":"missing"}"><small>${String(i+1).padStart(2,"0")}</small>${f||"?"}</span>`).join("");}
    }
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
  $("#puzzle-form").addEventListener("submit",solveCurrentPuzzle);
  $("#hint-button").addEventListener("click",requestHint);
  tapeDialog.addEventListener("click",e=>{if(e.target===tapeDialog)closeTape();});
  sealDialog.addEventListener("click",e=>{if(e.target===sealDialog)sealDialog.close();});
  window.addEventListener("resize",setupCanvas);
  initializePresenceCue();updateClock();setInterval(updateClock,1000);setupCanvas();renderSealList();renderTimer();requestAnimationFrame(drawScene);
})();
