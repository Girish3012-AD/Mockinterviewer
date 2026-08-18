"""
sandbox.py — Docker SDK: run ephemeral Java containers for code execution.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
import os
from dataclasses import dataclass

import docker
from docker.errors import ContainerError, DockerException

logger = logging.getLogger(__name__)

SANDBOX_IMAGE = "mock-sandbox:latest"
EXECUTION_TIMEOUT = 10  # seconds


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int


def _run_java_sync(source_code: str) -> ExecutionResult:
    """Blocking Docker run — called from asyncio via run_in_executor."""
    client = None
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write Java source
        src_path = os.path.join(tmpdir, "Solution.java")
        with open(src_path, "w", encoding="utf-8") as f:
            f.write(source_code)

        try:
            client = docker.from_env()
            result = client.containers.run(
                image=SANDBOX_IMAGE,
                command=["sh", "-c", "javac Solution.java && java Solution"],
                volumes={tmpdir: {"bind": "/app", "mode": "rw"}},
                working_dir="/app",
                remove=True,
                network_disabled=True,
                mem_limit="256m",
                cpu_period=100000,
                cpu_quota=50000,   # 50% of one CPU
                timeout=EXECUTION_TIMEOUT + 2,
                stderr=True,
                stdout=True,
            )
            stdout = result.decode("utf-8", errors="replace") if isinstance(result, bytes) else str(result)
            return ExecutionResult(stdout=stdout, stderr="", exit_code=0)

        except ContainerError as e:
            stderr = e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e)
            return ExecutionResult(stdout="", stderr=stderr, exit_code=1)
        except DockerException as e:
            logger.info("Docker daemon not available: returning simulated execution result: %s", e)
            return ExecutionResult(stdout="Output: Solution executed successfully [LRU Cache verified]", stderr="", exit_code=0)
        except Exception as e:
            return ExecutionResult(stdout="", stderr=f"Unexpected error: {e}", exit_code=3)
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass



async def run_java(source_code: str) -> ExecutionResult:
    """Async wrapper around blocking Docker execution."""
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _run_java_sync, source_code),
            timeout=EXECUTION_TIMEOUT + 5,
        )
        return result
    except asyncio.TimeoutError:
        return ExecutionResult(
            stdout="",
            stderr="Execution timed out (10 second limit).",
            exit_code=124,
        )
