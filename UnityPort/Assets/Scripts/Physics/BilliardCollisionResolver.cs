using System.Collections.Generic;
using UnityEngine;

namespace CaromGame.Physics
{
    public static class BilliardCollisionResolver
    {
        private const float Epsilon = 1e-6f;

        public static bool ResolveBallBall(
            BilliardBallPhysics a,
            BilliardBallPhysics b,
            in BilliardPhysicsRuntimeConfig config,
            List<PhysicsDebugContact> debugContacts)
        {
            Vector3 delta = b.Position - a.Position;
            float distance = delta.magnitude;
            float minDistance = a.Radius + b.Radius;

            if (distance >= minDistance)
            {
                return false;
            }

            Vector3 normal;
            if (distance < Epsilon)
            {
                Vector3 relativeVelocity = b.Velocity - a.Velocity;
                normal = relativeVelocity.sqrMagnitude > Epsilon ? relativeVelocity.normalized : Vector3.right;
            }
            else
            {
                normal = delta / distance;
            }

            float overlap = minDistance - Mathf.Max(distance, Epsilon);
            float correction = overlap * 0.5f + 1e-4f;
            a.Position -= normal * correction;
            b.Position += normal * correction;

            Vector3 ra = normal * a.Radius;
            Vector3 rb = -normal * b.Radius;
            Vector3 vaContact = a.Velocity + Vector3.Cross(a.AngularVelocity, ra);
            Vector3 vbContact = b.Velocity + Vector3.Cross(b.AngularVelocity, rb);
            Vector3 relative = vbContact - vaContact;

            float normalSpeed = Vector3.Dot(relative, normal);
            if (normalSpeed >= 0f)
            {
                AddDebugContact(debugContacts, (a.Position + b.Position) * 0.5f, normal, Vector3.zero, BallContactType.BallBall, Color.yellow);
                return true;
            }

            Vector3 tangentVelocity = relative - (normalSpeed * normal);
            float tangentSpeed = tangentVelocity.magnitude;
            Vector3 tangentDir = tangentSpeed > Epsilon ? tangentVelocity / tangentSpeed : Vector3.zero;

            float invMassSum = a.InverseMass + b.InverseMass;
            float normalImpulseMag = -(1f + config.BallRestitution) * normalSpeed / Mathf.Max(invMassSum, Epsilon);

            float dynamicFriction = config.BallBallFrictionA
                + config.BallBallFrictionB * Mathf.Exp(-config.BallBallFrictionC * tangentSpeed);
            float friction = Mathf.Max(config.BallBallFrictionFloor, dynamicFriction);
            float tangentImpulseLimit = Mathf.Abs(normalImpulseMag) * friction;
            float tangentImpulseMag = Mathf.Min(tangentSpeed / Mathf.Max(invMassSum, Epsilon), tangentImpulseLimit);

            Vector3 impulse = (normal * normalImpulseMag) - (tangentDir * tangentImpulseMag);

            a.ApplyImpulseAtPoint(-impulse, ra);
            b.ApplyImpulseAtPoint(impulse, rb);
            a.State = BallMotionState.Sliding;
            b.State = BallMotionState.Sliding;

            AddDebugContact(debugContacts, (a.Position + b.Position) * 0.5f, normal, impulse, BallContactType.BallBall, Color.cyan);
            return true;
        }

        public static bool ResolveCushion(
            BilliardBallPhysics ball,
            in BilliardPhysicsRuntimeConfig config,
            List<PhysicsDebugContact> debugContacts)
        {
            bool hit = false;
            hit |= ResolveWall(ball, new Vector3(1f, 0f, 0f), config.TableMinX + ball.Radius, true, config, debugContacts);
            hit |= ResolveWall(ball, new Vector3(-1f, 0f, 0f), config.TableMaxX - ball.Radius, true, config, debugContacts);
            hit |= ResolveWall(ball, new Vector3(0f, 0f, 1f), config.TableMinZ + ball.Radius, false, config, debugContacts);
            hit |= ResolveWall(ball, new Vector3(0f, 0f, -1f), config.TableMaxZ - ball.Radius, false, config, debugContacts);
            return hit;
        }

        public static bool ResolvePocket(
            BilliardBallPhysics ball,
            in BilliardPhysicsRuntimeConfig config,
            List<PhysicsDebugContact> debugContacts)
        {
            if (config.PocketRadius <= 0f || config.PocketPositions == null || config.PocketPositions.Length == 0)
            {
                return false;
            }

            float planarSpeed = new Vector2(ball.Velocity.x, ball.Velocity.z).magnitude;
            for (int i = 0; i < config.PocketPositions.Length; i++)
            {
                Vector3 pocket = config.PocketPositions[i];
                Vector3 delta = pocket - ball.Position;
                float planarDistance = new Vector2(delta.x, delta.z).magnitude;
                if (planarDistance > config.PocketRadius)
                {
                    continue;
                }

                bool movingTowardPocket = planarSpeed < config.PocketCaptureSpeed
                    || (planarSpeed > Epsilon && Vector3.Dot(ball.Velocity, delta) > 0f);
                if (!movingTowardPocket)
                {
                    continue;
                }

                ball.SetPocketed(true);
                ball.Position = pocket;
                ball.Velocity = Vector3.zero;
                ball.AngularVelocity = Vector3.zero;
                AddDebugContact(debugContacts, pocket, Vector3.up, Vector3.zero, BallContactType.Pocket, Color.magenta);
                return true;
            }

            return false;
        }

        private static bool ResolveWall(
            BilliardBallPhysics ball,
            Vector3 normal,
            float coordinate,
            bool axisX,
            in BilliardPhysicsRuntimeConfig config,
            List<PhysicsDebugContact> debugContacts)
        {
            float currentCoordinate = axisX ? ball.Position.x : ball.Position.z;
            bool lowerBoundary = axisX ? normal.x > 0f : normal.z > 0f;
            bool penetrating = lowerBoundary ? currentCoordinate < coordinate : currentCoordinate > coordinate;
            if (!penetrating)
            {
                return false;
            }

            if (axisX)
            {
                ball.Position.x = coordinate;
            }
            else
            {
                ball.Position.z = coordinate;
            }

            Vector3 contactOffset = -normal * ball.Radius;
            Vector3 contactVelocity = ball.Velocity + Vector3.Cross(ball.AngularVelocity, contactOffset);
            float normalSpeed = Vector3.Dot(contactVelocity, normal);
            if (normalSpeed >= 0f)
            {
                AddDebugContact(debugContacts, ball.Position + contactOffset, normal, Vector3.zero, BallContactType.Cushion, Color.green);
                return true;
            }

            Vector3 tangent = new Vector3(-normal.z, 0f, normal.x);
            Vector3 tangentVelocity = contactVelocity - (normalSpeed * normal);
            float tangentSpeed = tangentVelocity.magnitude;
            Vector3 tangentDir = tangentSpeed > Epsilon ? tangentVelocity / tangentSpeed : tangent;

            float normalImpulseMag = -(1f + config.CushionRestitution) * normalSpeed / Mathf.Max(ball.InverseMass, Epsilon);
            float tangentialLimit = Mathf.Abs(normalImpulseMag) * config.CushionFriction;
            float tangentialImpulseMag = Mathf.Min(tangentSpeed / Mathf.Max(ball.InverseMass, Epsilon), tangentialLimit);

            Vector3 impulse = (normal * normalImpulseMag) - (tangentDir * tangentialImpulseMag);
            ball.ApplyImpulseAtPoint(impulse, contactOffset);
            ball.State = BallMotionState.Sliding;

            AddDebugContact(debugContacts, ball.Position + contactOffset, normal, impulse, BallContactType.Cushion, Color.green);
            return true;
        }

        private static void AddDebugContact(
            List<PhysicsDebugContact> debugContacts,
            Vector3 point,
            Vector3 normal,
            Vector3 impulse,
            BallContactType type,
            Color color)
        {
            if (debugContacts == null)
            {
                return;
            }

            debugContacts.Add(new PhysicsDebugContact
            {
                Point = point,
                Normal = normal,
                Impulse = impulse,
                Color = color,
                Lifetime = 0.25f,
                Type = type
            });
        }
    }
}
