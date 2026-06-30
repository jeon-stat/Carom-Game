using System.Threading.Tasks;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace CaromGame.Pooltool
{
    public sealed class AimingController : MonoBehaviour
    {
        [SerializeField] private PooltoolClient pooltoolClient;
        [SerializeField] private TrajectoryPlaybackManager playbackManager;
        [SerializeField] private string cueBallId = "cue";

        [Header("Aim")]
        [SerializeField] private Vector3 aimDirection = Vector3.forward;
        [SerializeField] private float power = 2.0f;
        [SerializeField] private Vector2 tipOffset = Vector2.zero;
        [SerializeField] private float elevationDegrees;

        [Header("Controls")]
        [SerializeField] private KeyCode shootKey = KeyCode.Space;
        [SerializeField] private float aimRotateSpeed = 90f;
        [SerializeField] private float powerChangeSpeed = 1.5f;
        [SerializeField] private float minPower = 0.25f;
        [SerializeField] private float maxPower = 6f;

        private void Update()
        {
            if (pooltoolClient == null || playbackManager == null)
            {
                return;
            }

            if (playbackManager.IsPlaying)
            {
                return;
            }

            HandleAimingInput();

            if (Input.GetKeyDown(shootKey))
            {
                _ = FireShotAsync();
            }
        }

        private void HandleAimingInput()
        {
            float yaw = 0f;
            if (Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A))
            {
                yaw -= aimRotateSpeed * Time.deltaTime;
            }

            if (Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D))
            {
                yaw += aimRotateSpeed * Time.deltaTime;
            }

            if (Mathf.Abs(yaw) > 0f)
            {
                aimDirection = Quaternion.AngleAxis(yaw, Vector3.up) * aimDirection;
                aimDirection.y = 0f;
                if (aimDirection.sqrMagnitude < 1e-8f)
                {
                    aimDirection = Vector3.forward;
                }
                else
                {
                    aimDirection.Normalize();
                }
            }

            float powerDelta = 0f;
            if (Input.GetKey(KeyCode.UpArrow) || Input.GetKey(KeyCode.W))
            {
                powerDelta += powerChangeSpeed * Time.deltaTime;
            }

            if (Input.GetKey(KeyCode.DownArrow) || Input.GetKey(KeyCode.S))
            {
                powerDelta -= powerChangeSpeed * Time.deltaTime;
            }

            if (Mathf.Abs(powerDelta) > 0f)
            {
                power = Mathf.Clamp(power + powerDelta, minPower, maxPower);
            }
        }

        public async Task FireShotAsync()
        {
            if (playbackManager.IsPlaying)
            {
                return;
            }

            PooltoolShotRequest request = playbackManager.BuildShotRequest(
                cueBallId,
                aimDirection,
                power,
                tipOffset,
                elevationDegrees
            );

            try
            {
                PooltoolShotTrajectory trajectory = await pooltoolClient.SimulateAsync(request);
                playbackManager.PlayTrajectory(trajectory);
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"pooltool shot failed: {ex}");
            }
        }
    }
}
