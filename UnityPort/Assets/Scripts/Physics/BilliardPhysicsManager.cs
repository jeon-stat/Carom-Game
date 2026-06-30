using System;
using System.Collections.Generic;
using UnityEngine;

namespace CaromGame.Physics
{
    public sealed class BilliardPhysicsManager : MonoBehaviour
    {
        [SerializeField] private BilliardPhysicsConfig config;
        [SerializeField] private List<BilliardBallPhysics> balls = new List<BilliardBallPhysics>();
        [SerializeField] private bool autoRegisterChildren = true;

        private readonly List<PhysicsDebugContact> debugContacts = new List<PhysicsDebugContact>();
        private readonly Queue<CueStrikeCommand> pendingCueStrikes = new Queue<CueStrikeCommand>();
        private BilliardPhysicsRuntimeConfig runtime;
        private float accumulator;
        private bool runtimeDirty = true;

        public IReadOnlyList<BilliardBallPhysics> Balls => balls;
        public IReadOnlyList<PhysicsDebugContact> DebugContacts => debugContacts;
        public BilliardPhysicsRuntimeConfig Runtime => runtime;

        private void Awake()
        {
            RebuildRuntime();
            AutoRegisterBalls();
        }

        private void OnValidate()
        {
            runtimeDirty = true;
        }

        private void FixedUpdate()
        {
            if (runtimeDirty)
            {
                RebuildRuntime();
            }

            accumulator += Time.fixedDeltaTime;
            while (accumulator >= runtime.FixedStep)
            {
                Step(runtime.FixedStep);
                accumulator -= runtime.FixedStep;
            }
        }

        public void RegisterBall(BilliardBallPhysics ball)
        {
            if (ball == null || balls.Contains(ball))
            {
                return;
            }

            balls.Add(ball);
            SortBalls();
        }

        public void QueueCueStrike(CueStrikeCommand command)
        {
            pendingCueStrikes.Enqueue(command);
        }

        public void Step(float dt)
        {
            if (dt <= 0f)
            {
                return;
            }

            float subStep = dt / Math.Max(1, runtime.SubstepCount);
            for (int stepIndex = 0; stepIndex < runtime.SubstepCount; stepIndex++)
            {
                ResolvePendingCueStrikes();

                for (int i = 0; i < balls.Count; i++)
                {
                    BilliardBallPhysics ball = balls[i];
                    if (ball == null || ball.IsPocketed)
                    {
                        continue;
                    }

                    ball.UpdateMotionState(runtime);
                    IntegrateBall(ball, subStep);
                }

                for (int i = 0; i < balls.Count; i++)
                {
                    BilliardBallPhysics ball = balls[i];
                    if (ball == null || ball.IsPocketed)
                    {
                        continue;
                    }

                    BilliardCollisionResolver.ResolveCushion(ball, runtime, debugContacts);
                }

                ResolveBallBallCollisions();

                for (int i = 0; i < balls.Count; i++)
                {
                    BilliardBallPhysics ball = balls[i];
                    if (ball == null || ball.IsPocketed)
                    {
                        continue;
                    }

                    BilliardCollisionResolver.ResolvePocket(ball, runtime, debugContacts);
                }

                for (int i = 0; i < balls.Count; i++)
                {
                    BilliardBallPhysics ball = balls[i];
                    if (ball == null || ball.IsPocketed)
                    {
                        continue;
                    }

                    ball.UpdateMotionState(runtime);
                    SnapToRest(ball);
                    ball.IntegrateSpinVisual(subStep);
                    ball.SyncTransform();
                }

                DecayDebugContacts(subStep);
            }
        }

        public bool AreAllBallsStopped()
        {
            for (int i = 0; i < balls.Count; i++)
            {
                BilliardBallPhysics ball = balls[i];
                if (ball == null || ball.IsPocketed)
                {
                    continue;
                }

                if (!IsStopped(ball))
                {
                    return false;
                }
            }

            return true;
        }

        public Vector3[] PredictTrajectory(BilliardBallPhysics ball, float horizonSeconds, int sampleCount)
        {
            if (ball == null)
            {
                return Array.Empty<Vector3>();
            }

            sampleCount = Math.Max(2, sampleCount);
            float step = horizonSeconds / sampleCount;
            Vector3[] points = new Vector3[sampleCount + 1];

            PredictionState sim = PredictionState.From(ball);
            points[0] = sim.Position;
            for (int i = 1; i <= sampleCount; i++)
            {
                IntegratePrediction(ref sim, step);
                points[i] = sim.Position;
            }

            return points;
        }

        private void AutoRegisterBalls()
        {
            if (autoRegisterChildren)
            {
                balls.Clear();
                balls.AddRange(GetComponentsInChildren<BilliardBallPhysics>(true));
            }

            SortBalls();
        }

        private void RebuildRuntime()
        {
            runtime = config != null
                ? config.CreateRuntimeConfig()
                : new BilliardPhysicsRuntimeConfig
                {
                    BallRadius = 0.03275f,
                    BallMass = 0.17f,
                    Gravity = 9.81f,
                    SlidingFriction = 0.2f,
                    RollingFriction = 0.015f,
                    SpinDecay = 0.02f,
                    BallRestitution = 0.95f,
                    BallBallFrictionFloor = 0.08f,
                    BallBallFrictionA = 0.009951f,
                    BallBallFrictionB = 0.108f,
                    BallBallFrictionC = 1.088f,
                    CushionRestitution = 0.8f,
                    CushionFriction = 0.2f,
                    StopVelocityThreshold = 0.01f,
                    StopAngularThreshold = 0.04f,
                    SlipToRollThreshold = 0.004f,
                    PureSpinStopThreshold = 0.02f,
                    SubstepCount = 14,
                    FixedStep = 1f / 120f,
                    TableMinX = -1.18f,
                    TableMaxX = 1.18f,
                    TableMinZ = -0.56f,
                    TableMaxZ = 0.56f,
                    TableY = 0.03275f,
                    PocketRadius = 0f,
                    PocketCaptureSpeed = 0.08f,
                    PocketPositions = Array.Empty<Vector3>(),
                    CueImpulseScale = 1f,
                    CueSpinScale = 1f,
                    CueElevationLiftScale = 0.18f,
                    TrajectoryPreviewSeconds = 1.75f,
                    TrajectoryPreviewSamples = 24,
                    DrawDebugGizmos = true
                };

            runtimeDirty = false;
            SortBalls();
        }

        private void ResolvePendingCueStrikes()
        {
            while (pendingCueStrikes.Count > 0)
            {
                CueStrikeCommand command = pendingCueStrikes.Dequeue();
                BilliardBallPhysics ball = FindBall(command.BallId);
                if (ball == null || ball.IsPocketed)
                {
                    continue;
                }

                CueStrikeResult result = CueStrikeResolver.Resolve(ball, runtime, command);
                ball.ApplyImpulseAtPoint(result.LinearImpulse, result.ContactPoint - ball.Position);
                ball.State = BallMotionState.Sliding;

                debugContacts.Add(new PhysicsDebugContact
                {
                    Point = result.ContactPoint,
                    Normal = command.Direction.sqrMagnitude > 0f ? command.Direction.normalized : Vector3.forward,
                    Impulse = result.LinearImpulse,
                    Color = Color.red,
                    Lifetime = 0.2f,
                    Type = BallContactType.Cue
                });
            }
        }

        private void ResolveBallBallCollisions()
        {
            for (int i = 0; i < balls.Count; i++)
            {
                BilliardBallPhysics a = balls[i];
                if (a == null || a.IsPocketed)
                {
                    continue;
                }

                for (int j = i + 1; j < balls.Count; j++)
                {
                    BilliardBallPhysics b = balls[j];
                    if (b == null || b.IsPocketed)
                    {
                        continue;
                    }

                    BilliardCollisionResolver.ResolveBallBall(a, b, runtime, debugContacts);
                }
            }
        }

        private void IntegrateBall(BilliardBallPhysics ball, float dt)
        {
            switch (ball.State)
            {
                case BallMotionState.Stationary:
                    ball.Velocity = Vector3.zero;
                    ball.AngularVelocity = Vector3.zero;
                    break;
                case BallMotionState.Spinning:
                    IntegrateSpinning(ball, dt);
                    break;
                case BallMotionState.Rolling:
                    IntegrateRolling(ball, dt);
                    break;
                case BallMotionState.Sliding:
                    IntegrateSliding(ball, dt);
                    break;
            }

            ball.Position += ball.Velocity * dt;
            ball.Position.y = runtime.TableY;
        }

        private void IntegrateSpinning(BilliardBallPhysics ball, float dt)
        {
            float spinDecay = runtime.SpinDecay * runtime.Gravity * dt;
            ball.AngularVelocity.x = MoveTowards(ball.AngularVelocity.x, 0f, spinDecay * 0.75f);
            ball.AngularVelocity.z = MoveTowards(ball.AngularVelocity.z, 0f, spinDecay * 0.75f);
            ball.AngularVelocity.y = MoveTowards(ball.AngularVelocity.y, 0f, spinDecay * 1.5f);

            if (new Vector2(ball.Velocity.x, ball.Velocity.z).magnitude < runtime.StopVelocityThreshold * 0.2f
                && Mathf.Abs(ball.AngularVelocity.y) < runtime.PureSpinStopThreshold)
            {
                ball.Velocity = Vector3.zero;
                ball.AngularVelocity = Vector3.zero;
                ball.State = BallMotionState.Stationary;
            }
        }

        private void IntegrateRolling(BilliardBallPhysics ball, float dt)
        {
            Vector3 planar = new Vector3(ball.Velocity.x, 0f, ball.Velocity.z);
            float speed = planar.magnitude;

            if (speed < runtime.StopVelocityThreshold * 1.2f)
            {
                ball.Velocity = Vector3.zero;
                ball.AngularVelocity = Vector3.zero;
                ball.State = BallMotionState.Stationary;
                return;
            }

            float decel = runtime.RollingFriction * runtime.Gravity * dt;
            float newSpeed = Mathf.Max(0f, speed - decel);
            if (speed > 1e-6f)
            {
                planar *= newSpeed / speed;
                ball.Velocity.x = planar.x;
                ball.Velocity.z = planar.z;
            }

            ball.ForceRollingConstraint();
            ball.AngularVelocity.y = MoveTowards(ball.AngularVelocity.y, 0f, runtime.SpinDecay * runtime.Gravity * dt);
        }

        private void IntegrateSliding(BilliardBallPhysics ball, float dt)
        {
            Vector3 slip = ball.GetBottomSlipVector();
            float slipSpeed = slip.magnitude;

            if (slipSpeed > 1e-6f)
            {
                Vector3 slipDir = slip / slipSpeed;
                float linearStep = runtime.SlidingFriction * runtime.Gravity * dt;
                ball.Velocity -= slipDir * linearStep;
                ball.AngularVelocity.x += (runtime.SlidingFriction * runtime.Gravity / (2f * ball.Radius)) * slipDir.z * dt;
                ball.AngularVelocity.z -= (runtime.SlidingFriction * runtime.Gravity / (2f * ball.Radius)) * slipDir.x * dt;
            }

            ball.AngularVelocity.y = MoveTowards(ball.AngularVelocity.y, 0f, runtime.SpinDecay * runtime.Gravity * dt);

            float newSlip = ball.GetBottomSlipVector().magnitude;
            if (newSlip < runtime.SlipToRollThreshold)
            {
                ball.ForceRollingConstraint();
                ball.State = BallMotionState.Rolling;
            }

            if (new Vector2(ball.Velocity.x, ball.Velocity.z).magnitude < runtime.StopVelocityThreshold
                && newSlip < runtime.StopVelocityThreshold)
            {
                ball.Velocity = Vector3.zero;
                ball.AngularVelocity = Vector3.zero;
                ball.State = BallMotionState.Stationary;
            }
        }

        private void SnapToRest(BilliardBallPhysics ball)
        {
            float planarSpeed = new Vector2(ball.Velocity.x, ball.Velocity.z).magnitude;
            float spinSpeed = Mathf.Abs(ball.AngularVelocity.y);
            float angularXZ = new Vector2(ball.AngularVelocity.x, ball.AngularVelocity.z).magnitude;
            float slipSpeed = ball.GetBottomSlipVector().magnitude;

            if (planarSpeed < runtime.StopVelocityThreshold
                && spinSpeed < runtime.StopAngularThreshold
                && angularXZ < runtime.StopAngularThreshold
                && slipSpeed < runtime.SlipToRollThreshold)
            {
                ball.Velocity = Vector3.zero;
                ball.AngularVelocity = Vector3.zero;
                ball.State = BallMotionState.Stationary;
                return;
            }

            if (planarSpeed < runtime.StopVelocityThreshold * 0.75f
                && angularXZ < runtime.StopAngularThreshold * 1.5f
                && spinSpeed >= runtime.StopAngularThreshold)
            {
                ball.Velocity = Vector3.zero;
                ball.AngularVelocity.x = 0f;
                ball.AngularVelocity.z = 0f;
                ball.State = BallMotionState.Spinning;
            }
        }

        private void IntegratePrediction(ref PredictionState ball, float dt)
        {
            switch (ball.State)
            {
                case BallMotionState.Stationary:
                    ball.Velocity = Vector3.zero;
                    ball.AngularVelocity = Vector3.zero;
                    break;
                case BallMotionState.Spinning:
                    ball.AngularVelocity = DampSpin(ball.AngularVelocity, dt);
                    break;
                case BallMotionState.Rolling:
                    ball = IntegrateRollingPrediction(ball, dt);
                    break;
                case BallMotionState.Sliding:
                    ball = IntegrateSlidingPrediction(ball, dt);
                    break;
            }

            ball.Position += ball.Velocity * dt;
            ball.Position.y = runtime.TableY;

            if (ball.GetBottomSlipVector(runtime.BallRadius).magnitude < runtime.SlipToRollThreshold)
            {
                ball.ForceRollingConstraint(runtime.BallRadius);
                if (ball.State == BallMotionState.Sliding)
                {
                    ball.State = BallMotionState.Rolling;
                }
            }
        }

        private PredictionState IntegrateRollingPrediction(PredictionState ball, float dt)
        {
            Vector3 planar = new Vector3(ball.Velocity.x, 0f, ball.Velocity.z);
            float speed = planar.magnitude;
            float decel = runtime.RollingFriction * runtime.Gravity * dt;
            float newSpeed = Mathf.Max(0f, speed - decel);
            if (speed > 1e-6f)
            {
                planar *= newSpeed / speed;
                ball.Velocity.x = planar.x;
                ball.Velocity.z = planar.z;
            }

            ball.ForceRollingConstraint(runtime.BallRadius);
            ball.AngularVelocity.y = MoveTowards(ball.AngularVelocity.y, 0f, runtime.SpinDecay * runtime.Gravity * dt);
            return ball;
        }

        private PredictionState IntegrateSlidingPrediction(PredictionState ball, float dt)
        {
            Vector3 slip = ball.GetBottomSlipVector(runtime.BallRadius);
            float slipSpeed = slip.magnitude;
            if (slipSpeed > 1e-6f)
            {
                Vector3 slipDir = slip / slipSpeed;
                float linearStep = runtime.SlidingFriction * runtime.Gravity * dt;
                ball.Velocity -= slipDir * linearStep;
                ball.AngularVelocity.x += (runtime.SlidingFriction * runtime.Gravity / (2f * runtime.BallRadius)) * slipDir.z * dt;
                ball.AngularVelocity.z -= (runtime.SlidingFriction * runtime.Gravity / (2f * runtime.BallRadius)) * slipDir.x * dt;
            }

            ball.AngularVelocity.y = MoveTowards(ball.AngularVelocity.y, 0f, runtime.SpinDecay * runtime.Gravity * dt);
            if (ball.GetBottomSlipVector(runtime.BallRadius).magnitude < runtime.SlipToRollThreshold)
            {
                ball.ForceRollingConstraint(runtime.BallRadius);
                ball.State = BallMotionState.Rolling;
            }

            return ball;
        }

        private Vector3 DampSpin(Vector3 angularVelocity, float dt)
        {
            float decay = runtime.SpinDecay * runtime.Gravity * dt;
            angularVelocity.x = MoveTowards(angularVelocity.x, 0f, decay * 0.75f);
            angularVelocity.z = MoveTowards(angularVelocity.z, 0f, decay * 0.75f);
            angularVelocity.y = MoveTowards(angularVelocity.y, 0f, decay * 1.5f);
            return angularVelocity;
        }

        private void DecayDebugContacts(float dt)
        {
            for (int i = debugContacts.Count - 1; i >= 0; i--)
            {
                PhysicsDebugContact contact = debugContacts[i];
                contact.Lifetime -= dt;
                if (contact.Lifetime <= 0f)
                {
                    debugContacts.RemoveAt(i);
                }
                else
                {
                    debugContacts[i] = contact;
                }
            }
        }

        private bool IsStopped(BilliardBallPhysics ball)
        {
            float planarSpeed = new Vector2(ball.Velocity.x, ball.Velocity.z).magnitude;
            float angularSpeed = ball.AngularVelocity.magnitude;
            return planarSpeed <= runtime.StopVelocityThreshold && angularSpeed <= runtime.StopAngularThreshold;
        }

        private BilliardBallPhysics FindBall(int ballId)
        {
            for (int i = 0; i < balls.Count; i++)
            {
                if (balls[i] != null && balls[i].BallId == ballId)
                {
                    return balls[i];
                }
            }

            return null;
        }

        private void SortBalls()
        {
            balls.Sort((lhs, rhs) =>
            {
                if (lhs == null && rhs == null)
                {
                    return 0;
                }

                if (lhs == null)
                {
                    return 1;
                }

                if (rhs == null)
                {
                    return -1;
                }

                int compare = lhs.BallId.CompareTo(rhs.BallId);
                return compare != 0 ? compare : string.CompareOrdinal(lhs.BallName, rhs.BallName);
            });
        }

        private static float MoveTowards(float current, float target, float maxDelta)
        {
            if (current < target)
            {
                return Mathf.Min(current + maxDelta, target);
            }

            return Mathf.Max(current - maxDelta, target);
        }

        private struct PredictionState
        {
            public Vector3 Position;
            public Vector3 Velocity;
            public Vector3 AngularVelocity;
            public BallMotionState State;

            public static PredictionState From(BilliardBallPhysics ball)
            {
                return new PredictionState
                {
                    Position = ball.Position,
                    Velocity = ball.Velocity,
                    AngularVelocity = ball.AngularVelocity,
                    State = ball.State
                };
            }

            public Vector3 GetBottomSlipVector(float radius)
            {
                return new Vector3(
                    Velocity.x + radius * AngularVelocity.z,
                    0f,
                    Velocity.z - radius * AngularVelocity.x
                );
            }

            public void ForceRollingConstraint(float radius)
            {
                if (new Vector2(Velocity.x, Velocity.z).magnitude < 1e-5f)
                {
                    AngularVelocity.x = 0f;
                    AngularVelocity.z = 0f;
                    return;
                }

                AngularVelocity.x = Velocity.z / radius;
                AngularVelocity.z = -Velocity.x / radius;
            }
        }
    }
}
