using UnityEngine;

namespace CaromGame.Pooltool
{
    [DisallowMultipleComponent]
    public sealed class PooltoolBallView : MonoBehaviour
    {
        [SerializeField] private string ballId = "cue";
        [SerializeField] private float radius = 0.028575f;
        [SerializeField] private float mass = 0.170097f;
        [SerializeField] private bool isCueBall;
        [SerializeField] private Rigidbody cachedBody;

        private Quaternion initialRotation = Quaternion.identity;

        public string BallId => ballId;
        public float Radius => radius;
        public float Mass => mass;
        public bool IsCueBall => isCueBall;
        public Rigidbody CachedBody => cachedBody;

        private void Awake()
        {
            if (cachedBody == null)
            {
                cachedBody = GetComponent<Rigidbody>();
            }

            initialRotation = transform.rotation;
            LockVisualBody();
        }

        private void OnValidate()
        {
            radius = Mathf.Max(0.001f, radius);
            mass = Mathf.Max(0.001f, mass);

            if (cachedBody == null)
            {
                cachedBody = GetComponent<Rigidbody>();
            }
        }

        public PooltoolBallRequest ToRequest()
        {
            return new PooltoolBallRequest
            {
                ballId = ballId,
                position = transform.position,
                velocity = Vector3.zero,
                angularVelocity = Vector3.zero,
                radius = radius,
                mass = mass,
                isCueBall = isCueBall
            };
        }

        public void ApplySample(PooltoolTrajectorySample sample)
        {
            if (sample == null)
            {
                return;
            }

            if (sample.pocketed)
            {
                gameObject.SetActive(false);
                return;
            }

            if (!gameObject.activeSelf)
            {
                gameObject.SetActive(true);
            }

            transform.SetPositionAndRotation(sample.position, initialRotation * sample.rotation);
        }

        public void ResetToScenePose()
        {
            if (!gameObject.activeSelf)
            {
                gameObject.SetActive(true);
            }

            transform.rotation = initialRotation;
            LockVisualBody();
        }

        public void LockVisualBody()
        {
            if (cachedBody == null)
            {
                return;
            }

            cachedBody.isKinematic = true;
            cachedBody.useGravity = false;
            cachedBody.detectCollisions = false;
        }
    }
}
