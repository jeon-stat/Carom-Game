import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js";
import { BallState, BilliardBallPhysics, BilliardPhysicsManager } from "./physics.js";

const canvas = document.getElementById("scene");
const statusText = document.getElementById("statusText");
const resetButton = document.getElementById("resetButton");
const controlsDrawer = document.getElementById("controlsDrawer");
const controlsToggle = document.getElementById("controlsToggle");
const controlsHandle = controlsDrawer.querySelector(".controls-handle");
const viewToggle = document.getElementById("viewToggle");
const shootButton = document.getElementById("shootButton");
const powerSlider = document.getElementById("powerSlider");
const powerValue = document.getElementById("powerValue");
const aimPad = document.getElementById("aimPad");
const aimThumb = document.getElementById("aimThumb");
const spinPad = document.getElementById("spinPad");
const spinThumb = document.getElementById("spinThumb");
const spinXValue = document.getElementById("spinXValue");
const spinYValue = document.getElementById("spinYValue");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x09131a, 9, 22);

const cameraRig = new THREE.Group();
scene.add(cameraRig);

const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
cameraRig.add(camera);

const ambientLight = new THREE.HemisphereLight(0xa7d7ff, 0x1a120d, 1.2);
scene.add(ambientLight);

const spot = new THREE.SpotLight(0xfff4de, 2.3, 30, Math.PI / 5, 0.35, 1);
spot.position.set(0, 6.5, 2.4);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.bias = -0.0002;
scene.add(spot);
scene.add(spot.target);
spot.target.position.set(0, 0, 0);

const directional = new THREE.DirectionalLight(0xffffff, 1.2);
directional.position.set(-4, 8, 5);
directional.castShadow = true;
directional.shadow.mapSize.set(2048, 2048);
directional.shadow.bias = -0.00015;
scene.add(directional);
scene.add(directional.target);
directional.target.position.set(0, 0, 0);

const room = new THREE.Mesh(
  new THREE.BoxGeometry(26, 12, 26),
  new THREE.MeshStandardMaterial({
    color: 0x0b1217,
    side: THREE.BackSide,
    roughness: 1
  })
);
room.position.y = 5;
scene.add(room);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(18, 64),
  new THREE.MeshStandardMaterial({
    color: 0x0d171d,
    roughness: 1
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.82;
floor.receiveShadow = true;
scene.add(floor);

const table = {
  playWidth: 2.54,
  playHeight: 1.27,
  cushionHeight: 0.052,
  clothY: 0,
  railOuter: 0.12,
  railInner: 0.095,
  railTop: 0.032,
  frameHeight: 0.17
};

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const woodMaterial = new THREE.MeshStandardMaterial({
  color: 0x41261c,
  roughness: 0.62,
  metalness: 0.05
});

const clothMaterial = new THREE.MeshStandardMaterial({
  color: 0x1567d2,
  roughness: 0.95,
  metalness: 0.02,
  side: THREE.DoubleSide
});

const cushionMaterial = new THREE.MeshStandardMaterial({
  color: 0x1679ee,
  roughness: 0.82,
  metalness: 0.03
});

const pointMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5f5f2,
  roughness: 0.18,
  metalness: 0.2
});

buildTable();

const cueGroup = new THREE.Group();
scene.add(cueGroup);

const cueStick = new THREE.Mesh(
  new THREE.CylinderGeometry(0.0052, 0.012, 1.12, 18, 1, false),
  new THREE.MeshStandardMaterial({
    color: 0xc9ab74,
    roughness: 0.54
  })
);
cueStick.rotation.z = Math.PI / 2;
cueStick.position.set(-7.4, 0, 0);
cueStick.castShadow = true;
cueGroup.add(cueStick);

const cueTip = new THREE.Mesh(
  new THREE.CylinderGeometry(0.0058, 0.0068, 0.03, 16),
  new THREE.MeshStandardMaterial({ color: 0xe7f2ff, roughness: 0.4 })
);
cueTip.rotation.z = Math.PI / 2;
cueTip.position.set(0.02, 0, 0);
cueGroup.add(cueTip);

const cueMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.013, 0.019, 40),
  new THREE.MeshBasicMaterial({ color: 0xff4c43, side: THREE.DoubleSide, transparent: true, opacity: 0.98 })
);
cueMarker.visible = true;
scene.add(cueMarker);

const cueTipLocalOffset = 0.0;
const cueHeadGap = 0.16;
const cuePullbackDistance = 0.48;
const cueStrikeDuration = 0.16;
const cueStrikeHitTime = 0.9;
const cueTipOffsetLimit = 0.45;
const cueStickStretch = 5.2;
const cueCameraBackDistance = 2.35;
const cueCameraHeight = 0.64;
const cueCameraSideOffset = 0;
const cueCameraLookAhead = 0.95;

const ballRadius = 0.03275;
const balls = [];
const physicsManager = new BilliardPhysicsManager({
  ballRadius,
  ballMass: 0.23,
  gravity: 9.81,
  slidingFriction: 0.2,
  rollingFriction: 0.2,
  spinningFriction: 0.0,
  ballRestitution: 0.8,
  ballFriction: 0.2,
  cushionRestitution: 0.8,
  cushionFriction: 0.2,
  stopVelocityThreshold: 0.01,
  stopAngularThreshold: 0.04,
  substepCount: 14,
  tableMinX: -table.playWidth / 2 + ballRadius,
  tableMaxX: table.playWidth / 2 - ballRadius,
  tableMinZ: -table.playHeight / 2 + ballRadius,
  tableMaxZ: table.playHeight / 2 - ballRadius,
  tableY: ballRadius,
  pocketRadius: 0,
  pocketCaptureSpeed: 0.08,
  pocketPositions: [],
  debugMode: false
});
window.physicsManager = physicsManager;
window.billiardsBalls = balls;

const ballDefs = [
  { name: "cue", color: 0xf7f7f2, accent: 0xd34840, number: "C", position: new THREE.Vector3(-0.58, ballRadius, 0) },
  { name: "yellow", color: 0xefb11b, accent: 0x202020, number: "Y", position: new THREE.Vector3(0.5, ballRadius, -0.24) },
  { name: "red", color: 0xb8211f, accent: 0xffffff, number: "R", position: new THREE.Vector3(0.55, ballRadius, 0.18) },
  { name: "black", color: 0x1d1d22, accent: 0xf1c64c, number: "K", position: new THREE.Vector3(0.68, ballRadius, 0.03) }
];

for (const def of ballDefs) {
  balls.push(createBall(def));
}

const state = {
  yaw: 1.05,
  pitch: 0.1,
  eyeYaw: 1.05,
  eyePitch: 0.35,
  eyeDistance: 3.6,
  cueLift: 0.08,
  cuePull: 0.21,
  power: Number(powerSlider.value),
  spin: new THREE.Vector2(0, 0),
  viewMode: "cue",
  shotInFlight: false,
  cueStrikeActive: false,
  cueStrikeProgress: 1,
  cueStrikeHit: false,
  cameraFrozen: false,
  cameraFreezeOrigin: new THREE.Vector3(),
  aimDirection: new THREE.Vector3(0, 0, 1),
  aimPadPointerId: null,
  spinPadPointerId: null,
  canvasGestureStartX: 0,
  canvasGestureStartY: 0,
  canvasGestureStartTime: 0,
  canvasGestureStartYaw: 0,
  canvasGestureStartPitch: 0,
  canvasGestureStartEyeYaw: 0,
  canvasGestureStartEyePitch: 0,
  canvasGestureMoved: false
};

window.__gameState = state;

const tmpVec2 = new THREE.Vector2();
const tmpVec3 = new THREE.Vector3();
const cushionMinX = -table.playWidth / 2 + ballRadius;
const cushionMaxX = table.playWidth / 2 - ballRadius;
const cushionMinZ = -table.playHeight / 2 + ballRadius;
const cushionMaxZ = table.playHeight / 2 - ballRadius;

powerSlider.addEventListener("input", () => {
  state.power = Number(powerSlider.value);
  powerValue.textContent = `${Math.round(state.power * 100)}%`;
});

resetButton.addEventListener("click", resetBalls);
viewToggle.addEventListener("click", toggleViewMode);
shootButton.addEventListener("click", handleShootInput);
shootButton.addEventListener("pointerup", handleShootInput);
shootButton.addEventListener("touchend", handleShootInput, { passive: false });
controlsToggle.addEventListener("click", () => setControlsOpen(controlsDrawer.dataset.open !== "true"));
controlsHandle.addEventListener("click", () => setControlsOpen(controlsDrawer.dataset.open !== "true"));
window.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    toggleViewMode();
  }
});

setupAimPad();
setupSpinPad();
setupCanvasGestures();

window.addEventListener("resize", onResize);
onResize();
resetBalls();
window.triggerShot = handleShootInput;
window.triggerReset = resetBalls;

let lastTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.03);
  lastTime = now;

  updatePhysics(dt);
  updateCueAndCamera(dt);
  renderer.render(scene, camera);
});

function buildTable() {
  const tableRoot = new THREE.Group();
  worldGroup.add(tableRoot);

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(table.playWidth + 0.08, 0.025, table.playHeight + 0.08),
    woodMaterial
  );
  bed.position.y = -0.06;
  bed.receiveShadow = true;
  tableRoot.add(bed);

  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(table.playWidth, table.playHeight),
    clothMaterial
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.y = table.clothY;
  cloth.receiveShadow = true;
  tableRoot.add(cloth);

  const bumperHeight = 0.048;
  const bumperThickness = 0.11;
  const bumperInset = 0.012;
  const longBumperGeom = new THREE.BoxGeometry(table.playWidth + bumperThickness * 0.25, bumperHeight, bumperThickness);
  const shortBumperGeom = new THREE.BoxGeometry(bumperThickness, bumperHeight, table.playHeight + bumperThickness * 0.25);

  const northBumper = new THREE.Mesh(longBumperGeom, cushionMaterial);
  northBumper.position.set(0, bumperHeight / 2, -table.playHeight / 2 - bumperThickness / 2 + bumperInset);
  northBumper.castShadow = true;
  northBumper.receiveShadow = true;
  tableRoot.add(northBumper);

  const southBumper = northBumper.clone();
  southBumper.position.z *= -1;
  tableRoot.add(southBumper);

  const eastBumper = new THREE.Mesh(shortBumperGeom, cushionMaterial);
  eastBumper.position.set(table.playWidth / 2 + bumperThickness / 2 - bumperInset, bumperHeight / 2, 0);
  eastBumper.castShadow = true;
  eastBumper.receiveShadow = true;
  tableRoot.add(eastBumper);

  const westBumper = eastBumper.clone();
  westBumper.position.x *= -1;
  tableRoot.add(westBumper);

  const pointGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.004, 20);
  const pointOffsetsX = [-1.08, -0.54, 0, 0.54, 1.08];
  const pointOffsetsZ = [-0.52, 0, 0.52];

  for (const x of pointOffsetsX) {
    for (const side of [-1, 1]) {
      if (x === 0 && side === 1) {
        continue;
      }
      const point = new THREE.Mesh(pointGeometry, pointMaterial);
      point.rotation.x = Math.PI / 2;
      point.position.set(
        THREE.MathUtils.clamp(x, -1.18, 1.18),
        table.cushionHeight + 0.025,
        side * (table.playHeight / 2 + table.railOuter - 0.018)
      );
      worldGroup.add(point);
    }
  }

  for (const z of pointOffsetsZ) {
    for (const side of [-1, 1]) {
      const point = new THREE.Mesh(pointGeometry, pointMaterial);
      point.rotation.z = Math.PI / 2;
      point.position.set(
        side * (table.playWidth / 2 + table.railOuter - 0.018),
        table.cushionHeight + 0.025,
        THREE.MathUtils.clamp(z, -0.58, 0.58)
      );
      worldGroup.add(point);
    }
  }
}

function makeBallTexture(baseColor, accentColor, label) {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");

  const base = `#${baseColor.toString(16).padStart(6, "0")}`;
  const accent = `#${accentColor.toString(16).padStart(6, "0")}`;

  const gradient = ctx.createRadialGradient(size * 0.32, size * 0.26, size * 0.08, size * 0.5, size * 0.5, size * 0.5);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.18, base);
  gradient.addColorStop(0.75, base);
  gradient.addColorStop(1, "#000000");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.5 - 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.5 - 2, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = accent;
  ctx.fillRect(size * 0.43, size * 0.08, size * 0.14, size * 0.84);

  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.beginPath();
  ctx.arc(size * 0.63, size * 0.33, size * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.font = `bold ${Math.round(size * 0.12)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, size * 0.63, size * 0.335);
  ctx.restore();

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function setControlsOpen(open) {
  controlsDrawer.dataset.open = open ? "true" : "false";
  controlsToggle.textContent = open ? "닫기" : "조작";
}

function createBall({ name, color, accent, number, position }) {
  const group = new THREE.Group();
  const map = makeBallTexture(color, accent, number);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 48, 48),
    new THREE.MeshStandardMaterial({
      color,
      map,
      emissive: new THREE.Color(color).multiplyScalar(name === "black" ? 0.02 : 0.08),
      emissiveIntensity: 1,
      roughness: 0.18,
      metalness: 0.02
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const marker = new THREE.Mesh(
    new THREE.CircleGeometry(ballRadius * 0.12, 24),
    new THREE.MeshBasicMaterial({ color: spot, side: THREE.DoubleSide })
  );
  marker.position.set(ballRadius * 0.72, ballRadius * 0.12, 0);
  marker.lookAt(marker.position.clone().add(new THREE.Vector3(1, 0, 0)));
  body.add(marker);

  group.position.copy(position);
  scene.add(group);

  const ball = new BilliardBallPhysics({
    id: balls.length,
    ballNumber: balls.length + 1,
    name,
    mesh: group,
    body,
    radius: ballRadius,
    mass: 0.23,
    manager: physicsManager,
    homePosition: position
  });
  physicsManager.registerBall(ball);
  ball.marker = marker;
  return ball;
}

function resetBalls() {
  state.shotInFlight = false;
  state.cueStrikeActive = false;
  state.cueStrikeProgress = 1;
  state.cueStrikeHit = false;
  state.cameraFrozen = false;
  state.cuePull = 0.21;
  state.spin.set(0, 0);
  state.viewMode = "cue";
  state.yaw = 1.05;
  state.pitch = 0.02;
  state.eyeYaw = 1.05;
  state.eyePitch = 0.35;
  state.eyeDistance = 3.6;
  syncViewToggle();
  syncSpinThumb();
  physicsManager.resetBalls();
  for (const ball of balls) {
    ball.body.rotation.set(0, 0, 0);
  }
}

function toggleViewMode() {
  state.viewMode = state.viewMode === "cue" ? "eye" : "cue";
  syncViewToggle();
}

function syncViewToggle() {
  if (!viewToggle) {
    return;
  }

  viewToggle.textContent = state.viewMode === "cue" ? "CUE" : "EYE";
}

function setupAimPad() {
  aimPad.addEventListener("pointerdown", (event) => {
    state.aimPadPointerId = event.pointerId;
    aimPad.setPointerCapture(event.pointerId);
    updateAimFromPointer(event);
  });

  aimPad.addEventListener("pointermove", (event) => {
    if (state.aimPadPointerId !== event.pointerId) {
      return;
    }
    updateAimFromPointer(event);
  });

  const release = (event) => {
    if (state.aimPadPointerId !== event.pointerId) {
      return;
    }
    state.aimPadPointerId = null;
    aimThumb.style.left = "50%";
    aimThumb.style.top = "50%";
  };

  aimPad.addEventListener("pointerup", release);
  aimPad.addEventListener("pointercancel", release);
}

function updateAimFromPointer(event) {
  const rect = aimPad.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  state.yaw -= x * 0.03;
  state.pitch = THREE.MathUtils.clamp(state.pitch + y * 0.012, -1.15, 0.55);
  state.cueLift = THREE.MathUtils.clamp((state.pitch + 0.05) * 0.45, 0.015, 0.26);
  aimThumb.style.left = `${THREE.MathUtils.clamp((x * 0.35 + 0.5) * 100, 15, 85)}%`;
  aimThumb.style.top = `${THREE.MathUtils.clamp((y * 0.35 + 0.5) * 100, 15, 85)}%`;
}

function setupSpinPad() {
  spinPad.addEventListener("pointerdown", (event) => {
    state.spinPadPointerId = event.pointerId;
    spinPad.setPointerCapture(event.pointerId);
    updateSpinFromPointer(event);
  });

  spinPad.addEventListener("pointermove", (event) => {
    if (state.spinPadPointerId !== event.pointerId) {
      return;
    }
    updateSpinFromPointer(event);
  });

  const release = (event) => {
    if (state.spinPadPointerId !== event.pointerId) {
      return;
    }
    state.spinPadPointerId = null;
  };

  spinPad.addEventListener("pointerup", release);
  spinPad.addEventListener("pointercancel", release);
}

function updateSpinFromPointer(event) {
  const rect = spinPad.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = (event.clientX - cx) / (rect.width * 0.36);
  const dy = (event.clientY - cy) / (rect.height * 0.36);
  tmpVec2.set(dx, dy);
  if (tmpVec2.length() > 1) {
    tmpVec2.normalize();
  }

  state.spin.set(
    THREE.MathUtils.clamp(tmpVec2.x, -1, 1),
    THREE.MathUtils.clamp(tmpVec2.y, -1, 1)
  );
  syncSpinThumb();
}

function syncSpinThumb() {
  spinThumb.style.left = `${50 + state.spin.x * 28}%`;
  spinThumb.style.top = `${50 + state.spin.y * 28}%`;
  spinXValue.textContent = state.spin.x.toFixed(2);
  spinYValue.textContent = (-state.spin.y).toFixed(2);
}

function shootCueBall() {
  if (state.shotInFlight || state.cueStrikeActive || areBallsMoving()) {
    return;
  }
  state.cameraFrozen = true;
  state.cameraFreezeOrigin.copy(balls[0].position);
  state.cueStrikeActive = true;
  state.cueStrikeProgress = 0;
  state.cueStrikeHit = false;
  state.shotInFlight = true;
  statusText.textContent = "타격 준비 중";
}

function handleShootInput(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  shootCueBall();
}

function setupCanvasGestures() {
  const activePointers = new Map();
  let primaryPointerId = null;

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY
    });

    if (primaryPointerId === null) {
      primaryPointerId = event.pointerId;
      state.canvasGestureStartX = event.clientX;
      state.canvasGestureStartY = event.clientY;
      state.canvasGestureStartTime = performance.now();
      state.canvasGestureStartYaw = state.yaw;
      state.canvasGestureStartPitch = state.pitch;
      state.canvasGestureStartEyeYaw = state.eyeYaw;
      state.canvasGestureStartEyePitch = state.eyePitch;
      state.canvasGestureMoved = false;
    }

    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const pointer = activePointers.get(event.pointerId);
    if (!pointer) {
      return;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (activePointers.size >= 2) {
      if (state.viewMode !== "cue") {
        return;
      }
      let sumX = 0;
      let sumY = 0;
      for (const item of activePointers.values()) {
        sumX += item.x;
        sumY += item.y;
      }
      const rect = canvas.getBoundingClientRect();
      const centerX = sumX / activePointers.size;
      const centerY = sumY / activePointers.size;
      const nx = ((centerX - rect.left) / rect.width) * 2 - 1;
      const ny = ((centerY - rect.top) / rect.height) * 2 - 1;
      state.spin.set(
        THREE.MathUtils.clamp(nx * 0.92, -1, 1),
        THREE.MathUtils.clamp(ny * 0.92, -1, 1)
      );
      state.canvasGestureMoved = true;
      return;
    }

    if (event.pointerId !== primaryPointerId) {
      return;
    }

    const dx = event.clientX - state.canvasGestureStartX;
    const dy = event.clientY - state.canvasGestureStartY;
    if (!state.canvasGestureMoved && Math.hypot(dx, dy) > 6) {
      state.canvasGestureMoved = true;
    }

    if (state.viewMode === "cue") {
      state.yaw = state.canvasGestureStartYaw - dx * 0.0052;
      state.pitch = THREE.MathUtils.clamp(state.canvasGestureStartPitch - dy * 0.0036, -1.15, 0.65);
      state.cueLift = THREE.MathUtils.clamp((state.pitch + 0.05) * 0.45, 0.015, 0.26);
      return;
    }

    state.eyeYaw = state.canvasGestureStartEyeYaw - dx * 0.0052;
    state.eyePitch = THREE.MathUtils.clamp(state.canvasGestureStartEyePitch - dy * 0.0036, -0.1, 1.05);
  });

  const finishGesture = (event) => {
    if (!activePointers.has(event.pointerId)) {
      return;
    }
    const wasPrimary = event.pointerId === primaryPointerId;
    activePointers.delete(event.pointerId);
    if (wasPrimary) {
      primaryPointerId = null;
      state.canvasGestureMoved = false;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener("pointerup", finishGesture);
  canvas.addEventListener("pointercancel", finishGesture);
}

function updateCueAndCamera(dt) {
  const cueBall = balls[0];
  const up = new THREE.Vector3(0, 1, 0);
  const cameraOrigin = state.cameraFrozen ? state.cameraFreezeOrigin : cueBall.position;
  const cueTipOffset = getCueTipOffset();

  let cameraEye;
  let cameraFocus;
  let shotForward;
  let cueVisible = true;
  let cueTipPoint = cueBall.position.clone();
  let contactPoint = cueBall.position.clone();

  if (state.viewMode === "cue") {
    const baseForward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
    const baseRight = new THREE.Vector3(baseForward.z, 0, -baseForward.x).normalize();

    const contactOffset = baseRight.clone().multiplyScalar(cueTipOffset.x * ballRadius)
      .add(up.clone().multiplyScalar(-cueTipOffset.y * ballRadius));

    contactPoint = cueBall.position.clone()
      .add(baseForward.clone().multiplyScalar(-ballRadius - cueHeadGap))
      .add(contactOffset);

    cueTipPoint = contactPoint.clone();
    if (state.cueStrikeActive) {
      state.cueStrikeProgress = Math.min(state.cueStrikeProgress + dt / cueStrikeDuration, 1);
      const eased = 1 - Math.pow(1 - state.cueStrikeProgress, 3);
      const pullback = THREE.MathUtils.lerp(cuePullbackDistance, 0, eased);
      cueTipPoint = contactPoint.clone().add(baseForward.clone().multiplyScalar(-pullback));

      if (!state.cueStrikeHit && state.cueStrikeProgress >= cueStrikeHitTime) {
        strikeCueBall(state.aimDirection);
        state.cueStrikeHit = true;
        statusText.textContent = "공이 멈출 때까지 물리 계산 중";
      }

      if (state.cueStrikeProgress >= 1) {
        state.cueStrikeActive = false;
      }
    }

    const cueCameraLift = THREE.MathUtils.clamp(cueCameraHeight + state.pitch * 0.82, 0.045, 0.72);
    cameraEye = cameraOrigin.clone()
      .add(baseForward.clone().multiplyScalar(-cueCameraBackDistance))
      .add(up.clone().multiplyScalar(cueCameraLift))
      .add(baseRight.clone().multiplyScalar(cueCameraSideOffset));
    cameraFocus = cueBall.position.clone()
      .add(up.clone().multiplyScalar(0.03))
      .add(baseForward.clone().multiplyScalar(cueCameraLookAhead));
    shotForward = baseForward.clone();

    cueVisible = !state.cueStrikeActive && !areBallsMoving();
    cueMarker.visible = cueVisible;
    cueMarker.position.copy(contactPoint);
    cueMarker.lookAt(cueBall.position);

    const cueToCamera = cameraEye.clone().sub(cueTipPoint).normalize();
    cueGroup.scale.set(cueStickStretch, 1, 1);
    cueGroup.position.copy(cueTipPoint.clone().add(cueToCamera.multiplyScalar(1.15)));
    cueGroup.rotation.set(0, Math.atan2(shotForward.x, shotForward.z) + Math.PI / 2, state.cueLift * 0.9);
    cueGroup.visible = !state.cueStrikeActive && !areBallsMoving();
  } else {
    const orbitX = Math.sin(state.eyeYaw) * Math.cos(state.eyePitch);
    const orbitY = Math.sin(state.eyePitch);
    const orbitZ = Math.cos(state.eyeYaw) * Math.cos(state.eyePitch);
    const orbitDir = new THREE.Vector3(orbitX, orbitY, orbitZ).normalize();
    cameraEye = cueBall.position.clone().add(orbitDir.multiplyScalar(state.eyeDistance));
    cameraFocus = cueBall.position.clone();
    shotForward = cameraFocus.clone().sub(cameraEye);
    shotForward.y = 0;
    if (shotForward.lengthSq() < 1e-6) {
      shotForward.set(0, 0, 1);
    } else {
      shotForward.normalize();
    }
    cueVisible = false;
    cueMarker.visible = false;
    cueGroup.visible = false;
  }

  state.aimDirection.copy(shotForward);
  const ballsMoving = areBallsMoving();
  const moving = ballsMoving || state.cueStrikeActive;

  cameraRig.position.copy(cameraEye);
  camera.lookAt(cameraFocus);

  if (!ballsMoving && !state.cueStrikeActive) {
    state.shotInFlight = false;
    state.cueStrikeActive = false;
    state.cameraFrozen = false;
    statusText.textContent = state.viewMode === "cue" ? "큐 시점에서 조준 후 샷" : "눈 시점에서 테이블 확인";
  }
}

function strikeCueBall(forward) {
  if (state.viewMode !== "cue") {
    return;
  }

  const cueBall = balls[0];
  const speed = THREE.MathUtils.clamp(state.power, 0.12, 1) * (160 * ballRadius);
  cueBall.applyShot(state.aimDirection, speed, getCueTipOffset());
}

function getCueTipOffset() {
  return new THREE.Vector2(
    THREE.MathUtils.clamp(state.spin.x, -1, 1) * cueTipOffsetLimit,
    THREE.MathUtils.clamp(state.spin.y, -1, 1) * cueTipOffsetLimit
  );
}

function updatePhysics(dt) {
  physicsManager.step(dt);
}

function handleCushions(ball) {
  if (ball.position.x <= cushionMinX) {
    ball.position.x = cushionMinX + 0.0004;
    if (ball.velocity.x < 0) {
      bounceBall(ball, new THREE.Vector3(1, 0, 0));
    }
  } else if (ball.position.x >= cushionMaxX) {
    ball.position.x = cushionMaxX - 0.0004;
    if (ball.velocity.x > 0) {
      bounceBall(ball, new THREE.Vector3(-1, 0, 0));
    }
  }

  if (ball.position.z <= cushionMinZ) {
    ball.position.z = cushionMinZ + 0.0004;
    if (ball.velocity.z < 0) {
      bounceBall(ball, new THREE.Vector3(0, 0, 1));
    }
  } else if (ball.position.z >= cushionMaxZ) {
    ball.position.z = cushionMaxZ - 0.0004;
    if (ball.velocity.z > 0) {
      bounceBall(ball, new THREE.Vector3(0, 0, -1));
    }
  }
}

function bounceBall(ball, normal) {
  const vn = normal.clone().multiplyScalar(ball.velocity.dot(normal));
  const vt = ball.velocity.clone().sub(vn);
  const spinKick = new THREE.Vector3(-normal.z, 0, normal.x).multiplyScalar(ball.spin.y * physics.sideSpinCushionScale);

  ball.velocity.copy(
    vt.multiplyScalar(physics.tangentialBounce)
      .sub(vn.multiplyScalar(physics.restitution))
      .add(spinKick)
  );

  ball.spin.y *= 0.78;
  ball.spin.x *= 0.92;
  ball.spin.z *= 0.92;
}

function resolveBallCollisions() {
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      tmpVec3.copy(b.position).sub(a.position);
      const distance = tmpVec3.length();
      const minDistance = ballRadius * 2;

      if (distance === 0 || distance >= minDistance) {
        continue;
      }

      const normal = tmpVec3.normalize();
      const overlap = minDistance - distance;
      a.position.addScaledVector(normal, -overlap * 0.5);
      b.position.addScaledVector(normal, overlap * 0.5);

      const relative = a.velocity.clone().sub(b.velocity);
      const separating = relative.dot(normal);
      if (separating > 0) {
        continue;
      }

      const impulse = -separating;
      a.velocity.addScaledVector(normal, -impulse);
      b.velocity.addScaledVector(normal, impulse);

      const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
      const englishTransfer = (a.spin.y - b.spin.y) * 0.06;
      a.velocity.addScaledVector(tangent, -englishTransfer);
      b.velocity.addScaledVector(tangent, englishTransfer);
      a.spin.y *= 0.92;
      b.spin.y *= 0.92;
    }
  }
}

function areBallsMoving() {
  return !physicsManager.areAllBallsStopped();
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
