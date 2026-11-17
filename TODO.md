# TODO

這份清單是專案唯一的待辦清單。沒有固定分工：想做事的人（或他的 agent）從這裡挑一項來做。

## 怎麼用

1. **挑一項。** 從上往下挑第一個還是 `[ ]` 的項目。已經標 `[~]` 的有人在做，跳過。agent 挑好之後先跟使用者說要做哪一項，使用者同意再開工。
2. **認領。** 在最新的 `main` 上把那一項的 `[ ]` 改成 `[~]`，行尾加上 `（進行中：@GitHub 帳號，分支 feat/xxx）`。只 commit 這一行，訊息用 `docs(todo): start <項目代號>`，直接 push 到 `main`，讓其他人馬上看得到。
3. **開分支做。** 從 `main` 開剛剛寫的分支。照項目寫的「起點」讀檔案，做到「完成」的條件。
4. **檢查。** 跑項目要求的檢查，至少要跑 `npm test`。
5. **交回。** push 分支、開 PR。在同一個 PR 裡把這一項從清單刪掉，並在最下面「已完成」加一行（代號、標題、PR 編號）。做的過程中發現新問題，就在對的分類加一項新的 `[ ]`。
6. **放棄。** 做不完就把 `[~]` 改回 `[ ]`，在項目下面寫一行做到哪裡。

項目太大、一個 PR 做不完，就拆成幾項（例如 G8 拆成 G8a、G8b），各自認領。

---

## 優先：玩法

玩法比美術優先。介面和擴充步驟都在 [docs/tech/GAMEPLAY.md](docs/tech/GAMEPLAY.md)，每一項都先讀它。新內容一律放在新檔案、用繼承或註冊加進去，不改 `Pistol`、`Walker`、`AmmoRefillItem` 這三個範例。

- [~] **G3 波次設計**（進行中：@nickcx0109，分支 feat/waves-data）
  - 起點：`web/js/game/WaveDirector.js`。
  - 內容：波次不要一次全部出完，改成一段時間內陸續出怪；每一波混合不同種類（等 G2）；波次表寫成資料，不要寫死在程式裡。順便做殭屍互相推開（設計文件 6.1 第 1 點），不然會疊成一點。
  - 完成：有測試證明每波數量、種類、出怪間隔照表走。
- [ ] **G5 開始、結束、重開畫面**
  - 起點：`web/js/game/states/`、`GameSession.js`，`test/GameSession.test.js`。
  - 內容：Lobby 顯示開始畫面；GameOver 顯示結算（波次、擊殺）並可以不重新整理就重開（先完整 dispose 再建新的 Session）；新增 Victory 狀態給 G6 用。
  - 完成：狀態切換和重開都有測試，重開後沒有殘留的敵人或事件訂閱。
- [ ] **G6 第二章過關條件：守門開鎖**
  - 起點：`docs/story/chapter-2.md`、`web/levels/ch2.json`、`web/js/game/`。
  - 內容：開鎖倒數（故事文件還沒訂時間，先自己訂一個值放在關卡或波次資料裡，在 PR 說明寫出來；`docs/story/` 不要改），撐到倒數結束進 Victory；HUD 顯示剩餘時間。過關條件做成可以換的類別（例如 `Objective`），第一章、第三章之後也用得到。
  - 完成：`?level=ch2&play=1` 從開始玩得到勝利；有倒數和勝利的測試。
- [ ] **G7 倒地和救援**
  - 內容：生命歸零先倒地，隊友靠近按住 E 數秒救起；全部倒地才 GameOver。先在單人可測的狀態下做好（例如 debug 加一個假隊友）。
  - 完成：倒地、救起、全滅三種情況都有測試。
  - 介面已經有隊友列（`web/js/ui/hud/TeamWidget.js`）：玩家物件有 `downed` 就照它顯示「DOWN」，沒有就把血量歸零當成倒地。
- [ ] **G8 區網多人連線**（大項，認領前先拆小）
  - 起點：`GAMEPLAY.md` 的「傷害與行為的邊界」第 5 點；舊原型的 `reference/old-web-prototype/prototype-web/server.mjs`（WebSocket 房間轉送）和 `core/net.js`、`core/coop.js`。
  - 內容：Host 跑 `GameSession`，Client 只送輸入，Host 傳快照；顯示其他玩家；`ChaseBrain` 改成追最近的玩家（現在只追 `ctx.players[0]`）；連線時把第二章的 `alarm.light.count` 降到 1 或 0（動態燈上限）。
  - 完成：兩台電腦在同一個區網可以一起打第二章。
- [~] **G9 槍的第一人稱模型和動畫**（進行中：@nickcx0109，分支 feat/weapons-art，暫停）
  - 做到一半，已 push 到分支 `feat/weapons-art`（5 個 commit，還沒開 PR、沒合併）：資產庫的可動零件、手槍模型 `pistol.glb`、`art/manifest/weapons.json`、`web/js/weapons/` 的 `WeaponRig`、`WeaponView`、`PistolView`、`Clip`、`WeaponModel`（開槍、換彈、拿出的動畫）。
  - 接手前：這個分支是從 PR #6 之前的 `main` 開的，要先 `git rebase main`。`web/js/App.js` 會衝突，兩邊的改動都要留。
  - 還沒做：
    - 改用玩法骨架的事件。現在用自己的 `weapon:fire`、`weapon:reload`，還自己綁滑鼠和 R 鍵；要改成訂閱 `game/events.js` 的 `WEAPON_FIRED`、`WEAPON_RELOADED`、`WEAPON_CHANGED`。
    - 走動模式現在預設會拿槍，畫面會變。要決定是只在 `play=1` 顯示，還是接受走動模式的截圖改變。
    - 測試，以及 G1 的步槍和霰彈槍模型。
- [ ] **G10 音效**
  - 起點：`reference/old-web-prototype/prototype-web/sfx/`、`core/audio.js`。
  - 內容：開槍、換彈、殭屍、受傷、波次開始的音效，用訂閱事件的方式播放，不寫進武器或敵人的邏輯裡。

## 場景與美術

開工前讀 [docs/art/CHAPTER_FILES.md](docs/art/CHAPTER_FILES.md)、[docs/art/ADDING_AN_ASSET.md](docs/art/ADDING_AN_ASSET.md)、[art/style/STYLE_GUIDE.md](art/style/STYLE_GUIDE.md)、[docs/tech/PERFORMANCE_PLAN.md](docs/tech/PERFORMANCE_PLAN.md) 第 3.1 節，以及 `docs/story/` 裡那一章的故事。資產要跑 `node tools/art/assets.mjs all --chapter <章>` 通過才能 commit；截圖 JPEG 品質 85、1280×720。回報 draw call 和三角面數。

- [ ] **S2 第一章資產**（`art/manifest/ch1.json`）：`road_segment`（直線、彎道、坡道）、`guardrail`、`guardrail_broken`、`escape_car`（尾燈自發光）、`tree`。
- [ ] **S3 第一章擺模型和打光**（等 S1、S2）：霧的流動、遠景剪影；重拍所有機位，和灰盒截圖比較。
- [ ] **S4 第二章剩下的資產**（`art/manifest/ch2.json`）：`mvidia_sign`（標誌自己設計，不要仿真實公司的 logo）、`sandbags`、`hq_wall`。
- [ ] **S5 第二章擺模型和打光**：招牌閃爍、警示燈、霧的流動；重拍所有機位存到 `art/style/refs/ch2/`，和 `ch2-greybox/` 比較。碰撞不要動。順便改善「20 m 外的殭屍只剩很淡的剪影」。
- [ ] **S7 第三章資產**（`art/manifest/ch3.json`）：`office_kit`（牆、門、窗、走廊、轉角、樓梯）、`server_rack`（LED 自發光）、`freight_elevator`、`fuel_barrel` 三種狀態（一般、冒煙、毀損）、`rocket`、`launch_pad`、`cage`。可以拆成幾項分別認領。
- [ ] **S8 第三章擺模型和打光**（等 S6、S7）：閃爍日光燈、機房綠色 LED、探照燈打在火箭上。
- [ ] **S9 共用道具**（`art/manifest/common.json`）：`fence`、`oil_barrel`、`trash_pile`。
- [ ] **S10 角色模型**：殭屍、Boss、老黃、主角。殭屍先看 PERFORMANCE_PLAN 3.2 第 1 點（一隻一個 mesh 或 InstancedMesh），再決定做法。

## 修 bug 與效能

細節和修法方向在 [docs/tech/KNOWN_ISSUES.md](docs/tech/KNOWN_ISSUES.md)。修好就在那份文件標成已修復，並從這裡刪掉。

- [ ] **B1** 綁了 collider 的道具旋轉或縮放後，外觀超出碰撞盒（KNOWN_ISSUES #3，和「AABB 不會跟著 rotY 轉」是同一件事）
- [ ] **B2** `tools/serve.mjs` 開放區網時，8.3 短檔名可以繞過隱藏檔過濾（#4，做 G8 之前要修）
- [~] **B3** `PostFX` 的 `bloom.levels || 3` 把 0 當成沒設定（#5）（進行中：@nickcx0109，分支 fix/small-engine-bugs）
- [ ] **B4** `shots.mjs` 某一張逾時就整個中斷（#6）
- [~] **B5** fps 統計的 `elapsed` 沒限制範圍（#7）（進行中：@nickcx0109，分支 fix/small-engine-bugs）
- [~] **B6** `_countLights` 每幀走訪整個場景（#8）（進行中：@nickcx0109，分支 fix/small-engine-bugs）
- [ ] **B7** `StaticBatcher` 整關合併、無法剔除，要改成按區塊合併（#9，S1 會遇到）
- [~] **B8** 手電筒改了 `shadow.camera.near` 沒呼叫 `updateProjectionMatrix`（#10）（進行中：@nickcx0109，分支 fix/small-engine-bugs）
- [ ] **B9** `mood.json` 的 `spawns.zombies[1]` 和 `tree_56` 重疊（出生點檢查變嚴格後才出現的警告）
- [ ] **B10** 抗鋸齒：沒有 MSAA 也沒有 FXAA
- [ ] **B11** 品質分級和自動降解析度（PERFORMANCE_PLAN 3.3）；固定的效能測試場景（第 4 節第 2 點）
- [ ] **B12** `Emitters` 沒有公開的方法讓章節道具登記每幀動畫；`Ch1Props.js` 的營火閃爍暫時直接用內部的 `_animations` 陣列（欄位改名的話火只是不閃，不會壞）
- [ ] **G11** 換樓層（`web/js/level/LevelFlow.js`）會重新載入頁面：`play=1` 時血量、子彈、金錢會重來，也要再點一下才能鎖滑鼠。要讓玩法狀態跨關卡保留，或改成不重新載入就換關
- [ ] **B13** `WEAPON_FIRED`、`WEAPON_RELOADED`、`WEAPON_CHANGED` 的 payload 沒有子彈數，也沒有「開始換彈」的事件；補彈（`refill`）也不發事件。HUD 現在靠 `ui/hud/PlayerStatus.js` 每幀從 Session 抄數字。做連線（G8）時要嘛在事件裡帶上數字，要嘛讓快照填 `PlayerStatus`。

## 其他

- [ ] **O1** 更新 README 的 commit 統計表（照表下的指令重跑）

---

## 已完成

格式：`代號 標題（PR #編號）`。

- 遊戲骨架：武器、敵人、狀態、商店各一個範例，修好碰撞 #1、#2（PR #6）
- S1 第一章灰盒（PR #8）
- S6 第三章灰盒：一樓、二樓、頂樓三個關卡檔，樓梯間與載燃料的貨梯，樓層切換和擋路的障礙物（PR #11）
- G12 遊戲內介面（HUD）重做（PR #14）
- G1 步槍和霰彈槍（PR #9）
- G2 更多殭屍種類（PR #10）
- G4 商店介面和更多商品（PR #16）
