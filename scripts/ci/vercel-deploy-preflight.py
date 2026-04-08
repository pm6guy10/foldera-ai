#!/usr/bin/env python3
"""
GitHub Actions helper for .github/workflows/deploy.yml.

Modes:
  preflight — set GITHUB_OUTPUT skip_cli=true|false (wait for Git integration when in-flight)
  check-ready — exit 0 iff production has a READY deployment at HEAD_SHA
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TERMINAL_BAD = frozenset({"ERROR", "CANCELED"})


def fetch_deployments(token: str, pid: str, team: str) -> dict:
    params: dict[str, str] = {"projectId": pid, "target": "production", "limit": "40"}
    if team:
        params["teamId"] = team
    q = urllib.parse.urlencode(params)
    url = f"https://api.vercel.com/v6/deployments?{q}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.load(resp)


def scan(data: dict, head: str) -> tuple[bool, bool]:
    ready = False
    inflight = False
    for d in data.get("deployments") or []:
        if d.get("target") != "production":
            continue
        meta = d.get("meta") or {}
        sha = (meta.get("githubCommitSha") or "").strip().lower()
        if sha != head:
            continue
        st = (d.get("state") or "").upper()
        if st == "READY":
            ready = True
        elif st not in TERMINAL_BAD:
            inflight = True
    return ready, inflight


def write_output(key: str, val: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"{key}={val}\n")


def cmd_preflight() -> int:
    token = os.environ["VERCEL_TOKEN"]
    pid = os.environ["VERCEL_PROJECT_ID"]
    team = os.environ.get("VERCEL_ORG_ID", "").strip()
    head = os.environ["HEAD_SHA"].strip().lower()

    try:
        data = fetch_deployments(token, pid, team)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"::warning::Vercel deployments list HTTP {e.code}: {body[:500]} — continuing with CLI deploy")
        write_output("skip_cli", "false")
        return 0
    except Exception as e:
        print(f"::warning::Vercel probe failed ({e}) — continuing with CLI deploy")
        write_output("skip_cli", "false")
        return 0

    ready, inflight = scan(data, head)
    if ready:
        print(
            f"Production READY already at {head[:7]} — skipping CLI build/deploy "
            f"(saves api-deployments-free-per-day)."
        )
        write_output("skip_cli", "true")
        return 0

    if not inflight:
        print("No production row for this SHA yet — waiting 35s for Git integration to register…")
        time.sleep(35)
        data = fetch_deployments(token, pid, team)
        ready, inflight = scan(data, head)
        if ready:
            print(f"Production READY at {head[:7]} after short wait — skipping CLI.")
            write_output("skip_cli", "true")
            return 0

    if inflight:
        print(
            f"Git integration in-flight for {head[:7]} — polling up to ~10m for READY "
            f"(avoid CLI upload into Hobby quota)…"
        )
        for _ in range(20):
            time.sleep(30)
            data = fetch_deployments(token, pid, team)
            ready, inflight = scan(data, head)
            if ready:
                print(f"Production READY at {head[:7]} after wait — skipping CLI.")
                write_output("skip_cli", "true")
                return 0
            if not inflight:
                print("No longer in-flight for this SHA — will try CLI path.")
                break

    print(f"No READY production deployment at {head[:7]} — running CLI build/deploy.")
    write_output("skip_cli", "false")
    return 0


def cmd_check_ready() -> int:
    token = os.environ["VERCEL_TOKEN"]
    pid = os.environ["VERCEL_PROJECT_ID"]
    team = os.environ.get("VERCEL_ORG_ID", "").strip()
    head = os.environ["HEAD_SHA"].strip().lower()
    try:
        data = fetch_deployments(token, pid, team)
    except Exception:
        return 1
    ready, _ = scan(data, head)
    if ready:
        print(f"Production READY at {head[:7]} — treating workflow as success.")
        return 0
    return 1


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["preflight", "check-ready"])
    args = p.parse_args()
    if args.mode == "preflight":
        sys.exit(cmd_preflight())
    sys.exit(cmd_check_ready())


if __name__ == "__main__":
    main()
