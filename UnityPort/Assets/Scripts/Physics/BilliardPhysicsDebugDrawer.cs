using System.Collections.Generic;
using UnityEngine;

namespace CaromGame.Physics
{
    public sealed class BilliardPhysicsDebugDrawer : MonoBehaviour
    {
        [SerializeField] private BilliardPhysicsManager manager;
        [SerializeField] private Color velocityColor = Color.green;
        [SerializeField] private Color angularColor = new Color(1f, 0.5f, 0.1f);
        [SerializeField] private Color trajectoryColor = Color.cyan;
        [SerializeField] private float velocityScale = 0.08f;
        [SerializeField] private float angularScale = 0.03f;

        private void OnDrawGizmos()
        {
            if (manager == null || manager.Runtime.DrawDebugGizmos == false)
            {
                return;
            }

            IReadOnlyList<BilliardBallPhysics> balls = manager.Balls;
            for (int i = 0; i < balls.Count; i++)
            {
                BilliardBallPhysics ball = balls[i];
                if (ball == null || ball.IsPocketed)
                {
                    continue;
                }

                Gizmos.color = velocityColor;
                Gizmos.DrawLine(ball.Position, ball.Position + ball.Velocity * velocityScale);

                Gizmos.color = angularColor;
                Vector3 angularAxis = ball.AngularVelocity.sqrMagnitude > 1e-6f
                    ? ball.AngularVelocity.normalized
                    : Vector3.up;
                Gizmos.DrawLine(
                    ball.Position + Vector3.up * ball.Radius * 0.25f,
                    ball.Position + Vector3.up * ball.Radius * 0.25f + angularAxis * (ball.AngularVelocity.magnitude * angularScale)
                );

                Gizmos.color = trajectoryColor;
                Vector3[] points = manager.PredictTrajectory(
                    ball,
                    manager.Runtime.TrajectoryPreviewSeconds,
                    manager.Runtime.TrajectoryPreviewSamples
                );
                for (int p = 1; p < points.Length; p++)
                {
                    Gizmos.DrawLine(points[p - 1], points[p]);
                }
            }

            IReadOnlyList<PhysicsDebugContact> contacts = manager.DebugContacts;
            for (int i = 0; i < contacts.Count; i++)
            {
                PhysicsDebugContact contact = contacts[i];
                Gizmos.color = contact.Color;
                Gizmos.DrawSphere(contact.Point, 0.01f);
                Gizmos.DrawLine(contact.Point, contact.Point + contact.Normal * 0.08f);
            }
        }
    }
}
