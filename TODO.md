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

- [~] **G7 倒地和救援**（進行中：@nickcx0109，分支 feat/downed-revive）
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
    - 武士刀模型（G24 只做了刀光）：參考舊原型 `reference/old-web-prototype/prototype-web/gfx/weapons.js` 的 `katana()`，鮫皮柄加柄卷的菱形窗、黃銅鐔、彎的刀身分鎬地／平地／刃三段，刃口一條淡藍發光線。揮刀動畫的掃過時間對齊刀光（`ui/hud/logic/SlashStyles.js` 的 `sweepSeconds`，0.08 秒），方向也要一致：刀光每一刀左右交替（`SlashTrail.side`）。
- [ ] **G15 隊友狀態列**（等 G14）
  - 內容：從 `ui/hud/TeamWidget.js` 改：左下排隊友的頭像、名字、血條，身上有治療物就顯示小圖示；右下是自己的血量，低血量變紅。
- [ ] **G16b 繃帶的隊友圖示**（等 G15）
  - 內容：G16 已完成；隊友狀態列做好後，身上有繃帶的隊友顯示小圖示。治療進度條現在在畫面下方的提示列，如果要放正中間再改。
- [ ] **G17 狙擊槍**（等 G11）
  - 內容：地上撿，放主武器格。傷害 150、射程 120 m、彈匣 5、備彈 25、每發間隔 1.2 秒。（在 `installGameplay` 的武器清單 `WeaponCatalog` 註冊，自動進 `type: "weapon"` 點的隨機名單）
- [ ] **G21 腎上腺素**（等 G14）
  - 內容：放第 7 格，最多 1 個。用了 10 秒內換彈時間減半、移動速度 ×1.3。（地上撿，放在 `type: "healing"` 點，有自己的治療物清單，和武器、投擲物分開抽）
- [~] **G27 左輪和霰彈槍一發一發裝**（進行中：@big0527，分支 feat/single-round-reload）
  - 內容：按 R 之後一發一發裝進去，每裝一發就有一聲；裝到一半按左鍵可以直接開火（只裝一發也能打）。
- [~] **G28 真實音效**（進行中：@big0527，分支 feat/real-sounds）
  - 內容：還在用程式合成的音效（換彈、子彈打中、受傷、撿東西、丟東西、波次、補彈）換成真實錄音，授權要能用（CC0 優先），來源寫進 `web/assets/sfx/CREDITS.md`。
- [x] **G22 殭屍數量變多、變快、傷害降低**（所有章節）（@big0527，分支 feat/zombie-horde）
  - 內容：每波數量 ×1.5、速度 ×1.25、傷害 ×0.6（先用這個值試玩再調）。會改 G3 的波次表和各種殭屍數值，開工前先和 @nickcx0109 講好。
  - 結果：使用者改成數量 ×10、速度 ×2、傷害不變。原本的波次表和殭屍類別沒動，倍數都在 `installGameplay` 的 `new Difficulty({ count: 10, speed: 2 })`，要調只改這一行。同時活著最多 40 隻（PERFORMANCE_PLAN 的上限）。
- [x] **G10 音效**（@big0527，分支 feat/sound；槍聲來自 gunsoundeffect.com，見 `web/assets/sfx/CREDITS.md`）
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
- [ ] **B7** `StaticBatcher` 整關合併、無法剔除，要改成按區塊合併（#9，S1 會遇到）
- [ ] **B10** 抗鋸齒：沒有 MSAA 也沒有 FXAA
- [ ] **B11** 品質分級和自動降解析度（PERFORMANCE_PLAN 3.3）；固定的效能測試場景（第 4 節第 2 點）
- [ ] **B15** 換樓層（`web/js/level/LevelFlow.js`）會重新載入頁面：`play=1` 時血量、子彈、道具欄會重來，也要再點一下才能鎖滑鼠。要讓玩法狀態跨關卡保留，或改成不重新載入就換關
- [ ] **B13** `WEAPON_FIRED`、`WEAPON_RELOADED`、`WEAPON_CHANGED` 的 payload 沒有子彈數，也沒有「開始換彈」的事件；補彈（`refill`）也不發事件。HUD 現在靠 `ui/hud/PlayerStatus.js` 每幀從 Session 抄數字。做連線（G8）時要嘛在事件裡帶上數字，要嘛讓快照填 `PlayerStatus`。

## 其他


---

## 已完成

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
- G16 G20 繃帶、手榴彈、燃燒瓶，地上的治療物和投擲物點；跳躍、槍的後座力（分支 feat/more-guns，還沒開 PR）
- G18 G19 G13 武士刀、鏈鋸（每個場景 2 個近戰點）、彈藥箱（每個場景 3 個）；投擲物會傷到自己和隊友（分支 feat/more-guns）
- G24 武士刀刀光：揮刀時畫面有一道弧形刀光，打到更亮更粗；`SlashStyles` 註冊表讓之後的近戰也能用（分支 feat/katana-slash）
- G25 其他武器的第一人稱模型：`play=1` 時十一把武器都看得到，換武器會切換，開槍有後座和火光、換彈和揮砍有動作；沿用 G9 的 `WeaponRig`、`WeaponView`、`Clip`（分支 feat/weapon-models）
- G26 拿掉商店和金錢（PR #30）
