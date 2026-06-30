using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace CaromGame.Pooltool
{
    public sealed class TrajectoryPlaybackManager : MonoBehaviour
    {
        [Serializable]
        public sealed class TableSettings
        {
            public string tableType = "pocket";
            public float length = 1.9812f;
            public float width = 0.9906f;
            public float height = 0.708f;
            public float pocketRadius = 0.062f;
            public float sampleDeltaTime = 0.01f;
            public float maxSimulationTime = 12f;
        }

        [Header("Scene")]
        [SerializeField] private bool autoDiscoverBallViews = true;
        [SerializeField] private List<PooltoolBallView> ballViews = new List<PooltoolBallView>();

        [Header("Table")]
        [SerializeField] private TableSettings table = new TableSettings();

        [Header("Playback")]
        [SerializeField] private float playbackSpeed = 1f;
        [SerializeField] private bool loopPlayback;

        public event Action<PooltoolShotTrajectory> PlaybackFinished;

        private readonly Dictionary<string, PooltoolBallView> ballViewMap = new Dictionary<string, PooltoolBallView>();
        private readonly Dictionary<string, int> sampleCursorMap = new Dictionary<string, int>();
        private PooltoolShotTrajectory activeTrajectory;
        private float playbackTime;

        public bool IsPlaying { get; private set; }

        public IReadOnlyList<PooltoolBallView> BallViews => ballViews;

        private void Awake()
        {
            RefreshBallViews();
        }

        private void OnValidate()
        {
            table.sampleDeltaTime = Mathf.Max(0.001f, table.sampleDeltaTime);
            table.maxSimulationTime = Mathf.Max(0.001f, table.maxSimulationTime);
            playbackSpeed = Mathf.Max(0.01f, playbackSpeed);
            RefreshBallViews();
        }

        private void Update()
        {
            if (!IsPlaying || activeTrajectory == null)
            {
                return;
            }

            playbackTime += Time.deltaTime * playbackSpeed;
            ApplyTrajectoryAtTime(playbackTime);

            if (playbackTime >= activeTrajectory.duration)
            {
                IsPlaying = false;
                PlaybackFinished?.Invoke(activeTrajectory);

                if (loopPlayback)
                {
                    PlayTrajectory(activeTrajectory);
                }
            }
        }

        public void RefreshBallViews()
        {
            if (autoDiscoverBallViews)
            {
                ballViews = GetComponentsInChildren<PooltoolBallView>(true).ToList();
            }

            ballViewMap.Clear();
            for (int i = 0; i < ballViews.Count; i++)
            {
                PooltoolBallView view = ballViews[i];
                if (view == null || string.IsNullOrWhiteSpace(view.BallId))
                {
                    continue;
                }

                view.LockVisualBody();
                ballViewMap[view.BallId] = view;
            }
        }

        public PooltoolShotRequest BuildShotRequest(
            string cueBallId,
            Vector3 cueDirection,
            float power,
            Vector2 tipOffset,
            float elevationDegrees)
        {
            RefreshBallViews();

            PooltoolShotRequest request = new PooltoolShotRequest
            {
                cueBallId = cueBallId,
                sampleDeltaTime = table.sampleDeltaTime,
                maxSimulationTime = table.maxSimulationTime,
                table = new PooltoolTableRequest
                {
                    tableType = table.tableType,
                    length = table.length,
                    width = table.width,
                    height = table.height,
                    pocketRadius = table.pocketRadius
                },
                cue = new PooltoolCueRequest
                {
                    direction = cueDirection,
                    speed = power,
                    tipOffset = tipOffset,
                    elevation = elevationDegrees
                }
            };

            List<PooltoolBallRequest> balls = new List<PooltoolBallRequest>(ballViews.Count);
            for (int i = 0; i < ballViews.Count; i++)
            {
                PooltoolBallView view = ballViews[i];
                if (view == null)
                {
                    continue;
                }

                balls.Add(view.ToRequest());
            }

            balls.Sort((lhs, rhs) => string.CompareOrdinal(lhs.ballId, rhs.ballId));
            request.balls = balls;
            return request;
        }

        public void PlayTrajectory(PooltoolShotTrajectory trajectory)
        {
            if (trajectory == null)
            {
                throw new ArgumentNullException(nameof(trajectory));
            }

            activeTrajectory = trajectory;
            playbackTime = 0f;
            IsPlaying = true;
            sampleCursorMap.Clear();

            ApplyTrajectoryAtTime(0f);
        }

        public void StopPlayback()
        {
            IsPlaying = false;
        }

        private void ApplyTrajectoryAtTime(float time)
        {
            if (activeTrajectory == null)
            {
                return;
            }

            for (int i = 0; i < activeTrajectory.balls.Count; i++)
            {
                PooltoolBallTrajectory ballTrajectory = activeTrajectory.balls[i];
                if (ballTrajectory == null)
                {
                    continue;
                }

                if (!ballViewMap.TryGetValue(ballTrajectory.ballId, out PooltoolBallView view) || view == null)
                {
                    continue;
                }

                PooltoolTrajectorySample sample = SampleAtTime(ballTrajectory, time);
                view.ApplySample(sample);
            }
        }

        private PooltoolTrajectorySample SampleAtTime(PooltoolBallTrajectory ballTrajectory, float time)
        {
            if (ballTrajectory.samples == null || ballTrajectory.samples.Count == 0)
            {
                return new PooltoolTrajectorySample
                {
                    time = time,
                    position = Vector3.zero,
                    rotation = Quaternion.identity,
                    motionState = "stationary",
                    pocketed = true
                };
            }

            List<PooltoolTrajectorySample> samples = ballTrajectory.samples;
            if (time <= samples[0].time)
            {
                return samples[0];
            }

            int cursor = 0;
            sampleCursorMap.TryGetValue(ballTrajectory.ballId, out cursor);
            cursor = Mathf.Clamp(cursor, 0, samples.Count - 2);

            while (cursor < samples.Count - 2 && samples[cursor + 1].time < time)
            {
                cursor++;
            }

            while (cursor > 0 && samples[cursor].time > time)
            {
                cursor--;
            }

            sampleCursorMap[ballTrajectory.ballId] = cursor;

            PooltoolTrajectorySample a = samples[cursor];
            PooltoolTrajectorySample b = samples[Math.Min(cursor + 1, samples.Count - 1)];
            if (time >= b.time || Mathf.Abs(b.time - a.time) < 1e-6f)
            {
                return b;
            }

            float alpha = Mathf.InverseLerp(a.time, b.time, time);
            return new PooltoolTrajectorySample
            {
                time = time,
                position = Vector3.LerpUnclamped(a.position, b.position, alpha),
                velocity = Vector3.LerpUnclamped(a.velocity, b.velocity, alpha),
                angularVelocity = Vector3.LerpUnclamped(a.angularVelocity, b.angularVelocity, alpha),
                rotation = Quaternion.SlerpUnclamped(a.rotation, b.rotation, alpha),
                motionState = alpha < 0.5f ? a.motionState : b.motionState,
                pocketed = a.pocketed || b.pocketed
            };
        }
    }
}
