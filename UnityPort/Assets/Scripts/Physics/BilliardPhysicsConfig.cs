using System;
using UnityEngine;

namespace CaromGame.Physics
{
    [CreateAssetMenu(menuName = "Carom/Physics/Billiard Physics Config")]
    public sealed class BilliardPhysicsConfig : ScriptableObject
    {
        [Header("Ball")]
        [Min(0.001f)] public float ballRadius = 0.03275f;
        [Min(0.001f)] public float ballMass = 0.17f;
        [Min(0f)] public float gravity = 9.81f;

        [Header("Motion")]
        [Min(0f)] public float slidingFriction = 0.2f;
        [Min(0f)] public float rollingFriction = 0.015f;
        [Min(0f)] public float spinDecay = 0.02f;

        [Header("Ball-Ball")]
        [Range(0f, 1f)] public float ballRestitution = 0.95f;
        [Min(0f)] public float ballBallFrictionFloor = 0.05f;
        [Min(0f)] public float ballBallFrictionA = 0.009951f;
        [Min(0f)] public float ballBallFrictionB = 0.108f;
        [Min(0f)] public float ballBallFrictionC = 1.088f;

        [Header("Cushion")]
        [Range(0f, 1f)] public float cushionRestitution = 0.8f;
        [Min(0f)] public float cushionFriction = 0.2f;

        [Header("State Thresholds")]
        [Min(0f)] public float stopVelocityThreshold = 0.01f;
        [Min(0f)] public float stopAngularThreshold = 0.04f;
        [Min(0f)] public float slipToRollThreshold = 0.004f;
        [Min(0f)] public float pureSpinStopThreshold = 0.02f;

        [Header("Determinism")]
        [Min(1)] public int substepCount = 14;
        [Min(0.0001f)] public float fixedStep = 1f / 120f;

        [Header("Table")]
        public float tableMinX = -1.18f;
        public float tableMaxX = 1.18f;
        public float tableMinZ = -0.56f;
        public float tableMaxZ = 0.56f;
        public float tableY = 0.03275f;

        [Header("Pocket")]
        [Min(0f)] public float pocketRadius = 0f;
        [Min(0f)] public float pocketCaptureSpeed = 0.08f;
        public Vector3[] pocketPositions = Array.Empty<Vector3>();

        [Header("Cue")]
        [Min(0f)] public float cueImpulseScale = 1f;
        [Min(0f)] public float cueSpinScale = 1f;
        [Min(0f)] public float cueElevationLiftScale = 0.18f;

        [Header("Debug")]
        [Min(0f)] public float trajectoryPreviewSeconds = 1.75f;
        [Min(2)] public int trajectoryPreviewSamples = 24;
        public bool drawDebugGizmos = true;

        public BilliardPhysicsRuntimeConfig CreateRuntimeConfig()
        {
            return new BilliardPhysicsRuntimeConfig
            {
                BallRadius = ballRadius,
                BallMass = ballMass,
                Gravity = gravity,
                SlidingFriction = slidingFriction,
                RollingFriction = rollingFriction,
                SpinDecay = spinDecay,
                BallRestitution = ballRestitution,
                BallBallFrictionFloor = ballBallFrictionFloor,
                BallBallFrictionA = ballBallFrictionA,
                BallBallFrictionB = ballBallFrictionB,
                BallBallFrictionC = ballBallFrictionC,
                CushionRestitution = cushionRestitution,
                CushionFriction = cushionFriction,
                StopVelocityThreshold = stopVelocityThreshold,
                StopAngularThreshold = stopAngularThreshold,
                SlipToRollThreshold = slipToRollThreshold,
                PureSpinStopThreshold = pureSpinStopThreshold,
                SubstepCount = Math.Max(1, substepCount),
                FixedStep = fixedStep,
                TableMinX = tableMinX,
                TableMaxX = tableMaxX,
                TableMinZ = tableMinZ,
                TableMaxZ = tableMaxZ,
                TableY = tableY,
                PocketRadius = pocketRadius,
                PocketCaptureSpeed = pocketCaptureSpeed,
                PocketPositions = pocketPositions != null
                    ? (Vector3[])pocketPositions.Clone()
                    : Array.Empty<Vector3>(),
                CueImpulseScale = cueImpulseScale,
                CueSpinScale = cueSpinScale,
                CueElevationLiftScale = cueElevationLiftScale,
                TrajectoryPreviewSeconds = trajectoryPreviewSeconds,
                TrajectoryPreviewSamples = trajectoryPreviewSamples,
                DrawDebugGizmos = drawDebugGizmos
            };
        }
    }
}
