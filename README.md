# 404-huang-not-found

AOOP 期末專題（第 8 組）：網頁版第一人稱殭屍生存遊戲。

沒有固定分工，要做的事都在 [`TODO.md`](TODO.md)：在 repo 根目錄開 Claude Code（或其他 agent），跟它說「讀 TODO.md，挑一項來做」。agent 的規則在 [`AGENTS.md`](AGENTS.md)。

舊專案的網頁原型放在 [`reference/`](reference/README.md)，只供參考。

## Commit 統計（暫時）

> 統計到 2026-11-24，`origin/main`（commit `dbf807d`）。行數不含 `package-lock.json`、二進位檔（圖片、GLB、音效）和 `reference/`（Liang 匯入舊原型的 29,287 行另外算，不列在表裡）。

| 組員 | GitHub | 一般 commit | Merge（PR 合併） | 合計 | 占比（一般 commit） | 新增行數 | 刪除行數 | 主要內容 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| kyle614 | kyle614 | 173 | 7 | 180 | 37.4% | 16,316 | 739 | 故事文件（`docs/story/`）、三章漫畫（`web/comics/`）、第一章灰盒與氣氛（S1）、第三章灰盒與細節（S6）、遊戲內 HUD 重做（G12） |
| Hsu | big0527 | 143 | 18 | 161 | 30.9% | 16,396 | 922 | 場景引擎（`web/js/`）、美術工具、第二章灰盒與美術、道具欄（G14）、地上撿的槍、治療物和投擲物（G16、G20、G23）、近戰武器和彈藥箱（G13、G18、G19）、第一人稱武器模型（G9、G25）、刀光（G24）、槍聲（G10）、難度（G22） |
| Liang Chang | nickcx0109 | 147 | 25 | 172 | 31.7% | 11,760 | 4,036 | ES modules 重構、遊戲骨架（武器、敵人、狀態）、碰撞修正、TODO 流程、步槍和霰彈槍（G1）、三種新殭屍（G2）、波次（G3）、開始／結束／重開畫面（G5）、第二章守門過關（G6）、拿掉商店（G26）、倒地和救援（G7）、隊友狀態列（G15、G16b）、狙擊槍（G17）、腎上腺素（G21）、工具和小 bug（B2、B4、B9、B10、B12、B13、B14、B16） |
| **總計** | | **463** | **50** | **513** | 100% | 44,472 | 5,697 | |

重新產生：

```bash
git fetch
git shortlog -sne origin/main --no-merges   # 一般 commit
git shortlog -sne origin/main --merges      # merge commit
# 行數（不含 lock 檔和 reference/）
git log origin/main --no-merges --numstat --format='@%an' -- . ':!package-lock.json' ':!reference' \
  | awk '/^@/{a=substr($0,2);next} NF==3 && $1!="-"{ad[a]+=$1;de[a]+=$2} END{for(k in ad)print k, ad[k], de[k]}'
```
