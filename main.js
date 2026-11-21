(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#gate-scene");
  const tapeDialog = $("#tape-dialog");
  const sealDialog = $("#seal-dialog");
  const glitchScreen = $("#glitch-screen");
  const ruffleContainer = $("#ruffle-container");
  const warningAudio = $("#warning-audio");
  const escalatingAudio = $("#escalating-audio");
  const SAVE_KEY = "np-gate-09-progress-v1";
  const PLAY_SECONDS = 300;
  const IDLE_CUE_MS = 15000;
  const AWAY_CUE_MS = 30000;
  const VOICE_KEY = "np-gate-09-voice-v1";
  let voiceEnabled = localStorage.getItem(VOICE_KEY) !== "off";
  let lastActivityAt = Date.now();
  let awaySince = document.hidden ? Date.now() : null;
  let lastLongCueAt = 0;
  let idleCueTimer = null;
  let audioContext = null, warningBus = null, escalationBus = null, cueRun = 0;
  const puzzles = window.NP_PUZZLES;
  let progress = readProgress();
  let gamePlayer = null;
  let timerInterval = null;
  let lastTick = 0;
  let currentPuzzle = -1;
  let sceneController = null;

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
  function distortionCurve(amount) {
    const samples = 512, curve = new Float32Array(samples), drive = 1 + amount * 18, normalizer = Math.tanh(drive);
    for (let i = 0; i < samples; i++) {
      const x = i * 2 / (samples - 1) - 1;
      curve[i] = Math.tanh(x * drive) / normalizer;
    }
    return curve;
  }
  function createAudioGraph() {
    if (audioContext) return { warningBus, escalationBus };
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !warningAudio || !escalatingAudio) return null;
    try {
      audioContext = new AudioContextClass();
      const warningSource = audioContext.createMediaElementSource(warningAudio);
      const warningGain = audioContext.createGain();
      warningSource.connect(warningGain).connect(audioContext.destination);
      warningBus = { gain: warningGain };
      const escalationSource = audioContext.createMediaElementSource(escalatingAudio);
      const shaper = audioContext.createWaveShaper();
      const filter = audioContext.createBiquadFilter();
      const escalationGain = audioContext.createGain();
      shaper.oversample = "4x";
      shaper.curve = distortionCurve(0);
      filter.type = "lowpass"; filter.frequency.value = 11000;
      escalationSource.connect(shaper).connect(filter).connect(escalationGain).connect(audioContext.destination);
      escalationBus = { gain: escalationGain, shaper, filter };
      return { warningBus, escalationBus };
    } catch {
      audioContext = null; warningBus = null; escalationBus = null;
      return null;
    }
  }
  function primeAudio() {
    if (!voiceEnabled) return;
    createAudioGraph();
    if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
  }
  function stopAudioCues() {
    cueRun++;
    [warningAudio, escalatingAudio].forEach(audio => {
      if (!audio) return;
      audio.pause(); audio.currentTime = 0; audio.playbackRate = 1;
    });
    if (audioContext && warningBus) warningBus.gain.gain.setTargetAtTime(0, audioContext.currentTime, .04);
    if (audioContext && escalationBus) escalationBus.gain.gain.setTargetAtTime(0, audioContext.currentTime, .04);
  }
  function playFirstWarning() {
    if (!voiceEnabled || !warningAudio) return;
    stopAudioCues(); primeAudio();
    warningAudio.currentTime = 0; warningAudio.volume = audioContext && warningBus ? 1 : 0.13;
    if (audioContext && warningBus) {
      const now = audioContext.currentTime;
      warningBus.gain.gain.cancelScheduledValues(now);
      warningBus.gain.gain.setValueAtTime(.12, now);
    }
    warningAudio.play().catch(() => {});
  }
  const waitForAudio = (audio, run, ms) => new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(timer); audio.removeEventListener("ended", finish); resolve();
    };
    const timer = setTimeout(finish, ms);
    audio.addEventListener("ended", finish, { once: true });
    if (run !== cueRun) finish();
  });
  async function playEscalatingWarning() {
    if (!voiceEnabled || !escalatingAudio) return;
    stopAudioCues(); primeAudio();
    const run = cueRun;
    const gainStages = [[.07,.14],[.13,.24],[.22,.39],[.36,.56]];
    const distortionStages = [[.025,.07],[.09,.17],[.2,.32],[.36,.56]];
    const duration = Number.isFinite(escalatingAudio.duration) && escalatingAudio.duration > 0 ? escalatingAudio.duration : 3.4;
    for (let i = 0; i < gainStages.length; i++) {
      if (run !== cueRun || !voiceEnabled) return;
      escalatingAudio.currentTime = 0;
      escalatingAudio.playbackRate = 1 - i * .025;
      const now = audioContext?.currentTime || 0;
      const [from, to] = gainStages[i], [soft, harsh] = distortionStages[i];
      escalatingAudio.volume = audioContext && escalationBus ? 1 : to;
      if (audioContext && escalationBus) {
        const gain = escalationBus.gain.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(from, now);
        gain.linearRampToValueAtTime(to, now + duration);
        escalationBus.shaper.curve = distortionCurve(soft);
        escalationBus.filter.frequency.cancelScheduledValues(now);
        escalationBus.filter.frequency.setValueAtTime(10000 - i * 1300, now);
        escalationBus.filter.frequency.linearRampToValueAtTime(7600 - i * 1250, now + duration);
        // Increase the distortion once more halfway through each pass.
        setTimeout(() => { if (run === cueRun && escalationBus) escalationBus.shaper.curve = distortionCurve(harsh); }, duration * 500);
      }
      try { await escalatingAudio.play(); } catch { return; }
      await waitForAudio(escalatingAudio, run, duration * 1000 + 250);
      escalatingAudio.pause();
      if (run !== cueRun || !voiceEnabled) return;
      if (i < gainStages.length - 1) await new Promise(resolve => setTimeout(resolve, 380));
    }
    if (run === cueRun) {
      escalatingAudio.playbackRate = 1;
      if (audioContext && escalationBus) {
        escalationBus.gain.gain.setTargetAtTime(0, audioContext.currentTime, .18);
        escalationBus.shaper.curve = distortionCurve(0);
        escalationBus.filter.frequency.setTargetAtTime(11000, audioContext.currentTime, .18);
      }
    }
  }
  function scheduleIdleCue() {
    clearTimeout(idleCueTimer);
    if (document.hidden) return;
    const remaining = Math.max(0, IDLE_CUE_MS - (Date.now() - lastActivityAt));
    idleCueTimer = setTimeout(() => {
      if (!document.hidden && Date.now() - lastActivityAt >= IDLE_CUE_MS) playFirstWarning();
    }, remaining);
  }
  function noteActivity() {
    primeAudio();
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
    if (awayDuration >= AWAY_CUE_MS && Date.now() - lastLongCueAt >= 90000) {
      lastLongCueAt = Date.now();
      playEscalatingWarning();
    }
    primeAudio();
    lastActivityAt = Date.now();
    scheduleIdleCue();
  }
  function initializePresenceCue() {
    const voiceButton = $("#voice-toggle");
    updateVoiceControl();
    voiceButton?.addEventListener("click", () => {
      voiceEnabled = !voiceEnabled;
      localStorage.setItem(VOICE_KEY, voiceEnabled ? "on" : "off");
      if (!voiceEnabled) stopAudioCues();
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

  function setupCanvas() { sceneController?.resize(); }
  async function initializeThreeScene() {
    try {
      const { createGateScene } = await import("./scene3d.js");
      sceneController = createGateScene(canvas, index => openSeal(index));
      sceneController.setSolvedCount(progress.solved.length, progress.finished);
    } catch (error) {
      const message = document.createElement("div");
      message.className = "scene-error";
      message.textContent = "3D SCENE UNAVAILABLE — RELOAD THE ARCHIVE";
      canvas.after(message);
      console.error("North Pole 3D scene failed to initialize", error);
    }
  }
  function renderSealList() {
    sceneController?.setSolvedCount(progress.solved.length, progress.finished);
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
  $("#recover-button").addEventListener("click",openTape);
  $("#close-tape").addEventListener("click",closeTape);
  $("#ack-glitch").addEventListener("click",()=>{closeTape();document.body.classList.remove("glitched");});
  $("#close-seal").addEventListener("click",()=>sealDialog.close());
  $("#puzzle-form").addEventListener("submit",solveCurrentPuzzle);
  $("#hint-button").addEventListener("click",requestHint);
  tapeDialog.addEventListener("click",e=>{if(e.target===tapeDialog)closeTape();});
  sealDialog.addEventListener("click",e=>{if(e.target===sealDialog)sealDialog.close();});
  window.addEventListener("resize",setupCanvas);
  initializePresenceCue();updateClock();setInterval(updateClock,1000);setupCanvas();renderSealList();renderTimer();initializeThreeScene();
})();
