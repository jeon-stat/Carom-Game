using System;
using UnityEngine;

namespace CaromGame.Physics
{
    [DisallowMultipleComponent]
    public sealed class BilliardBallPhysics : MonoBehaviour
    {
        [SerializeField] private int ballId;
        [SerializeField] private string ballName = "ball";
        [SerializeField] private float radius = 0.03275f;
        [SerializeField] private float mass = 0.17f;

        public int BallId => ballId;
        public string BallName => ballName;
        public float Radius => radius;
        public float Mass => mass;

        public Vector3 Position { get; set; }
        public Vector3 Velocity { get; set; }
        public Vector3 AngularVelocity { get; set; }
        public BallMotionState State { get; set; }
        public bool IsPocketed { get; private set; }

        private Renderer[] renderersCache = Array.Empty<Renderer>();
        private Quaternion initialRotation = Quaternion.identity;
        private Quaternion spinRotation = Quaternion.identity;

        public float InverseMass => mass <= 0f ? 0f : 1f / mass;
        public float InverseInertia =>
            mass <= 0f || radius <= 0f ? 0f : 5f / (2f * mass * radius * radius);

        private void Awake()
        {
            CacheVisuals();
            Position = transform.position;
            initialRotation = transform.rotation;
            SyncTransform();
        }

        private void OnValidate()
        {
            radius = Mathf.Max(0.001f, radius);
            mass = Mathf.Max(0.001f, mass);
        }

        public void Configure(int id, string name, float ballRadius, float ballMass, Vector3 homePosition)
        {
            ballId = id;
            ballName = name;
            radius = ballRadius;
            mass = ballMass;
            ResetBall(homePosition);
        }

        public void ResetBall(Vector3 position)
        {
            IsPocketed = false;
            Position = position;
            Velocity = Vector3.zero;
            AngularVelocity = Vector3.zero;
            State = BallMotionState.Stationary;
            spinRotation = Quaternion.identity;
            SetRenderersVisible(true);
            SyncTransform();
        }

        public void SetPocketed(bool pocketed)
        {
            IsPocketed = pocketed;
            if (pocketed)
            {
                Velocity = Vector3.zero;
                AngularVelocity = Vector3.zero;
                State = BallMotionState.Stationary;
            }

            SetRenderersVisible(!pocketed);
        }

        public void ApplyImpulse(Vector3 impulse)
        {
            Velocity += impulse * InverseMass;
        }

        public void ApplyImpulseAtPoint(Vector3 impulse, Vector3 contactPointRelativeToCenter)
        {
            Velocity += impulse * InverseMass;
            AngularVelocity += Vector3.Cross(contactPointRelativeToCenter, impulse) * InverseInertia;
        }

        public void UpdateMotionState(in BilliardPhysicsRuntimeConfig config)
        {
            if (IsPocketed)
            {
                State = BallMotionState.Stationary;
                return;
            }

            float planarSpeed = new Vector2(Velocity.x, Velocity.z).magnitude;
            Vector3 slip = GetBottomSlipVector();
            float slipSpeed = slip.magnitude;
            float spinSpeed = Mathf.Abs(AngularVelocity.y);

            if (planarSpeed < config.StopVelocityThreshold
                && spinSpeed < config.StopAngularThreshold
                && slipSpeed < config.SlipToRollThreshold)
            {
                Velocity = Vector3.zero;
                AngularVelocity = Vector3.zero;
                State = BallMotionState.Stationary;
                return;
            }

            if (slipSpeed >= config.SlipToRollThreshold)
            {
                State = BallMotionState.Sliding;
                return;
            }

            if (planarSpeed >= config.StopVelocityThreshold)
            {
                State = BallMotionState.Rolling;
                return;
            }

            State = spinSpeed >= config.StopAngularThreshold ? BallMotionState.Spinning : BallMotionState.Stationary;
            if (State == BallMotionState.Stationary)
            {
                Velocity = Vector3.zero;
                AngularVelocity = Vector3.zero;
            }
        }

        public Vector3 GetBottomSlipVector()
        {
            return new Vector3(
                Velocity.x + radius * AngularVelocity.z,
                0f,
                Velocity.z - radius * AngularVelocity.x
            );
        }

        public void ForceRollingConstraint()
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

        public void IntegrateSpinVisual(float dt)
        {
            float angularSpeed = AngularVelocity.magnitude;
            if (angularSpeed < 1e-6f)
            {
                return;
            }

            Vector3 axis = AngularVelocity / angularSpeed;
            spinRotation = Quaternion.AngleAxis(angularSpeed * Mathf.Rad2Deg * dt, axis) * spinRotation;
        }

        public void SyncTransform()
        {
            if (IsPocketed)
            {
                return;
            }

            transform.SetPositionAndRotation(Position, initialRotation * spinRotation);
        }

        private void CacheVisuals()
        {
            renderersCache = GetComponentsInChildren<Renderer>(true);
        }

        private void SetRenderersVisible(bool visible)
        {
            if (renderersCache == null)
            {
                return;
            }

            for (int i = 0; i < renderersCache.Length; i++)
            {
                if (renderersCache[i] != null)
                {
                    renderersCache[i].enabled = visible;
                }
            }
        }
    }
}
