# 場景建置進度（交接用）

照 [FABLE_BUILD_PLAN.md](FABLE_BUILD_PLAN.md) 一段一段交給 Fable 5.2（effort high）做。分支：`feat/scene-ch2`。

最後更新：2026-11-16

| 任務 | 狀態 | 備註 |
|---|---|---|
| T1 場景骨架 | ✅ 完成 | `web/`、`tools/serve.mjs`；測試關卡 `?level=test` |
| T2 氣氛樣板 | ✅ 完成，**選定 heavy** | `palette.json` 的 `mood.defaultPreset = "heavy"`；候選截圖在 `art/style/refs/candidates/` |
| T3 第二章灰盒 | ✅ 完成，**待章節負責人確認** | `web/levels/ch2.json`、`palette.json` 的 `ch2` 區塊；截圖在 `art/style/refs/ch2-greybox/`（先看 `plan.jpg`） |
| T4 資產工具＋共用框架 | ✅ 完成 | Blender 資產流程（build → preview → check）、每章各自的清單／替身／palette 檔、GLB 模型載入。用 `test_crate` 跑通 |
| 三章平行製作 | ⏭ 下一步 | 三個人各做一章：灰盒（第二章已有）→ 資產 → 擺模型與打光。先讀 [OWNERSHIP.md](OWNERSHIP.md)（誰改哪些檔案）和 [ADDING_AN_ASSET.md](ADDING_AN_ASSET.md) |
| 共用道具（原 T5） | 未開始 | 不用素材包，改成用 Blender 腳本自己做：`art/manifest/common.json` 列了 8 個（廢車、卡車、廂型車、路燈、圍欄、油桶、垃圾堆），**要先分配誰做哪一個** |

## 接手的人要知道的

- **開發環境**：需要 Node.js（這台電腦已用 winget 裝 LTS v26）。第一次在新電腦跑：`npm install`、`npx playwright install chromium`。
- **執行**：`node tools/serve.mjs`，網址是 `http://localhost:8080/web/index.html?level=<名稱>`（server 根目錄是 repo 根目錄，不是 `web/`）。
- **資產工具**（需要 Blender 4.2 LTS 在 PATH 上，或設 `BLENDER` 環境變數）：`node tools/art/assets.mjs all --chapter ch2` 會依序 build、preview、check；也可以只給資產 id。沒過 check 不能 commit。
- **截圖工具**：`node tools/art/shots.mjs --level <名稱> --out <資料夾>`，會自己開關 server。
- **和計畫不一樣的決定**（T3 之後也照這樣做）：
  - 截圖存 **JPEG 品質 85**（保留顆粒），不是 PNG。顆粒讓 PNG 每張約 1 MB，超過 300 KB 上限。
  - `palette.json` 的 `fog.color` 是「畫面上看到的顏色」，程式會反推曝光和 tone mapping。
  - bloom 用 1/4 解析度（比半解析度省 0.8 ms）。
  - 關卡 props 多一個選填欄位 `size: [寬, 高, 深]`，給沒有 collider 的灰盒替身用。
- **框架怎麼分工**（T4）：
  - 每章四個自己的檔案：`web/levels/chN.json`、`web/js/props/ChNProps.js`、`art/style/chapters/chN.json`、`art/manifest/chN.json`，加上自己清單裡的資產腳本、模型、預覽圖。其他都是共用檔案，改之前先跟組長說。完整清單在 [OWNERSHIP.md](OWNERSHIP.md)。
  - 道具的外觀照「模型 → 灰盒替身 → 灰色方塊」的順序決定。模型要清單標成 `ready`、關卡的 `manifests` 有列那份清單才會載入；載不到會自動退回，不會壞。
  - `palette.json` 現在只放 `default`、`mood`、`blockout`；`ch2` 區塊搬到 `art/style/chapters/ch2.json`，畫面和搬之前逐像素相同。
  - 模型的顏色也從 palette 來（`_assets.colors`），「降飽和＋髒污」由工具統一加。
  - SCENE_PIPELINE.md 第 3 節和 FABLE_BUILD_PLAN.md 的 T4～T7 是舊的規劃（單一 `art/manifest.json`、`convert_kit.py`、T7 才做模型載入），以這份文件和上面兩份新文件為準。
- **heavy 的風險**：很暗，戰鬥章節（第二章）可能難瞄準。T3 做 ch2 區塊時，可以在 ch2 局部調亮，或加強手電筒和重點光，不要改 mood 的 heavy。
- **第二章灰盒（T3）要確認的事**：
  - 配置：大門在南邊，玩家面向北。左街、右街、北邊停車場三個入口；三個沙包防守點（`markers` 的 `post_left`、`post_right`、`post_front`）；商店在大門左邊；4 個出怪區藏在卡車和廂型車後面。
  - 31 個矮掩體、5 個 marker、4 個出怪區，從 3 個玩家出生點都走得到（用 `PathFinder` 驗過）。
  - `ch2` 區塊從 heavy 出發再調亮，差異列在 `art/style/STYLE_GUIDE.md` 的「第二章」那一節。覺得還是太暗或太亮，改 `ch2` 的 `hemisphere.intensity`、`fog`、`flashlight`，不要動 `mood`。
  - 動態燈剛好 4 盞（手電筒＋三盞警示燈），**還沒算其他玩家的手電筒**。接多人時把 `alarm.light.count` 降到 1 或 0。
  - 看得到敵人嗎：網址加 `&dummies=1` 會在殭屍的路線上放假人。
  - 效能（1080p）：draw call 29～44、三角面約 5 千、Iris Xe 每幀約 7.4 ms。
- **已知待辦**：見 [docs/tech/KNOWN_ISSUES.md](../tech/KNOWN_ISSUES.md)（PR #1 審查找到的 10 項，加上 T1～T3 回報過還沒處理的）。做框架時沒有動其中任何一項。
- **git 身分**：全域設定為 `Hsu <109849259+big0527@users.noreply.github.com>`。commit 結尾加 `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`。
- **PR**：T1、T2 已 push 並開 PR #1。T3 的 commit 還在本機，沒有 push。
