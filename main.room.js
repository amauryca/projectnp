(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#gate-scene"), puzzleDialog = $("#puzzle-dialog"), tapeDialog = $("#tape-dialog");
  const ruffleContainer = $("#ruffle-container");
  const SAVE_KEY = "np-gate-09-progress-v4-room";
  const puzzles = window.NP_PUZZLES;
  let progress = readProgress(), sceneController = null, currentPuzzle = -1, gamePlayer = null, createCryptexViewer = null, cryptexViewer = null;
  let activePuzzleState = {};
  const MUSIC_KEY = "np-gate-09-music-v1";
  let hintIndex = 0, musicOn = false, musicContext = null, musicMaster = null, musicNodes = [];

  function readProgress() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      const solved = Array.isArray(data.solved) ? [...new Set(data.solved.filter(n => Number.isInteger(n) && n >= 0 && n < 10))].sort((a,b) => a-b) : [];
      // Enforce a contiguous route. A later saved seal can never skip an earlier one.
      const ordered = []; for (let i = 0; i < solved.length && solved[i] === i; i++) ordered.push(i);
      return { solved: ordered, inventory: Array.isArray(data.inventory) ? [...new Set(data.inventory.filter(x => ["flashlight","gate_tooth","cryptex_key"].includes(x)))] : [], hints: data.hints || {}, fragments: Array.isArray(data.fragments) ? data.fragments.slice(0,10) : [], registerActivated: Boolean(data.registerActivated && ordered.includes(0)), finished: ordered.length === 10 };
    } catch { return { solved: [], inventory: [], hints: {}, fragments: [], registerActivated: false, finished: false }; }
  }
  function saveProgress() { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }
  function hasItem(id) { return progress.inventory.includes(id); }
  function currentIndex() { return Math.min(progress.solved.length, puzzles.length - 1); }
  function showToast(message) {
    const toast = $("#toast-message"); toast.textContent = message; toast.classList.add("visible");
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }
  function renderStage() {
    const index = currentIndex(), stage = puzzles[index];
    $("#stage-count").textContent = "ROOM 09-A / PRIVATE RESIDENCE";
    $("#stage-title").textContent = progress.finished ? "The House Is Still" : "The North Room";
    $("#stage-objective").textContent = progress.finished ? "The room settles. The record is complete." : progress.registerActivated ? "Dust has been disturbed somewhere in the room." : "The house is cold. Find a light, then look closely at the old gate.";
    $("#gate-state").textContent = progress.finished ? "RECORD CLOSED" : progress.registerActivated ? "ROOM OCCUPIED" : "POWER LOST";
    const progressBar = $("#stage-progress"); progressBar.replaceChildren();
    for (let i=0;i<10;i++) { const dot=document.createElement("i"); dot.className = i < progress.solved.length ? "complete" : i === index && !progress.finished ? "current" : ""; progressBar.append(dot); }
    renderInventory();
    sceneController?.setRegisterActive(progress.registerActivated);
    sceneController?.setSolvedCount(progress.solved.length, progress.finished);
  }
  function renderInventory() {
    const hud=$("#inventory-hud"); if(!hud)return; hud.replaceChildren();
    const items=[{id:"flashlight",label:"LAMP",icon:"◉"},{id:"gate_tooth",label:"TOOTH",icon:"⌁"},{id:"cryptex_key",label:"KEY",icon:"⚿"}];
    items.forEach(item=>{
      const button=document.createElement("button"); button.type="button"; button.className="inventory-slot"+(hasItem(item.id)?" found":""); button.disabled=!hasItem(item.id);
      button.setAttribute("aria-label",hasItem(item.id)?`Inventory: ${item.label}`:`${item.label} not recovered`); button.title=hasItem(item.id)?item.label:"Not recovered";
      button.innerHTML=`<span>${item.icon}</span><small>${item.label}</small>`;
      if(item.id==="flashlight") { button.setAttribute("aria-pressed",String(Boolean(sceneController?.flashlightOn))); button.addEventListener("click",()=>{sceneController?.setFlashlight(!sceneController?.flashlightOn);renderInventory();}); }
      hud.append(button);
    });
    const tape=document.createElement("button"); tape.type="button"; tape.className="inventory-slot record-slot"; tape.textContent="REC"; tape.title="Recovered tape"; tape.hidden=!progress.solved.includes(2); tape.addEventListener("click",openTape); hud.append(tape);
  }
  function onSceneFocusItem(id) {
    const prompt=$("#scene-prompt"); if(!prompt)return;
    if(!id){prompt.classList.remove("visible");return;}
    const text={flashlight:"HAND LAMP · CLICK TO RECOVER",gate_tooth:"BRASS TOOTH · PRESS E TO TAKE",cryptex_key:"KEY RECOVERED",artifact:"EVIDENCE FOUND · CLICK TO INSPECT"};
    prompt.textContent=text[id]||"EVIDENCE FOUND · CLICK TO INSPECT"; prompt.classList.add("visible");
  }
  function onSceneItemFound(id) {
    if(!["flashlight","gate_tooth","cryptex_key"].includes(id)||hasItem(id))return;
    progress.inventory.push(id);
    if(id==="flashlight") { sceneController?.setFlashlight(true); saveProgress(); renderInventory(); showToast("HAND LAMP RECOVERED · SWEEP THE GATE"); return; }
    if(id==="gate_tooth" && hasItem("flashlight")) {
      progress.registerActivated=true; progress.solved=[0]; progress.fragments[0]=puzzles[0].fragment; saveProgress(); renderStage();
      showToast("SURVEY COMPLETE · THE FIRST SEAL RELEASES"); return;
    }
    saveProgress(); renderInventory(); showToast("OBJECT RECOVERED");
  }
  function onSceneSelect(index) {
    // The only inspectable evidence is on the next unopened gate.
    if(!progress.registerActivated || progress.finished || index!==currentIndex())return;
    openPuzzle(index);
  }
  async function initializeScene() {
    try {
      const sceneModule=await import("./scene3d.room.js?v=3");
      const {createGateScene}=sceneModule; createCryptexViewer=sceneModule.createCryptexViewer;
      sceneController=createGateScene(canvas,onSceneSelect,onSceneItemFound,onSceneFocusItem);
      sceneController.setRegisterActive(progress.registerActivated);
      sceneController.setSolvedCount(progress.solved.length,progress.finished);
      sceneController.setFlashlight(hasItem("flashlight"));
      sceneController.setCollectedItems(progress.inventory);
      sceneController.setCryptexLetters(["0","0","0","0","0"]);
      renderStage();
    } catch(error) { showToast("THE GATE SCENE COULD NOT LOAD · RELOAD THE ARCHIVE"); console.error("3D gate scene failed",error); }
  }

  function openPuzzle(index) {
    if(index!==currentIndex() || index===0 || !progress.registerActivated)return;
    const puzzle=puzzles[index]; currentPuzzle=index; activePuzzleState={}; hintIndex=Number(progress.hints[index])||0;
    $("#puzzle-kicker").textContent=`EVIDENCE / ${String(index+1).padStart(2,"0")} · ${puzzle.label}`;
    $("#puzzle-title").textContent=puzzle.name; $("#puzzle-intro").textContent=puzzle.objective;
    $("#puzzle-feedback").textContent=""; $("#puzzle-feedback").classList.remove("error");
    $("#puzzle-answer").value=""; $("#puzzle-form").hidden=true; $("#puzzle-action").hidden=true;
    $("#hint-button").textContent=hintIndex>=puzzle.hints.length?"HINTS EXHAUSTED":`REQUEST HINT ${hintIndex+1} / ${puzzle.hints.length}`;
    $("#hint-button").disabled=hintIndex>=puzzle.hints.length;
    renderPuzzleWidget(puzzle);
    if(puzzle.type==="cryptex")sceneController?.setCryptexVisible(true);
    puzzleDialog.showModal(); sceneController?.setPaused(true);
  }
  function setAnswerMode(label="ENTER RECOVERED CODE") { $("#puzzle-form").hidden=false; $("#answer-label").textContent=label; }
  function setActionMode(label="CONFIRM ↗") { const b=$("#puzzle-action"); b.textContent=label; b.hidden=false; }
  function renderPuzzleWidget(p) {
    const box=$("#puzzle-content"); box.replaceChildren();
    if(p.type==="photo-order") {
      box.innerHTML='<p class="artifact-copy">Five photographs were recovered out of sequence. Arrange them by <b>DateTimeOriginal</b> from earliest to latest. Read the letter burned into each frame.</p><div class="photo-sort" id="photo-sort"></div><div class="artifact-readout" id="photo-readout">ORDER NOT RECONSTRUCTED</div>';
      const photos=[{id:"C",time:"1998:12:24 22:41:12",letter:"T"},{id:"E",time:"1998:12:24 23:03:54",letter:"H"},{id:"B",time:"1998:12:24 21:19:00",letter:"A"},{id:"D",time:"1998:12:24 20:55:15",letter:"E"},{id:"A",time:"1998:12:24 21:47:09",letter:"R"}];
      const list=$("#photo-sort");
      const draw=()=>{list.replaceChildren();photos.forEach((photo,i)=>{const row=document.createElement("div");row.className="photo-row";row.innerHTML=`<span class="photo-index">${String(i+1).padStart(2,"0")}</span><span class="photo-thumb frame-${photo.id}" aria-hidden="true"></span><span class="photo-name">FRAME ${photo.id}<small>DATETIMEORIGINAL · ${photo.time} · UTC−05:00 · GPS 28.0587031,-82.4138539</small></span><b class="photo-letter">${photo.letter}</b>`;const controls=document.createElement("span");controls.className="photo-controls";for(const [delta,label] of [[-1,"↑"],[1,"↓"]]){const button=document.createElement("button");button.type="button";button.textContent=label;button.disabled=i+delta<0||i+delta>=photos.length;button.setAttribute("aria-label",`${delta<0?"Move earlier":"Move later"}`);button.addEventListener("click",()=>{[photos[i],photos[i+delta]]=[photos[i+delta],photos[i]];draw();});controls.append(button);}row.append(controls);list.append(row);});$("#photo-readout").textContent=`FRAME ORDER: ${photos.map(x=>x.letter).join("")}`;};draw();
      setActionMode("LOCK PHOTO ORDER ↗"); $("#puzzle-action").onclick=()=>{const chronological=[...photos].sort((a,b)=>a.time.localeCompare(b.time)).map(x=>x.id).join("");const current=photos.map(x=>x.id).join("");if(current!==chronological){feedback("THE CAPTURE TIMES ARE NOT ASCENDING.",true);return;}const word=photos.map(x=>x.letter).join("");if(word!==p.answer){feedback("THE FRAMES ALIGN, BUT THE LETTERS DO NOT.",true);return;}solvePuzzle(word);};
    } else if(p.type==="cryptex") {
      box.innerHTML='<p class="artifact-copy">The photo order points to Google Earth. Search the coordinate recorded in the photo metadata, open the University of South Florida, Tampa place card, and read the five-digit postal code in its published address.</p><div class="coordinate-card">28.0587031° N<br>82.4138539° W</div><div class="link-row"><a href="https://earth.google.com/web/search/University+of+South+Florida,+Tampa/" target="_blank" rel="noreferrer">OPEN USF TAMPA IN GOOGLE EARTH ↗</a></div><p class="small-note">Use the university place card, not a campus building. No campus visit is required.</p><canvas class="cryptex-viewer" id="cryptex-viewer" aria-label="Interactive three-dimensional five-digit cryptex"></canvas><div class="artifact-readout cryptex-readout" id="cryptex-readout">00000</div><div class="cryptex-controls" id="cryptex-controls"></div>';
      const alphabet="0123456789",controls=$("#cryptex-controls");let letters=[..."00000"].map(c=>alphabet.indexOf(c));
      const sync=(next)=>{if(next)letters=next.map(c=>alphabet.indexOf(String(c)));const word=letters.map(x=>alphabet[x]).join("");$("#cryptex-readout").textContent=word;activePuzzleState.cryptexWord=word;controls.querySelectorAll("small").forEach((label,i)=>{label.textContent=`${String(i+1).padStart(2,"0")} · ${alphabet[letters[i]]}`;});};
      cryptexViewer?.dispose();
      cryptexViewer=createCryptexViewer?.($("#cryptex-viewer"),letters.map(x=>alphabet[x]),next=>{letters=next.map(c=>alphabet.indexOf(c));sync();});
      const drawControls=()=>{controls.replaceChildren();letters.forEach((value,i)=>{const dial=document.createElement("div");dial.className="cryptex-dial";dial.innerHTML=`<button type="button" aria-label="Turn ring ${i+1} backward">−</button><small>${String(i+1).padStart(2,"0")} · ${alphabet[value]}</small><button type="button" aria-label="Turn ring ${i+1} forward">+</button>`;const buttons=dial.querySelectorAll("button");buttons[0].addEventListener("click",()=>cryptexViewer?.turn(i,-1));buttons[1].addEventListener("click",()=>cryptexViewer?.turn(i,1));controls.append(dial);});};
      sync();drawControls();
      setActionMode("ENGAGE CENTER CATCH ↗");$("#puzzle-action").onclick=()=>{const word=cryptexViewer?.getCode?.()||letters.map(x=>alphabet[x]).join("");activePuzzleState.cryptexWord=word;if(word!==p.answer){feedback(`THE RINGS READ ${word}. CHECK THE PLACE CARD CODE.`,true);return;}solvePuzzle(word);};
    } else if(p.type==="reflection") {
      box.innerHTML='<p class="artifact-copy">The scratched plate looks blank head-on. Drag around the gate until the side-mounted mirror becomes inspectable. In this record, rotate the plate to match the reflection.</p><div class="mirror-lab"><div class="mirror-frame"><span id="mirror-text">↗ · · ↙</span></div></div><label class="control-label" for="mirror-angle">MIRROR ANGLE <output id="mirror-angle-readout">0°</output></label><input id="mirror-angle" class="range-control" type="range" min="0" max="180" value="0"><div class="artifact-readout" id="mirror-readout">REFLECTION UNRESOLVED</div>';
      const slider=$("#mirror-angle");slider.addEventListener("input",()=>{const a=Number(slider.value),aligned=a===120;$("#mirror-angle-readout").textContent=`${a}°`;$("#mirror-text").textContent=aligned?"INWARD":"↗ · · ↙";$("#mirror-readout").textContent=aligned?"INSCRIPTION: INWARD":"REFLECTION UNRESOLVED";});setActionMode("RECORD INSCRIPTION ↗");$("#puzzle-action").onclick=()=>Number(slider.value)===120?solvePuzzle(p.answer):feedback("THE MIRROR HAS NOT CAUGHT THE LINE OF SIGHT.",true);
    } else if(p.type==="morse") {
      box.innerHTML='<p class="artifact-copy">A lamp repeats a four-letter signal. Short flashes are dots; long flashes are dashes. Separate letters by the longer pauses. No speech is present in this recording.</p><div class="morse-lamp" aria-label="Morse pattern: dot dash dash, dot, dot dot dot, dash"><i class="dot"></i><i class="dash"></i><i class="dash"></i><b>/</b><i class="dot"></i><b>/</b><i class="dot"></i><i class="dot"></i><i class="dot"></i><b>/</b><i class="dash"></i></div><div class="morse-note">SHORT · LONG · LETTER GAP</div>';
      setAnswerMode("DECODED DIRECTION");
    } else if(p.type==="channels") {
      box.innerHTML='<p class="artifact-copy">The scan is a composite. Isolate a color channel and inspect the grain. One channel carries the writing.</p><div class="channel-preview" id="channel-preview"><span id="channel-secret">••••••</span></div><div class="channel-controls"><button type="button" data-channel="red">RED</button><button type="button" data-channel="green">GREEN</button><button type="button" data-channel="blue">BLUE</button></div><div class="artifact-readout" id="channel-readout">COMPOSITE VIEW</div>';
      box.querySelectorAll("[data-channel]").forEach(button=>button.addEventListener("click",()=>{const ch=button.dataset.channel;activePuzzleState.channel=ch;box.querySelectorAll("[data-channel]").forEach(b=>b.classList.toggle("selected",b===button));$("#channel-preview").dataset.channel=ch;$("#channel-secret").textContent=ch==="blue"?"RETURN":"••••••";$("#channel-readout").textContent=ch==="blue"?"BLUE CHANNEL / TEXT RECOVERED":"CHANNEL EMPTY";}));setAnswerMode("RECOVERED WORD");
    } else if(p.type==="earth") {
      box.innerHTML='<p class="artifact-copy">The survey photograph carries these GPS coordinates:</p><div class="coordinate-card">28.0587031° N<br>82.4138539° W</div><p class="artifact-copy">The location is on USF Tampa. Compare it with the public campus history record. What year was the campus groundbreaking?</p><div class="link-row"><a href="https://earth.google.com/web/search/28.0587031,-82.4138539" target="_blank" rel="noreferrer">OPEN COORDINATE IN GOOGLE EARTH ↗</a><a href="https://www.usf.edu/about-usf/history.aspx" target="_blank" rel="noreferrer">USF HISTORY ↗</a></div><p class="small-note">Online research only. No campus visit is required.</p>';
      setAnswerMode("YEAR FROM THE RECORD");
    } else if(p.type==="shadow") {
      box.innerHTML='<p class="artifact-copy">Rotate the inspection lamp. Align the moving shadow with the engraved line; the aligned relief exposes a four-digit record.</p><div class="shadow-lab"><div class="shadow-mark"></div><div class="shadow-bar" id="shadow-bar"></div></div><label class="control-label" for="shadow-angle">LAMP BEARING <output id="shadow-angle-readout">0°</output></label><input class="range-control" id="shadow-angle" type="range" min="0" max="180" step="15" value="0"><div class="artifact-readout" id="shadow-readout">SHADOW OFF AXIS</div>';
      const slider=$("#shadow-angle");slider.addEventListener("input",()=>{const a=Number(slider.value),aligned=a===90;$("#shadow-bar").style.transform=`rotate(${a}deg)`;$("#shadow-angle-readout").textContent=`${a}°`;$("#shadow-readout").textContent=aligned?"ETCHING EXPOSED: 1218":"SHADOW OFF AXIS";});setActionMode("TAKE THE READING ↗");$("#puzzle-action").onclick=()=>Number(slider.value)===90?solvePuzzle(p.answer):feedback("THE SHADOW MISSES THE ENGRAVING.",true);
    } else if(p.type==="route") {
      box.innerHTML='<p class="artifact-copy">Begin at A. Enter the four remaining stations once each, then return to A. E is the final stop. The log gives the order C before D before B before E; B cannot directly follow A.</p><div class="route-graph"><svg viewBox="0 0 420 180" role="img" aria-label="Five stations A through E with connections"><path d="M60 90 L160 35 L270 55 L360 110 L220 145 L60 90 M160 35 L220 145 M60 90 L270 55 M360 110 L160 35"/><g><circle cx="60" cy="90" r="17"/><text x="60" y="94">A</text><circle cx="160" cy="35" r="17"/><text x="160" y="39">B</text><circle cx="270" cy="55" r="17"/><text x="270" y="59">C</text><circle cx="360" cy="110" r="17"/><text x="360" y="114">D</text><circle cx="220" cy="145" r="17"/><text x="220" y="149">E</text></g></svg></div><div class="route-entry" id="route-entry"></div><div class="artifact-readout" id="route-readout">A → · → · → · → · → A</div>';
      const entry=$("#route-entry");for(let i=0;i<4;i++){const select=document.createElement("select");select.setAttribute("aria-label",`Route station ${i+1} of 4`);select.innerHTML='<option value="">—</option>'+"BCDE".split("").map(c=>`<option>${c}</option>`).join("");select.addEventListener("change",()=>{$("#route-readout").textContent=`A → ${[...entry.querySelectorAll("select")].map(x=>x.value||"·").join(" → ")} → A`;});entry.append(select);}setActionMode("TRACE THE ROUTE ↗");$("#puzzle-action").onclick=()=>{const stops=[...entry.querySelectorAll("select")].map(x=>x.value),route="A"+stops.join("");if(stops.includes("")||new Set(stops).size!==4){feedback("ENTER EACH STATION ONCE BEFORE RETURNING TO A.",true);return;}activePuzzleState.route=route;route===p.answer?solvePuzzle(route):feedback("THE ROUTE BREAKS A SIGHTLINE OR ORDER RULE.",true);};
    } else if(p.type==="final") {
      box.innerHTML=`<p class="artifact-copy">Recovered fragments, in gate order:</p><div class="fragment-tray">${progress.fragments.slice(0,9).map((x,i)=>`<span class="fragment-chip found"><small>${String(i+1).padStart(2,"0")}</small>${x}</span>`).join("")}</div><div class="final-sentence">THE GATE IS <span>________</span></div><p class="artifact-copy">The map places the gate outside. The photographs place the camera inside.</p>`;
      setAnswerMode("FINAL WORD");
    }
  }
  function normalized(value) { return String(value).toUpperCase().replace(/[^A-Z0-9]/g,""); }
  function feedback(message,error=false) { const el=$("#puzzle-feedback");el.textContent=message;el.classList.toggle("error",error); }
  function solvePuzzle(value) {
    const puzzle=puzzles[currentPuzzle]; if(!puzzle||currentPuzzle!==currentIndex()||!progress.registerActivated||normalized(value)!==normalized(puzzle.answer)){feedback("THE MECHANISM DOES NOT ACCEPT THAT READING.",true);return;}
    if(puzzle.type==="channels"&&activePuzzleState.channel!=="blue"){feedback("ISOLATE THE BLUE CHANNEL BEFORE RECORDING THE WORD.",true);return;}
    if(puzzle.type==="route"&&activePuzzleState.route!==p.answer){feedback("COMPLETE THE ROUTE PANEL BEFORE RECORDING IT.",true);return;}
    if(puzzle.type==="cryptex"&&activePuzzleState.cryptexWord!==p.answer){feedback("THE RINGS MUST BE TURNED INTO ALIGNMENT FIRST.",true);return;}
    feedback(`RECORD ACCEPTED · FRAGMENT ${puzzle.fragment} RECOVERED`);
    if(!progress.solved.includes(currentPuzzle))progress.solved.push(currentPuzzle);
    progress.fragments[currentPuzzle]=puzzle.fragment;
    if(currentPuzzle===2&&!hasItem("cryptex_key"))progress.inventory.push("cryptex_key");
    progress.finished=progress.solved.length===10;saveProgress();renderStage();
    puzzleDialog.classList.add("solving");$("#transition-cover").classList.add("sweep");
    if(progress.finished)showToast("CONTINUITY RESTORED · PASSAGE OPEN");
    else showToast(`SEAL ${String(currentPuzzle+1).padStart(2,"0")} RELEASED`);
    setTimeout(()=>{puzzleDialog.classList.remove("solving");if(puzzleDialog.open)puzzleDialog.close();sceneController?.setCryptexVisible(false);$("#transition-cover").classList.remove("sweep");},850);
  }
  function submitAnswer(event) { event.preventDefault();if(currentPuzzle<0)return;solvePuzzle($("#puzzle-answer").value); }
  function requestHint() {
    const p=puzzles[currentPuzzle],n=Number(progress.hints[currentPuzzle])||0;if(!p||n>=p.hints.length)return;
    feedback(`HINT ${n+1}: ${p.hints[n]}`);progress.hints[currentPuzzle]=n+1;saveProgress();
    $("#hint-button").textContent=n+1>=p.hints.length?"HINTS EXHAUSTED":`REQUEST HINT ${n+2} / ${p.hints.length}`;$("#hint-button").disabled=n+1>=p.hints.length;
  }
  function closePuzzle() { if(puzzleDialog.open)puzzleDialog.close();sceneController?.setCryptexVisible(false);sceneController?.setPaused(false);cryptexViewer?.dispose();cryptexViewer=null;puzzleDialog.classList.remove("solving"); }

  function openTape() {
    if(!progress.solved.includes(2))return;tapeDialog.showModal();loadRuffle();
  }
  function loadRuffle() {
    if(gamePlayer)return;
    const init=()=>{try{const r=window.RufflePlayer?.newest();if(!r)throw new Error("Ruffle unavailable");gamePlayer=r.createPlayer();gamePlayer.className="ruffle-game";gamePlayer.volume=0;ruffleContainer.replaceChildren(gamePlayer);gamePlayer.ruffle().load("assets/christmas-cat-17945-lore.swf").then(()=>$("#player-loading")?.remove()).catch(showPlayerError);}catch{showPlayerError();}};
    if(window.RufflePlayer)init();else{const script=document.querySelector('script[src*="ruffle"]');script?.addEventListener("load",init,{once:true});script?.addEventListener("error",showPlayerError,{once:true});setTimeout(()=>{if(!gamePlayer&&!window.RufflePlayer)showPlayerError();},12000);}
  }
  function showPlayerError(){if($("#player-error"))return;const e=document.createElement("div");e.id="player-error";e.className="player-error";e.innerHTML='<span class="eyebrow">PLAYER COULD NOT INITIALIZE</span><p>Try another browser or use the local download.</p><a href="assets/christmas-cat-17945-lore.swf" download>DOWNLOAD RECOVERED MEDIA ↗</a>';ruffleContainer.replaceChildren(e);}

  // A quiet, speech-free procedural score: slow detuned pads and a soft repeating low note.
  function startMusic() {
    if(musicContext){if(musicContext.state==="suspended")musicContext.resume().catch(()=>{});return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    try {
      musicContext=new AC();musicMaster=musicContext.createGain();musicMaster.gain.value=0;musicMaster.connect(musicContext.destination);
      const filter=musicContext.createBiquadFilter();filter.type="lowpass";filter.frequency.value=620;filter.Q.value=.5;filter.connect(musicMaster);
      const notes=[55,82.41,110,164.81];
      notes.forEach((frequency,i)=>{const osc=musicContext.createOscillator(),gain=musicContext.createGain(),pan=musicContext.createStereoPanner();osc.type=i===0?"sine":"triangle";osc.frequency.value=frequency;osc.detune.value=(i%2?-.9:.7);gain.gain.value=[.16,.065,.042,.018][i];pan.pan.value=(i-1.5)*.35;osc.connect(gain).connect(pan).connect(filter);osc.start();musicNodes.push(osc);});
      const lfo=musicContext.createOscillator(),lfoGain=musicContext.createGain();lfo.frequency.value=.055;lfoGain.gain.value=140;lfo.connect(lfoGain).connect(filter.frequency);lfo.start();musicNodes.push(lfo);
      musicMaster.gain.setTargetAtTime(musicOn ? .18 : 0,musicContext.currentTime,1.8);
    } catch { musicContext=null; }
  }
  function setMusic(enabled) { musicOn=Boolean(enabled);localStorage.setItem(MUSIC_KEY,musicOn?"on":"off");$("#music-toggle").textContent=musicOn?"MUSIC ON":"MUSIC OFF";$("#music-toggle").setAttribute("aria-pressed",String(musicOn));if(musicOn)startMusic();if(musicMaster&&musicContext)musicMaster.gain.setTargetAtTime(musicOn ? .18 : 0,musicContext.currentTime,.8); }
  function primeMusic() { if(musicOn)startMusic(); }

  $("#puzzle-form").addEventListener("submit",submitAnswer);
  $("#puzzle-action").addEventListener("click",()=>{});
  $("#hint-button").addEventListener("click",requestHint);
  $("#close-puzzle").addEventListener("click",closePuzzle);
  puzzleDialog.addEventListener("click",e=>{if(e.target===puzzleDialog)closePuzzle();});
  puzzleDialog.addEventListener("close",()=>{sceneController?.setCryptexVisible(false);sceneController?.setPaused(false);cryptexViewer?.dispose();cryptexViewer=null;});
  $("#music-toggle").addEventListener("click",()=>setMusic(!musicOn));
  $("#close-tape").addEventListener("click",()=>tapeDialog.close());
  const crouchButton=$("#crouch-toggle");
  crouchButton?.addEventListener("click",()=>{const next=crouchButton.getAttribute("aria-pressed")!=="true";crouchButton.setAttribute("aria-pressed",String(next));crouchButton.textContent=next?"STAND":"CROUCH";sceneController?.setCrouching(next);});
  tapeDialog.addEventListener("click",e=>{if(e.target===tapeDialog)tapeDialog.close();});
  ["pointerdown","keydown","touchstart"].forEach(type=>window.addEventListener(type,primeMusic,{passive:type!=="keydown"}));
  window.addEventListener("resize",()=>sceneController?.resize());
  const musicPreference=localStorage.getItem(MUSIC_KEY);setMusic(musicPreference!=="off");
  renderStage();initializeScene();
})();
