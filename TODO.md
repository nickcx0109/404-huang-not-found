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

玩法比美術優先。介面和擴充步驟都在 [docs/tech/GAMEPLAY.md](docs/tech/GAMEPLAY.md)，每一項都先讀它。新內容一律放在新檔案、用繼承或註冊加進去，不改 `Pistol`、`Walker` 這兩個範例。

- **G8 線上多人連線**：設計和協定都在 [docs/tech/NETWORK.md](docs/tech/NETWORK.md)，每一項開工前先讀。雲端 Node server 跑 `GameSession`，瀏覽器用隊伍編號加入。相依：G8a、G8b、G8c 可以同時做；G8d 等 G8a、G8b；G8e 等 G8c、G8d；G8f 部署準備之後，G8m 最後。
  - [ ] **G8m 實際部署和實測**（最後）：照 README「線上多人」部署到東京（Fly.io，`fly.toml`）或新加坡（Render，`render.yaml`），確認只有一台機器在跑；兩台電腦在不同網路用隊伍編號一起打完第二章，用 `node tools/net-latency.mjs wss://<網址> 50` 記錄延遲（min／median／p95），把延遲和遇到的問題寫進 NETWORK.md「部署」或新的 TODO 項目。
  - [ ] **G8h 快照補上彈藥箱和飛行中的效果**：協定還沒有彈藥箱能不能拿（線上的箱子永遠顯示可以拿），也沒有 `effects` 清單（飛行中的手榴彈、汽油彈、燃燒的地面），瀏覽器只畫得出爆炸閃光。在 snapshot 加欄位（記得更新 NETWORK.md 和 `protocol.js` 的檢查），瀏覽器用 `AmmoCrateViews`、`EffectViews` 畫出來；加測試。
  - [ ] **G8i 遊戲中斷線可以回來**：遊戲開始後重新連線，server 會回 `started`，瀏覽器只能顯示「連線中斷」。讓斷線的玩家在同一個位置（同一個編號、血量和武器）回到進行中的遊戲；加測試。
  - [ ] **G8k 線上的關卡出口和障礙物**：`installLevelFlow` 線上整個關掉（`OnlineMode.blocksLevelFlow`）。改成由 server 決定：有人在出口按 E 時送 action，server 處理後用事件通知所有人。
- [~] **G9 槍的第一人稱模型和動畫**（進行中：@nickcx0109，分支 feat/weapons-art，暫停）
  - 做到一半，已 push 到分支 `feat/weapons-art`（5 個 commit，還沒開 PR、沒合併）：資產庫的可動零件、手槍模型 `pistol.glb`、`art/manifest/weapons.json`、`web/js/weapons/` 的 `WeaponRig`、`WeaponView`、`PistolView`、`Clip`、`WeaponModel`（開槍、換彈、拿出的動畫）。
  - 接手前：這個分支是從 PR #6 之前的 `main` 開的，要先 `git rebase main`。`web/js/App.js` 會衝突，兩邊的改動都要留。
  - 還沒做：
    - 改用玩法骨架的事件。現在用自己的 `weapon:fire`、`weapon:reload`，還自己綁滑鼠和 R 鍵；要改成訂閱 `game/events.js` 的 `WEAPON_FIRED`、`WEAPON_RELOADED`、`WEAPON_CHANGED`。
    - 走動模式現在預設會拿槍，畫面會變。要決定是只在 `play=1` 顯示，還是接受走動模式的截圖改變。
    - 測試，以及 G1 的步槍和霰彈槍模型。
    - 武士刀模型（G24 只做了刀光）：參考舊原型 `reference/old-web-prototype/prototype-web/gfx/weapons.js` 的 `katana()`，鮫皮柄加柄卷的菱形窗、黃銅鐔、彎的刀身分鎬地／平地／刃三段，刃口一條淡藍發光線。揮刀動畫的掃過時間對齊刀光（`ui/hud/logic/SlashStyles.js` 的 `sweepSeconds`，0.08 秒），方向也要一致：刀光每一刀左右交替（`SlashTrail.side`）。
- [~] **G27 左輪和霰彈槍一發一發裝**（進行中：@big0527，分支 feat/single-round-reload）
  - 內容：按 R 之後一發一發裝進去，每裝一發就有一聲；裝到一半按左鍵可以直接開火（只裝一發也能打）。
- [~] **G28 真實音效**（進行中：@big0527，分支 feat/real-sounds）
  - 內容：還在用程式合成的音效（換彈、子彈打中、受傷、撿東西、丟東西、波次、補彈）換成真實錄音，授權要能用（CC0 優先），來源寫進 `web/assets/sfx/CREDITS.md`。

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

- [ ] **B18** 第一章的車、卡車替身（`Ch1Props.js` 的 `ch1_*`、`escape_car`）畫出來比 collider 大，B17 量過但沒改：`ch1_car_crashed` 凸出 0.13 m、`ch1_car_flipped` 0.08 m、`ch1_car_hazard` 0.035 m、`escape_car` 0.03 m，`ch1_box_truck` 0.29 m；`ch1_car_blocking`（1.8 m）、`ch1_car_lights`（0.8 m）、`ch1_box_truck_looted`（3.1 m）、`ch1_car_open`（3.8 m）凸出的多半是打開的車門和地上散落的東西。要決定哪些算擋路，再補 `footprint` 或改 collider，記得看出怪路線（`test/CrowdStall.test.js`）
- [ ] **B7** `StaticBatcher` 整關合併、無法剔除，要改成按區塊合併（#9，S1 會遇到）
- [ ] **B11** 品質分級和自動降解析度（PERFORMANCE_PLAN 3.3）；固定的效能測試場景（第 4 節第 2 點）

## 其他

- [ ] **G8o 隊友的電鋸、換彈聲**：G8j 只在隊友的位置播 `weapon.fired` 的 `fire`／`hit`（槍聲、揮刀）。隊友拿電鋸沒有循環聲（`SoundBoard.hold`／`loop` 沒有位置），隊友換彈也沒聲音。要讓循環聲帶位置、跟著隊友移動；加測試。
- [ ] **G8n 限制 input 頻率**：G8g 之後灌 input 已經跑不快（`MoveBudget` 只跟著時間累積），但每則 input 還是會做一次 `CollisionWorld.move`，一個 client 每秒送幾千則還是會吃 server 的 CPU。用一個獨立的類別丟掉遠快於每秒 30 則的 input（注意最後一則不能丟，不然位置會停在舊的），加測試。


---

## 已完成

- B15 換樓層保留血量、子彈和道具欄，點一下繼續（PR #60）
- G8g 連線防作弊收緊：移動額度跟著時間累積（`MoveBudget`）（PR #58）
- G8l 只有房主能按開始（PR #58）

- B13 武器事件帶子彈數（PR #45）

- G21 腎上腺素（PR #43）

- G17 狙擊槍（PR #42）

- G15 隊友狀態列（PR #41）
- G16b 繃帶的隊友圖示（PR #41）

- G7 倒地和救援（PR #40）

格式：`代號 標題（PR #編號）`。

- G5 開始、結束、重開畫面（PR #31）
- G6 第二章過關條件：守住大門 180 秒到開鎖（`Objective` 類別，關卡檔的 `objective`）（PR #32）

- 遊戲骨架：武器、敵人、狀態、商店各一個範例，修好碰撞 #1、#2（PR #6）
- S1 第一章灰盒（PR #8）
- S6 第三章灰盒：一樓、二樓、頂樓三個關卡檔，樓梯間與載燃料的貨梯，樓層切換和擋路的障礙物（PR #11）
- G12 遊戲內介面（HUD）重做（PR #14）
- G1 步槍和霰彈槍（PR #9）
- G2 更多殭屍種類（PR #10）
- B3 B5 B6 B8 引擎小 bug（PR #17）
- B4 `shots.mjs` 某一張逾時不再中斷整批（PR #33）
- B16 截圖比對容許軟體繪圖雜訊：`tools/art/compare.mjs`（PR #34）
- B14 暫停時聲音一起停（PR #35）
- B12 `Emitters.addAnimation`，章節道具不再碰內部陣列（PR #36）
- B9 `mood.json` 的 `woods_right` 出生點移出 `tree_56`（PR #37）
- B2 開發伺服器不再讓 8.3 短檔名讀到隱藏檔（PR #38）
- O1 README 的 commit 統計表更新到 2026-11-20（PR #39）
- G3 波次設計（PR #15）
- G4 商店：取消，改成地上撿（PR #16 關閉不合併）
- G11 地上撿武器和開局裝備：手槍（無限備彈）、球棒、主武器格換槍，地上的槍有高光邊框（PR #18）
- G14 道具欄 7 格、滾輪切換、右側側邊欄（PR #19）
- G23 衝鋒槍、左輪，地上的槍位置固定、內容隨機（PR #20）
- G16 G20 繃帶、手榴彈、燃燒瓶，地上的治療物和投擲物點；跳躍、槍的後座力（PR #20）
- G18 G19 G13 武士刀、鏈鋸（每個場景 2 個近戰點）、彈藥箱（每個場景 3 個）；投擲物會傷到自己和隊友（PR #20）
- G24 武士刀刀光：揮刀時畫面有一道弧形刀光，打到更亮更粗；`SlashStyles` 註冊表讓之後的近戰也能用（PR #24）
- G25 其他武器的第一人稱模型：`play=1` 時十一把武器都看得到，換武器會切換，開槍有後座和火光、換彈和揮砍有動作；沿用 G9 的 `WeaponRig`、`WeaponView`、`Clip`（PR #25）
- G26 拿掉商店和金錢（PR #30）
- B10 抗鋸齒（PR #44）
- G10 音效（PR #21）
- G22 殭屍數量 ×10、速度 ×2（PR #23）
- O2 README 的 commit 統計表更新到 2026-11-24（PR #46）
- B16 矮視窗的道具欄不再蓋到彈藥；`tools/hud-overlap.mjs` 檢查六種尺寸（PR #47）
- G8a 房間 server：隊伍編號、建立／加入／離開／開始、訊息驗證、`server/main.mjs`（PR #49）
- G8c 瀏覽器端連線類別：`NetClient`、`ServerClock`、`SnapshotBuffer`、`InputSender`（PR #48）
- G8b 單機和 server 共用的 `createSession()`；遠端 controller 的規則寫在 GAMEPLAY.md（PR #50）
- B1 旋轉、縮放的道具碰撞盒跟著變大；`footprint` 欄位（PR #51）
- B17 車輛模型的碰撞盒包住整台模型：manifest 記 GLB 量的 `footprint`，ch2 的卡車、廂型車、停著的車照抄（PR #57）
- G8d server 跑遊戲：`SessionRoomGame`、`RemoteController`、開槍倒回時間、快照和事件轉送（PR #52）
- G8e 瀏覽器接上連線：隊伍開始畫面和房間、`OnlineMode`（本地預測、快照插值、殭屍方塊和隊友膠囊、事件轉成單機事件）、連線時第二章警示燈降到 1（PR #54）
- G8f 部署準備：一個 port 送網頁、`/health` 和 WebSocket（`server/http/`），game server 送出的網頁自動連自己、`Dockerfile`、`fly.toml`（東京）、`render.yaml`（新加坡）、`npm start`、`tools/net-latency.mjs`（PR #55）
- G8j 聽得到隊友的槍聲：`TeammateWeaponSounds` 在隊友的位置播他那把武器的槍聲（左右聲道、60 m 衰減），自己的槍不會播兩次（PR #56）
