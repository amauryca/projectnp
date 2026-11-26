(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#gate-scene"), puzzleDialog = $("#puzzle-dialog"), tapeDialog = $("#tape-dialog"), morsePanel = $("#morse-panel");
  const ruffleContainer = $("#ruffle-container");
  const SAVE_KEY = "np-gate-09-progress-v12-photo-lock-ending";
  const LEGACY_SAVE_KEY = "np-gate-09-progress-v9-utc-morse-chair";
  const puzzles = window.NP_PUZZLES;
  const testMode = new URLSearchParams(location.search).get("test") === "1";
  let progress = readProgress(), sceneController = null, currentPuzzle = -1, gamePlayer = null, createCryptexViewer = null, cryptexViewer = null;
  let activePuzzleState = {};
  const MUSIC_KEY = "np-gate-09-music-v1";
  let musicOn = false, musicContext = null, musicMaster = null, musicNodes = [];

  function readProgress() {
    try {
      const hasCurrentSave = Boolean(localStorage.getItem(SAVE_KEY));
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem("np-gate-09-progress-v11-winter-ending") || localStorage.getItem("np-gate-09-progress-v10-image-evidence") || localStorage.getItem(LEGACY_SAVE_KEY) || "{}");
      const currentPuzzleSet = hasCurrentSave || data.version === 12;
      const solved = Array.isArray(data.solved) ? [...new Set(data.solved.filter(n => Number.isInteger(n) && n >= 0 && n < 10 && (currentPuzzleSet ? true : n < 6)))].sort((a,b) => a-b) : [];
      // Enforce a contiguous route. A later saved seal can never skip an earlier one.
      const ordered = []; for (let i = 0; i < solved.length && solved[i] === i; i++) ordered.push(i);
      return { version: 12, solved: ordered, inventory: Array.isArray(data.inventory) ? [...new Set(data.inventory.filter(x => ["flashlight","gate_tooth","cryptex_key"].includes(x)))] : [], fragments: Array.isArray(data.fragments) ? data.fragments.slice(0,currentPuzzleSet?10:6) : [], registerActivated: Boolean(data.registerActivated && ordered.includes(0)), finished: ordered.length === 10 };
    } catch { return { solved: [], inventory: [], fragments: [], registerActivated: false, finished: false }; }
  }
  function saveProgress() { progress.version = 12; localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }
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
    $("#stage-objective").textContent = progress.finished ? "The room settles. The record is complete." : !progress.registerActivated ? "The room is dark. A hand lamp rests on the writing table to your left." : stage?.objective || "Dust has been disturbed somewhere in the room.";
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
      button.innerHTML=`<span>${item.icon}</span><small>${item.label}</small>`;
      if(item.id==="flashlight") { button.setAttribute("aria-pressed",String(Boolean(sceneController?.flashlightOn))); button.addEventListener("click",()=>{sceneController?.setFlashlight(!sceneController?.flashlightOn);renderInventory();}); }
      hud.append(button);
    });
    const tape=document.createElement("button"); tape.type="button"; tape.className="inventory-slot record-slot"; tape.textContent="REC"; tape.title="Recovered tape"; tape.hidden=!progress.solved.includes(2); tape.addEventListener("click",openTape); hud.append(tape);
  }
  function onSceneFocusItem(id) {
    const prompt=$("#scene-prompt"); if(!prompt)return;
    if(!id){prompt.classList.remove("visible");return;}
    const text={flashlight:"HAND LAMP · CLICK TO RECOVER",gate_tooth:"BRASS KEY · CLICK / E TO TAKE",chair:sceneController?.isSeated()?"OPERATOR'S CHAIR · C TO STAND":"OPERATOR'S CHAIR · CLICK / E TO SIT",cryptex_key:"KEY RECOVERED",artifact:"EVIDENCE FOUND · CLICK TO INSPECT"};
    prompt.textContent=text[id]||"EVIDENCE FOUND · CLICK TO INSPECT"; prompt.classList.add("visible");
  }
  function onSceneItemFound(id) {
    if(!["flashlight","gate_tooth","cryptex_key"].includes(id)||hasItem(id))return;
    progress.inventory.push(id);
    if(id==="flashlight") { sceneController?.setFlashlight(true); saveProgress(); renderInventory(); showToast("HAND LAMP RECOVERED · A BRASS KEY CATCHES THE LIGHT"); return; }
    if(id==="gate_tooth" && hasItem("flashlight")) {
      progress.registerActivated=true; progress.solved=[0]; progress.fragments[0]=puzzles[0].fragment; saveProgress(); renderStage();
      showToast("BRASS KEY RECOVERED · THE FIRST SEAL RELEASES"); return;
    }
    saveProgress(); renderInventory(); showToast("OBJECT RECOVERED");
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
    $("#morse-incoming").textContent="·−− / · / ··· / −";$("#morse-sent").textContent="—";$("#morse-status").textContent="SHORT TAP = DOT · HOLD = DASH · PAUSE BETWEEN LETTERS";
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
      if(morseLetters.length<4)return;
      const sent=morseLetters.join("/");
      if(sent==="·−−/·/···/−"){
        activePuzzleState.morseSent="WEST";$("#morse-status").textContent="RETURN SIGNAL ACKNOWLEDGED";solvePuzzle("WEST");
      }else{
        morsePanel.classList.add("morse-error");$("#morse-status").textContent="NO ACKNOWLEDGEMENT · RESET AND TRY AGAIN";
        setTimeout(()=>{if(!morsePanel.hidden){morsePanel.classList.remove("morse-error");$("#morse-status").textContent="REPLY FROM THE KEY";resetMorseInput();}},1100);
      }
    },1050);
  }
  async function initializeScene() {
    try {
    const sceneModule=await import("./scene3d.room.js?v=19");
      const {createGateScene}=sceneModule; createCryptexViewer=sceneModule.createCryptexViewer;
      sceneController=createGateScene(canvas,onSceneSelect,onSceneItemFound,onSceneFocusItem,receiveMorsePulse,()=>{if(!morsePanel.hidden){morsePanel.hidden=true;resetMorseInput();}});
      sceneController.setRegisterActive(progress.registerActivated);
      sceneController.setSolvedCount(progress.solved.length,progress.finished);
      sceneController.setFlashlight(hasItem("flashlight"));
      sceneController.setCollectedItems(progress.inventory);
      sceneController.setCryptexLetters(["0","0","0","0","0"]);
      renderStage();
      if(progress.finished){sceneController.setControlsLocked(true);startEscapeCutscene();}
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
    renderPuzzleWidget(puzzle);
    if(puzzle.type==="cryptex")sceneController?.setCryptexVisible(true);
    puzzleDialog.showModal(); sceneController?.setPaused(true);if(puzzle.type==="cryptex")requestAnimationFrame(()=>cryptexViewer?.resize());
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
      box.innerHTML='<p class="artifact-copy">The photo order points to Google Earth. Open the bull fountain at the Marshall Student Center Plaza. Inspect its plaza imagery and record each count in this order:</p><div class="count-record"><div><span>01</span><b>Bulls in the fountain</b><i>—</i></div><div><span>02</span><b>People in red shirts beside a bull</b><i>—</i></div><div><span>03</span><b>Yellow signs beside the bull</b><i>—</i></div><div><span>04</span><b>People in business attire</b><i>—</i></div><div><span>05</span><b>Yellow daffodils</b><i>—</i></div></div><div class="link-row"><a href="https://earth.google.com/web/search/Marshall+Student+Center+Bull+Fountain,+USF,+Tampa/" target="_blank" rel="noreferrer">OPEN THE BULL FOUNTAIN IN GOOGLE EARTH ↗</a></div><p class="small-note">Drag a ring or use its + / − controls. Submit with the button below, or press the red side catch.</p><canvas class="cryptex-viewer" id="cryptex-viewer" aria-label="Interactive three-dimensional five-digit cryptex. Click its red side catch to confirm."></canvas><div class="artifact-readout cryptex-readout" id="cryptex-readout">00000</div><div class="cryptex-controls" id="cryptex-controls"></div><button id="cryptex-confirm" class="submit-button cryptex-confirm" type="button">SUBMIT THE FIVE COUNTS ↗</button>';
      const alphabet="0123456789",controls=$("#cryptex-controls");let letters=[..."00000"].map(c=>alphabet.indexOf(c));
      const sync=(next)=>{if(next)letters=next.map(c=>alphabet.indexOf(String(c)));const word=letters.map(x=>alphabet[x]).join("");$("#cryptex-readout").textContent=word;activePuzzleState.cryptexWord=word;controls.querySelectorAll("small").forEach((label,i)=>{label.textContent=`${String(i+1).padStart(2,"0")} · ${alphabet[letters[i]]}`;});};
      cryptexViewer?.dispose();
      const confirmCode=code=>{activePuzzleState.cryptexWord=String(code).replace(/[^0-9]/g,"").slice(0,5);if(activePuzzleState.cryptexWord!==p.answer){feedback(`THE RINGS READ ${activePuzzleState.cryptexWord}. RECHECK THE SURVEY COUNTS.`,true);return;}solvePuzzle(activePuzzleState.cryptexWord);};
      cryptexViewer=createCryptexViewer?.($("#cryptex-viewer"),letters.map(x=>alphabet[x]),next=>{letters=next.map(c=>alphabet.indexOf(c));sync();},confirmCode);
      const drawControls=()=>{controls.replaceChildren();letters.forEach((value,i)=>{const dial=document.createElement("div");dial.className="cryptex-dial";dial.innerHTML=`<button type="button" aria-label="Turn ring ${i+1} backward">−</button><small>${String(i+1).padStart(2,"0")} · ${alphabet[value]}</small><button type="button" aria-label="Turn ring ${i+1} forward">+</button>`;const buttons=dial.querySelectorAll("button");buttons[0].addEventListener("click",()=>cryptexViewer?.turn(i,-1));buttons[1].addEventListener("click",()=>cryptexViewer?.turn(i,1));controls.append(dial);});};
      sync();drawControls();$("#puzzle-action").hidden=true;$("#cryptex-confirm").addEventListener("click",()=>confirmCode(cryptexViewer?.getCode()??letters.map(x=>alphabet[x]).join("")));
    } else if(p.type==="earth-mirror") {
      box.innerHTML='<p class="artifact-copy">The reflected view shows Lake Behnke beside the north-south campus road. Compare the four recovered map captures, then choose the camera heading that matches the mirror.</p><div class="earth-captures" id="earth-captures"></div><div class="link-row"><a href="https://earth.google.com/web/@28.0587,-82.41385,850a,2500d,35y,0h,0t,0r" target="_blank" rel="noreferrer">OPEN THIS USF CAMPUS VIEW IN GOOGLE EARTH ↗</a></div><p class="small-note">Capture references use the real campus map. Google Earth imagery and dates can vary by region.</p><div class="artifact-readout" id="earth-capture-readout">NO CAPTURE SELECTED</div>';
      const captures=[{heading:"000",title:"NORTH UP",layout:"north"},{heading:"090",title:"EAST UP",layout:"east"},{heading:"180",title:"SOUTH UP",layout:"south"},{heading:"270",title:"WEST UP",layout:"west"}];
      const cards=$("#earth-captures");captures.forEach(capture=>{const button=document.createElement("button");button.type="button";button.className=`earth-capture earth-${capture.layout}`;button.dataset.heading=capture.heading;button.innerHTML=`<span class="earth-map" aria-hidden="true"><i class="earth-lake"></i><i class="earth-road"></i><i class="earth-building b1"></i><i class="earth-building b2"></i><i class="earth-building b3"></i><i class="earth-green"></i></span><b>${capture.title}</b><small>CAMERA HEADING · ${capture.heading}°</small>`;button.addEventListener("click",()=>{activePuzzleState.earthHeading=capture.heading;cards.querySelectorAll("button").forEach(node=>node.classList.toggle("selected",node===button));$("#earth-capture-readout").textContent=`CAPTURE SELECTED · ${capture.heading}°`;});cards.append(button);});
      setActionMode("ALIGN THE MIRROR ↗");$("#puzzle-action").onclick=()=>activePuzzleState.earthHeading===p.answer?solvePuzzle(p.answer):feedback("THE LAKE AND ROAD DO NOT MATCH THE REFLECTION.",true);
    } else if(p.type==="morse") {
      box.innerHTML='<p class="artifact-copy">A lamp repeats a four-letter signal. Short flashes are dots; long flashes are dashes. Separate letters by the longer pauses. No speech is present in this recording.</p><div class="morse-lamp" aria-label="Morse pattern: dot dash dash, dot, dot dot dot, dash"><i class="dot"></i><i class="dash"></i><i class="dash"></i><b>/</b><i class="dot"></i><b>/</b><i class="dot"></i><i class="dot"></i><i class="dot"></i><b>/</b><i class="dash"></i></div><div class="morse-note">SHORT · LONG · LETTER GAP</div>';
      setAnswerMode("DECODED DIRECTION");
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
    } else if(p.type==="photo-time") {
      box.innerHTML='<p class="artifact-copy">The damaged exposure record leaves only the photograph and its clock face. The archive logger used a 12-hour clock. Estimate the time as closely as you can.</p><div class="time-photo" role="img" aria-label="Recovered photograph showing a clock at two o’clock"><img src="assets/photo-04.svg" alt="A dim winter hallway with a clock showing two o’clock"><div class="photo-clock">2:00</div></div><label class="control-label" for="photo-time-guess">ESTIMATED CAPTURE TIME</label><input id="photo-time-guess" class="time-guess" type="time" step="60" aria-describedby="photo-time-note"><small id="photo-time-note" class="small-note">Enter either 2:00 AM or 2:00 PM. Estimates within three minutes are accepted.</small>';
      setActionMode("SUBMIT ESTIMATE ↗");
      $("#puzzle-action").onclick=()=>{const value=$("#photo-time-guess").value;if(!value){feedback("ENTER A TIME ESTIMATE FIRST.",true);return;}const [hour,minute]=value.split(":").map(Number),guess=hour*60+minute;const within=[120,840].some(target=>{const difference=Math.abs(guess-target);return Math.min(difference,1440-difference)<=3;});if(!within){activePuzzleState.timeAccepted=false;feedback("THAT ESTIMATE IS OUTSIDE THE ARCHIVE WINDOW.",true);return;}activePuzzleState.timeAccepted=true;solvePuzzle(p.answer);};
    } else if(p.type==="photo-wall") {
      box.innerHTML='<p class="artifact-copy">The wall photograph has been cut into nine fragments. Select two pieces to swap them until the scene is whole.</p><div class="wall-photo-board" id="wall-photo-board" aria-label="Nine-piece photograph assembly"></div><div class="artifact-readout" id="wall-photo-readout">THE IMAGE IS SCRAMBLED</div>';
      const tiles=$("#wall-photo-board"),order=[8,2,5,1,7,3,0,6,4];let selected=-1;
      const draw=()=>{tiles.replaceChildren();order.forEach((piece,slot)=>{const button=document.createElement("button");button.type="button";button.className="wall-photo-tile"+(slot===selected?" selected":"");button.setAttribute("aria-label",`Photo fragment in square ${slot+1}`);button.style.backgroundImage='url("assets/photo-05.svg")';button.style.backgroundPosition=`${piece%3*50}% ${Math.floor(piece/3)*50}%`;button.addEventListener("click",()=>{if(selected<0){selected=slot;draw();return;}if(selected===slot){selected=-1;draw();return;}[order[selected],order[slot]]=[order[slot],order[selected]];selected=-1;draw();});tiles.append(button);});const complete=order.every((piece,index)=>piece===index);$("#wall-photo-readout").textContent=complete?"WALL PHOTOGRAPH RESTORED · THE GATE IS CLEAR":"THE IMAGE IS SCRAMBLED";activePuzzleState.photoRestored=complete;};draw();
      setActionMode("SET THE IMAGE ↗");$("#puzzle-action").onclick=()=>activePuzzleState.photoRestored?solvePuzzle(p.answer):feedback("THE PHOTOGRAPH IS STILL OUT OF ORDER.",true);
    } else if(p.type==="uu-mirror") {
      box.innerHTML='<p class="artifact-copy">A strip behind the mirror uses classic uuencode. Decode the data block, then enter the recovered word for the final lock.</p><pre class="uu-record">begin 644 mirror.txt\n&24Y3241%\n`\nend</pre><p class="small-note">The header gives the file name and permissions. The line beginning with <code>&amp;</code> contains the encoded data.</p>';
      setAnswerMode("DECODED WORD");
    } else if(p.type==="gate-lock") {
      box.innerHTML='<p class="artifact-copy">Turn the six tumblers to spell the word recovered from behind the mirror.</p><div class="gate-tumblers" id="gate-tumblers" aria-label="Six-letter gate lock"></div><div class="artifact-readout" id="gate-lock-readout">______</div>';
      const letters=Array(6).fill("A"),alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ",container=$("#gate-tumblers");
      const draw=()=>{container.replaceChildren();letters.forEach((letter,index)=>{const dial=document.createElement("div");dial.className="gate-tumbler";dial.innerHTML=`<button type="button" aria-label="Turn tumbler ${index+1} backward">−</button><b>${letter}</b><button type="button" aria-label="Turn tumbler ${index+1} forward">+</button>`;const buttons=dial.querySelectorAll("button");buttons[0].addEventListener("click",()=>{letters[index]=alphabet[(alphabet.indexOf(letters[index])+25)%26];draw();});buttons[1].addEventListener("click",()=>{letters[index]=alphabet[(alphabet.indexOf(letters[index])+1)%26];draw();});container.append(dial);});const word=letters.join("");activePuzzleState.gateWord=word;$("#gate-lock-readout").textContent=word;};draw();
      setActionMode("RELEASE THE GATE ↗");$("#puzzle-action").onclick=()=>activePuzzleState.gateWord===p.answer?solvePuzzle(p.answer):feedback("THE TUMBLERS ARE NOT ALIGNED.",true);
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
    const puzzle=puzzles[currentPuzzle];
    const accepted=puzzle?.type==="photo-time"?activePuzzleState.timeAccepted===true:normalized(value)===normalized(puzzle?.answer||"");
    if(!puzzle||currentPuzzle!==currentIndex()||!progress.registerActivated||!accepted){feedback("THE MECHANISM DOES NOT ACCEPT THAT READING.",true);return;}
    if(puzzle.type==="metadata-photos"&&activePuzzleState.photoWord!==puzzle.answer){feedback("RESTORE THE PHOTO TIMELINE BEFORE RECORDING THE MESSAGE.",true);return;}
    if(puzzle.type==="earth-mirror"&&activePuzzleState.earthHeading!==puzzle.answer){feedback("MATCH A CAMPUS CAPTURE TO THE REFLECTION FIRST.",true);return;}
    if(puzzle.type==="photo-wall"&&activePuzzleState.photoRestored!==true){feedback("RESTORE THE WALL PHOTOGRAPH FIRST.",true);return;}
    if(puzzle.type==="gate-lock"&&activePuzzleState.gateWord!==puzzle.answer){feedback("ALIGN THE FINAL TUMBLERS FIRST.",true);return;}
    if(puzzle.type==="cryptex"&&activePuzzleState.cryptexWord!==puzzle.answer){feedback("THE RINGS MUST BE TURNED INTO ALIGNMENT FIRST.",true);return;}
    if(puzzle.type==="morse"&&activePuzzleState.morseSent!==puzzle.answer){$("#morse-status").textContent="THE REGISTER REQUIRES A PHYSICAL KEY REPLY";return;}
    feedback(`RECORD ACCEPTED · FRAGMENT ${puzzle.fragment} RECOVERED`);
    if(!progress.solved.includes(currentPuzzle))progress.solved.push(currentPuzzle);
    progress.fragments[currentPuzzle]=puzzle.fragment;
    if(currentPuzzle===2&&!hasItem("cryptex_key"))progress.inventory.push("cryptex_key");
    progress.finished=progress.solved.length===10;saveProgress();renderStage();
    puzzleDialog.classList.add("solving");$("#transition-cover").classList.add("sweep");
    if(progress.finished){showToast("CONTINUITY RESTORED · PASSAGE OPEN");sceneController?.setControlsLocked(true);}
    else showToast(`SEAL ${String(currentPuzzle+1).padStart(2,"0")} RELEASED`);
    setTimeout(()=>{puzzleDialog.classList.remove("solving");if(puzzleDialog.open)puzzleDialog.close();morsePanel.hidden=true;sceneController?.setMorseActive(false);sceneController?.setCryptexVisible(false);$("#transition-cover").classList.remove("sweep");if(progress.finished)startEscapeCutscene();},850);
  }
  function solveForTesting() {
    if(!testMode)return;
    if(!progress.registerActivated&&currentIndex()===0){
      progress.inventory=[...new Set([...progress.inventory,"flashlight","gate_tooth"])];
      progress.solved=[0];progress.fragments[0]=puzzles[0].fragment;progress.registerActivated=true;
      saveProgress();sceneController?.setCollectedItems(progress.inventory);sceneController?.setFlashlight(true);renderStage();
      showToast("TEST MODE · SURVEY COMPLETE · OPEN PUZZLE 02");return;
    }
    const puzzle=puzzles[currentPuzzle];
    if(!puzzle||currentPuzzle!==currentIndex()||(!puzzleDialog.open&&morsePanel.hidden)){
      showToast("TEST MODE · OPEN THE CURRENT PUZZLE FIRST");return;
    }
    if(puzzle.type==="photo-time")activePuzzleState.timeAccepted=true;
    if(puzzle.type==="metadata-photos")activePuzzleState.photoWord=puzzle.answer;
    if(puzzle.type==="earth-mirror")activePuzzleState.earthHeading=puzzle.answer;
    if(puzzle.type==="photo-wall")activePuzzleState.photoRestored=true;
    if(puzzle.type==="gate-lock")activePuzzleState.gateWord=puzzle.answer;
    if(puzzle.type==="cryptex"){
      const target=puzzle.answer,current=cryptexViewer?.getCode()||"00000";
      for(let i=0;i<target.length;i++){const steps=(Number(target[i])-Number(current[i])+10)%10;if(steps)cryptexViewer?.turn(i,steps);}
      activePuzzleState.cryptexWord=target;
    }
    if(puzzle.type==="morse")activePuzzleState.morseSent=puzzle.answer;
    solvePuzzle(puzzle.answer);
  }
  function submitAnswer(event) { event.preventDefault();if(currentPuzzle<0)return;solvePuzzle($("#puzzle-answer").value); }
  function startEscapeCutscene() {
    const ending=$("#escape-cutscene"); if(!ending)return;
    ending.hidden=false;ending.classList.remove("play");void ending.offsetWidth;ending.classList.add("play");
    const caption=$("#ending-caption"),progressBar=$("#ending-progress");
    progressBar.style.width="0%";
    const snow=$("#escape-snow");snow.replaceChildren();for(let i=0;i<54;i++){const flake=document.createElement("i");flake.className="escape-flake";flake.style.left=`${(i*37)%100}%`;flake.style.animationDelay=`-${(i*13)%18}s`;flake.style.animationDuration=`${8+(i%9)}s`;flake.style.setProperty("--drift",`${((i*19)%120)-60}px`);snow.append(flake);}
    const beats=[[0,"The lock releases. The door opens onto falling snow."],[6000,"You cross the threshold and leave the house behind."],[13000,"Cold air replaces the room’s stale warmth."],[20000,"Your footprints lead away from the gate."],[27000,"The winter road disappears into the trees."]];
    beats.forEach(([at,message])=>setTimeout(()=>{caption.textContent=message;},at));
    setTimeout(()=>{progressBar.style.width="100%";caption.textContent="You made it outside. The North Room is behind you.";},30000);
  }
  function initializeNotepad() {
    const dialog=$("#notepad-dialog"),textarea=$("#notepad-text"),paper=$("#notepad-paper");if(!dialog||!textarea||!paper)return;
    const textKey="np-gate-09-notes-v1",drawingKey="np-gate-09-sketch-v1",ctx=paper.getContext("2d");
    try{textarea.value=localStorage.getItem(textKey)||"";const saved=localStorage.getItem(drawingKey);if(saved){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,paper.width,paper.height);img.src=saved;}}catch{}
    textarea.addEventListener("input",()=>{try{localStorage.setItem(textKey,textarea.value);}catch{}});
    $("#notepad-open").addEventListener("click",()=>{dialog.showModal();dialog.classList.remove("open");requestAnimationFrame(()=>dialog.classList.add("open"));});
    $("#notepad-close").addEventListener("click",()=>dialog.close());dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
    const textMode=$("#note-text-mode"),drawMode=$("#note-draw-mode"),textPane=$("#note-text-pane"),drawPane=$("#note-draw-pane");
    textMode.addEventListener("click",()=>{textPane.hidden=false;drawPane.hidden=true;textMode.setAttribute("aria-pressed","true");drawMode.setAttribute("aria-pressed","false");textarea.focus();});
    drawMode.addEventListener("click",()=>{textPane.hidden=true;drawPane.hidden=false;textMode.setAttribute("aria-pressed","false");drawMode.setAttribute("aria-pressed","true");});
    let drawing=false;const point=event=>{const rect=paper.getBoundingClientRect();return{x:(event.clientX-rect.left)*paper.width/rect.width,y:(event.clientY-rect.top)*paper.height/rect.height};};
    paper.addEventListener("pointerdown",event=>{drawing=true;paper.setPointerCapture(event.pointerId);const p=point(event);ctx.beginPath();ctx.moveTo(p.x,p.y);});
    paper.addEventListener("pointermove",event=>{if(!drawing)return;const p=point(event);ctx.lineWidth=7;ctx.lineCap="round";ctx.strokeStyle="#34251c";ctx.lineTo(p.x,p.y);ctx.stroke();});
    const stopDrawing=()=>{if(!drawing)return;drawing=false;try{localStorage.setItem(drawingKey,paper.toDataURL("image/png"));}catch{}};
    paper.addEventListener("pointerup",stopDrawing);paper.addEventListener("pointercancel",stopDrawing);
    $("#note-clear").addEventListener("click",()=>{ctx.clearRect(0,0,paper.width,paper.height);try{localStorage.removeItem(drawingKey);}catch{}});
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
  if(testMode){const badge=$("#test-mode-badge");if(badge)badge.hidden=false;showToast("TEST MODE · OPEN A PUZZLE, THEN PRESS ⌘⌥⇧4");}
  window.addEventListener("keydown",event=>{
    if(!testMode||event.repeat||!event.metaKey||!event.altKey||!event.shiftKey||event.code!=="Digit4")return;
    event.preventDefault();solveForTesting();
  });
  $("#close-puzzle").addEventListener("click",closePuzzle);
  puzzleDialog.addEventListener("click",e=>{if(e.target===puzzleDialog)closePuzzle();});
  puzzleDialog.addEventListener("close",()=>{sceneController?.setCryptexVisible(false);sceneController?.setPaused(false);cryptexViewer?.dispose();cryptexViewer=null;});
  $("#music-toggle").addEventListener("click",()=>setMusic(!musicOn));
  $("#close-tape").addEventListener("click",()=>tapeDialog.close());
  const crouchButton=$("#crouch-toggle");
  crouchButton?.addEventListener("click",()=>{if(sceneController?.isSeated()){sceneController.toggleSeat();return;}const next=crouchButton.getAttribute("aria-pressed")!=="true";const actual=sceneController?.setCrouching(next);crouchButton.setAttribute("aria-pressed",String(actual??next));crouchButton.textContent=(actual??next)?"STAND":"CROUCH";});
  $("#morse-close")?.addEventListener("click",()=>{morsePanel.hidden=true;sceneController?.setMorseActive(false);resetMorseInput();});
  $("#morse-reset")?.addEventListener("click",()=>{resetMorseInput();$("#morse-status").textContent="REPLY CLEARED · SHORT TAP = DOT · HOLD = DASH";});
  tapeDialog.addEventListener("click",e=>{if(e.target===tapeDialog)tapeDialog.close();});
  ["pointerdown","keydown","touchstart"].forEach(type=>window.addEventListener(type,primeMusic,{passive:type!=="keydown"}));
  window.addEventListener("resize",()=>sceneController?.resize());
  const musicPreference=localStorage.getItem(MUSIC_KEY);setMusic(musicPreference!=="off");
  renderStage();initializeNotepad();initializeScene();
})();

