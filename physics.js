import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js";

export const BallState = Object.freeze({
  Stationary: "Stationary",
  Sliding: "Sliding",
  Rolling: "Rolling",
  Spinning: "Spinning"
});

const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3(0, 0, 0);
const EPSILON = 1e-6;

function createVector3(value) {
  if (value instanceof THREE.Vector3) {
    return value.clone();
  }

  if (Array.isArray(value)) {
    return new THREE.Vector3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
  }

  return new THREE.Vector3(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
}

function moveTowards(current, target, maxDelta) {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }

  return Math.max(current - maxDelta, target);
}

function clampMagnitude(vector, maxMagnitude) {
  const maxSq = maxMagnitude * maxMagnitude;
  const lengthSq = vector.lengthSq();
  if (lengthSq <= maxSq || lengthSq < EPSILON) {
    return vector;
  }

  return vector.multiplyScalar(maxMagnitude / Math.sqrt(lengthSq));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function upCross(vector, target = new THREE.Vector3()) {
  return target.set(vector.z, 0, -vector.x);
}

function setPlanar(vector, x, z) {
  vector.set(x, 0, z);
  return vector;
}

function zeroBallMotion(ball) {
  ball.velocity.set(0, 0, 0);
  ball.angularVelocity.set(0, 0, 0);
  ball.state = BallState.Stationary;
}

export class BilliardBallPhysics {
  constructor({
    id = 0,
    ballNumber = 0,
    name = "",
    mesh = null,
    body = null,
    radius = 0.03275,
    mass = 0.17,
    manager = null,
    homePosition = ZERO
  } = {}) {
    this.id = id;
    this.ballNumber = ballNumber;
    this.name = name;
    this.mesh = mesh;
    this.body = body;
    this.radius = radius;
    this.mass = mass;
    this.manager = manager;
    this.homePosition = createVector3(homePosition);
    this.position = createVector3(homePosition);
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.spin = this.angularVelocity;
    this.state = BallState.Stationary;
    this.isPocketed = false;
    this.visible = true;
    this.lastCushionTime = -Infinity;
    this._spinAxis = new THREE.Vector3(1, 0, 0);
    this._spinQuat = new THREE.Quaternion();
    this._scratch = new THREE.Vector3();
  }

  get isNearlyStopped() {
    if (this.isPocketed) {
      return true;
    }

    const manager = this.manager;
    const linearThreshold = manager?.stopVelocityThreshold ?? 0.01;
    const angularThreshold = manager?.stopAngularThreshold ?? 0.03;

    return this.velocity.lengthSq() <= linearThreshold * linearThreshold
      && this.angularVelocity.lengthSq() <= angularThreshold * angularThreshold;
  }

  applyShot(cueDirection, power, cueTipOffset) {
    if (!this.manager) {
      return;
    }

    this.manager.applyShot(this, cueDirection, power, cueTipOffset);
  }

  reset(position = this.homePosition) {
    this.isPocketed = false;
    this.visible = true;
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.state = BallState.Stationary;

    if (this.mesh) {
      this.mesh.visible = true;
    }

    if (this.body) {
      this.body.quaternion.identity();
      this.body.rotation.set(0, 0, 0);
    }

    this.syncTransform();
  }

  setPocketed(pocketed) {
    this.isPocketed = pocketed;
    this.visible = !pocketed;

    if (this.mesh) {
      this.mesh.visible = !pocketed;
    }
  }

  syncTransform() {
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.visible = !this.isPocketed && this.visible;
    }
  }

  updateVisualSpin(dt) {
    if (!this.body || this.isPocketed) {
      return;
    }

    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed < EPSILON) {
      return;
    }

    this._spinAxis.copy(this.angularVelocity).normalize();
    this._spinQuat.setFromAxisAngle(this._spinAxis, angularSpeed * dt);
    this.body.quaternion.multiply(this._spinQuat);
  }
}

export class BilliardPhysicsManager {
  constructor({
    ballRadius = 0.03275,
    ballMass = 0.17,
    gravity = 9.81,
    slidingFriction = 0.2,
    rollingFriction = 0.015,
    spinningFriction = 0.045,
    ballRestitution = 0.95,
    ballFriction = 0.08,
    cushionRestitution = 0.9,
    cushionFriction = 0.06,
    stopVelocityThreshold = 0.01,
    stopAngularThreshold = 0.03,
    substepCount = 12,
    tableMinX = -1.18,
    tableMaxX = 1.18,
    tableMinZ = -0.56,
    tableMaxZ = 0.56,
    tableY = ballRadius,
    pocketRadius = 0,
    pocketCaptureSpeed = 0.08,
    pocketPositions = [],
    debugMode = false
  } = {}) {
    this.ballRadius = ballRadius;
    this.ballMass = ballMass;
    this.gravity = gravity;
    this.slidingFriction = slidingFriction;
    this.rollingFriction = rollingFriction;
    this.spinningFriction = spinningFriction;
    this.ballRestitution = ballRestitution;
    this.ballFriction = ballFriction;
    this.cushionRestitution = cushionRestitution;
    this.cushionFriction = cushionFriction;
    this.stopVelocityThreshold = stopVelocityThreshold;
    this.stopAngularThreshold = stopAngularThreshold;
    this.substepCount = Math.max(1, Math.floor(substepCount));
    this.tableMinX = tableMinX;
    this.tableMaxX = tableMaxX;
    this.tableMinZ = tableMinZ;
    this.tableMaxZ = tableMaxZ;
    this.tableY = tableY;
    this.pocketRadius = pocketRadius;
    this.pocketCaptureSpeed = pocketCaptureSpeed;
    this.pocketPositions = pocketPositions.map(createVector3);
    this.debugMode = debugMode;
    this.sinTheta = 2 / 5;
    this.cosTheta = Math.sqrt(21) / 5;
    this.throwFactor = 1;
    this.refreshDerivedPhysics();
    this.balls = [];
    this._scratchA = new THREE.Vector3();
    this._scratchB = new THREE.Vector3();
    this._scratchC = new THREE.Vector3();
    this._scratchD = new THREE.Vector3();
    this._scratchE = new THREE.Vector3();
    this._scratchF = new THREE.Vector3();
    this._frameCounter = 0;
    this._lastDebugLogFrame = -1;
  }

  refreshDerivedPhysics() {
    this.I = (2 / 5) * this.ballMass * this.ballRadius * this.ballRadius;
    this.Mz = ((this.rollingFriction * this.ballMass * this.gravity * 2) / 3) * this.spinningFriction;
    this.Mxy = (7 / (5 * Math.SQRT2)) * this.ballRadius * this.slidingFriction * this.ballMass * this.gravity;
    this.slideAngularAccel = (5 * this.slidingFriction * this.gravity) / (2 * this.ballRadius);
    this.spinAngularDecel = (5 * this.spinningFriction * this.gravity) / (2 * this.ballRadius);
  }

  registerBall(ball) {
    if (!ball || this.balls.includes(ball)) {
      return ball;
    }

    ball.manager = this;
    this.balls.push(ball);
    return ball;
  }

  resetBalls() {
    for (const ball of this.balls) {
      if (!ball) {
        continue;
      }

      ball.reset(ball.homePosition);
    }
  }

  applyShot(ball, cueDirection, power, cueTipOffset = new THREE.Vector2(), elevation = 0) {
    if (!ball || ball.isPocketed) {
      return;
    }

    const direction = createVector3(cueDirection);
    direction.y = 0;
    if (direction.lengthSq() < EPSILON) {
      direction.set(1, 0, 0);
    }
    direction.normalize();

    const tipOffset = cueTipOffset instanceof THREE.Vector2
      ? cueTipOffset.clone()
      : new THREE.Vector2(cueTipOffset?.x ?? 0, cueTipOffset?.y ?? 0);
    const angle = Math.atan2(direction.z, direction.x);
    const strike = this.cueStrike(angle, power, tipOffset, elevation);

    ball.velocity.copy(strike.vel);
    ball.velocity.y = 0;
    ball.angularVelocity.copy(strike.rvel);

    ball.state = BallState.Sliding;
    ball.setPocketed(false);
    ball.syncTransform();
  }

  cueStrike(angle, power, offset, elevation = 0) {
    const speed = clamp(power, 0, 160 * this.ballRadius);
    const vel = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(speed);
    const rvel = this.cueToSpin(offset, vel, elevation);
    return { vel, rvel };
  }

  cueToSpin(offset, v, elevation = 0) {
    const tip = offset instanceof THREE.Vector2
      ? offset
      : new THREE.Vector2(offset?.x ?? 0, offset?.y ?? 0);
    const planarSpeed = Math.max(this.getPlanarSpeed(v), 0.001);
    const dir = this._scratchA.copy(v).setY(0).normalize();
    const rollAxis = upCross(dir, this._scratchB);

    const follow = clamp(tip.y, -1, 1);
    const side = clamp(tip.x, -1, 1);
    const spinScale = planarSpeed / this.ballRadius;

    // Center hits start with almost no forward roll, so the ball first slides
    // and cloth friction gradually converts linear speed into rolling.
    const rollSpin = rollAxis.multiplyScalar(spinScale * follow * 1.6);
    const sideSpin = side * spinScale * 1.15;
    const masseLift = clamp(elevation, 0, 0.75) * spinScale * 0.18;

    return new THREE.Vector3(
      rollSpin.x,
      sideSpin + masseLift,
      rollSpin.z
    );
  }

  step(dt) {
    if (dt <= 0) {
      return;
    }

    const steps = Math.max(1, this.substepCount);
    const stepDt = dt / steps;

    for (let step = 0; step < steps; step += 1) {
      for (const ball of this.balls) {
        if (!ball || ball.isPocketed) {
          continue;
        }

        this.updateState(ball);
        this.integrateBall(ball, stepDt);
      }

      this.resolveCushions();
      this.resolveBallCollisions();
      this.resolvePockets();

      for (const ball of this.balls) {
        if (!ball || ball.isPocketed) {
          continue;
        }

        this.updateState(ball);
        this.snapToRest(ball);
        ball.syncTransform();
        ball.updateVisualSpin(stepDt);
      }
    }

    this.emitDebugLog();
  }

  areAllBallsStopped() {
    return this.balls.every((ball) => !ball || ball.isPocketed || ball.isNearlyStopped);
  }

  getMovingCenter() {
    const center = new THREE.Vector3();
    let count = 0;

    for (const ball of this.balls) {
      if (!ball || ball.isPocketed || ball.isNearlyStopped) {
        continue;
      }

      center.add(ball.position);
      count += 1;
    }

    if (count === 0) {
      return this.getCueBallPosition();
    }

    return center.multiplyScalar(1 / count);
  }

  getCueBallPosition() {
    const cueBall = this.balls.find((ball) => ball && !ball.isPocketed);
    return cueBall ? cueBall.position.clone() : new THREE.Vector3();
  }

  updateState(ball) {
    const planarSpeed = this.getPlanarSpeed(ball.velocity);
    const spinSpeed = Math.abs(ball.angularVelocity.y);
    const slipSpeed = this.getBottomSlipVector(ball, this._scratchA).length();

    if (planarSpeed < this.stopVelocityThreshold
      && spinSpeed < this.stopAngularThreshold
      && slipSpeed < this.stopVelocityThreshold * 0.5) {
      zeroBallMotion(ball);
      return;
    }

    if (planarSpeed < this.stopVelocityThreshold * 0.75
      && spinSpeed >= this.stopAngularThreshold
      && slipSpeed < this.stopVelocityThreshold * 0.5) {
      ball.state = BallState.Spinning;
      return;
    }

    if (slipSpeed > this.stopVelocityThreshold * 0.5) {
      ball.state = BallState.Sliding;
      return;
    }

    if (planarSpeed >= this.stopVelocityThreshold) {
      ball.state = BallState.Rolling;
      return;
    }

    ball.state = spinSpeed >= this.stopAngularThreshold ? BallState.Spinning : BallState.Stationary;
    if (ball.state === BallState.Stationary) {
      zeroBallMotion(ball);
    }
  }

  integrateBall(ball, dt) {
    switch (ball.state) {
      case BallState.Stationary:
        zeroBallMotion(ball);
        break;
      case BallState.Spinning:
        this.integrateSpinning(ball, dt);
        break;
      case BallState.Rolling:
        this.integrateRolling(ball, dt);
        break;
      case BallState.Sliding:
        this.integrateSliding(ball, dt);
        break;
      default:
        break;
    }

    ball.position.addScaledVector(ball.velocity, dt);
    ball.position.y = this.tableY;
    ball.velocity.y = 0;
    clampMagnitude(ball.velocity, 8.0);
    clampMagnitude(ball.angularVelocity, 260.0);
  }

  integrateSpinning(ball, dt) {
    ball.velocity.x = moveTowards(ball.velocity.x, 0, this.rollingFriction * this.gravity * 0.05 * dt);
    ball.velocity.z = moveTowards(ball.velocity.z, 0, this.rollingFriction * this.gravity * 0.05 * dt);
    ball.angularVelocity.x = moveTowards(ball.angularVelocity.x, 0, this.spinAngularDecel * 0.75 * dt);
    ball.angularVelocity.z = moveTowards(ball.angularVelocity.z, 0, this.spinAngularDecel * 0.75 * dt);
    ball.angularVelocity.y = moveTowards(ball.angularVelocity.y, 0, this.spinAngularDecel * 3.6 * dt);

    if (this.getPlanarSpeed(ball.velocity) < this.stopVelocityThreshold * 0.6
      && Math.abs(ball.angularVelocity.y) < this.stopAngularThreshold * 10) {
      zeroBallMotion(ball);
    }
  }

  integrateRolling(ball, dt) {
    const planar = this._scratchA.set(ball.velocity.x, 0, ball.velocity.z);
    const speed = planar.length();

    if (speed < this.stopVelocityThreshold * 1.2) {
      zeroBallMotion(ball);
      return;
    }

    if (speed > EPSILON) {
      const decel = this.rollingFriction * this.gravity;
      const newSpeed = Math.max(0, speed - decel * dt);
      planar.multiplyScalar(newSpeed / speed);
      ball.velocity.x = planar.x;
      ball.velocity.z = planar.z;
    }

    this.forceRoll(ball.velocity, ball.angularVelocity);
    ball.angularVelocity.y = moveTowards(ball.angularVelocity.y, 0, this.spinAngularDecel * 1.15 * dt);
  }

  integrateSliding(ball, dt) {
    const slip = this.getBottomSlipVector(ball, this._scratchA);
    const slipSpeed = slip.length();

    if (slipSpeed > EPSILON) {
      const slipDir = slip.multiplyScalar(1 / slipSpeed);
      const linearStep = this.slidingFriction * this.gravity * dt;
      ball.velocity.addScaledVector(slipDir, -linearStep);

      ball.angularVelocity.x += this.slideAngularAccel * slipDir.z * dt;
      ball.angularVelocity.z -= this.slideAngularAccel * slipDir.x * dt;
    }

    ball.angularVelocity.y = moveTowards(ball.angularVelocity.y, 0, this.spinAngularDecel * 0.85 * dt);

    const newSlip = this.getBottomSlipVector(ball, this._scratchB).length();
    if (newSlip < this.stopVelocityThreshold * 0.4) {
      this.forceRoll(ball.velocity, ball.angularVelocity);
    }

    if (this.getPlanarSpeed(ball.velocity) < this.stopVelocityThreshold * 1.2
      && newSlip < this.stopVelocityThreshold) {
      zeroBallMotion(ball);
    }
  }

  sliding(v, w) {
    const va = this.surfaceVelocity(v, w, this._scratchA);
    const deltaV = this._scratchB.set(0, 0, 0);
    const deltaW = this._scratchC.set(0, 0, 0);

    if (va.lengthSq() > EPSILON) {
      deltaV.copy(va).normalize().multiplyScalar(-this.slidingFriction * this.gravity);
      upCross(va, deltaW);
      if (deltaW.lengthSq() > EPSILON) {
        deltaW.normalize().multiplyScalar((5 / 2) * (this.slidingFriction * this.gravity) / this.ballRadius);
      }
    }

    deltaW.y = -(5 / 2) * (this.Mz / (this.ballMass * this.ballRadius * this.ballRadius)) * Math.sign(w.y || 0);
    return { v: deltaV.clone(), w: deltaW.clone() };
  }

  rollingFull(w, v, t) {
    const deltaV = new THREE.Vector3();
    const deltaW = new THREE.Vector3();
    const mag = Math.hypot(w.x, w.z);
    const zmag = Math.abs(w.y);
    const zsign = Math.sign(w.y || 0);

    if (mag < EPSILON) {
      deltaV.copy(v).multiplyScalar(-1 / Math.max(t, EPSILON));
      const spindownFactor = zmag > 24 ? 12 : 1;
      deltaW.set(
        -w.x,
        -(5 / 2) * (this.Mz / (this.ballMass * this.ballRadius * this.ballRadius)) * spindownFactor * zsign,
        -w.z
      );
      return { v: deltaV, w: deltaW };
    }

    const kw = ((5 / 7) * this.Mxy) / (this.ballMass * this.ballRadius * this.ballRadius * mag);
    const dwx = -kw * w.x;
    const dwz = -kw * w.z;
    const spinDown = -(5 / 2) * (this.Mz / (this.ballMass * this.ballRadius * this.ballRadius)) * zsign;

    deltaW.set(dwx, spinDown, dwz);
    deltaV.set(
      this.ballRadius * (w.z + dwz) - v.x,
      0,
      -this.ballRadius * (w.x + dwx) - v.z
    );
    return { v: deltaV, w: deltaW };
  }

  forceRoll(v, w) {
    if (Math.hypot(v.x, v.z) < this.stopVelocityThreshold * 1.2) {
      w.x = 0;
      w.z = 0;
      return;
    }

    w.x = v.z / this.ballRadius;
    w.z = -v.x / this.ballRadius;
  }

  resolveCushions() {
    for (const ball of this.balls) {
      if (!ball || ball.isPocketed) {
        continue;
      }

      let hit = false;

      if (ball.position.x < this.tableMinX) {
        ball.position.x = this.tableMinX + 0.0001;
        if (ball.velocity.x < 0) {
          this.applyCushionResponse(ball, new THREE.Vector3(1, 0, 0));
          hit = true;
        }
      } else if (ball.position.x > this.tableMaxX) {
        ball.position.x = this.tableMaxX - 0.0001;
        if (ball.velocity.x > 0) {
          this.applyCushionResponse(ball, new THREE.Vector3(-1, 0, 0));
          hit = true;
        }
      }

      if (ball.position.z < this.tableMinZ) {
        ball.position.z = this.tableMinZ + 0.0001;
        if (ball.velocity.z < 0) {
          this.applyCushionResponse(ball, new THREE.Vector3(0, 0, 1));
          hit = true;
        }
      } else if (ball.position.z > this.tableMaxZ) {
        ball.position.z = this.tableMaxZ - 0.0001;
        if (ball.velocity.z > 0) {
          this.applyCushionResponse(ball, new THREE.Vector3(0, 0, -1));
          hit = true;
        }
      }

      if (hit) {
        ball.lastCushionTime = typeof performance !== "undefined" ? performance.now() : Date.now();
      }
    }
  }

  applyCushionResponse(ball, normal) {
    const n = normal.clone().normalize();
    const t = new THREE.Vector3(-n.z, 0, n.x);
    const vn = ball.velocity.dot(n);
    if (vn >= 0) {
      return;
    }

    const vt = ball.velocity.dot(t);
    ball.velocity.addScaledVector(n, -(1 + this.cushionRestitution) * vn);
    ball.velocity.addScaledVector(t, -this.cushionFriction * vt);
    const tangentialContactSpeed = vt - ball.angularVelocity.y * this.ballRadius;
    ball.angularVelocity.y += (tangentialContactSpeed / Math.max(this.ballRadius, EPSILON)) * 0.14;
    this.forceRoll(ball.velocity, ball.angularVelocity);
    ball.angularVelocity.y *= 0.92;
  }

  bounceHanBlend(v, w) {
    const deltaGrip = this.gripHan(v, w);
    const deltaSlip = this.slipHan(v, w);
    const isCheckSide = Math.sign(v.y) === Math.sign(w.z);
    const factor = isCheckSide ? Math.cos(Math.atan2(v.y, v.x)) : 1;

    return {
      v: deltaSlip.v.lerp(deltaGrip.v, factor),
      w: deltaSlip.w.lerp(deltaGrip.w, factor)
    };
  }

  basisHan(v, w) {
    return {
      c: this.c0(v),
      s: this.s0(v, w),
      A: (7 / 2) / this.ballMass,
      B: 1 / this.ballMass
    };
  }

  s0(v, w) {
    const sinA = this.sinTheta;
    const cosA = this.cosTheta;
    return new THREE.Vector3(
      v.x * sinA - v.z * cosA + this.ballRadius * w.y,
      -v.y - this.ballRadius * w.z * cosA + this.ballRadius * w.x * sinA,
      0
    );
  }

  c0(v) {
    const cosA = this.cosTheta;
    return v.x * cosA;
  }

  Pzs(s) {
    return s.length() / ((7 / 2) / this.ballMass);
  }

  Pze(c) {
    const B = 1 / this.ballMass;
    const cosA = this.cosTheta;
    const coeff = this.restitutionCushion(new THREE.Vector3(c / cosA, 0, 0));
    return (0.85 * ((1 + coeff) * c)) / B;
  }

  isGripCushion(v, w) {
    return this.Pzs(this.s0(v, w)) <= this.Pze(this.c0(v));
  }

  gripHan(v, w) {
    const { c, s, A, B } = this.basisHan(v, w);
    const sinA = this.sinTheta;
    const cosA = this.cosTheta;
    const ecB = (1 + 0.86) * (c / B);
    const PX = (-s.x / A) * sinA - ecB * cosA;
    const PY = s.y / A;
    const PZ = (s.x / A) * cosA - ecB * sinA;
    return this.impulseToDelta(PX, PY, PZ);
  }

  slipHan(v, w) {
    const { c, B } = this.basisHan(v, w);
    const sinA = this.sinTheta;
    const cosA = this.cosTheta;
    const ecB = (1 + 0.86) * (c / B);
    const mu = this.muCushion(v);
    const phi = Math.atan2(v.y, v.x);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const PX = -mu * ecB * cosPhi * cosA - ecB * cosA;
    const PY = mu * ecB * sinPhi;
    const PZ = mu * ecB * cosPhi * cosA - ecB * sinA;
    return this.impulseToDelta(PX, PY, PZ);
  }

  impulseToDelta(PX, PY, PZ) {
    const sinA = this.sinTheta;
    const cosA = this.cosTheta;
    const inertia = this.I;
    return {
      v: new THREE.Vector3(PX / this.ballMass, PY / this.ballMass, 0),
      w: new THREE.Vector3(
        (-this.ballRadius / inertia) * PY * sinA,
        (this.ballRadius / inertia) * (PX * sinA - PZ * cosA),
        (this.ballRadius / inertia) * PY * cosA
      )
    };
  }

  muCushion(v) {
    const theta = Math.atan2(Math.abs(v.y), v.x);
    return 0.471 - theta * 0.241;
  }

  restitutionCushion(v) {
    const x = v.x;
    return 0.39 + 0.257 * x - 0.044 * x * x;
  }

  resolveBallCollisions() {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < this.balls.length; i += 1) {
        const a = this.balls[i];
        if (!a || a.isPocketed) {
          continue;
        }

        for (let j = i + 1; j < this.balls.length; j += 1) {
          const b = this.balls[j];
          if (!b || b.isPocketed) {
            continue;
          }

          const delta = this._scratchA.copy(b.position).sub(a.position);
          let distance = delta.length();
          const minDistance = a.radius + b.radius;

          if (distance >= minDistance) {
            continue;
          }

          if (distance < EPSILON) {
            const relative = this._scratchB.copy(b.velocity).sub(a.velocity);
            if (relative.lengthSq() > EPSILON) {
              delta.copy(relative).normalize();
            } else {
              delta.set(1, 0, 0);
            }
            distance = EPSILON;
          }

          const normal = delta.multiplyScalar(1 / distance);
          const overlap = minDistance - distance;
          const correction = overlap * 0.5 + 1e-4;
          a.position.addScaledVector(normal, -correction);
          b.position.addScaledVector(normal, correction);

          const ab = this._scratchB.copy(normal);
          const vPoint = this._scratchC.copy(a.velocity).sub(b.velocity)
            .add(ab.clone().multiplyScalar(-this.ballRadius).cross(a.angularVelocity))
            .sub(ab.clone().multiplyScalar(this.ballRadius).cross(b.angularVelocity));
          const vRelNormalMag = ab.dot(vPoint);
          if (vRelNormalMag < 0) {
            continue;
          }
          const vRel = this._scratchD.copy(vPoint).sub(ab.clone().multiplyScalar(vRelNormalMag));
          const vRelTangentialMag = vRel.dot(new THREE.Vector3(-ab.z, 0, ab.x));
          const invMassSum = (1 / a.mass) + (1 / b.mass);
          const normalForce = -(1 + this.ballRestitution) * vRelNormalMag / invMassSum;
          const dynamicFriction = 0.01 + 0.108 * Math.exp(-1.088 * Math.abs(vRelTangentialMag));
          const friction = Math.max(this.ballFriction, dynamicFriction);
          const tangentImpulse = this.throwFactor * clamp(
            -(Math.abs(normalForce) * friction) * Math.sign(vRelTangentialMag),
            -(Math.abs(normalForce) * friction),
            Math.abs(normalForce) * friction
          );
          const impulse = this._scratchE.copy(ab).multiplyScalar(normalForce)
            .addScaledVector(new THREE.Vector3(-ab.z, 0, ab.x), tangentImpulse);

          a.velocity.addScaledVector(impulse, 1 / a.mass);
          b.velocity.addScaledVector(impulse, -1 / b.mass);
          const contactRadiusA = this._scratchF.copy(ab).multiplyScalar(a.radius);
          const contactRadiusB = ab.clone().multiplyScalar(-b.radius);
          a.angularVelocity.add(contactRadiusA.clone().cross(impulse).multiplyScalar(1 / this.I));
          b.angularVelocity.add(contactRadiusB.clone().cross(impulse.clone().multiplyScalar(-1)).multiplyScalar(1 / this.I));
          a.angularVelocity.y *= 0.985;
          b.angularVelocity.y *= 0.985;
          a.state = BallState.Sliding;
          b.state = BallState.Sliding;

          if (this.debugMode) {
            a._lastCollision = "ball";
            b._lastCollision = "ball";
          }
        }
      }
    }
  }

  resolvePockets() {
    if (!this.pocketPositions.length || this.pocketRadius <= 0) {
      return;
    }

    for (const ball of this.balls) {
      if (!ball || ball.isPocketed) {
        continue;
      }

      const speed = this.getPlanarSpeed(ball.velocity);
      for (const pocket of this.pocketPositions) {
        const delta = this._scratchA.copy(pocket).sub(ball.position);
        const distance = delta.length();
        if (distance > this.pocketRadius) {
          continue;
        }

        const movingTowardPocket = speed < this.pocketCaptureSpeed
          || (speed > EPSILON && ball.velocity.dot(delta) > 0);

        if (!movingTowardPocket) {
          continue;
        }

        ball.setPocketed(true);
        ball.velocity.set(0, 0, 0);
        ball.angularVelocity.set(0, 0, 0);
        ball.position.copy(pocket);
        ball.syncTransform();
        break;
      }
    }
  }

  surfaceVelocity(v, w, target = new THREE.Vector3()) {
    return target.set(
      v.x + this.ballRadius * w.z,
      0,
      v.z - this.ballRadius * w.x
    );
  }

  snapToRest(ball) {
    const planarSpeed = this.getPlanarSpeed(ball.velocity);
    const spinSpeed = Math.abs(ball.angularVelocity.y);
    const angularXZ = Math.hypot(ball.angularVelocity.x, ball.angularVelocity.z);
    const slipSpeed = this.getBottomSlipVector(ball, this._scratchA).length();
    const spinSnapThreshold = this.stopAngularThreshold * 3.5;

    if (planarSpeed < this.stopVelocityThreshold
      && spinSpeed < this.stopAngularThreshold
      && angularXZ < this.stopAngularThreshold
      && slipSpeed < this.stopVelocityThreshold * 0.4) {
      zeroBallMotion(ball);
      return;
    }

    if (planarSpeed < this.stopVelocityThreshold * 0.8
      && angularXZ < spinSnapThreshold
      && spinSpeed < spinSnapThreshold
      && slipSpeed < this.stopVelocityThreshold * 0.8) {
      zeroBallMotion(ball);
      return;
    }

    if (planarSpeed < this.stopVelocityThreshold * 0.5
      && angularXZ < this.stopAngularThreshold * 1.5
      && spinSpeed >= this.stopAngularThreshold) {
      ball.velocity.set(0, 0, 0);
      ball.angularVelocity.x = 0;
      ball.angularVelocity.z = 0;
      ball.state = BallState.Spinning;
    }
  }

  getBottomSlipVector(ball, target = new THREE.Vector3()) {
    return setPlanar(
      target,
      ball.velocity.x + ball.radius * ball.angularVelocity.z,
      ball.velocity.z - ball.radius * ball.angularVelocity.x
    );
  }

  getPlanarVelocity(velocity, target = new THREE.Vector3()) {
    return target.set(velocity.x, 0, velocity.z);
  }

  getPlanarSpeed(velocity) {
    return Math.hypot(velocity.x, velocity.z);
  }

  getSpinDeceleration() {
    return (5 * this.spinningFriction * this.gravity) / 2;
  }

  emitDebugLog() {
    if (!this.debugMode) {
      return;
    }

    this._frameCounter += 1;
    if (this._frameCounter - this._lastDebugLogFrame < 30) {
      return;
    }

    this._lastDebugLogFrame = this._frameCounter;
    const snapshot = this.balls.map((ball) => ({
      id: ball.id,
      state: ball.state,
      pocketed: ball.isPocketed,
      velocity: ball.velocity.toArray().map((value) => Number(value.toFixed(3))),
      angularVelocity: ball.angularVelocity.toArray().map((value) => Number(value.toFixed(3)))
    }));
    console.table(snapshot);
  }

  getDebugText() {
    return this.balls.map((ball) => {
      const velocity = ball.velocity.toArray().map((value) => value.toFixed(2)).join(", ");
      const angular = ball.angularVelocity.toArray().map((value) => value.toFixed(2)).join(", ");
      return `${ball.name || ball.id}: ${ball.state} v=[${velocity}] w=[${angular}] pocketed=${ball.isPocketed}`;
    }).join("\n");
  }
}
