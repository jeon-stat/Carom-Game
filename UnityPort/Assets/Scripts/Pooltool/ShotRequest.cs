using System;
using System.Collections.Generic;
using UnityEngine;

namespace CaromGame.Pooltool
{
    [Serializable]
    public sealed class PooltoolShotRequest
    {
        public string shotId = Guid.NewGuid().ToString("N");
        public string cueBallId = "cue";
        public float sampleDeltaTime = 0.01f;
        public float maxSimulationTime = 12f;
        public PooltoolTableRequest table = new PooltoolTableRequest();
        public PooltoolCueRequest cue = new PooltoolCueRequest();
        public List<PooltoolBallRequest> balls = new List<PooltoolBallRequest>();
    }

    [Serializable]
    public sealed class PooltoolTableRequest
    {
        public string tableType = "pocket";
        public float length = 1.9812f;
        public float width = 0.9906f;
        public float height = 0.708f;
        public float pocketRadius = 0.062f;
    }

    [Serializable]
    public sealed class PooltoolCueRequest
    {
        public Vector3 direction = Vector3.forward;
        public float speed = 2.0f;
        public Vector2 tipOffset = Vector2.zero;
        public float elevation = 0f;
        public float cueImpulseScale = 1f;
        public float cueSpinScale = 0.55f;
        public float cueElevationLiftScale = 0.18f;
    }

    [Serializable]
    public sealed class PooltoolBallRequest
    {
        public string ballId = "cue";
        public Vector3 position = Vector3.zero;
        public Vector3 velocity = Vector3.zero;
        public Vector3 angularVelocity = Vector3.zero;
        public float radius = 0.028575f;
        public float mass = 0.170097f;
        public bool isCueBall;
    }
}
