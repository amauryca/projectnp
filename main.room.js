(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#gate-scene"), puzzleDialog = $("#puzzle-dialog"), tapeDialog = $("#tape-dialog"), morsePanel = $("#morse-panel");
  const ruffleContainer = $("#ruffle-container");
  const SAVE_KEY = "np-gate-09-progress-v11-no-hints-ending";
  const LEGACY_SAVE_KEY = "np-gate-09-progress-v10-image-evidence";
  const OLDER_SAVE_KEY = "np-gate-09-progress-v9-utc-morse-chair";
  const puzzles = window.NP_PUZZLES;
  let progress = readProgress(), sceneController = null, currentPuzzle = -1, gamePlayer = null, createCryptexViewer = null, cryptexViewer = null;
  let activePuzzleState = {};
  const MUSIC_KEY = "np-gate-09-music-v1";
  let musicOn = false, musicContext = null, musicMaster = null, musicNodes = [];

  function readProgress() {
    try {
      const hasCurrentSave = Boolean(localStorage.getItem(SAVE_KEY));
      const hasV10Save = Boolean(localStorage.getItem(LEGACY_SAVE_KEY));
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY) || localStorage.getItem(OLDER_SAVE_KEY) || "{}");
      const progressLimit = hasCurrentSave ? 10 : hasV10Save ? 7 : 3;
      const solved = Array.isArray(data.solved) ? [...new Set(data.solved.filter(n => Number.isInteger(n) && n >= 0 && n < progressLimit))].sort((a,b) => a-b) : [];
      // Enforce a contiguous route. A later saved seal can never skip an earlier one.
      const ordered = []; for (let i = 0; i < solved.length && solved[i] === i; i++) ordered.push(i);
      return { solved: ordered, inventory: Array.isArray(data.inventory) ? [...new Set(data.inventory.filter(x => ["flashlight","gate_tooth","cryptex_key"].includes(x)))] : [], fragments: Array.isArray(data.fragments) ? data.fragments.slice(0,progressLimit) : [], registerActivated: Boolean(data.registerActivated && ordered.includes(0)), finished: ordered.length === 10, endingSeen: Boolean(data.endingSeen) };
    } catch { return { solved: [], inventory: [], fragments: [], registerActivated: false, finished: false, endingSeen: false }; }
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
    $("#stage-objective").textContent = progress.finished ? "The room settles. The record is complete." : !progress.registerActivated ? "The dark keeps a small warmth near the writing desk." : stage?.type==="morse" ? "A question lingers in the operator’s chair." : stage?.type==="time-window" ? "A false midnight rests over a polar sea." : stage?.type==="photo-wall" ? "The winter portrait is missing its center." : stage?.type==="mirror-code" ? "A thin line of light slips behind old glass." : stage?.type==="uuencode" ? "The painted trees carry one shadow too many." : stage?.type==="earth-mirror" ? "Four reflections disagree about where north begins." : stage?.type==="metadata-photos" ? "Six negatives remember the same evening differently." : "A little dust has shifted in the room.";
    $("#gate-state").textContent = progress.finished ? "RECORD CLOSED" : progress.registerActivated ? "ROOM OCCUPIED" : "POWER LOST";
    const progressBar = $("#stage-progress"); progressBar.replaceChildren();
    for (let i=0;i<10;i++) { const dot=document.createElement("i"); dot.className = i < progress.solved.length ? "complete" : i === index && !progress.finished ? "current" : ""; progressBar.append(dot); }
    renderInventory();
    sceneController?.setRegisterActive(progress.registerActivated);
    sceneController?.setSolvedCount(progress.solved.length, progress.finished);
  }
  function renderInventory() {
    const hud=$("#inventory-hud"); if(!hud)return; hud.replaceChildren();
    const items=[{id:"flashlight",label:"LAMP",icon:"◉"},{id:"gate_tooth",label:"BRASS KEY",icon:"⚿"},{id:"cryptex_key",label:"KEY",icon:"⌁"}];
    items.forEach(item=>{
      const button=document.createElement("button"); button.type="button"; button.className="inventory-slot"+(hasItem(item.id)?" found":""); button.disabled=!hasItem(item.id);
      button.setAttribute("aria-label",hasItem(item.id)?`Inventory: ${item.label}`:`${item.label} not recovered`); button.title=hasItem(item.id)?item.label:"Not recovered";
      button.innerHTML=`<span>${item.icon}</span><small>${item.label}</small>${item.id==="flashlight"?'<em id="lamp-charge">30s</em>':""}`;
      if(item.id==="flashlight") { button.setAttribute("aria-pressed",String(Boolean(sceneController?.flashlightOn))); button.addEventListener("click",()=>{sceneController?.setFlashlight(!sceneController?.flashlightOn);renderInventory();}); }
      hud.append(button);
    });
    const tape=document.createElement("button"); tape.type="button"; tape.className="inventory-slot record-slot"; tape.textContent="REC"; tape.title="Recovered tape"; tape.hidden=!progress.solved.includes(2); tape.addEventListener("click",openTape); hud.append(tape);
  }
  function onSceneFocusItem(id) {
    const prompt=$("#scene-prompt"); if(!prompt)return;
    if(!id){prompt.classList.remove("visible");return;}
    const text={flashlight:"HAND LAMP · CLICK TO RECOVER",gate_tooth:"SMALL BRASS KEY · PRESS E TO TAKE",rug_corner:"RUG EDGE · LAMP + CROUCH · PRESS E TO LIFT",chair:sceneController?.isSeated()?"OPERATOR'S CHAIR · C TO STAND":"OPERATOR'S CHAIR · CLICK / E TO SIT",cryptex_key:"KEY RECOVERED",artifact:"EVIDENCE FOUND · CLICK TO INSPECT"};
    prompt.textContent=text[id]||"EVIDENCE FOUND · CLICK TO INSPECT"; prompt.classList.add("visible");
  }
  function onSceneItemFound(id) {
    if(!["flashlight","gate_tooth","cryptex_key"].includes(id)||hasItem(id))return;
    progress.inventory.push(id);
    if(id==="flashlight") { sceneController?.setFlashlight(true); saveProgress(); renderInventory(); showToast("HAND LAMP RECOVERED · SEARCH THE RUG'S EDGE"); return; }
    if(id==="gate_tooth" && hasItem("flashlight")) {
      progress.registerActivated=true; progress.solved=[0]; progress.fragments[0]=puzzles[0].fragment; saveProgress(); renderStage();
      showToast("BRASS KEY RECOVERED · THE FIRST SEAL RELEASES"); return;
    }
    saveProgress(); renderInventory(); showToast("OBJECT RECOVERED");
  }
  function skipCurrentStage() {
    if(progress.finished)return;
    const index=currentIndex(),stage=puzzles[index];if(!stage)return;
    if(index===0){progress.inventory=[...new Set([...progress.inventory,"flashlight","gate_tooth"])];progress.solved=[0];progress.fragments[0]=stage.fragment;progress.registerActivated=true;}
    else{if(!progress.registerActivated)return;if(!progress.solved.includes(index))progress.solved.push(index);progress.fragments[index]=stage.fragment;}
    if(index===2&&!hasItem("cryptex_key"))progress.inventory.push("cryptex_key");
    progress.finished=progress.solved.length===puzzles.length;saveProgress();currentPuzzle=-1;activePuzzleState={};morsePanel.hidden=true;sceneController?.setMorseActive(false);
    if(puzzleDialog.open)puzzleDialog.close();sceneController?.setFlashlight(hasItem("flashlight"));sceneController?.setCollectedItems(progress.inventory);renderStage();
    showToast(`SHORTCUT USED · LEVEL ${String(index+1).padStart(2,"0")} SKIPPED`);
    if(progress.finished){sceneController?.setPaused(true);startEnding();}
  }
  function onSceneSelect(index) {
    // The only inspectable evidence is on the next unopened gate.
    if(!progress.registerActivated || progress.finished || index!==currentIndex())return;
    if(puzzles[index]?.type==="morse"){
      if(!sceneController?.isSeated()){showToast("THE RECEIVER IS SET FOR THE OPERATOR'S CHAIR");return;}
      openMorseStation(index);return;
    }
    openPuzzle(index);
  }
  function openMorseStation(index){
    if(index!==currentIndex()||!sceneController?.isSeated())return;
    currentPuzzle=index;activePuzzleState={};morsePanel.hidden=false;morsePanel.classList.remove("morse-error");
    $("#morse-incoming").textContent="IN WHICH WAY DOES THE WIND BLOW IN THE NORTH POLE?";$("#morse-sent").textContent="—";$("#morse-status").textContent="SHORT TAP = DOT · HOLD = DASH · PAUSE BETWEEN LETTERS";
    sceneController.setMorseActive(true);resetMorseInput();
  }
  let morseLetters=[],morseCurrent="",morseTimer=null;
  function resetMorseInput(){clearTimeout(morseTimer);morseLetters=[];morseCurrent="";$("#morse-sent").textContent="—";}
  function receiveMorsePulse(duration){
    if(morsePanel.hidden||currentPuzzle<0||!sceneController?.isSeated())return;
    if(morseTimer)clearTimeout(morseTimer);
    morseCurrent+=duration>=320?"−":"·";
    const preview=[...morseLetters,morseCurrent].join(" / ");$("#morse-sent").textContent=preview;
    $("#morse-status").textContent="SIGNAL RECEIVED · PAUSE BETWEEN LETTERS";
    morseTimer=setTimeout(()=>{
      if(morseCurrent)morseLetters.push(morseCurrent);morseCurrent="";morseTimer=null;
      if(morseLetters.length<5)return;
      const sent=morseLetters.join("/");
      if(sent==="···/−−−/··−/−/····"){
        activePuzzleState.morseSent="SOUTH";$("#morse-status").textContent="RETURN SIGNAL ACKNOWLEDGED";solvePuzzle("SOUTH");
      }else{
        morsePanel.classList.add("morse-error");$("#morse-status").textContent="NO ACKNOWLEDGEMENT · RESET AND TRY AGAIN";
        setTimeout(()=>{if(!morsePanel.hidden){morsePanel.classList.remove("morse-error");$("#morse-status").textContent="REPLY FROM THE KEY";resetMorseInput();}},1100);
      }
    },1050);
  }
  async function initializeScene() {
    try {
      const sceneModule=await import("./scene3d.room.js?v=25");
      const {createGateScene}=sceneModule; createCryptexViewer=sceneModule.createCryptexViewer;
      sceneController=createGateScene(canvas,onSceneSelect,onSceneItemFound,onSceneFocusItem,receiveMorsePulse,()=>{if(!morsePanel.hidden){morsePanel.hidden=true;resetMorseInput();}},skipCurrentStage);
      sceneController.setRegisterActive(progress.registerActivated);
      sceneController.setSolvedCount(progress.solved.length,progress.finished);
      sceneController.setFlashlight(hasItem("flashlight"));
      sceneController.setCollectedItems(progress.inventory);
      sceneController.setCryptexLetters(["0","0","0","0","0"]);
      renderStage();
      if(progress.finished)startEnding();
    } catch(error) { showToast("THE GATE SCENE COULD NOT LOAD · RELOAD THE ARCHIVE"); console.error("3D gate scene failed",error); }
  }

  function openPuzzle(index) {
    if(index!==currentIndex() || index===0 || !progress.registerActivated)return;
    if(puzzles[index]?.type==="morse"){if(!sceneController?.isSeated()){showToast("THE RECEIVER IS SET FOR THE OPERATOR'S CHAIR");return;}openMorseStation(index);return;}
    const puzzle=puzzles[index]; currentPuzzle=index; activePuzzleState={};
    $("#puzzle-kicker").textContent=`EVIDENCE / ${String(index+1).padStart(2,"0")} · ${puzzle.label}`;
    $("#puzzle-title").textContent=puzzle.name; $("#puzzle-intro").textContent=puzzle.objective;
    $("#puzzle-feedback").textContent=""; $("#puzzle-feedback").classList.remove("error");
    $("#puzzle-answer").value=""; $("#puzzle-form").hidden=true; $("#puzzle-action").hidden=true;
    const answerInput=$("#puzzle-answer");answerInput.type=puzzle.type==="time-window"?"time":"text";answerInput.step=puzzle.type==="time-window"?"60":"any";answerInput.placeholder=puzzle.type==="time-window"?"02:00 AM":"ENTER CODE";
    renderPuzzleWidget(puzzle);
    if(puzzle.type==="cryptex")sceneController?.setCryptexVisible(true);
    puzzleDialog.showModal(); sceneController?.setPaused(true);if(puzzle.type==="cryptex")requestAnimationFrame(()=>cryptexViewer?.resize());
  }
  function setAnswerMode(label="ENTER RECOVERED CODE") { $("#puzzle-form").hidden=false; $("#answer-label").textContent=label; }
  function setActionMode(label="CONFIRM ↗") { const b=$("#puzzle-action"); b.textContent=label; b.hidden=false; }
  function makeEarthMapSvg(rotation) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360">
      <defs><linearGradient id="ground" x2=".2" y2="1"><stop stop-color="#59634d"/><stop offset="1" stop-color="#30392f"/></linearGradient><linearGradient id="lake" x2="1" y2="1"><stop stop-color="#496267"/><stop offset="1" stop-color="#20393d"/></linearGradient><linearGradient id="road" x2="0" y2="1"><stop stop-color="#bdb69d"/><stop offset=".5" stop-color="#ded4b9"/><stop offset="1" stop-color="#9f9880"/></linearGradient></defs>
      <rect width="600" height="360" fill="url(#ground)"/><g transform="rotate(${rotation} 300 180)">
        <path d="M40 335 560 25" stroke="#aaa58d" stroke-width="18" opacity=".7"/><path d="M40 335 560 25" stroke="#d1c8aa" stroke-width="8" opacity=".7"/><path d="M290 -40 324 -40 324 400 290 400Z" fill="url(#road)"/>
        <ellipse cx="165" cy="173" rx="54" ry="126" fill="url(#lake)" stroke="#81918a" stroke-opacity=".4" stroke-width="8"/><path d="M78 260q62-52 122 5t-6 58q-75 12-116-8Z" fill="#627957" opacity=".9"/>
        <path d="M393 78h112v52H393zM455 211h78v68h-78zM205 68h62v44h-62z" fill="#a9a995" stroke="#777b6e" stroke-width="5"/><path d="M356 156q45-28 89 0t4 46q-58 10-93-4Z" fill="#627957" opacity=".88"/><path d="M73 66h104v20H73zM490 304h76v18h-76z" fill="#8c927a" opacity=".7"/>
      </g><rect x="3" y="3" width="594" height="354" fill="none" stroke="#dfd0ad" stroke-opacity=".35" stroke-width="6"/></svg>`;
  }
  function makeWallPortraitSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360">
      <defs><linearGradient id="room" x2="0" y2="1"><stop stop-color="#50312b"/><stop offset="1" stop-color="#160e0d"/></linearGradient><linearGradient id="snow" x2="0" y2="1"><stop stop-color="#d8e2de"/><stop offset="1" stop-color="#738b8b"/></linearGradient></defs>
      <rect width="600" height="360" fill="url(#room)"/><rect x="44" y="28" width="512" height="304" rx="5" fill="#291816" stroke="#b28b55" stroke-width="12"/><rect x="68" y="52" width="464" height="256" fill="#233940"/>
      <rect x="82" y="66" width="436" height="205" fill="url(#snow)"/><circle cx="418" cy="111" r="25" fill="#f1ddae"/>
      <path d="M82 226 169 136l58 63 91-101 103 123 97-71v121H82Z" fill="#243638"/><path d="m120 225 49-89 50 74 66-112 59 93 45-48 53 82Z" fill="#f0e9da"/>
      <rect x="286" y="165" width="7" height="106" fill="#d4bb89"/><path d="m270 176 20-45 20 45Z" fill="#731e25"/><path d="m270 205 20-45 20 45Z" fill="#731e25"/><path d="m270 234 20-45 20 45Z" fill="#731e25"/>
      <rect x="82" y="271" width="436" height="37" fill="#1a1110"/><text x="300" y="297" fill="#eddbb6" font-family="Georgia,serif" font-size="23" letter-spacing="7" text-anchor="middle">TURN THE MIRROR</text>
      <path d="M54 40h492M54 320h492" stroke="#ead09a" stroke-opacity=".34" stroke-width="2"/></svg>`;
  }
  function scrambleEarthMap() {
    const pieces=Array.from({length:9},(_,i)=>i);let blank=8,previous=-1;
    for(let turn=0;turn<42;turn++){const row=Math.floor(blank/3),column=blank%3;const options=[row>0?blank-3:-1,row<2?blank+3:-1,column>0?blank-1:-1,column<2?blank+1:-1].filter(i=>i>=0&&i!==previous);const next=options[Math.floor(Math.random()*options.length)];[pieces[blank],pieces[next]]=[pieces[next],pieces[blank]];previous=blank;blank=next;}
    return pieces.every((piece,index)=>piece===index)?scrambleEarthMap():pieces;
  }
  function renderPuzzleWidget(p) {
    const box=$("#puzzle-content"); box.replaceChildren();
    if(p.type==="photo-order") {
      box.innerHTML='<p class="artifact-copy">Five photographs were recovered out of sequence. Arrange them by <b>DateTimeOriginal</b> from earliest to latest. Read the letter burned into each frame.</p><div class="photo-sort" id="photo-sort"></div><div class="artifact-readout" id="photo-readout">ORDER NOT RECONSTRUCTED</div>';
      const photos=[{id:"C",time:"1998:12:24 22:41:12",letter:"T"},{id:"E",time:"1998:12:24 23:03:54",letter:"H"},{id:"B",time:"1998:12:24 21:19:00",letter:"A"},{id:"D",time:"1998:12:24 20:55:15",letter:"E"},{id:"A",time:"1998:12:24 21:47:09",letter:"R"}];
      const list=$("#photo-sort");
      const draw=()=>{list.replaceChildren();photos.forEach((photo,i)=>{const row=document.createElement("div");row.className="photo-row";row.innerHTML=`<span class="photo-index">${String(i+1).padStart(2,"0")}</span><span class="photo-thumb frame-${photo.id}" aria-hidden="true"></span><span class="photo-name">FRAME ${photo.id}<small>DATETIMEORIGINAL · ${photo.time} · UTC−05:00 · GPS 28.0587031,-82.4138539</small></span><b class="photo-letter">${photo.letter}</b>`;const controls=document.createElement("span");controls.className="photo-controls";for(const [delta,label] of [[-1,"↑"],[1,"↓"]]){const button=document.createElement("button");button.type="button";button.textContent=label;button.disabled=i+delta<0||i+delta>=photos.length;button.setAttribute("aria-label",`${delta<0?"Move earlier":"Move later"}`);button.addEventListener("click",()=>{[photos[i],photos[i+delta]]=[photos[i+delta],photos[i]];draw();});controls.append(button);}row.append(controls);list.append(row);});$("#photo-readout").textContent=`FRAME ORDER: ${photos.map(x=>x.letter).join("")}`;};draw();
      setActionMode("LOCK PHOTO ORDER ↗"); $("#puzzle-action").onclick=()=>{const chronological=[...photos].sort((a,b)=>a.time.localeCompare(b.time)).map(x=>x.id).join("");const current=photos.map(x=>x.id).join("");if(current!==chronological){feedback("THE CAPTURE TIMES ARE NOT ASCENDING.",true);return;}const word=photos.map(x=>x.letter).join("");if(word!==p.answer){feedback("THE FRAMES ALIGN, BUT THE LETTERS DO NOT.",true);return;}solvePuzzle(word);};
    } else if(p.type==="cryptex") {
      box.innerHTML='<p class="artifact-copy">The photo order points to Google Earth. Open the bull fountain at the Marshall Student Center Plaza. Inspect its plaza imagery and record each count in this order:</p><div class="count-record"><div><span>01</span><b>Bulls in the fountain</b><i>—</i></div><div><span>02</span><b>People in red shirts beside a bull</b><i>—</i></div><div><span>03</span><b>Yellow signs beside the bull</b><i>—</i></div><div><span>04</span><b>People in business attire</b><i>—</i></div><div><span>05</span><b>Yellow daffodils</b><i>—</i></div></div><div class="link-row"><a href="https://earth.google.com/web/search/Marshall+Student+Center+Bull+Fountain,+USF,+Tampa/" target="_blank" rel="noreferrer">OPEN THE BULL FOUNTAIN IN GOOGLE EARTH ↗</a></div><p class="small-note">Drag a ring or use its + / − controls. Submit with the button below, or press the red side catch.</p><canvas class="cryptex-viewer" id="cryptex-viewer" aria-label="Interactive three-dimensional five-digit cryptex. Click its red side catch to confirm."></canvas><div class="artifact-readout cryptex-readout" id="cryptex-readout">00000</div><div class="cryptex-controls" id="cryptex-controls"></div><button id="cryptex-confirm" class="submit-button cryptex-confirm" type="button">SUBMIT THE FIVE COUNTS ↗</button>';
      const alphabet="0123456789",controls=$("#cryptex-controls");let letters=[..."00000"].map(c=>alphabet.indexOf(c));
      const sync=(next)=>{if(next)letters=next.map(c=>alphabet.indexOf(String(c)));const word=letters.map(x=>alphabet[x]).join("");$("#cryptex-readout").textContent=word;activePuzzleState.cryptexWord=word;controls.querySelectorAll("small").forEach((label,i)=>{label.textContent=`${String(i+1).padStart(2,"0")} · ${alphabet[letters[i]]}`;});};
      cryptexViewer?.dispose();
      const confirmCode=code=>{activePuzzleState.cryptexWord=String(code).replace(/[^0-9]/g,"").slice(0,5);if(activePuzzleState.cryptexWord!==p.answer){feedback(`THE RINGS READ ${activePuzzleState.cryptexWord}. RECHECK THE SURVEY COUNTS.`,true);return;}solvePuzzle(activePuzzleState.cryptexWord);};
      cryptexViewer=createCryptexViewer?.($("#cryptex-viewer"),letters.map(x=>alphabet[x]),next=>{letters=next.map(c=>alphabet.indexOf(c));sync();},confirmCode);
      const drawControls=()=>{controls.replaceChildren();letters.forEach((value,i)=>{const dial=document.createElement("div");dial.className="cryptex-dial";dial.innerHTML=`<button type="button" aria-label="Turn ring ${i+1} backward">−</button><small>${String(i+1).padStart(2,"0")} · ${alphabet[value]}</small><button type="button" aria-label="Turn ring ${i+1} forward">+</button>`;const buttons=dial.querySelectorAll("button");buttons[0].addEventListener("click",()=>cryptexViewer?.turn(i,-1));buttons[1].addEventListener("click",()=>cryptexViewer?.turn(i,1));controls.append(dial);});};
      sync();drawControls();$("#puzzle-action").hidden=true;$("#cryptex-confirm").addEventListener("click",()=>confirmCode(cryptexViewer?.getCode()??letters.map(x=>alphabet[x]).join("")));
    } else if(p.type==="earth-mirror") {
      box.innerHTML='<p class="artifact-copy">Reconstruct each recovered campus capture by sliding the map pieces into the empty square. When all four views are whole, compare Lake Behnke and the straight road with the mirror, then select the matching camera heading.</p><p class="small-note">Click a piece beside the empty square to slide it. You can also use Tab and Enter. Every frame must be rebuilt before its heading is revealed.</p><div class="earth-captures" id="earth-captures"></div><div class="link-row"><a href="https://earth.google.com/web/@28.0587,-82.41385,850a,2500d,35y,0h,0t,0r" target="_blank" rel="noreferrer">OPEN THIS USF CAMPUS VIEW IN GOOGLE EARTH ↗</a></div><p class="small-note">These are original schematic captures based on the campus layout. Google Earth imagery and dates can vary by region.</p><div class="artifact-readout" id="earth-capture-readout" aria-live="polite">MAPS RESTORED · 0 / 4 · NO CAPTURE SELECTED</div>';
      const captures=[{heading:"000",rotation:0},{heading:"090",rotation:90},{heading:"180",rotation:180},{heading:"270",rotation:270}];
      for(let i=captures.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[captures[i],captures[j]]=[captures[j],captures[i]];}
      const cards=$("#earth-captures"),restored=new Set();
      captures.forEach((capture,index)=>{
        const article=document.createElement("article");article.className="earth-capture";
        const title=document.createElement("div");title.className="earth-capture-head";
        const frame=document.createElement("b");frame.textContent=`FIELD FRAME · ${String.fromCharCode(65+index)}`;
        const state=document.createElement("small");state.textContent="SCRAMBLED";title.append(frame,state);
        const grid=document.createElement("div");grid.className="earth-image-board";grid.setAttribute("role","group");grid.setAttribute("aria-label",`Scrambled campus map frame ${String.fromCharCode(65+index)}`);
        const image=`url("data:image/svg+xml,${encodeURIComponent(makeEarthMapSvg(capture.rotation))}")`;
        let pieces=scrambleEarthMap();
        const draw=focusIndex=>{
          grid.replaceChildren();
          pieces.forEach((piece,position)=>{
            const tile=document.createElement("button");tile.type="button";tile.className="earth-image-piece";tile.setAttribute("aria-label",piece===8?"Empty square":`Map piece ${piece+1}; slide into the empty square`);tile.disabled=piece===8;tile.dataset.position=String(position);
            if(piece!==8){tile.style.backgroundImage=image;tile.style.backgroundPosition=`${(piece%3)*50}% ${Math.floor(piece/3)*50}%`;}
            tile.addEventListener("click",()=>{
              const blank=pieces.indexOf(8),row=Math.floor(position/3),column=position%3,blankRow=Math.floor(blank/3),blankColumn=blank%3;
              if(Math.abs(row-blankRow)+Math.abs(column-blankColumn)!==1)return;
              [pieces[position],pieces[blank]]=[pieces[blank],pieces[position]];
              if(pieces.every((value,cell)=>value===cell)){
                article.classList.add("is-complete");restored.add(capture.heading);state.textContent=`RESTORED · CAMERA ${capture.heading}°`;grid.setAttribute("aria-label",`Campus map frame ${String.fromCharCode(65+index)} reconstructed`);
                const choose=document.createElement("button");choose.type="button";choose.className="earth-capture-select";choose.textContent=`SELECT ${capture.heading}° CAPTURE`;
                choose.addEventListener("click",()=>{activePuzzleState.earthHeading=capture.heading;cards.querySelectorAll(".earth-capture").forEach(node=>node.classList.remove("selected"));article.classList.add("selected");$("#earth-capture-readout").textContent=`MAPS RESTORED · 4 / 4 · CAPTURE SELECTED · ${capture.heading}°`;});
                article.append(choose);$("#earth-capture-readout").textContent=`MAPS RESTORED · ${restored.size} / 4 · ${restored.size===4?"COMPARE THE LANDMARKS AND SELECT A HEADING":"FINISH THE OTHER MAPS"}`;
              }
              draw(blank);
            });
            grid.append(tile);
          });
          if(focusIndex!==undefined&&!article.classList.contains("is-complete"))grid.querySelector(`[data-position="${focusIndex}"]`)?.focus();
        };
        draw();article.append(title,grid);cards.append(article);
      });
      setActionMode("ALIGN THE MIRROR ↗");$("#puzzle-action").onclick=()=>activePuzzleState.earthHeading===p.answer&&restored.size===4?solvePuzzle(p.answer):feedback(restored.size<4?"REBUILD ALL FOUR CAMPUS MAPS FIRST.":"THE LAKE AND ROAD DO NOT MATCH THE REFLECTION.",true);
    } else if(p.type==="morse") {
      box.innerHTML='<p class="artifact-copy">The telegraph bears one question, stamped by the winter office: “In which way does the wind blow in the North Pole?” The key answers only in pulses.</p><div class="morse-note">SHORT TAP · LONG HOLD · PAUSE BETWEEN LETTERS</div>';
      setAnswerMode("RETURNED DIRECTION");
    } else if(p.type==="metadata-photos") {
      const records=[
        {id:"D",time:"1998:12:24 22:41:12",note:"An echo calls back to yoU",asset:"photo-04.svg"},
        {id:"B",time:"1998:12:24 23:03:54",note:"Under the old lamp, remembeR",asset:"photo-05.svg"},
        {id:"C",time:"1998:12:24 20:55:15",note:"Snow keeps its coloR",asset:"photo-01.svg"},
        {id:"E",time:"1998:12:25 00:18:02",note:"No footprints remain dowN",asset:"photo-06.svg"},
        {id:"A",time:"1998:12:24 21:47:09",note:"Window glass takes the lighT",asset:"photo-03.svg"},
        {id:"F",time:"1998:12:24 21:19:00",note:"Tracks vanish by dawnE",asset:"photo-02.svg"}
      ];
      box.innerHTML='<p class="artifact-copy">These six photographs were recovered out of order. Open each image metadata record. Sort by <b>DateTimeOriginal</b>, then read the final character of each <b>ImageDescription</b>.</p><div class="metadata-photo-grid" id="metadata-photo-grid"></div><div class="artifact-readout" id="metadata-order-readout">TIMELINE NOT RECONSTRUCTED</div>';
      const grid=$("#metadata-photo-grid");
      const drawRecords=()=>{grid.replaceChildren();records.forEach((record,index)=>{const card=document.createElement("article");card.className="metadata-photo";card.innerHTML=`<img src="assets/${record.asset}" alt="Recovered archival photograph ${record.id}"><div class="metadata-photo-head"><b>FRAME ${record.id}</b><span>${String(index+1).padStart(2,"0")}</span></div><details><summary>READ IMAGE METADATA</summary><dl><dt>DateTimeOriginal</dt><dd>${record.time}</dd><dt>ImageDescription</dt><dd>${record.note}</dd><dt>GPSStatus</dt><dd>INTERPOLATED</dd><dt>Artist</dt><dd>FIELD ARCHIVE / NPTA</dd></dl></details><div class="metadata-order-controls"></div>`;const controls=card.querySelector(".metadata-order-controls");for(const [delta,label] of [[-1,"↑"],[1,"↓"]]){const move=document.createElement("button");move.type="button";move.textContent=label;move.disabled=index+delta<0||index+delta>=records.length;move.setAttribute("aria-label",delta<0?"Move frame earlier":"Move frame later");move.addEventListener("click",()=>{[records[index],records[index+delta]]=[records[index+delta],records[index]];activePuzzleState.photoWord="";$("#metadata-order-readout").textContent="TIMELINE CHANGED · RECHECK THE ORDER";drawRecords();});controls.append(move);}grid.append(card);});};
      drawRecords();setActionMode("RECONSTRUCT THE TIMELINE ↗");setAnswerMode("RECOVERED WORD");$("#puzzle-action").onclick=()=>{const sorted=[...records].sort((a,b)=>a.time.localeCompare(b.time));if(records.some((record,index)=>record.id!==sorted[index].id)){feedback("THE METADATA TIMES ARE NOT IN ASCENDING ORDER.",true);return;}const word=records.map(record=>record.note.slice(-1)).join("").toUpperCase();activePuzzleState.photoWord=word;$("#metadata-order-readout").textContent=`TIMELINE RESTORED · ${word}`;feedback("TIMELINE RESTORED · ENTER THE SIX LETTER MESSAGE.");$("#puzzle-answer").focus();};
    } else if(p.type==="earth") {
      box.innerHTML='<p class="artifact-copy">The recovered image is tagged at the coordinate below. Verify the location in Google Earth, then reconstruct the camera\'s absolute capture time from its metadata. The archive accepted only UTC.</p><div class="coordinate-card">28.0587031° N<br>82.4138539° W</div><div class="link-row"><a href="https://earth.google.com/web/search/28.0587031,-82.4138539" target="_blank" rel="noreferrer">VERIFY THE PIN IN GOOGLE EARTH ↗</a></div><div class="utc-record"><span>DATETIMEORIGINAL</span><b>1998:12:24 22:41:12</b><span>CAMERA CLOCK · UTC−05:00</span><small>Convert the instant, including the date rollover. Submit UTC as YYYYMMDDHHMMSS.</small></div><p class="small-note">This is an online research puzzle. No campus visit is needed.</p>';
      setAnswerMode("UTC TIMESTAMP · 14 DIGITS");
    } else if(p.type==="time-window") {
      box.innerHTML='<p class="artifact-copy">The source photograph records a night that never quite becomes morning. Read the light in the original image and estimate its local exposure time.</p><div class="link-row"><a href="https://earth.google.com/web/@0,-0.37463501,0a,22251752.77375655d,35y,0h,0t,0r/data=CgRCAggBQgIIAEoNCP___________wEQAA?authuser=0" target="_blank" rel="noreferrer">OPEN THE ORIGINAL EARTH CAPTURE ↗</a></div><div class="camera-clock camera-clock-muted" role="img" aria-label="An unmarked camera dial"><div class="clock-face"><i class="clock-minute"></i></div><span>EXPOSURE / RECORD 07</span></div><p class="small-note">The archive accepts a local estimate within three minutes of the exposure.</p>';
      setAnswerMode("ESTIMATED PHOTO TIME · ±3 MINUTES");
    } else if(p.type==="photo-wall") {
      const photo=`url("data:image/svg+xml,${encodeURIComponent(makeWallPortraitSvg())}")`;
      box.innerHTML='<p class="artifact-copy">A winter portrait has been cut into nine pieces. Select one piece, then another to swap them. You can also drag pieces. Rebuild the photograph to read the frame.</p><div class="wall-photo-board" id="wall-photo-board" role="group" aria-label="Nine-piece wall photograph"></div><div class="wall-photo-reveal" id="wall-photo-reveal" hidden>TURN THE MIRROR</div>';
      const board=$("#wall-photo-board");let pieces=[...Array(9).keys()];for(let i=pieces.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pieces[i],pieces[j]]=[pieces[j],pieces[i]];}if(pieces.every((v,i)=>v===i))[pieces[0],pieces[1]]=[pieces[1],pieces[0]];
      let selected=-1,dragFrom=-1;
      const draw=()=>{board.replaceChildren();pieces.forEach((piece,slot)=>{const tile=document.createElement("button");tile.type="button";tile.className="wall-photo-tile"+(selected===slot?" selected":"");tile.setAttribute("aria-label",`Photograph piece ${slot+1}, currently showing section ${piece+1}`);tile.style.backgroundImage=photo;tile.style.backgroundPosition=`${(piece%3)*50}% ${Math.floor(piece/3)*50}%`;tile.draggable=true;tile.addEventListener("click",()=>{if(selected<0){selected=slot;draw();return;}if(selected===slot){selected=-1;draw();return;}[pieces[selected],pieces[slot]]=[pieces[slot],pieces[selected]];selected=-1;draw();});tile.addEventListener("dragstart",()=>{dragFrom=slot;});tile.addEventListener("dragover",e=>e.preventDefault());tile.addEventListener("drop",e=>{e.preventDefault();if(dragFrom<0||dragFrom===slot)return;[pieces[dragFrom],pieces[slot]]=[pieces[slot],pieces[dragFrom]];dragFrom=-1;draw();});board.append(tile);});if(pieces.every((v,i)=>v===i)){activePuzzleState.wallRestored=true;$("#wall-photo-reveal").hidden=false;setAnswerMode("OBJECT NAMED IN THE FRAME");$("#puzzle-answer").focus();}};
      draw();
    } else if(p.type==="mirror-code") {
      box.innerHTML='<p class="artifact-copy">A loose hinge hides a small brass object. The room shifts when the mirror is moved.</p><div class="mirror-reveal-stage"><div class="mirror-reveal-frame" id="mirror-reveal-frame"><span>GLASS</span></div><div class="mirror-drop-status" id="mirror-drop-status">THE FRAME IS STILL</div></div><button id="mirror-turn" class="submit-button" type="button">TURN THE MIRROR</button><div class="artifact-readout" id="mirror-readout" hidden>THE OBJECT HAS FALLEN · ITS NAME IS STILL NEEDED</div>';
      $("#mirror-turn").addEventListener("click",()=>{if(activePuzzleState.mirrorRevealed)return;activePuzzleState.mirrorRevealed=true;sceneController?.turnMirrorAndDrop();$("#mirror-reveal-frame").classList.add("turned");$("#mirror-drop-status").textContent="A SMALL OBJECT TUMBLES TO THE FLOOR";setTimeout(()=>{$("#mirror-readout").hidden=false;setAnswerMode("NAME OF THE DROPPED OBJECT");$("#puzzle-answer").focus();},1150);});
      setActionMode("TURN THE MIRROR");$("#puzzle-action").hidden=true;
    } else if(p.type==="uuencode") {
      sceneController?.revealTreeNote();box.innerHTML='<p class="artifact-copy">The painting has shifted from the wall. A line of old code was tucked behind the winter trees.</p><pre class="final-uu-code">begin 644 north-pole.txt\n,5T%,2R!/5513241%\n \nend</pre><p class="small-note">Keep the spaces and punctuation in the decoded instruction.</p>';
      setAnswerMode("DECODED INSTRUCTION");
    }
  }
  function normalized(value) { return String(value).toUpperCase().replace(/[^A-Z0-9]/g,""); }
  function feedback(message,error=false) { const el=$("#puzzle-feedback");el.textContent=message;el.classList.toggle("error",error); }
  function solvePuzzle(value) {
    if(progress.finished)return;
    const puzzle=puzzles[currentPuzzle]; if(!puzzle||currentPuzzle!==currentIndex()||!progress.registerActivated||normalized(value)!==normalized(puzzle.answer)){feedback("THE MECHANISM DOES NOT ACCEPT THAT READING.",true);return;}
    if(puzzle.type==="metadata-photos"&&activePuzzleState.photoWord!==puzzle.answer){feedback("RESTORE THE PHOTO TIMELINE BEFORE RECORDING THE MESSAGE.",true);return;}
    if(puzzle.type==="earth-mirror"&&activePuzzleState.earthHeading!==puzzle.answer){feedback("MATCH A CAMPUS CAPTURE TO THE REFLECTION FIRST.",true);return;}
    if(puzzle.type==="photo-wall"&&!activePuzzleState.wallRestored){feedback("REBUILD THE WALL PHOTOGRAPH FIRST.",true);return;}
    if(puzzle.type==="mirror-code"&&!activePuzzleState.mirrorRevealed){feedback("THE MIRROR HAS NOT BEEN TURNED.",true);return;}
    if(puzzle.type==="cryptex"&&activePuzzleState.cryptexWord!==puzzle.answer){feedback("THE RINGS MUST BE TURNED INTO ALIGNMENT FIRST.",true);return;}
    if(puzzle.type==="morse"&&activePuzzleState.morseSent!==puzzle.answer){$("#morse-status").textContent="THE REGISTER REQUIRES A PHYSICAL KEY REPLY";return;}
    feedback(`RECORD ACCEPTED · FRAGMENT ${puzzle.fragment} RECOVERED`);
    if(!progress.solved.includes(currentPuzzle))progress.solved.push(currentPuzzle);
    progress.fragments[currentPuzzle]=puzzle.fragment;
    if(currentPuzzle===2&&!hasItem("cryptex_key"))progress.inventory.push("cryptex_key");
    progress.finished=progress.solved.length===10;saveProgress();renderStage();if(progress.finished)sceneController?.setPaused(true);
    puzzleDialog.classList.add("solving");$("#transition-cover").classList.add("sweep");
    if(progress.finished)showToast("CONTINUITY RESTORED · THE DOOR IS OPEN");
    else showToast(`SEAL ${String(currentPuzzle+1).padStart(2,"0")} RELEASED`);
    const finalSolved=progress.finished;
    setTimeout(()=>{puzzleDialog.classList.remove("solving");if(puzzleDialog.open)puzzleDialog.close();morsePanel.hidden=true;sceneController?.setMorseActive(false);sceneController?.setCryptexVisible(false);$("#transition-cover").classList.remove("sweep");if(finalSolved)startEnding();else sceneController?.setPaused(false);},850);
  }
  function submitAnswer(event) {
    event.preventDefault();if(currentPuzzle<0)return;
    const puzzle=puzzles[currentPuzzle],value=$("#puzzle-answer").value;
    if(puzzle?.type==="time-window"){
      const match=/^(\d{2}):(\d{2})$/.exec(value);if(!match){feedback("SET A CAMERA TIME FIRST.",true);return;}
      const minutes=Number(match[1])*60+Number(match[2]);if(Math.abs(minutes-120)>3){feedback("THE CAMERA CLOCK IS MORE THAN THREE MINUTES FROM THE EXPOSURE.",true);return;}
      solvePuzzle("0200");return;
    }
    solvePuzzle(value);
  }
  function startEnding(){
    $("#gate-scene").focus();
    const overlay=$("#ending-cutscene"),caption=$("#ending-caption"),bar=$("#ending-progress-bar"),final=$("#ending-final");overlay.hidden=false;final.hidden=true;caption.hidden=false;caption.textContent="THE EXIT STANDS OPEN · WALK INTO THE WINTER AIR";bar.style.width="0%";
    if(progress.endingSeen){caption.hidden=true;final.hidden=false;sceneController?.playEnding(0,()=>{});return;}
    sceneController?.playEnding(30000,(ratio,escaped)=>{
      const amount=Math.max(0,Math.min(1,ratio));bar.style.width=`${amount*100}%`;
      if(escaped){caption.hidden=true;final.hidden=false;progress.endingSeen=true;saveProgress();}
      else if(amount>=1){caption.textContent="THE HOUSE IS BEHIND YOU · KEEP WALKING THROUGH THE SNOW";caption.hidden=false;}
    });
  }
  function closePuzzle() { if(puzzleDialog.open)puzzleDialog.close();sceneController?.setCryptexVisible(false);sceneController?.setPaused(Boolean(progress.finished));cryptexViewer?.dispose();cryptexViewer=null;puzzleDialog.classList.remove("solving"); }

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

  const NOTES_TEXT_KEY="np-gate-09-field-notes-v1",NOTES_DRAW_KEY="np-gate-09-field-drawing-v1",notepadDialog=$("#notepad-dialog"),notesText=$("#notes-text"),notesCanvas=$("#notes-canvas");let noteSaveTimer=0,drawingActive=false,eraseNotes=false;
  function openNotepad(){notesText.value=localStorage.getItem(NOTES_TEXT_KEY)||"";notepadDialog.showModal();sceneController?.setPaused(true);requestAnimationFrame(sizeNotesCanvas);}
  function closeNotepad(){if(notepadDialog.open)notepadDialog.close();sceneController?.setPaused(Boolean(progress.finished));}
  function queueNoteSave(){const status=$("#notes-save-status");status.textContent="SAVING…";clearTimeout(noteSaveTimer);noteSaveTimer=setTimeout(()=>{localStorage.setItem(NOTES_TEXT_KEY,notesText.value);status.textContent="SAVED IN THIS BROWSER";},220);}
  function sizeNotesCanvas(){const rect=notesCanvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const imageData=localStorage.getItem(NOTES_DRAW_KEY),ratio=Math.min(window.devicePixelRatio||1,2);notesCanvas.width=Math.round(rect.width*ratio);notesCanvas.height=Math.round(rect.height*ratio);const ctx=notesCanvas.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle="#fffdf8";ctx.fillRect(0,0,rect.width,rect.height);if(imageData){const image=new Image();image.onload=()=>ctx.drawImage(image,0,0,rect.width,rect.height);image.src=imageData;}}
  function notePoint(event){const rect=notesCanvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function startNoteStroke(event){if($("#notes-drawing").hidden)return;event.preventDefault();drawingActive=true;notesCanvas.setPointerCapture(event.pointerId);const p=notePoint(event),ctx=notesCanvas.getContext("2d");ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.1,p.y+.1);ctx.strokeStyle=eraseNotes?"#fffdf8":$("#notes-color").value;ctx.lineWidth=Number($("#notes-width").value)*(eraseNotes?4:1);ctx.lineCap="round";ctx.stroke();}
  function moveNoteStroke(event){if(!drawingActive)return;const p=notePoint(event),ctx=notesCanvas.getContext("2d");ctx.strokeStyle=eraseNotes?"#fffdf8":$("#notes-color").value;ctx.lineWidth=Number($("#notes-width").value)*(eraseNotes?4:1);ctx.lineCap="round";ctx.lineTo(p.x,p.y);ctx.stroke();}
  function endNoteStroke(){if(!drawingActive)return;drawingActive=false;localStorage.setItem(NOTES_DRAW_KEY,notesCanvas.toDataURL("image/png"));$("#notes-save-status").textContent="SAVED IN THIS BROWSER";}
  function showNotesMode(mode){const draw=mode==="draw";$("#notes-write-tab").setAttribute("aria-pressed",String(!draw));$("#notes-draw-tab").setAttribute("aria-pressed",String(draw));notesText.hidden=draw;$("#notes-drawing").hidden=!draw;if(draw)requestAnimationFrame(sizeNotesCanvas);eraseNotes=false;$("#notes-erase").setAttribute("aria-pressed","false");}
  function clearNotes(){if(!window.confirm("Clear the saved notes and drawing from this browser?"))return;notesText.value="";localStorage.removeItem(NOTES_TEXT_KEY);localStorage.removeItem(NOTES_DRAW_KEY);sizeNotesCanvas();$("#notes-save-status").textContent="PAGE CLEARED";}

  $("#puzzle-form").addEventListener("submit",submitAnswer);
  $("#puzzle-action").addEventListener("click",()=>{});
  $("#close-puzzle").addEventListener("click",closePuzzle);
  puzzleDialog.addEventListener("click",e=>{if(e.target===puzzleDialog)closePuzzle();});
  puzzleDialog.addEventListener("close",()=>{sceneController?.setCryptexVisible(false);sceneController?.setPaused(Boolean(progress.finished));cryptexViewer?.dispose();cryptexViewer=null;});
  $("#music-toggle").addEventListener("click",()=>setMusic(!musicOn));
  $("#notes-toggle").addEventListener("click",openNotepad);$("#close-notepad").addEventListener("click",closeNotepad);notepadDialog.addEventListener("click",e=>{if(e.target===notepadDialog)closeNotepad();});
  notesText.value=localStorage.getItem(NOTES_TEXT_KEY)||"";notesText.addEventListener("input",queueNoteSave);$("#notes-write-tab").addEventListener("click",()=>showNotesMode("write"));$("#notes-draw-tab").addEventListener("click",()=>showNotesMode("draw"));$("#notes-clear").addEventListener("click",clearNotes);$("#notes-erase").addEventListener("click",()=>{eraseNotes=!eraseNotes;$("#notes-erase").setAttribute("aria-pressed",String(eraseNotes));});
  notesCanvas.addEventListener("pointerdown",startNoteStroke);notesCanvas.addEventListener("pointermove",moveNoteStroke);notesCanvas.addEventListener("pointerup",endNoteStroke);notesCanvas.addEventListener("pointercancel",endNoteStroke);window.addEventListener("resize",()=>{if(notepadDialog.open&&!$("#notes-drawing").hidden)sizeNotesCanvas();});
  $("#close-tape").addEventListener("click",()=>tapeDialog.close());
  document.addEventListener("np-lamp-empty",()=>{showToast("THE LAMP IS OUT · SWITCH IT OFF TO LET IT RECHARGE");renderInventory();});
  const crouchButton=$("#crouch-toggle");
  crouchButton?.addEventListener("click",()=>{if(sceneController?.isSeated()){sceneController.toggleSeat();return;}const next=crouchButton.getAttribute("aria-pressed")!=="true";const actual=sceneController?.setCrouching(next);crouchButton.setAttribute("aria-pressed",String(actual??next));crouchButton.textContent=(actual??next)?"STAND":"CROUCH";});
  $("#morse-close")?.addEventListener("click",()=>{morsePanel.hidden=true;sceneController?.setMorseActive(false);resetMorseInput();});
  $("#morse-reset")?.addEventListener("click",()=>{resetMorseInput();$("#morse-status").textContent="REPLY CLEARED · SHORT TAP = DOT · HOLD = DASH";});
  tapeDialog.addEventListener("click",e=>{if(e.target===tapeDialog)tapeDialog.close();});
  ["pointerdown","keydown","touchstart"].forEach(type=>window.addEventListener(type,primeMusic,{passive:type!=="keydown"}));
  window.addEventListener("resize",()=>sceneController?.resize());
  const musicPreference=localStorage.getItem(MUSIC_KEY);setMusic(musicPreference!=="off");
  renderStage();initializeScene();
})();

