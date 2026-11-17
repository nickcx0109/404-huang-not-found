# 404-huang-not-found

AOOP 期末專題（第 8 組）：網頁版第一人稱殭屍生存遊戲。

沒有固定分工，要做的事都在 [`TODO.md`](TODO.md)：在 repo 根目錄開 Claude Code（或其他 agent），跟它說「讀 TODO.md，挑一項來做」。agent 的規則在 [`AGENTS.md`](AGENTS.md)。

舊專案的網頁原型放在 [`reference/`](reference/README.md)，只供參考。

## Commit 統計（暫時）

> 統計到 2026-11-17，`origin/main`（commit `4bfa46d`）。行數不含 `package-lock.json`、二進位檔（圖片、GLB）和 `reference/`（Liang 匯入舊原型的 29,287 行另外算，不列在表裡）。

| 組員 | GitHub | 一般 commit | Merge（PR 合併） | 合計 | 占比（一般 commit） | 新增行數 | 刪除行數 | 主要內容 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| kyle614 | kyle614 | 173 | 7 | 180 | 63% | 16,316 | 739 | 故事文件（`docs/story/`）、三章漫畫（`web/comics/`）、第一章灰盒與氣氛（S1）、第三章灰盒與細節（S6）、遊戲內 HUD 重做（G12） |
| Liang Chang | nickcx0109 | 63 | 7 | 70 | 23% | 7,172 | 3,296 | ES modules 重構、遊戲骨架（武器、敵人、狀態、商店）、碰撞修正、TODO 流程、步槍和霰彈槍（G1）、三種新殭屍（G2）、手槍美術（分支中） |
| Hsu | big0527 | 37 | 3 | 40 | 14% | 7,943 | 324 | 場景引擎（`web/js/`）、美術工具、第二章灰盒與美術 |
| **總計** | | **273** | **17** | **290** | 100% | 31,431 | 4,359 | |

重新產生：

```bash
git fetch
git shortlog -sne origin/main --no-merges   # 一般 commit
git shortlog -sne origin/main --merges      # merge commit
# 行數（不含 lock 檔和 reference/）
git log origin/main --no-merges --numstat --format='@%an' -- . ':!package-lock.json' ':!reference' \
  | awk '/^@/{a=substr($0,2);next} NF==3 && $1!="-"{ad[a]+=$1;de[a]+=$2} END{for(k in ad)print k, ad[k], de[k]}'
```
