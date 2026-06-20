from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from importlib.metadata import PackageNotFoundError, distribution
from pathlib import Path


DIST_NAME = "lookingglass-amplihack"
DEFAULT_REPO_URL = "https://github.com/rysweet/alice-web-prototype.git"
NODE_HEAP_OPTION = "--max-old-space-size=32768"
LOOKINGGLASS_SOURCE_ENV = "LOOKINGGLASS_SOURCE"
LEGACY_SOURCE_ENV = "ALICE_WEB_SOURCE"
LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT_ENV = "LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT"
LEGACY_ALLOW_MUTABLE_CHECKOUT_ENV = "ALICE_WEB_ALLOW_MUTABLE_CHECKOUT"
COMMIT_SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")

SCENARIOS = {
    "a3p-statement-simple": {
        "description": "A3P parser/writer statement inventory contract",
        "pattern": (
            "keeps parser-recognized statement kinds explicit|"
            "keeps writer round-trip coverage cases in exact parity with SUPPORTED_A3P_STATEMENT_KINDS"
        ),
    },
    "a3p-statement-integration": {
        "description": "A3P statement round-trip, lowering, and fail-loud coverage",
        "pattern": (
            "round-trips writer-supported|"
            "lowers VariableAssignment statements|"
            "lowers EventListener statements|"
            "rejects TS-only ForEach statements|"
            "throws instead of dropping unsupported statement kinds"
        ),
    },
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="amplihack",
        description="Run LookingGlass outside-in validation scenarios from a uvx-installed branch.",
    )
    parser.add_argument("command", choices=sorted(SCENARIOS))
    parser.add_argument(
        "--no-install",
        action="store_true",
        help="Skip npm ci when node_modules already exists in the cached checkout.",
    )
    parser.add_argument(
        "--allow-mutable-checkout",
        action="store_true",
        help=(
            "Unsafe: allow fallback to a requested branch/tag when the installation metadata "
            f"does not include an immutable commit SHA. {LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT_ENV}=1 "
            f"also enables this; {LEGACY_ALLOW_MUTABLE_CHECKOUT_ENV}=1 remains a compatibility alias."
        ),
    )
    args = parser.parse_args(argv)

    scenario = SCENARIOS[args.command]
    repo = ensure_checkout(allow_mutable_checkout=args.allow_mutable_checkout)
    ensure_tool("npm")

    print(f"Scenario: {scenario['description']}", flush=True)
    print(f"Checkout: {repo}", flush=True)

    if not args.no_install:
        run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], cwd=repo)
    elif not (repo / "node_modules").exists():
        raise SystemExit("--no-install was used, but cached node_modules does not exist")

    env = os.environ.copy()
    env["NODE_OPTIONS"] = merge_node_options(env.get("NODE_OPTIONS"))
    command = [
        "npm",
        "exec",
        "--no",
        "--",
        "vitest",
        "run",
        "test/a3p-writer.test.ts",
        "-t",
        scenario["pattern"],
    ]
    print(f"Command: NODE_OPTIONS={env['NODE_OPTIONS']} {' '.join(command)}", flush=True)
    run(command, cwd=repo, env=env)
    return 0


def ensure_checkout(allow_mutable_checkout: bool = False) -> Path:
    source_override = os.environ.get(LOOKINGGLASS_SOURCE_ENV) or os.environ.get(LEGACY_SOURCE_ENV)
    if source_override:
        repo = Path(source_override).expanduser().resolve()
        validate_repo(repo)
        return repo

    source_repo = Path(__file__).resolve().parent
    if (source_repo / "package.json").exists():
        return source_repo

    direct_url = read_direct_url()
    repo_url = direct_url.get("url") or DEFAULT_REPO_URL
    vcs_info = direct_url.get("vcs_info") or {}
    revision, commit = resolve_checkout_revision(repo_url, vcs_info, allow_mutable_checkout)

    cache_dir = cache_root() / safe_cache_name(repo_url, revision)
    if not (cache_dir / "package.json").exists():
        clone_checkout(repo_url, revision, commit, cache_dir)

    validate_repo(cache_dir)
    return cache_dir


def read_direct_url() -> dict[str, object]:
    try:
        text = distribution(DIST_NAME).read_text("direct_url.json")
    except PackageNotFoundError:
        text = None
    if not text:
        return {"url": DEFAULT_REPO_URL, "vcs_info": {"requested_revision": "main"}}
    return json.loads(text)


def resolve_checkout_revision(
    repo_url: object,
    vcs_info: object,
    allow_mutable_checkout: bool = False,
) -> tuple[str, str | None]:
    if not isinstance(vcs_info, dict):
        vcs_info = {}

    commit = string_value(vcs_info.get("commit_id"))
    if commit:
        if not COMMIT_SHA_RE.fullmatch(commit):
            raise SystemExit(
                "Refusing to checkout LookingGlass because direct_url.json commit_id "
                "is not a full immutable commit SHA."
            )
        return commit, commit

    requested_revision = string_value(vcs_info.get("requested_revision")) or "unknown"
    if mutable_checkout_allowed(allow_mutable_checkout):
        warn_mutable_checkout(repo_url, requested_revision)
        return requested_revision, None

    raise SystemExit(
        "Refusing to checkout LookingGlass without an immutable commit_id in direct_url.json. "
        "Mutable branch/tag checkout can execute changed upstream code. Reinstall from a commit SHA, "
        f"or explicitly accept the risk with --allow-mutable-checkout or "
        f"{LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT_ENV}=1."
    )


def string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def mutable_checkout_allowed(allow_mutable_checkout: bool) -> bool:
    env_value = os.environ.get(LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT_ENV) or os.environ.get(
        LEGACY_ALLOW_MUTABLE_CHECKOUT_ENV,
        "",
    )
    return allow_mutable_checkout or env_value.lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def warn_mutable_checkout(repo_url: object, revision: str) -> None:
    print(
        "WARNING: unsafe mutable checkout enabled; cloning requested revision "
        f"{revision!r} from {repo_url!r}. This can execute changed upstream code.",
        file=sys.stderr,
        flush=True,
    )


def clone_checkout(repo_url: str, revision: str, commit: str | None, target: Path) -> None:
    ensure_tool("git")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f"{target.name}.tmp")
    if partial.exists():
        shutil.rmtree(partial)

    if commit:
        run(["git", "clone", "--no-checkout", repo_url, str(partial)], cwd=target.parent)
        run(["git", "checkout", commit], cwd=partial)
    else:
        run(["git", "clone", "--depth", "1", "--branch", revision, repo_url, str(partial)], cwd=target.parent)

    if target.exists():
        shutil.rmtree(target)
    partial.rename(target)


def validate_repo(repo: Path) -> None:
    missing = [name for name in ["package.json", "package-lock.json", "test/a3p-writer.test.ts"] if not (repo / name).exists()]
    if missing:
        raise SystemExit(f"{repo} is not a LookingGlass checkout; missing {', '.join(missing)}")


def cache_root() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    root = Path(base).expanduser() if base else Path.home() / ".cache"
    return root / "lookingglass" / "uvx-checkouts"


def safe_cache_name(repo_url: str, revision: str) -> str:
    tail = repo_url.rstrip("/").split("/")[-1].removesuffix(".git")
    safe_revision = re.sub(r"[^A-Za-z0-9_.-]+", "-", revision)[:64]
    return f"{tail}-{safe_revision}"


def merge_node_options(current: str | None) -> str:
    if current and NODE_HEAP_OPTION in current.split():
        return current
    return f"{NODE_HEAP_OPTION} {current}".strip() if current else NODE_HEAP_OPTION


def ensure_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"Required tool not found on PATH: {name}")


def run(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    completed = subprocess.run(command, cwd=cwd, env=env)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
