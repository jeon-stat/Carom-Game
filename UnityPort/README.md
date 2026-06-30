# Unity Carom Physics Port

This folder mirrors a Unity-friendly script layout under `Assets/Scripts/Physics`.

## Canonical files

- `Assets/Scripts/Physics/BilliardPhysicsTypes.cs`
- `Assets/Scripts/Physics/BilliardPhysicsConfig.cs`
- `Assets/Scripts/Physics/BilliardBallPhysics.cs`
- `Assets/Scripts/Physics/CueStrikeResolver.cs`
- `Assets/Scripts/Physics/BilliardCollisionResolver.cs`
- `Assets/Scripts/Physics/BilliardPhysicsManager.cs`
- `Assets/Scripts/Physics/BilliardPhysicsDebugDrawer.cs`

## What this gives us

- `BallMotionState` is separated into `Stationary`, `Sliding`, `Rolling`, `Spinning`
- all tunables live in `BilliardPhysicsConfig`
- cue strike uses impulse-based resolution
- ball-ball and ball-cushion use impulse-based collision response
- deterministic update order is preserved by sorting balls by ID
- debug contacts and trajectory prediction are available for gizmo rendering

## Pooltool comparison

The public `pooltool` repository is Apache 2.0 licensed and uses a modular event-resolution architecture.
This port borrows the architecture, not the source code.

If we later move this into a production Unity project, we should keep the Apache 2.0 notice and attribution notes alongside any direct references to pooltool-derived ideas.
