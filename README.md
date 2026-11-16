# 404-huang-not-found

AOOP 期末專題（第 8 組）：網頁版第一人稱殭屍生存遊戲。

舊專案的網頁原型放在 [`reference/`](reference/README.md)，只供參考。

## Commit 統計（暫時）

> 統計到 2026-11-16，`origin/main`（commit `af3466f`）。行數不含 `package-lock.json` 和二進位檔（圖片、GLB）。

| 組員 | GitHub | 一般 commit | Merge（PR 合併） | 合計 | 占比（一般 commit） | 新增行數 | 刪除行數 | 主要內容 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Hsu | big0527 | 37 | 3 | 40 | 74% | 7,972 | 439 | 場景引擎（`web/js/`）、美術工具、第二章灰盒與美術 |
| kyle614 | kyle614 | 9 | 0 | 9 | 18% | 3,474 | 10 | 故事文件（`docs/story/`）、三章漫畫（`web/comics/`） |
| Liang Chang | nickcx0109 | 4 | 1 | 5 | 8% | 428 | 2 | 場景流程規劃、效能預算、Fable 建置計畫 |
| **總計** | | **50** | **4** | **54** | 100% | 11,874 | 451 | |

重新產生：

```bash
git fetch
git shortlog -sne origin/main --no-merges   # 一般 commit
git shortlog -sne origin/main --merges      # merge commit
```
