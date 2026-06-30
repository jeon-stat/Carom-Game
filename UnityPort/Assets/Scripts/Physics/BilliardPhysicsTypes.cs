using System;
using UnityEngine;

namespace CaromGame.Physics
{
    public enum BallMotionState
    {
        Stationary = 0,
        Sliding = 1,
        Rolling = 2,
        Spinning = 3
    }

    public enum BallContactType
    {
        Cue,
        BallBall,
        Cushion,
        Pocket
    }

    [Serializable]
    public struct PhysicsDebugContact
    {
        public Vector3 Point;
        public Vector3 Normal;
        public Vector3 Impulse;
        public Color Color;
        public float Lifetime;
        public BallContactType Type;
    }

    [Serializable]
    public struct CueStrikeCommand
    {
        public int BallId;
        public Vector3 Direction;
        public float Speed;
        public Vector2 TipOffset;
        public float Elevation;
    }

    [Serializable]
    public struct CueStrikeResult
    {
        public Vector3 LinearImpulse;
        public Vector3 AngularImpulse;
        public Vector3 ContactPoint;
    }

    [Serializable]
    public struct BilliardPhysicsRuntimeConfig
    {
        public float BallRadius;
        public float BallMass;
        public float Gravity;
        public float SlidingFriction;
        public float RollingFriction;
        public float SpinDecay;
        public float BallRestitution;
        public float BallBallFrictionFloor;
        public float BallBallFrictionA;
        public float BallBallFrictionB;
        public float BallBallFrictionC;
        public float CushionRestitution;
        public float CushionFriction;
        public float StopVelocityThreshold;
        public float StopAngularThreshold;
        public float SlipToRollThreshold;
        public float PureSpinStopThreshold;
        public int SubstepCount;
        public float FixedStep;
        public float TableMinX;
        public float TableMaxX;
        public float TableMinZ;
        public float TableMaxZ;
        public float TableY;
        public float PocketRadius;
        public float PocketCaptureSpeed;
        public Vector3[] PocketPositions;
        public float CueImpulseScale;
        public float CueSpinScale;
        public float CueElevationLiftScale;
        public float TrajectoryPreviewSeconds;
        public int TrajectoryPreviewSamples;
        public bool DrawDebugGizmos;

        public float InverseBallMass => BallMass <= 0f ? 0f : 1f / BallMass;
        public float InverseInertia =>
            BallMass <= 0f || BallRadius <= 0f ? 0f : 5f / (2f * BallMass * BallRadius * BallRadius);
    }
}
