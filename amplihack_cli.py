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


DIST_NAME = "alice-web-prototype-amplihack"
DEFAULT_REPO_URL = "https://github.com/rysweet/alice-web-prototype.git"
NODE_HEAP_OPTION = "--max-old-space-size=32768"

SCENARIOS = {
    "a3p-statement-simple": {
        "description": "A3P parser/writer statement inventory contract",
        "test_files": ["test/a3p-writer.test.ts"],
        "pattern": (
            "keeps parser-recognized statement kinds explicit|"
            "keeps writer round-trip coverage cases in exact parity with SUPPORTED_A3P_STATEMENT_KINDS"
        ),
    },
    "a3p-statement-integration": {
        "description": "A3P statement round-trip, lowering, and fail-loud coverage",
        "test_files": ["test/a3p-writer.test.ts"],
        "pattern": (
            "round-trips writer-supported|"
            "lowers VariableAssignment statements|"
            "lowers EventListener statements|"
            "rejects TS-only ForEach statements|"
            "throws instead of dropping unsupported statement kinds"
        ),
    },
    "story-api-barrel-simple": {
        "description": "Story API public barrels stay export-only",
        "test_files": ["test/story-api-public-barrels.test.ts"],
        "pattern": (
            "keeps src/index.ts as an export-only root barrel with the StoryApi namespace|"
            "keeps src/story-api/index.ts as an export-only barrel"
        ),
    },
    "story-api-barrel-integration": {
        "description": "Story API public import paths preserve helper behavior",
        "test_files": [
            "test/story-api-public-barrels.test.ts",
            "test/story-api-wrappers.test.ts",
        ],
        "pattern": (
            "keeps directory and index import value surfaces aligned|"
            "keeps the root StoryApi namespace aligned with direct Story API imports|"
            "continues exposing story-world helpers from all public Story API import paths|"
            "builds and summarizes an empty story world without changing helper output shape|"
            "compares story worlds by public summary fields only|"
            "applies environment options and snapshots scene state|"
            "summarizes property change history and scene lifecycle helpers"
        ),
    },
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="amplihack",
        description="Run alice-web-prototype outside-in validation scenarios from a uvx-installed branch.",
    )
    parser.add_argument("command", choices=sorted(SCENARIOS))
    parser.add_argument(
        "--no-install",
        action="store_true",
        help="Skip npm ci when node_modules already exists in the cached checkout.",
    )
    args = parser.parse_args(argv)

    scenario = SCENARIOS[args.command]
    repo = ensure_checkout()
    ensure_tool("npm")
    ensure_tool("npx")

    print(f"Scenario: {scenario['description']}", flush=True)
    print(f"Checkout: {repo}", flush=True)

    if not args.no_install:
        run(["npm", "ci", "--no-audit", "--no-fund", "--silent"], cwd=repo)
    elif not (repo / "node_modules").exists():
        raise SystemExit("--no-install was used, but cached node_modules does not exist")

    env = os.environ.copy()
    env["NODE_OPTIONS"] = merge_node_options(env.get("NODE_OPTIONS"))
    command = [
        "npx",
        "vitest",
        "run",
        *scenario["test_files"],
        "-t",
        scenario["pattern"],
    ]
    print(f"Command: NODE_OPTIONS={env['NODE_OPTIONS']} {' '.join(command)}", flush=True)
    run(command, cwd=repo, env=env)
    return 0


def ensure_checkout() -> Path:
    source_override = os.environ.get("ALICE_WEB_SOURCE")
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
    commit = vcs_info.get("commit_id")
    revision = commit or vcs_info.get("requested_revision") or "unknown"

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
        raise SystemExit(f"{repo} is not an alice-web-prototype checkout; missing {', '.join(missing)}")


def cache_root() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    root = Path(base).expanduser() if base else Path.home() / ".cache"
    return root / "alice-web-prototype" / "uvx-checkouts"


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
