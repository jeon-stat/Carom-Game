// Browser runtime billiards physics inspired by pooltool (Apache-2.0).
// The implementation below ports the same modeling ideas into a deterministic
// fixed-step Three.js simulation without copying the original source.

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function moveTowards(current, target, maxDelta) {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }

  return Math.max(current - maxDelta, target);
}

function zeroBallMotion(ball) {
  ball.velocity.set(0, 0, 0);
  ball.angularVelocity.set(0, 0, 0);
  ball.state = BallState.Stationary;
}

function planarSpeed(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}

function getBottomSlipVector(ball, target = new THREE.Vector3()) {
  return target.set(
    ball.velocity.x + ball.radius * ball.angularVelocity.z,
    0,
    ball.velocity.z - ball.radius * ball.angularVelocity.x
  );
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
  }

  get inverseMass() {
    return this.mass <= 0 ? 0 : 1 / this.mass;
  }

  get inverseInertia() {
    return this.mass <= 0 || this.radius <= 0
      ? 0
      : 5 / (2 * this.mass * this.radius * this.radius);
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

  applyShot(cueDirection, power, cueTipOffset, elevation = 0) {
    if (!this.manager) {
      return;
    }

    this.manager.applyShot(this, cueDirection, power, cueTipOffset, elevation);
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

  applyImpulse(impulse) {
    this.velocity.addScaledVector(impulse, this.inverseMass);
  }

  applyImpulseAtPoint(impulse, contactPointRelativeToCenter) {
    this.velocity.addScaledVector(impulse, this.inverseMass);
    this.angularVelocity.add(
      contactPointRelativeToCenter.clone().cross(impulse).multiplyScalar(this.inverseInertia)
    );
  }

  setPocketed(pocketed) {
    this.isPocketed = pocketed;
    this.visible = !pocketed;

    if (this.mesh) {
      this.mesh.visible = !pocketed;
    }
  }

  syncTransform() {
    if (!this.mesh) {
      return;
    }

    this.mesh.position.copy(this.position);
    this.mesh.visible = !this.isPocketed && this.visible;
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
    spinningFriction = 0.05,
    spinDecay = 0.02,
    ballRestitution = 0.98,
    ballBallFrictionFloor = 0.05,
    ballBallFrictionA = 0.009951,
    ballBallFrictionB = 0.108,
    ballBallFrictionC = 1.088,
    cushionRestitution = 0.8,
    cushionFriction = 0.2,
    stopVelocityThreshold = 0.01,
    stopAngularThreshold = 0.04,
    slipToRollThreshold = 0.004,
    pureSpinStopThreshold = 0.02,
    substepCount = 14,
    fixedStep = 1 / 120,
    tableMinX = -1.18,
    tableMaxX = 1.18,
    tableMinZ = -0.56,
    tableMaxZ = 0.56,
    tableY = ballRadius,
    pocketRadius = 0,
    pocketCaptureSpeed = 0.08,
    pocketPositions = [],
    cueImpulseScale = 1,
    cueSpinScale = 1,
    cueElevationLiftScale = 0.18,
    debugMode = false
  } = {}) {
    this.ballRadius = ballRadius;
    this.ballMass = ballMass;
    this.gravity = gravity;
    this.slidingFriction = slidingFriction;
    this.rollingFriction = rollingFriction;
    this.spinningFriction = spinningFriction;
    this.spinDecay = spinDecay ?? 0.02;
    this.ballRestitution = ballRestitution;
    this.ballBallFrictionFloor = ballBallFrictionFloor;
    this.ballBallFrictionA = ballBallFrictionA;
    this.ballBallFrictionB = ballBallFrictionB;
    this.ballBallFrictionC = ballBallFrictionC;
    this.cushionRestitution = cushionRestitution;
    this.cushionFriction = cushionFriction;
    this.stopVelocityThreshold = stopVelocityThreshold;
    this.stopAngularThreshold = stopAngularThreshold;
    this.slipToRollThreshold = slipToRollThreshold;
    this.pureSpinStopThreshold = pureSpinStopThreshold;
    this.substepCount = Math.max(1, Math.floor(substepCount));
    this.fixedStep = fixedStep;
    this.tableMinX = tableMinX;
    this.tableMaxX = tableMaxX;
    this.tableMinZ = tableMinZ;
    this.tableMaxZ = tableMaxZ;
    this.tableY = tableY;
    this.pocketRadius = pocketRadius;
    this.pocketCaptureSpeed = pocketCaptureSpeed;
    this.pocketPositions = pocketPositions.map(createVector3);
    this.cueImpulseScale = cueImpulseScale;
    this.cueSpinScale = cueSpinScale;
    this.cueElevationLiftScale = cueElevationLiftScale;
    this.debugMode = debugMode;
    this.accumulator = 0;
    this.debugContacts = [];
    this.balls = [];

    this._scratchA = new THREE.Vector3();
    this._scratchB = new THREE.Vector3();
    this._scratchC = new THREE.Vector3();
    this._scratchD = new THREE.Vector3();
    this._scratchE = new THREE.Vector3();
    this._scratchF = new THREE.Vector3();
    this._frameCounter = 0;
    this._lastDebugLogFrame = -1;

    this.refreshDerivedPhysics();
  }

  refreshDerivedPhysics() {
    this.inertia = (2 / 5) * this.ballMass * this.ballRadius * this.ballRadius;
    this.inverseMass = this.ballMass <= 0 ? 0 : 1 / this.ballMass;
    this.inverseInertia = this.inertia <= 0 ? 0 : 1 / this.inertia;
    this.slideAngularAccel = (5 * this.slidingFriction * this.gravity) / (2 * this.ballRadius);
    this.spinAngularDecel = this.spinDecay * this.gravity;
  }

  dampenCollisionSpin(ball) {
    if (!ball) {
      return;
    }

    ball.angularVelocity.x *= 0.97;
    ball.angularVelocity.y *= 0.9;
    ball.angularVelocity.z *= 0.97;

    const planar = planarSpeed(ball.velocity);
    const maxAngularSpeed = Math.max(24, (planar / Math.max(ball.radius, EPSILON)) * 1.75);
    const angularSpeed = ball.angularVelocity.length();
    if (angularSpeed > maxAngularSpeed) {
      ball.angularVelocity.multiplyScalar(maxAngularSpeed / angularSpeed);
    }
  }

  registerBall(ball) {
    if (!ball || this.balls.includes(ball)) {
      return ball;
    }

    ball.manager = this;
    this.balls.push(ball);
    this.balls.sort((lhs, rhs) => lhs.id - rhs.id);
    return ball;
  }

  resetBalls() {
    for (const ball of this.balls) {
      if (ball) {
        ball.reset(ball.homePosition);
      }
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

    const tip = cueTipOffset instanceof THREE.Vector2
      ? cueTipOffset.clone()
      : new THREE.Vector2(cueTipOffset?.x ?? 0, cueTipOffset?.y ?? 0);

    const right = this._scratchA.set(direction.z, 0, -direction.x);
    if (right.lengthSq() < EPSILON) {
      right.set(0, 0, 1);
    } else {
      right.normalize();
    }

    const speed = clamp(power, 0, 160 * this.ballRadius);
    const impulseMagnitude = speed * ball.mass * this.cueImpulseScale;
    const linearImpulse = direction.clone().multiplyScalar(impulseMagnitude);
    const contactOffset = direction.clone().multiplyScalar(-this.ballRadius)
      .addScaledVector(right, tip.x * this.ballRadius * this.cueSpinScale)
      .addScaledVector(UP, tip.y * this.ballRadius * this.cueSpinScale)
      .addScaledVector(UP, clamp(elevation, 0, 1) * this.ballRadius * this.cueElevationLiftScale);

    if (elevation > 0) {
      linearImpulse.addScaledVector(UP, impulseMagnitude * elevation * this.cueElevationLiftScale);
    }

    ball.velocity.set(0, 0, 0);
    ball.angularVelocity.set(0, 0, 0);
    ball.applyImpulseAtPoint(linearImpulse, contactOffset);
    this.dampenCollisionSpin(ball);
    ball.state = BallState.Sliding;
    ball.setPocketed(false);
    ball.syncTransform();

    this.recordDebugContact(
      ball.position.clone().add(contactOffset),
      contactOffset.clone().normalize(),
      linearImpulse,
      "cue",
      0xff5555
    );
  }

  step(dt) {
    if (dt <= 0) {
      return;
    }

    this.debugContacts.length = 0;
    this.accumulator = Math.min(this.accumulator + dt, this.fixedStep * this.substepCount * 8);

    while (this.accumulator >= this.fixedStep) {
      const steps = Math.max(1, this.substepCount);
      const stepDt = this.fixedStep / steps;

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
          ball.position.y = this.tableY;
          ball.velocity.y = 0;
          ball.syncTransform();
          ball.updateVisualSpin(stepDt);
        }

        this.decayDebugContacts(stepDt);
      }

      this.accumulator -= this.fixedStep;
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

    return count > 0 ? center.multiplyScalar(1 / count) : this.getCueBallPosition();
  }

  getCueBallPosition() {
    const cueBall = this.balls.find((ball) => ball && !ball.isPocketed);
    return cueBall ? cueBall.position.clone() : new THREE.Vector3();
  }

  updateState(ball) {
    const planar = planarSpeed(ball.velocity);
    const spinY = Math.abs(ball.angularVelocity.y);
    const angularXZ = Math.hypot(ball.angularVelocity.x, ball.angularVelocity.z);
    const slip = getBottomSlipVector(ball, this._scratchA).length();

    if (
      planar < this.stopVelocityThreshold
      && spinY < this.stopAngularThreshold
      && angularXZ < this.stopAngularThreshold
      && slip < this.slipToRollThreshold
    ) {
      zeroBallMotion(ball);
      return;
    }

    if (slip >= this.slipToRollThreshold) {
      ball.state = BallState.Sliding;
      return;
    }

    if (planar >= this.stopVelocityThreshold) {
      ball.state = BallState.Rolling;
      return;
    }

    if (spinY >= this.stopAngularThreshold || angularXZ >= this.stopAngularThreshold) {
      ball.state = BallState.Spinning;
      return;
    }

    ball.state = BallState.Stationary;
    zeroBallMotion(ball);
  }

  integrateBall(ball, dt) {
    switch (ball.state) {
      case BallState.Sliding:
        this.integrateSliding(ball, dt);
        break;
      case BallState.Rolling:
        this.integrateRolling(ball, dt);
        break;
      case BallState.Spinning:
        this.integrateSpinning(ball, dt);
        break;
      case BallState.Stationary:
      default:
        zeroBallMotion(ball);
        break;
    }

    ball.position.addScaledVector(ball.velocity, dt);
    ball.position.y = this.tableY;
    ball.velocity.y = 0;
  }

  integrateSliding(ball, dt) {
    const slip = getBottomSlipVector(ball, this._scratchA);
    const slipSpeed = slip.length();

    if (slipSpeed > EPSILON) {
      const slipDir = slip.multiplyScalar(1 / slipSpeed);
      const linearStep = this.slidingFriction * this.gravity * dt;
      ball.velocity.addScaledVector(slipDir, -linearStep);

      ball.angularVelocity.x += this.slideAngularAccel * slipDir.z * dt;
      ball.angularVelocity.z -= this.slideAngularAccel * slipDir.x * dt;
    }

    ball.angularVelocity.y = moveTowards(
      ball.angularVelocity.y,
      0,
      this.spinAngularDecel * dt
    );

    const newSlip = getBottomSlipVector(ball, this._scratchB).length();
    if (newSlip < this.slipToRollThreshold) {
      this.forceRoll(ball);
      ball.state = BallState.Rolling;
    }

    if (planarSpeed(ball.velocity) < this.stopVelocityThreshold
      && newSlip < this.stopVelocityThreshold) {
      zeroBallMotion(ball);
    }
  }

  integrateRolling(ball, dt) {
    const planar = this._scratchA.set(ball.velocity.x, 0, ball.velocity.z);
    const speed = planar.length();

    if (speed < this.stopVelocityThreshold * 1.2
      && Math.abs(ball.angularVelocity.y) < this.stopAngularThreshold
      && Math.hypot(ball.angularVelocity.x, ball.angularVelocity.z) < this.stopAngularThreshold) {
      zeroBallMotion(ball);
      return;
    }

    if (speed > EPSILON) {
      const decel = this.rollingFriction * this.gravity * dt;
      const newSpeed = Math.max(0, speed - decel);
      planar.multiplyScalar(newSpeed / speed);
      ball.velocity.x = planar.x;
      ball.velocity.z = planar.z;
    }

    this.forceRoll(ball);
    ball.angularVelocity.y = moveTowards(
      ball.angularVelocity.y,
      0,
      this.spinAngularDecel * dt
    );

    if (planarSpeed(ball.velocity) < this.stopVelocityThreshold * 0.25
      && Math.abs(ball.angularVelocity.y) < this.stopAngularThreshold * 0.5) {
      zeroBallMotion(ball);
    }
  }

  integrateSpinning(ball, dt) {
    const decay = this.spinAngularDecel * dt;
    ball.angularVelocity.x = moveTowards(ball.angularVelocity.x, 0, decay * 0.75);
    ball.angularVelocity.z = moveTowards(ball.angularVelocity.z, 0, decay * 0.75);
    ball.angularVelocity.y = moveTowards(ball.angularVelocity.y, 0, decay * 1.5);

    if (planarSpeed(ball.velocity) < this.stopVelocityThreshold * 0.2
      && Math.abs(ball.angularVelocity.y) < this.pureSpinStopThreshold) {
      zeroBallMotion(ball);
    }
  }

  forceRoll(ball) {
    if (planarSpeed(ball.velocity) < this.stopVelocityThreshold * 0.5) {
      ball.angularVelocity.x = 0;
      ball.angularVelocity.z = 0;
      return;
    }

    ball.angularVelocity.x = ball.velocity.z / ball.radius;
    ball.angularVelocity.z = -ball.velocity.x / ball.radius;
  }

  resolveCushions() {
    for (const ball of this.balls) {
      if (!ball || ball.isPocketed) {
        continue;
      }

      let hit = false;

      if (ball.position.x < this.tableMinX) {
        ball.position.x = this.tableMinX;
        if (ball.velocity.x < 0) {
          this.resolveCushion(ball, new THREE.Vector3(1, 0, 0));
          hit = true;
        }
      } else if (ball.position.x > this.tableMaxX) {
        ball.position.x = this.tableMaxX;
        if (ball.velocity.x > 0) {
          this.resolveCushion(ball, new THREE.Vector3(-1, 0, 0));
          hit = true;
        }
      }

      if (ball.position.z < this.tableMinZ) {
        ball.position.z = this.tableMinZ;
        if (ball.velocity.z < 0) {
          this.resolveCushion(ball, new THREE.Vector3(0, 0, 1));
          hit = true;
        }
      } else if (ball.position.z > this.tableMaxZ) {
        ball.position.z = this.tableMaxZ;
        if (ball.velocity.z > 0) {
          this.resolveCushion(ball, new THREE.Vector3(0, 0, -1));
          hit = true;
        }
      }

      if (hit) {
        ball.lastCushionTime = typeof performance !== "undefined" ? performance.now() : Date.now();
      }
    }
  }

  resolveCushion(ball, normal) {
    const n = normal.clone().normalize();
    const t = this._scratchA.set(-n.z, 0, n.x);
    const contactOffset = this._scratchB.copy(n).multiplyScalar(-ball.radius);
    const contactVelocity = this._scratchC.copy(ball.velocity)
      .add(this._scratchD.copy(ball.angularVelocity).cross(contactOffset));
    const vn = contactVelocity.dot(n);

    if (vn >= 0) {
      return;
    }

    const vt = contactVelocity.dot(t);
    const normalImpulseMag = -(1 + this.cushionRestitution) * vn * ball.mass;
    const desiredTangentialImpulse = -(2 / 7) * ball.mass * vt;
    const tangentialLimit = Math.abs(normalImpulseMag) * this.cushionFriction;
    const tangentialImpulseMag = clamp(
      desiredTangentialImpulse,
      -tangentialLimit,
      tangentialLimit
    );

    const impulse = this._scratchE.copy(n).multiplyScalar(normalImpulseMag)
      .addScaledVector(t, tangentialImpulseMag);

    ball.applyImpulseAtPoint(impulse, contactOffset);
    ball.state = BallState.Sliding;
    this.recordDebugContact(ball.position.clone().add(contactOffset), n, impulse, "cushion", 0x66ff66);
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

          const normal = this._scratchB;
          if (distance < EPSILON) {
            const relativeVelocity = this._scratchC.copy(b.velocity).sub(a.velocity);
            if (relativeVelocity.lengthSq() > EPSILON) {
              normal.copy(relativeVelocity).normalize();
            } else {
              normal.set(1, 0, 0);
            }
          } else {
            normal.copy(delta).divideScalar(distance);
          }

          if (distance < EPSILON) {
            distance = EPSILON;
          }

          const overlap = minDistance - distance;
          const correction = overlap * 0.5 + 1e-4;
          a.position.addScaledVector(normal, -correction);
          b.position.addScaledVector(normal, correction);

          const ra = this._scratchD.copy(normal).multiplyScalar(a.radius);
          const rb = this._scratchE.copy(normal).multiplyScalar(-b.radius);
          const vaContact = this._scratchF.copy(a.velocity)
            .add(this._scratchC.copy(a.angularVelocity).cross(ra));
          const vbContact = this._scratchC.copy(b.velocity)
            .add(this._scratchA.copy(b.angularVelocity).cross(rb));
          const relative = vbContact.sub(vaContact);
          const vn = relative.dot(normal);

          if (vn >= 0) {
            continue;
          }

          const tangentVelocity = this._scratchB.copy(relative).sub(this._scratchD.copy(normal).multiplyScalar(vn));
          const tangentSpeed = tangentVelocity.length();
          const tangent = tangentSpeed > EPSILON
            ? tangentVelocity.multiplyScalar(1 / tangentSpeed)
            : this._scratchD.set(-normal.z, 0, normal.x);

          const invMassSum = a.inverseMass + b.inverseMass;
          const normalImpulseMag = -(1 + this.ballRestitution) * vn / Math.max(invMassSum, EPSILON);

          const effectiveTangentInvMass = invMassSum
            + (a.radius * a.radius * a.inverseInertia)
            + (b.radius * b.radius * b.inverseInertia);
          const desiredTangentialImpulse = tangentSpeed > EPSILON
            ? -tangentSpeed / Math.max(effectiveTangentInvMass, EPSILON)
            : 0;
          const dynamicFriction = this.ballBallFrictionA
            + this.ballBallFrictionB * Math.exp(-this.ballBallFrictionC * tangentSpeed);
          const friction = Math.max(this.ballBallFrictionFloor, dynamicFriction);
          const tangentialLimit = Math.abs(normalImpulseMag) * friction;
          const tangentialImpulseMag = clamp(
            desiredTangentialImpulse,
            -tangentialLimit,
            tangentialLimit
          );

          const impulse = this._scratchE.copy(normal).multiplyScalar(normalImpulseMag)
            .addScaledVector(tangent, tangentialImpulseMag);

          a.applyImpulseAtPoint(impulse.clone().multiplyScalar(-1), ra);
          b.applyImpulseAtPoint(impulse, rb);
          a.state = BallState.Sliding;
          b.state = BallState.Sliding;
          this.dampenCollisionSpin(a);
          this.dampenCollisionSpin(b);

          this.recordDebugContact(
            a.position.clone().add(b.position).multiplyScalar(0.5),
            normal,
            impulse,
            "ball",
            0x66ccff
          );
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

      const speed = planarSpeed(ball.velocity);
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
        ball.position.copy(pocket);
        ball.velocity.set(0, 0, 0);
        ball.angularVelocity.set(0, 0, 0);
        ball.syncTransform();
        this.recordDebugContact(pocket.clone(), UP, new THREE.Vector3(), "pocket", 0xff66ff);
        break;
      }
    }
  }

  snapToRest(ball) {
    const planar = planarSpeed(ball.velocity);
    const spinY = Math.abs(ball.angularVelocity.y);
    const angularXZ = Math.hypot(ball.angularVelocity.x, ball.angularVelocity.z);
    const slip = getBottomSlipVector(ball, this._scratchA).length();

    if (planar < this.stopVelocityThreshold
      && spinY < this.stopAngularThreshold
      && angularXZ < this.stopAngularThreshold
      && slip < this.slipToRollThreshold) {
      zeroBallMotion(ball);
      return;
    }

    if (
      planar < this.stopVelocityThreshold * 0.75
      && angularXZ < this.stopAngularThreshold * 1.5
      && spinY >= this.stopAngularThreshold
    ) {
      ball.velocity.set(0, 0, 0);
      ball.angularVelocity.x = 0;
      ball.angularVelocity.z = 0;
      ball.state = BallState.Spinning;
    }
  }

  getBottomSlipVector(ball, target = new THREE.Vector3()) {
    return getBottomSlipVector(ball, target);
  }

  getPlanarVelocity(velocity, target = new THREE.Vector3()) {
    return target.set(velocity.x, 0, velocity.z);
  }

  getPlanarSpeed(velocity) {
    return planarSpeed(velocity);
  }

  getSpinDeceleration() {
    return this.spinAngularDecel;
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
    console.table(this.balls.map((ball) => ({
      id: ball.id,
      state: ball.state,
      pocketed: ball.isPocketed,
      velocity: ball.velocity.toArray().map((value) => Number(value.toFixed(3))),
      angularVelocity: ball.angularVelocity.toArray().map((value) => Number(value.toFixed(3)))
    })));
  }

  getDebugText() {
    return this.balls.map((ball) => {
      const velocity = ball.velocity.toArray().map((value) => value.toFixed(2)).join(", ");
      const angular = ball.angularVelocity.toArray().map((value) => value.toFixed(2)).join(", ");
      return `${ball.name || ball.id}: ${ball.state} v=[${velocity}] w=[${angular}] pocketed=${ball.isPocketed}`;
    }).join("\n");
  }

  recordDebugContact(point, normal, impulse, type, color) {
    this.debugContacts.push({
      point: point.clone ? point.clone() : createVector3(point),
      normal: normal.clone ? normal.clone() : createVector3(normal),
      impulse: impulse.clone ? impulse.clone() : createVector3(impulse),
      type,
      color,
      lifetime: 0.25
    });
  }

  decayDebugContacts(dt) {
    for (let i = this.debugContacts.length - 1; i >= 0; i -= 1) {
      const contact = this.debugContacts[i];
      contact.lifetime -= dt;
      if (contact.lifetime <= 0) {
        this.debugContacts.splice(i, 1);
      }
    }
  }
}
