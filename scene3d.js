import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const GATE_SPACING = 11.5;
const GATE_COUNT = 10;

function makeMetalTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#89969b";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 9137;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 1200; i++) {
    const x = random() * 256, y = random() * 256;
    ctx.strokeStyle = `rgba(${random() > .5 ? 255 : 10},${random() > .5 ? 255 : 10},${random() > .5 ? 255 : 10},${random() * .12})`;
    ctx.lineWidth = random() * 1.3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 16, y + random() * 3); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 1.5);
  return texture;
}

function createEvidenceTexture(text, color = "#b9d0d4") {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#0b1116"; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(171,202,210,.65)"; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = color; ctx.font = "600 27px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function addBox(parent, geometry, material, position, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function createNumberTexture(number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#dce9e9";
  ctx.font = "600 50px monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(number).padStart(2, "0"), 64, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGateScene(canvas, onSelect, onItemFound = () => {}, onItemFocus = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1017);
  scene.fog = new THREE.FogExp2(0x0a1017, 0.018);
  const camera = new THREE.PerspectiveCamera(58, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 150);
  camera.position.set(0, 1.78, 5.2);

  const ambient = new THREE.HemisphereLight(0x9baeb6, 0x101317, 1.12);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0x9bb4c1, 2.1);
  moon.position.set(-4, 8, 6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 0.1; moon.shadow.camera.far = 42;
  moon.shadow.camera.left = -9; moon.shadow.camera.right = 9;
  moon.shadow.camera.top = 9; moon.shadow.camera.bottom = -7;
  scene.add(moon);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x202a30, metalness: 0.48, roughness: 0.82, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x11191e, metalness: 0.55, roughness: 0.56 });
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x344149, metalness: 0.72, roughness: 0.48 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x53636a, map: makeMetalTexture(), metalness: 0.78, roughness: 0.62 });
  const insetMat = new THREE.MeshStandardMaterial({ color: 0x263137, metalness: 0.82, roughness: 0.46 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x84959a, metalness: 0.82, roughness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x080b0e, metalness: 0.18, roughness: 0.95, side: THREE.DoubleSide });

  // One continuous station hall provides parallax while the camera advances.
  addBox(scene, new THREE.BoxGeometry(10.5, .34, 126), floorMat, [0, -.18, -56], { castShadow: false });
  addBox(scene, new THREE.BoxGeometry(.34, 5.25, 126), wallMat, [-5.15, 2.45, -56]);
  addBox(scene, new THREE.BoxGeometry(.34, 5.25, 126), wallMat, [5.15, 2.45, -56]);
  addBox(scene, new THREE.BoxGeometry(10.5, .28, 126), wallMat, [0, 5.05, -56]);
  const seamGeo = new THREE.BoxGeometry(.035, .015, 126);
  for (const x of [-4.15, -2.05, 0, 2.05, 4.15]) addBox(scene, seamGeo, ribMat, [x, .0, -56], { castShadow: false });

  const ribGeo = new THREE.BoxGeometry(.16, 5.0, .2);
  const topRibGeo = new THREE.BoxGeometry(10.1, .16, .2);
  const floorRibGeo = new THREE.BoxGeometry(10.1, .06, .2);
  const lamps = [];
  for (let i = 0; i < 31; i++) {
    const z = 3 - i * 4.0;
    for (const x of [-4.92, 4.92]) addBox(scene, ribGeo, ribMat, [x, 2.42, z], { castShadow: false });
    addBox(scene, topRibGeo, ribMat, [0, 4.85, z], { castShadow: false });
    addBox(scene, floorRibGeo, ribMat, [0, .02, z], { castShadow: false });
    if (i % 4 === 0) {
      const lamp = new THREE.PointLight(0x9eb9c3, .62, 10, 2);
      lamp.position.set(0, 4.58, z - .35); scene.add(lamp); lamps.push(lamp);
    }
    addBox(scene, new THREE.BoxGeometry(.42, .06, .24), trimMat, [0, 4.85, z - .38], { castShadow: false });
  }

  const gates = [];
  const locks = [];
  const evidenceObjects = [];
  const cryptexRings = [];
  const lockBaseMat = new THREE.MeshStandardMaterial({ color: 0x9ab5bc, emissive: 0x1a343c, emissiveIntensity: .55, metalness: .68, roughness: .32 });
  const lockSolvedMat = new THREE.MeshStandardMaterial({ color: 0xc8e5df, emissive: 0x557e72, emissiveIntensity: 1.05, metalness: .58, roughness: .27 });
  const lockSealedMat = new THREE.MeshStandardMaterial({ color: 0x8e554d, emissive: 0x621a1a, emissiveIntensity: .75, metalness: .68, roughness: .35 });

  function makeGate(index) {
    const group = new THREE.Group();
    group.position.z = -(index + 1) * GATE_SPACING;
    scene.add(group);
    addBox(group, new THREE.BoxGeometry(4.25, 3.8, .55), darkMat, [0, 1.92, -.27], { castShadow: false });
    const stone = new THREE.MeshStandardMaterial({ color: 0x303b41, map: makeMetalTexture(), metalness: .62, roughness: .7 });
    const postGeo = new THREE.BoxGeometry(.42, 4.15, .7);
    addBox(group, postGeo, stone, [-2.18, 2.02, 0]);
    addBox(group, postGeo, stone, [2.18, 2.02, 0]);
    addBox(group, new THREE.BoxGeometry(4.75, .48, .72), stone, [0, 4.08, 0]);
    addBox(group, new THREE.BoxGeometry(4.15, .12, .82), trimMat, [0, 3.81, .03]);

    const leaves = [];
    for (const side of ["left", "right"]) {
      const left = side === "left";
      const pivot = new THREE.Group();
      pivot.position.set(left ? -2.0 : 2.0, 0, .1);
      group.add(pivot);
      const sign = left ? 1 : -1;
      const centerX = sign * .98;
      const body = addBox(pivot, new THREE.BoxGeometry(1.96, 3.72, .24), panelMat, [centerX, 1.9, 0]);
      body.userData.doorBody = true;
      for (let row = 0; row < 4; row++) {
        addBox(pivot, new THREE.BoxGeometry(1.52, .56, .095), insetMat, [centerX, .48 + row * .88, .17], { castShadow: false });
        addBox(pivot, new THREE.BoxGeometry(1.32, .045, .045), trimMat, [centerX, .48 + row * .88, .23], { castShadow: false });
      }
      const brace = addBox(pivot, new THREE.BoxGeometry(2.16, .085, .1), trimMat, [centerX, 1.9, .19], { castShadow: false });
      brace.rotation.z = left ? .74 : -.74;
      for (let y = .35; y < 3.7; y += .72) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .25, 12), trimMat);
        hinge.position.set(0, y, .12); hinge.castShadow = true; pivot.add(hinge);
      }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), trimMat);
      knob.position.set(-sign * .18, 1.82, .26); pivot.add(knob);
      leaves.push({ pivot, left });
    }

    const lock = new THREE.Group();
    lock.position.set(0, 1.92, .43);
    group.add(lock);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.34, .07, 12, 40), lockBaseMat);
    ring.userData.puzzleIndex = index; ring.castShadow = true; lock.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .13, 24), lockBaseMat);
    hub.rotation.x = Math.PI / 2; hub.position.z = .025; hub.userData.puzzleIndex = index; lock.add(hub);
    const numberMat = new THREE.SpriteMaterial({ map: createNumberTexture(index + 1), transparent: true, depthWrite: false });
    const number = new THREE.Sprite(numberMat);
    number.scale.set(.43, .43, 1); number.position.z = .13; number.userData.puzzleIndex = index; lock.add(number);
    const lockLight = new THREE.PointLight(0x9cb7bf, .8, 3.2, 2);
    lockLight.position.z = .25; lock.add(lockLight);
    const warning = new THREE.PointLight(0xa8483f, 0, 5.5, 2);
    warning.position.set(0, 3.8, .65); group.add(warning);

    let evidence = null, evidenceLight = null;
    if (index > 0) {
      evidence = new THREE.Group();
      evidence.position.set(index % 2 ? -2.58 : 2.58, index === 8 ? .46 : 2.15, .54);
      evidence.userData.puzzleIndex = index;
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b4e54, emissive: 0x152b33, emissiveIntensity: .45, metalness: .72, roughness: .34 });
      const face = new THREE.Mesh(new THREE.BoxGeometry(.82, .72, .14), frameMat); evidence.add(face);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(.68, .54), new THREE.MeshBasicMaterial({ map: createEvidenceTexture(["", "PHOTO FILE", "CRYPTEX", "MIRROR", "SIGNAL", "NEGATIVE", "SURVEY", "RELIEF", "ROUTE", "CORE"][index]), side: THREE.DoubleSide }));
      card.position.z = .081; evidence.add(card);
      if (index === 2) {
        const model = new THREE.Group(); model.position.set(0, -.78, .08); evidence.add(model);
        for (let ringIndex = 0; ringIndex < 5; ringIndex++) {
          const ring = new THREE.Group(); ring.position.x = (ringIndex - 2) * .25; ring.userData.ringIndex = ringIndex;
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .22, 24, 1, false), new THREE.MeshStandardMaterial({ color: 0x92764d, metalness: .83, roughness: .27 }));
          barrel.rotation.z = Math.PI / 2; ring.add(barrel);
          const band = new THREE.Mesh(new THREE.TorusGeometry(.215, .035, 8, 28), new THREE.MeshStandardMaterial({ color: 0xc0a16a, metalness: .9, roughness: .2 }));
          band.rotation.y = Math.PI / 2; ring.add(band);
          const labelMat = new THREE.SpriteMaterial({ map: createEvidenceTexture("A", "#ede0c2"), transparent: true, depthWrite: false });
          const label = new THREE.Sprite(labelMat); label.scale.set(.22, .16, 1); label.position.z = .24; ring.add(label);
          ring.userData.label = label; model.add(ring); cryptexRings.push(ring);
        }
        const spindle = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.42, 16), new THREE.MeshStandardMaterial({ color: 0x352d23, metalness: .7, roughness: .3 }));
        spindle.rotation.z = Math.PI / 2; model.add(spindle);
        evidence.userData.cryptex = model; model.visible = false;
      }
      group.add(evidence); evidenceObjects.push(evidence);
      evidenceLight = new THREE.PointLight(0x9cc5cf, .16, 3.5, 2); evidenceLight.position.copy(evidence.position); group.add(evidenceLight);
    }
    gates.push({ group, leaves, lock, lockLight, warning, stone, index, evidence, evidenceLight });
    locks.push(lock);
  }
  for (let i = 0; i < GATE_COUNT; i++) makeGate(i);

  // Survey 00 objects: one lamp lies in the near snow; a missing brass tooth is caught in gate 01.
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb78b4a, metalness: .76, roughness: .28, emissive: 0x493116, emissiveIntensity: .25 });
  const lamp = new THREE.Group();
  lamp.position.set(.92, .22, 1.35);
  lamp.rotation.set(.18, -.28, -.58);
  const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(.105, .13, .62, 20), new THREE.MeshStandardMaterial({ color: 0x30383a, metalness: .8, roughness: .32 }));
  lampBody.rotation.z = Math.PI / 2; lamp.add(lampBody);
  const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(.16, .12, .19, 20), new THREE.MeshStandardMaterial({ color: 0x7d8a8c, metalness: .78, roughness: .28 }));
  lampHead.rotation.z = Math.PI / 2; lampHead.position.x = .36; lamp.add(lampHead);
  const lampGlass = new THREE.Mesh(new THREE.CircleGeometry(.115, 20), new THREE.MeshBasicMaterial({ color: 0xb9d6d9, transparent: true, opacity: .76 }));
  lampGlass.position.x = .46; lampGlass.rotation.y = Math.PI / 2; lamp.add(lampGlass);
  const lampGlow = new THREE.PointLight(0x9bc4d0, .45, 1.8, 2); lampGlow.position.x = .42; lamp.add(lampGlow);
  lamp.userData.itemId = "flashlight"; scene.add(lamp);

  const tooth = new THREE.Group();
  tooth.position.set(1.53, 1.18, -GATE_SPACING + .52);
  const toothBody = new THREE.Mesh(new THREE.BoxGeometry(.18, .56, .14), brassMat);
  tooth.add(toothBody);
  for (let i = 0; i < 3; i++) {
    const notch = new THREE.Mesh(new THREE.BoxGeometry(.17, .055, .2), brassMat);
    notch.position.set(.08, -.16 + i * .17, 0); tooth.add(notch);
  }
  tooth.userData.itemId = "gate_tooth"; tooth.visible = true; brassMat.transparent = true; brassMat.opacity = .035; brassMat.emissiveIntensity = .02; scene.add(tooth);
  const items = [lamp, tooth];
  let registerActive = false, flashlightOn = false, focusedItem = null, toothRevealed = false;
  const lampBeam = new THREE.SpotLight(0xc4e2ec, 0, 34, .3, .7, 1.3);
  lampBeam.position.set(0, -.05, 0);
  const beamTarget = new THREE.Object3D(); beamTarget.position.set(0, 0, -1);
  camera.add(lampBeam); camera.add(beamTarget); lampBeam.target = beamTarget;
  scene.add(camera);

  // Branch-like cables emerge over the later gates, revealing the change gradually.
  const tendrils = [];
  const tendrilMat = new THREE.MeshStandardMaterial({ color: 0x342226, emissive: 0x170809, emissiveIntensity: .55, roughness: .82 });
  for (let i = 2; i < GATE_COUNT; i++) {
    const z = -(i + 1) * GATE_SPACING;
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 4.9, .1, z + 1.2),
        new THREE.Vector3(side * 4.55, 1.0, z + .6),
        new THREE.Vector3(side * 4.8, 1.9, z + .2),
        new THREE.Vector3(side * 4.3, 3.1, z - .4),
        new THREE.Vector3(side * 4.6, 4.5, z - 1.0)
      ]);
      const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .055 + i * .004, 6, false), tendrilMat);
      root.visible = false; root.castShadow = true; scene.add(root); tendrils.push({ mesh: root, stage: i });
    }
  }

  // Low-contrast floating ice dust catches the corridor lamps.
  const dustCount = 420;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - .5) * 8.5;
    dustPositions[i * 3 + 1] = .2 + Math.random() * 4.4;
    dustPositions[i * 3 + 2] = -Math.random() * 100;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xa9c0c5, size: .035, transparent: true, opacity: .52, sizeAttenuation: true }));
  scene.add(dust);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const clock = new THREE.Clock();
  let solvedCount = 0, finished = false, yaw = 0, pitch = 0;
  let dragging = false, downX = 0, downY = 0, lastX = 0, lastY = 0, moved = false;
  const scratch = new THREE.Vector3();
  const activeIndex = () => Math.min(Math.max(solvedCount, 0), GATE_COUNT - 1);

  let cryptexVisible = false;
  function setRegisterActive(active) { registerActive = Boolean(active); }
  function setCollectedItems(ids = []) {
    const collected = new Set(ids);
    for (const item of items) {
      item.userData.collected = collected.has(item.userData.itemId);
      if (item === tooth && item.userData.collected) { toothRevealed = true; brassMat.opacity = 1; brassMat.emissiveIntensity = .35; }
      item.visible = !item.userData.collected;
    }
  }
  function setCryptexVisible(visible) {
    cryptexVisible = Boolean(visible);
    const model = gates[2]?.evidence?.userData.cryptex;
    if (model) model.visible = cryptexVisible;
  }
  function setCryptexLetters(letters) {
    cryptexRings.forEach((ring,i)=>{
      const letter=String(letters[i]||"A").slice(0,1);
      ring.userData.label.material.map?.dispose(); ring.userData.label.material.map=createEvidenceTexture(letter,"#f4e4c2"); ring.userData.label.material.needsUpdate=true;
      const code=letter.charCodeAt(0)-65; ring.rotation.x=code*(Math.PI*2/26);
    });
  }
  function setFlashlight(active) {
    flashlightOn = Boolean(active);
    lampBeam.intensity = flashlightOn ? 58 : 0;
    lampBeam.angle = flashlightOn ? .31 : .01;
    lampBeam.distance = 36;
  }
  function collectItem(item) {
    if (!item || item.userData.collected || (item === tooth && !toothRevealed)) return;
    item.userData.collected = true; item.visible = false;
    onItemFound(item.userData.itemId);
    if (focusedItem === item) { focusedItem = null; onItemFocus(null); }
  }
  function setSolvedCount(count, isFinished = false) {
    solvedCount = Math.max(0, Math.min(GATE_COUNT, count));
    finished = Boolean(isFinished);
    const creep = Math.min(1, solvedCount / 9);
    scene.fog.color.setRGB(.039 + creep * .045, .063 - creep * .035, .09 - creep * .046);
    scene.fog.density = .018 + creep * .008;
    scene.background.copy(scene.fog.color);
    ambient.intensity = 1.12 - creep * .28;
    moon.color.set(0x9bb4c1).lerp(new THREE.Color(0x765257), creep * .68);
    moon.intensity = 2.1 - creep * .42;
    lamps.forEach((lamp, i) => {
      const shadowed = Math.max(0, creep - i / lamps.length * 1.4);
      lamp.color.set(0x9eb9c3).lerp(new THREE.Color(0xa7443e), shadowed * .82);
      lamp.intensity = .55 - shadowed * .19;
    });
    gates.forEach((gate, i) => {
      const current = i === activeIndex();
      gate.lockLight.color.copy(i < solvedCount ? new THREE.Color(0x85c6b1) : new THREE.Color(current ? 0xb5d5da : 0x774542));
      gate.lockLight.intensity = i < solvedCount ? .7 : current ? 1.15 : .24;
      if (gate.evidenceLight) gate.evidenceLight.intensity = registerActive && i === activeIndex() ? .9 : .05;
      if (gate.evidence) gate.evidence.traverse(object => { if (object.material?.emissive) object.material.emissiveIntensity = registerActive && i === activeIndex() ? .9 : .22; });
      gate.warning.userData.baseIntensity = Math.max(0, creep - .18) * (current ? 2.2 : .72);
      gate.warning.intensity = gate.warning.userData.baseIntensity;
      gate.stone.color.set(0x303b41).lerp(new THREE.Color(0x382528), creep * .7);
      if (i < solvedCount) gate.lock.children.forEach(child => { if (child.isMesh && child.geometry.type !== "Sprite") child.material = lockSolvedMat; });
      else gate.lock.children.forEach(child => { if (child.isMesh && child.geometry.type !== "Sprite") child.material = current ? lockSealedMat : lockBaseMat; });
    });
    tendrils.forEach(({ mesh, stage }) => { mesh.visible = solvedCount >= stage; });
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener("resize", resize);

  function eventPoint(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }
  function onPointerDown(event) {
    dragging = true; moved = false;
    downX = lastX = event.clientX; downY = lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (dragging) {
      const dx = event.clientX - lastX, dy = event.clientY - lastY;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) moved = true;
      yaw = THREE.MathUtils.clamp(yaw - dx * .0032, -.52, .52);
      pitch = THREE.MathUtils.clamp(pitch - dy * .0024, -.16, .16);
      lastX = event.clientX; lastY = event.clientY;
    } else {
      eventPoint(event); raycaster.setFromCamera(pointer, camera);
      const hitItem = raycaster.intersectObjects(items.filter(item => item.visible && !item.userData.collected && (item !== tooth || toothRevealed)), true).length > 0;
      const activeEvidence = gates[activeIndex()]?.evidence;
      const hitEvidence = registerActive && activeEvidence && raycaster.intersectObject(activeEvidence, true).length > 0;
      canvas.style.cursor = hitItem || hitEvidence ? "pointer" : "grab";
    }
  }
  function onPointerUp(event) {
    if (!dragging) return;
    dragging = false;
    if (!moved && Math.hypot(event.clientX - downX, event.clientY - downY) <= 5) {
      eventPoint(event); raycaster.setFromCamera(pointer, camera);
      const itemHit = raycaster.intersectObjects(items.filter(item => item.visible && !item.userData.collected && (item !== tooth || toothRevealed)), true)[0];
      if (itemHit) { collectItem(itemHit.object.parent === lamp ? lamp : itemHit.object.parent === tooth ? tooth : itemHit.object); return; }
      const active = activeIndex();
      const evidence = gates[active]?.evidence;
      const evidenceHit = evidence && raycaster.intersectObject(evidence, true).length > 0;
      if (registerActive && evidenceHit) onSelect(active);
    }
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  window.addEventListener("keydown", event => {
    if (event.key.toLowerCase() !== "e" || !focusedItem) return;
    if (focusedItem === lamp || focusedItem === tooth) collectItem(focusedItem);
    else if (focusedItem.userData?.puzzleIndex === activeIndex() && registerActive) onSelect(activeIndex());
  });

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(.05, clock.getDelta());
    const targetZ = finished ? 5.2 - (GATE_COUNT - 1) * GATE_SPACING - 7.5 : 5.2 - solvedCount * GATE_SPACING;
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, .68, delta);
    camera.position.y = 1.78 + Math.sin(clock.elapsedTime * .63) * .014;
    const target = scratch.set(Math.sin(yaw) * 12, 1.83 + pitch * 8, camera.position.z - 12);
    camera.lookAt(target);
    if (flashlightOn && !tooth.userData.collected) {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = raycaster.intersectObject(tooth, true).length > 0;
      if (hit && !toothRevealed) { toothRevealed = true; brassMat.opacity = 1; brassMat.emissiveIntensity = .35; }
      tooth.visible = !tooth.userData.collected;
    }
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const activeEvidence = registerActive ? gates[activeIndex()]?.evidence : null;
    const focusTargets = [...items.filter(item => item.visible && !item.userData.collected && (item !== tooth || toothRevealed)), ...(activeEvidence ? [activeEvidence] : [])];
    const focused = raycaster.intersectObjects(focusTargets, true)[0];
    let nextFocus = null;
    if (focused) {
      nextFocus = focusTargets.find(item => { let node = focused.object; while (node) { if (node === item) return true; node = node.parent; } return false; }) || null;
    }
    if (nextFocus !== focusedItem) { focusedItem = nextFocus; onItemFocus(focusedItem?.userData.itemId || (focusedItem?.userData.puzzleIndex !== undefined ? "artifact" : null)); }
    const creep = Math.min(1, solvedCount / 9);
    gates.forEach((gate, i) => {
      const amount = i < solvedCount ? 1 : 0;
      const swing = 1.48 * amount;
      const leftTarget = gate.leaves[0].left ? swing : -swing;
      const rightTarget = gate.leaves[1].left ? swing : -swing;
      gate.leaves[0].pivot.rotation.y = THREE.MathUtils.damp(gate.leaves[0].pivot.rotation.y, leftTarget, 2.05, delta);
      gate.leaves[1].pivot.rotation.y = THREE.MathUtils.damp(gate.leaves[1].pivot.rotation.y, rightTarget, 2.05, delta);
      gate.lock.rotation.z = Math.sin(clock.elapsedTime * .6 + i) * .025;
      if (gate.evidenceLight && i === activeIndex()) gate.evidenceLight.intensity = registerActive ? .76 + Math.sin(clock.elapsedTime * 1.15) * .14 : .05;
      if (gate.evidence?.userData.cryptex) gate.evidence.userData.cryptex.visible = cryptexVisible && i === 2;
      gate.warning.intensity = gate.warning.userData.baseIntensity * (.94 + Math.sin(clock.elapsedTime * (2.2 + creep * 4) + i) * .06 * creep);
    });
    const positions = dustGeometry.attributes.position.array;
    for (let i = 0; i < dustCount; i++) {
      const z = i * 3 + 2;
      if (positions[z] > camera.position.z + 5) positions[z] -= 108;
      positions[z] += delta * .25;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }
  resize();
  setSolvedCount(0, false);
  animate();

  return {
    resize,
    setSolvedCount,
    setRegisterActive,
    setCollectedItems,
    setCryptexVisible,
    setCryptexLetters,
    setFlashlight,
    get flashlightOn() { return flashlightOn; },
    dispose() {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      renderer.dispose();
    }
  };
}
