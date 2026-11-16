"""統計每個人的 commit 數與改動行數，輸出 Markdown 表格。

用法：
    python tools/contrib_report.py                    # main 分支全部歷史
    python tools/contrib_report.py --since 2026-10-19 # 只看某天之後
    python tools/contrib_report.py --branch origin/main

同一個人用了不同名字或 email 時，在 .mailmap 合併。
Unity 自動產生的檔案和二進位素材不算行數，只算 commit 數。
"""
import argparse
import re
import subprocess
import sys
from collections import defaultdict

IGNORED = re.compile(
    r"(^|/)(Library|Temp|Logs|obj|Build|Builds|UserSettings)/"
    r"|\.(meta|unity|prefab|asset|mat|anim|controller|png|jpg|jpeg|psd|fbx|blend|wav|mp3|ogg)$",
    re.IGNORECASE,
)
REC, FLD, SEP = "\x1e", "\x1f", "\x1d"


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True,
                          encoding="utf-8", check=True).stdout


def collect(branch, since):
    fmt = f"{REC}%aN{FLD}%(trailers:key=Co-authored-by,valueonly,separator=%x1d)"
    cmd = ["log", branch, "--no-merges", "--numstat", f"--format={fmt}"]
    if since:
        cmd += ["--since", since]
    stats = defaultdict(lambda: {"commits": 0, "add": 0, "del": 0, "co": 0})
    for rec in git(*cmd).split(REC)[1:]:
        head, _, body = rec.partition("\n")
        name, co = head.split(FLD)
        s = stats[name]
        s["commits"] += 1
        for line in body.splitlines():
            parts = line.split("\t")
            if len(parts) != 3 or parts[0] == "-" or IGNORED.search(parts[2]):
                continue
            s["add"] += int(parts[0])
            s["del"] += int(parts[1])
        for c in filter(None, co.split(SEP)):
            stats[c.split("<")[0].strip()]["co"] += 1
    return stats


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default="main")
    ap.add_argument("--since")
    args = ap.parse_args()

    stats = collect(args.branch, args.since)
    if not stats:
        print("沒有符合條件的 commit。")
        return
    total = sum(s["commits"] for s in stats.values()) or 1
    rows = sorted(stats.items(), key=lambda kv: -kv[1]["commits"])

    scope = f"{args.branch}" + (f"，{args.since} 之後" if args.since else "，全部歷史")
    print(f"範圍：{scope}（不含 merge commit）\n")
    print("| 成員 | commit | 佔比 | 新增行 | 刪除行 | 共同作者 |")
    print("|---|---:|---:|---:|---:|---:|")
    for name, s in rows:
        print(f"| {name} | {s['commits']} | {s['commits'] / total:.0%} | "
              f"{s['add']} | {s['del']} | {s['co']} |")

    counts = [s["commits"] for _, s in rows if s["commits"]]
    if len(counts) >= 2 and max(counts) > 1.5 * min(counts):
        print(f"\n差距偏大：最多 {max(counts)}、最少 {min(counts)}。"
              "下週把新任務優先分給 commit 較少的人。")


if __name__ == "__main__":
    main()
