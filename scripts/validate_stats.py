#!/usr/bin/env python3
"""Validate data/stats.json against the Mandelduck dashboard schema.

Exit status is 0 when the file matches the schema, and 1 otherwise.
Run from anywhere:

    python3 scripts/validate_stats.py
    python3 scripts/validate_stats.py path/to/stats.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

PLATFORMS = ("x", "instagram", "youtube", "tiktok")
SERIES = ("my-wife-is-a-mystery", "history", "office", "other")

TOP_KEYS = {"updated_at", "example", "platforms", "posts", "history"}
PLATFORM_KEYS = {"followers", "followers_change_7d", "views_28d", "engagement_28d"}
POST_KEYS = {
    "platform",
    "id",
    "title",
    "url",
    "published_at",
    "series",
    "views",
    "likes",
    "comments",
    "shares",
}
HISTORY_KEYS = {"date", "platform", "followers", "views"}

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "stats.json"


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, path: str, message: str) -> None:
        where = path or "<root>"
        self.errors.append(f"{where}: {message}")


def is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def require_object(report: Report, value: object, keys: set[str], path: str) -> bool:
    """Record missing and unknown keys. Return True when value is an object."""
    if not isinstance(value, dict):
        report.add(path, "expected an object")
        return False
    missing = sorted(key for key in keys if key not in value)
    extra = sorted(key for key in value if key not in keys)
    if missing:
        report.add(path, "missing " + ", ".join(missing))
    if extra:
        report.add(path, "unknown " + ", ".join(extra))
    return True


def check_datetime(report: Report, value: object, path: str) -> None:
    if not isinstance(value, str) or "T" not in value:
        report.add(path, "expected an ISO-8601 datetime")
        return
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        report.add(path, "expected an ISO-8601 datetime")


def check_date(report: Report, value: object, path: str) -> None:
    if not isinstance(value, str):
        report.add(path, "expected a YYYY-MM-DD date")
        return
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        report.add(path, "expected a YYYY-MM-DD date")


def check_count(report: Report, obj: dict, key: str, path: str) -> None:
    if key not in obj:
        return
    value = obj[key]
    if not is_int(value) or value < 0:
        report.add(f"{path}.{key}", "expected a non-negative integer")


def check_platforms(report: Report, platforms: object) -> None:
    if not isinstance(platforms, dict):
        report.add("platforms", "expected an object")
        return
    missing = [name for name in PLATFORMS if name not in platforms]
    extra = sorted(name for name in platforms if name not in PLATFORMS)
    if missing:
        report.add("platforms", "missing " + ", ".join(missing))
    if extra:
        report.add("platforms", "unknown " + ", ".join(extra))
    for name in PLATFORMS:
        if name not in platforms:
            continue
        block = platforms[name]
        path = f"platforms.{name}"
        if not require_object(report, block, PLATFORM_KEYS, path):
            continue
        check_count(report, block, "followers", path)
        check_count(report, block, "views_28d", path)
        check_count(report, block, "engagement_28d", path)
        if "followers_change_7d" not in block:
            continue
        change = block["followers_change_7d"]
        if not is_int(change):
            report.add(f"{path}.followers_change_7d", "expected an integer")


def check_posts(report: Report, posts: object) -> None:
    if not isinstance(posts, list):
        report.add("posts", "expected an array")
        return
    seen: set[tuple[str, str]] = set()
    for index, post in enumerate(posts):
        path = f"posts[{index}]"
        if not require_object(report, post, POST_KEYS, path):
            continue
        platform = post.get("platform")
        if "platform" in post and platform not in PLATFORMS:
            report.add(f"{path}.platform", "expected one of " + ", ".join(PLATFORMS))
        post_id = post.get("id")
        if "id" in post and (not isinstance(post_id, str) or not post_id.strip()):
            report.add(f"{path}.id", "expected a non-empty string")
        elif isinstance(platform, str) and isinstance(post_id, str):
            key = (platform, post_id)
            if key in seen:
                report.add(f"{path}.id", "duplicate id for this platform")
            seen.add(key)
        title = post.get("title")
        if "title" in post and (not isinstance(title, str) or not title.strip()):
            report.add(f"{path}.title", "expected a non-empty string")
        url = post.get("url")
        if "url" in post and (
            not isinstance(url, str) or not url.lower().startswith(("http://", "https://"))
        ):
            report.add(f"{path}.url", "expected an http or https URL")
        if "published_at" in post:
            check_datetime(report, post["published_at"], f"{path}.published_at")
        if "series" in post and post["series"] not in SERIES:
            report.add(f"{path}.series", "expected one of " + ", ".join(SERIES))
        for field in ("views", "likes", "comments", "shares"):
            check_count(report, post, field, path)


def check_history(report: Report, history: object) -> None:
    if not isinstance(history, list):
        report.add("history", "expected an array")
        return
    seen: set[tuple[str, str]] = set()
    for index, row in enumerate(history):
        path = f"history[{index}]"
        if not require_object(report, row, HISTORY_KEYS, path):
            continue
        if "date" in row:
            check_date(report, row["date"], f"{path}.date")
        platform = row.get("platform")
        if "platform" in row and platform not in PLATFORMS:
            report.add(f"{path}.platform", "expected one of " + ", ".join(PLATFORMS))
        check_count(report, row, "followers", path)
        check_count(report, row, "views", path)
        if isinstance(row.get("date"), str) and isinstance(platform, str):
            key = (row["date"], platform)
            if key in seen:
                report.add(path, "duplicate snapshot for this date and platform")
            seen.add(key)


def validate(data: object, report: Report) -> None:
    if not require_object(report, data, TOP_KEYS, ""):
        return
    assert isinstance(data, dict)
    if "updated_at" in data:
        check_datetime(report, data["updated_at"], "updated_at")
    if "example" in data and not isinstance(data["example"], bool):
        report.add("example", "expected a boolean")
    if "platforms" in data:
        check_platforms(report, data["platforms"])
    if "posts" in data:
        check_posts(report, data["posts"])
    if "history" in data:
        check_history(report, data["history"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate dashboard stats.json")
    parser.add_argument(
        "path",
        nargs="?",
        default=str(DEFAULT_PATH),
        help="Path to stats.json (default: data/stats.json)",
    )
    args = parser.parse_args(argv)
    path = Path(args.path)
    if not path.is_file():
        print(f"{path}: file not found", file=sys.stderr)
        return 1
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"{path}: invalid JSON ({exc})", file=sys.stderr)
        return 1
    report = Report()
    validate(data, report)
    if report.errors:
        print(f"{path}: {len(report.errors)} error(s)", file=sys.stderr)
        for error in report.errors:
            print(f"  {error}", file=sys.stderr)
        return 1
    print(
        f"OK {path} ({len(data['platforms'])} platforms, "
        f"{len(data['posts'])} posts, {len(data['history'])} history rows)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
