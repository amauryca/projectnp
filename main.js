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
  let width = 0, height = 0, dpr = 1, stars = [], snow = [], gateHitboxes = [];
  let currentPuzzle = -1, doorOpen = 0;

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
    const p = rotate(v), camera = 8.4, scale = Math.min(width, height) * 1.2;
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
    doorOpen+=( (progress.finished?1:0) - doorOpen )*.025;
    box(-1.03-doorOpen*1.35,1.32,.18,1.96,2.46,.18,["#202a31","#151d23","#34414a","#56646c","#12191f"]);
    box(1.03+doorOpen*1.35,1.32,.18,1.96,2.46,.18,["#202a31","#151d23","#34414a","#56646c","#12191f"]);
    for(let k=0;k<7;k++){
      const baseX=-1.82+k*.52, x=baseX+(baseX<0?-1:1)*doorOpen*1.35;
      box(x,1.34,.33,.045,2.28,.045,["#61727b","#39464d","#91a0a5","#a8b4b6","#344047"]);
      box(x,.96,.38,.1,.13,.1,["#75858b","#465157","#8d9ca2","#b8c4c7","#414d53"]);
    }
    // The ten rotating seals sit on a custom three-dimensional rail.
    gateHitboxes=[];
    for(let i=0;i<10;i++){
      const x=-1.58+(i%5)*.79, y=i<5?2.05:.65;
      const solved=progress.solved.includes(i),lit=i<progress.unlocked;
      ring(x,y,.56,.18,.027,solved?"#c7e1e7":lit?"#91aab3":"#596870",i);
      const p=project([x,y,.78]);
      if(p){const r=Math.max(8,p.scale*.21);gateHitboxes[i]={minX:p.x-r,maxX:p.x+r,minY:p.y-r,maxY:p.y+r};ctx.fillStyle=solved?"#d8ebef":lit?"#b6cbd1":"#74838a";ctx.globalAlpha=solved ? 0.95 : lit ? 0.7 : 0.4;ctx.font=`${Math.max(7,Math.min(10,p.scale*5))}px IBM Plex Mono,monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(i+1).padStart(2,"0"),p.x,p.y);ctx.globalAlpha=1;}
    }
    // A distant red lamp marks the sealed side of the gate.
    const lamp=project([0,2.82,.8]);if(lamp){const pulse=.5+Math.sin(now/1100)*.16;ctx.fillStyle=`rgba(164,65,59,${pulse})`;ctx.shadowColor="#aa4640";ctx.shadowBlur=11;ctx.beginPath();ctx.arc(lamp.x,lamp.y,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    snow.forEach(f=>{f.y+=f.v;f.x+=f.drift;if(f.y>height){f.y=-4;f.x=Math.random()*width}if(f.x<0)f.x=width;if(f.x>width)f.x=0;ctx.fillStyle="rgba(213,226,231,.55)";ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();});
    pointer.yaw+=(pointer.targetYaw-pointer.yaw)*.08;pointer.pitch+=(pointer.targetPitch-pointer.pitch)*.08;
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
