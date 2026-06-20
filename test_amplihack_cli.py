from __future__ import annotations

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock
from unittest.mock import patch

import amplihack_cli


FULL_SHA = "0123456789abcdef0123456789abcdef01234567"


class AmplihackCliTests(unittest.TestCase):
    def test_install_uses_ignore_scripts_and_vitest_uses_locked_local_exec(self) -> None:
        commands: list[tuple[list[str], Path, dict[str, str] | None]] = []
        tools: list[str] = []
        repo = Path("/repo")

        def fake_run(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
            commands.append((command, cwd, env))

        with (
            mock.patch.object(amplihack_cli, "ensure_checkout", return_value=repo),
            mock.patch.object(amplihack_cli, "ensure_tool", side_effect=tools.append),
            mock.patch.object(amplihack_cli, "run", side_effect=fake_run),
            mock.patch.dict(os.environ, {"NODE_OPTIONS": "--trace-warnings"}, clear=True),
        ):
            result = amplihack_cli.main(["a3p-statement-simple"])

        self.assertEqual(result, 0)
        self.assertEqual(tools, ["npm"])
        self.assertEqual(
            commands[0],
            (["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], repo, None),
        )
        self.assertEqual(commands[1][0][:5], ["npm", "exec", "--no", "--", "vitest"])
        self.assertEqual(commands[1][0][5:8], ["run", "test/a3p-writer.test.ts", "-t"])
        self.assertIn("keeps writer", commands[1][0][8])
        self.assertEqual(commands[1][1], repo)
        self.assertEqual(commands[1][2]["NODE_OPTIONS"], "--max-old-space-size=32768 --trace-warnings")

    def test_no_install_requires_existing_node_modules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)

            with (
                mock.patch.object(amplihack_cli, "ensure_checkout", return_value=repo),
                mock.patch.object(amplihack_cli, "ensure_tool"),
                mock.patch.object(amplihack_cli, "run") as run,
            ):
                with self.assertRaisesRegex(SystemExit, "cached node_modules does not exist"):
                    amplihack_cli.main(["a3p-statement-simple", "--no-install"])

        run.assert_not_called()


class ResolveCheckoutRevisionTests(unittest.TestCase):
    def test_uses_full_commit_sha_as_immutable_revision(self) -> None:
        revision, commit = amplihack_cli.resolve_checkout_revision(
            "https://example.invalid/repo.git",
            {"commit_id": FULL_SHA, "requested_revision": "main"},
        )

        self.assertEqual(revision, FULL_SHA)
        self.assertEqual(commit, FULL_SHA)

    def test_rejects_missing_commit_id_by_default(self) -> None:
        with patch.dict(os.environ, {amplihack_cli.UNSAFE_MUTABLE_CHECKOUT_ENV: ""}):
            with self.assertRaises(SystemExit) as caught:
                amplihack_cli.resolve_checkout_revision(
                    "https://example.invalid/repo.git",
                    {"requested_revision": "main"},
                )

        self.assertIn("Refusing to checkout", str(caught.exception))
        self.assertIn("immutable commit_id", str(caught.exception))

    def test_rejects_non_full_commit_id(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            amplihack_cli.resolve_checkout_revision(
                "https://example.invalid/repo.git",
                {"commit_id": "abc123", "requested_revision": "main"},
            )

        self.assertIn("not a full immutable commit SHA", str(caught.exception))

    def test_explicit_flag_allows_mutable_revision_with_warning(self) -> None:
        stderr = io.StringIO()

        with redirect_stderr(stderr):
            revision, commit = amplihack_cli.resolve_checkout_revision(
                "https://example.invalid/repo.git",
                {"requested_revision": "main"},
                allow_mutable_checkout=True,
            )

        self.assertEqual(revision, "main")
        self.assertIsNone(commit)
        self.assertIn("WARNING: unsafe mutable checkout enabled", stderr.getvalue())
        self.assertIn("changed upstream code", stderr.getvalue())

    def test_env_allows_mutable_revision_with_warning(self) -> None:
        stderr = io.StringIO()

        with patch.dict(os.environ, {amplihack_cli.UNSAFE_MUTABLE_CHECKOUT_ENV: "1"}):
            with redirect_stderr(stderr):
                revision, commit = amplihack_cli.resolve_checkout_revision(
                    "https://example.invalid/repo.git",
                    {"requested_revision": "release"},
                )

        self.assertEqual(revision, "release")
        self.assertIsNone(commit)
        self.assertIn("WARNING: unsafe mutable checkout enabled", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
