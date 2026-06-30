using System;
using System.Collections.Generic;
using UnityEngine;

namespace CaromGame.Pooltool
{
    [Serializable]
    public sealed class PooltoolShotTrajectory
    {
        public string shotId = string.Empty;
        public float sampleDeltaTime;
        public float duration;
        public string backend = "pooltool";
        public List<PooltoolBallTrajectory> balls = new List<PooltoolBallTrajectory>();

        public PooltoolBallTrajectory FindBall(string ballId)
        {
            for (int i = 0; i < balls.Count; i++)
            {
                if (balls[i] != null && balls[i].ballId == ballId)
                {
                    return balls[i];
                }
            }

            return null;
        }
    }

    [Serializable]
    public sealed class PooltoolBallTrajectory
    {
        public string ballId = string.Empty;
        public float radius;
        public float mass;
        public List<PooltoolTrajectorySample> samples = new List<PooltoolTrajectorySample>();
    }

    [Serializable]
    public sealed class PooltoolTrajectorySample
    {
        public float time;
        public Vector3 position = Vector3.zero;
        public Vector3 velocity = Vector3.zero;
        public Vector3 angularVelocity = Vector3.zero;
        public Quaternion rotation = Quaternion.identity;
        public string motionState = "stationary";
        public bool pocketed;
    }
}
