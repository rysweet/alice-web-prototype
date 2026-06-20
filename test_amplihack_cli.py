import io
import os
import unittest
from contextlib import redirect_stderr
from unittest.mock import patch

import amplihack_cli


FULL_SHA = "0123456789abcdef0123456789abcdef01234567"


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
