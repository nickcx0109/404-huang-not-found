# 場景建置進度（交接用）

照 [FABLE_BUILD_PLAN.md](FABLE_BUILD_PLAN.md) 一段一段交給 Fable 5.2（effort high）做。分支：`feat/scene-ch2`。

最後更新：2026-11-15

| 任務 | 狀態 | 備註 |
|---|---|---|
| T1 場景骨架 | ✅ 完成 | `web/`、`tools/serve.mjs`；測試關卡 `?level=test` |
| T2 氣氛樣板 | ✅ 完成，**選定 heavy** | `palette.json` 的 `mood.defaultPreset = "heavy"`；候選截圖在 `art/style/refs/candidates/` |
| T3 第二章灰盒 | ✅ 完成，**待章節負責人確認** | `web/levels/ch2.json`、`palette.json` 的 `ch2` 區塊；截圖在 `art/style/refs/ch2-greybox/`（先看 `plan.jpg`） |
| T4 資產工具 | ⏭ 下一步 | 要先裝 Blender 4.2 LTS 並把 `blender` 加進 PATH |
| T5～T7 | 未開始 | |

## 接手的人要知道的

- **開發環境**：需要 Node.js（這台電腦已用 winget 裝 LTS v26）。第一次在新電腦跑：`npm install`、`npx playwright install chromium`。
- **執行**：`node tools/serve.mjs`，網址是 `http://localhost:8080/web/index.html?level=<名稱>`（server 根目錄是 repo 根目錄，不是 `web/`）。
- **截圖工具**：`node tools/art/shots.mjs --level <名稱> --out <資料夾>`，會自己開關 server。
- **和計畫不一樣的決定**（T3 之後也照這樣做）：
  - 截圖存 **JPEG 品質 85**（保留顆粒），不是 PNG。顆粒讓 PNG 每張約 1 MB，超過 300 KB 上限。
  - `palette.json` 的 `fog.color` 是「畫面上看到的顏色」，程式會反推曝光和 tone mapping。
  - bloom 用 1/4 解析度（比半解析度省 0.8 ms）。
  - 關卡 props 多一個選填欄位 `size: [寬, 高, 深]`，給沒有 collider 的灰盒替身用。
- **heavy 的風險**：很暗，戰鬥章節（第二章）可能難瞄準。T3 做 ch2 區塊時，可以在 ch2 局部調亮，或加強手電筒和重點光，不要改 mood 的 heavy。
- **第二章灰盒（T3）要確認的事**：
  - 配置：大門在南邊，玩家面向北。左街、右街、北邊停車場三個入口；三個沙包防守點（`markers` 的 `post_left`、`post_right`、`post_front`）；商店在大門左邊；4 個出怪區藏在卡車和廂型車後面。
  - 31 個矮掩體、5 個 marker、4 個出怪區，從 3 個玩家出生點都走得到（用 `PathFinder` 驗過）。
  - `ch2` 區塊從 heavy 出發再調亮，差異列在 `art/style/STYLE_GUIDE.md` 的「第二章」那一節。覺得還是太暗或太亮，改 `ch2` 的 `hemisphere.intensity`、`fog`、`flashlight`，不要動 `mood`。
  - 動態燈剛好 4 盞（手電筒＋三盞警示燈），**還沒算其他玩家的手電筒**。接多人時把 `alarm.light.count` 降到 1 或 0。
  - 看得到敵人嗎：網址加 `&dummies=1` 會在殭屍的路線上放假人。
  - 效能（1080p）：draw call 29～44、三角面約 5 千、Iris Xe 每幀約 7.4 ms。
- **已知待辦**（不在 T1/T2 範圍）：沒有抗鋸齒；1.5 倍解析度在內顯上約 39 fps，要做 PERFORMANCE_PLAN 3.3 的品質分級；AABB 碰撞不跟著 rotY 轉；尾燈超過約 45 m 會被相機遠平面切掉（第一章 300 m 山路要處理）。
- **git 身分**：全域設定為 `Hsu <109849259+big0527@users.noreply.github.com>`。commit 結尾加 `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`。
- **PR**：T1、T2 已 push 並開 PR #1。T3 的 commit 還在本機，沒有 push。
