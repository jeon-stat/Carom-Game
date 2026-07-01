using UnityEngine;

namespace CaromGame.Physics
{
    public static class CueStrikeResolver
    {
        public static CueStrikeResult Resolve(
            BilliardBallPhysics ball,
            in BilliardPhysicsRuntimeConfig config,
            in CueStrikeCommand command)
        {
            Vector3 direction = command.Direction;
            direction.y = 0f;
            if (direction.sqrMagnitude < 1e-8f)
            {
                direction = Vector3.forward;
            }
            direction.Normalize();

            Vector3 right = Vector3.Cross(Vector3.up, direction);
            if (right.sqrMagnitude < 1e-8f)
            {
                right = Vector3.right;
            }
            else
            {
                right.Normalize();
            }

            float speed = Mathf.Max(0f, command.Speed);
            float impulseMagnitude = speed * ball.Mass * config.CueImpulseScale;
            Vector3 linearImpulse = direction * impulseMagnitude;

            Vector3 contactOffset = (-direction * ball.Radius)
                + (right * (-command.TipOffset.x * ball.Radius * config.CueSpinScale))
                + (Vector3.up * (command.TipOffset.y * ball.Radius * config.CueSpinScale))
                + (Vector3.up * (command.Elevation * ball.Radius * config.CueElevationLiftScale));

            linearImpulse += Vector3.up * (command.Elevation * impulseMagnitude * config.CueElevationLiftScale);
            Vector3 angularImpulse = Vector3.Cross(contactOffset, linearImpulse) * ball.InverseInertia;
            angularImpulse.y *= -1f;

            return new CueStrikeResult
            {
                LinearImpulse = linearImpulse,
                AngularImpulse = angularImpulse,
                ContactPoint = ball.Position + contactOffset
            };
        }
    }
}
