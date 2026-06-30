using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace CaromGame.Pooltool
{
    public sealed class PooltoolClient : MonoBehaviour
    {
        [Header("Python")]
        [SerializeField] private string pythonExecutable = "python";
        [SerializeField] private string backendScriptRelativePath = "PythonBackend/simulate_shot.py";
        [SerializeField] private bool preferLocalPooltoolClone = true;
        [SerializeField] private float backendTimeoutSeconds = 120f;

        public async Task<PooltoolShotTrajectory> SimulateAsync(
            PooltoolShotRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            string requestJson = JsonUtility.ToJson(request);
            string responseJson = await Task.Run(
                () => ExecuteBackend(requestJson, cancellationToken),
                cancellationToken
            );

            PooltoolShotTrajectory trajectory = JsonUtility.FromJson<PooltoolShotTrajectory>(responseJson);
            if (trajectory == null)
            {
                throw new InvalidOperationException("pooltool backend returned an empty trajectory.");
            }

            return trajectory;
        }

        private string ExecuteBackend(string requestJson, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();

            string projectRoot = Directory.GetParent(Application.dataPath)?.FullName
                ?? throw new InvalidOperationException("Unable to resolve Unity project root.");

            string backendScript = Path.GetFullPath(Path.Combine(projectRoot, backendScriptRelativePath));
            if (!File.Exists(backendScript))
            {
                throw new FileNotFoundException(
                    $"Could not find pooltool backend script at '{backendScript}'.",
                    backendScript
                );
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = pythonExecutable,
                Arguments = $"\"{backendScript}\"",
                WorkingDirectory = projectRoot,
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            string pooltoolSourceRoot = ResolvePooltoolSourceRoot(projectRoot);
            if (!string.IsNullOrWhiteSpace(pooltoolSourceRoot) && Directory.Exists(pooltoolSourceRoot))
            {
                startInfo.EnvironmentVariables["POOLTOOL_SOURCE_ROOT"] = pooltoolSourceRoot;
            }

            using Process process = new Process { StartInfo = startInfo };
            if (!process.Start())
            {
                throw new InvalidOperationException("Failed to start the pooltool backend process.");
            }

            process.StandardInput.Write(requestJson);
            process.StandardInput.Close();

            if (!process.WaitForExit((int)Math.Ceiling(backendTimeoutSeconds * 1000f)))
            {
                try
                {
                    process.Kill();
                }
                catch
                {
                    // Best effort only.
                }

                throw new TimeoutException(
                    $"pooltool backend timed out after {backendTimeoutSeconds:0.##} seconds."
                );
            }

            string stdout = process.StandardOutput.ReadToEnd();
            string stderr = process.StandardError.ReadToEnd();

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"pooltool backend exited with code {process.ExitCode}.\n{stderr}"
                );
            }

            cancellationToken.ThrowIfCancellationRequested();
            return stdout.Trim();
        }

        private string ResolvePooltoolSourceRoot(string projectRoot)
        {
            if (!preferLocalPooltoolClone)
            {
                return string.Empty;
            }

            string localClone = Path.GetFullPath(Path.Combine(projectRoot, "..", "_pooltool"));
            return Directory.Exists(localClone) ? localClone : string.Empty;
        }
    }
}
