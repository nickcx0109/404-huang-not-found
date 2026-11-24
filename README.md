# 404-huang-not-found

AOOP 期末專題（第 8 組）：網頁版第一人稱殭屍生存遊戲。

沒有固定分工，要做的事都在 [`TODO.md`](TODO.md)：在 repo 根目錄開 Claude Code（或其他 agent），跟它說「讀 TODO.md，挑一項來做」。agent 的規則在 [`AGENTS.md`](AGENTS.md)。

舊專案的網頁原型放在 [`reference/`](reference/README.md)，只供參考。

## 線上多人

一個 Node server 同時送出網頁和連線（同一個 port），細節在 [`docs/tech/NETWORK.md`](docs/tech/NETWORK.md)「部署」。

**本機開 server**（Node 22 以上）：

```bash
npm ci
npm start                 # PORT=9000 npm start 換 port
```

打開 <http://localhost:8787/>（會轉到 `web/index.html?play=1`）。同一個區網的其他電腦用 `http://<這台的 IP>:8787/`。

**開房和加入：**

1. 一個人在開始畫面輸入名字，按「建立隊伍」，畫面上會出現 4 碼隊伍編號（可以按「複製編號」）。
2. 把編號告訴隊友。隊友打開同一個網址，在「輸入編號加入」輸入編號；也可以直接分享 `https://<網址>/?join=編號`。
3. 最多 3 人，到齊後由房主（建立隊伍的人）按「開始遊戲」。

**量延遲：** `node tools/net-latency.mjs wss://<網址> 50`（本機用 `ws://localhost:8787`），印出 RTT 的 min／median／p95／max 和時鐘差。

**部署到 Fly.io（東京，不會休眠）：** 需要 Fly 帳號和信用卡（按用量計費，一台 shared-cpu-1x 很便宜）。

```bash
# 1. 安裝 flyctl：https://fly.io/docs/flyctl/install/ ，然後登入
fly auth login
# 2. 建 app，不要馬上部署。問要不要沿用現有的 fly.toml 時選 Yes，app 名稱取一個沒人用的
fly launch --no-deploy
# 3. 部署。--ha=false 只開一台：隊伍存在記憶體裡，兩台的話隊友會連到不同台、找不到隊伍
fly deploy --ha=false
fly scale count 1         # 確認只有一台
fly open                  # 打開 https://<app>.fly.dev/
```

之後改了程式再 `fly deploy` 就好。`fly logs` 看 server 輸出。

**或部署到 Render（新加坡）：** Render 後台 → New → Blueprint → 選這個 repo，會讀 [`render.yaml`](render.yaml)，然後按 Deploy。免費方案閒置約 15 分鐘會休眠（隊伍會消失，下一次開啟要等幾十秒），示範前先打開一次，或改用付費方案。

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
