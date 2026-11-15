# 用 Fable 建場景的執行計畫

這份文件給負責建場景的組員使用：一次把一個「任務」整段貼給你自己的 Fable（Claude Fable 5.2）。規則和數值的來源是 [SCENE_PIPELINE.md](SCENE_PIPELINE.md)，預算看 [PERFORMANCE_PLAN.md](../tech/PERFORMANCE_PLAN.md)，故事看 [docs/story/](../story/README.md)。

## 怎麼用

1. clone 這個 repo，從 `main` 開自己的分支（例如 `feat/scene-ch2`）。
2. 在 repo 根目錄開 Claude Code，模型選 Fable，effort 選 high。
3. 照順序一次貼一個任務。**每個任務做完先看截圖、看 commit，滿意再貼下一個**。
4. commit 用你自己的 git 帳號，push 前讓組長看過 diff，再開 PR。

| 任務 | 內容 | 需要 Blender | 誰要先核可 |
|---|---|---|---|
| T1 | 場景骨架：讀關卡 JSON、走動、碰撞、手電筒 | 否 | — |
| T2 | 氣氛樣板：三種陰森程度的截圖 | 否 | 三人選一種 |
| T3 | 第二章灰盒 | 否 | 章節負責人 |
| T4 | 資產工具（Blender 批次輸出、預覽、檢查） | 是 | — |
| T5 | 轉換素材包 | 是 | — |
| T6 | 第二章專屬資產 | 是 | 章節負責人看預覽圖 |
| T7 | 第二章擺模型、打光 | 否 | 三人看截圖 |
| T8 起 | 第一章、第三章重複 T3、T6、T7 | — | — |

T1～T3 不需要 Blender，可以先做。T4 之前先裝 [Blender 4.2 LTS](https://www.blender.org/download/lts/)，確認 `blender --background --python-expr "print(1)"` 能跑。

## 每個任務都要附的共同規則

把下面這段放在每個任務的最前面一起貼：

```
你在 404-huang-not-found repo 做網頁版殭屍遊戲的地圖美術。開始前先讀：
- docs/art/SCENE_PIPELINE.md（流程與風格，這是規格）
- docs/tech/PERFORMANCE_PLAN.md 第 3.1 節（效能預算，不能超過）
- docs/story/ 底下的故事
- 如果 art/style/STYLE_GUIDE.md 存在，也要讀

共同規則：
- 只做這個任務寫的範圍，做完就停，回報結果。
- 不改 docs/story/。不改 git config。不要 push。
- 玩法資料（碰撞、出生點、出怪點）和外觀分開；換外觀不能動到碰撞。
- 顏色、霧、燈光數值只放在 art/style/palette.json，程式裡不寫死。
- 每做完一件事 commit 一次，英文 Conventional Commits，例如 feat(scene): ...、feat(art): ...、chore: ...。
- 截圖要自己打開看，對照規格自評，不滿意就修，最多 3 輪。
- 截圖每張盡量 300 KB 以內，只 commit 最後一版。

完成時回報：commit 清單、怎麼執行（完整指令）、截圖路徑、自評哪裡還不滿意、和計畫不一樣的地方。
```

## T1 場景骨架

```
任務 T1：在 web/ 建立場景骨架。

- 純 HTML + 一般 <script>，Three.js r128：https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js。不用打包工具。
- tools/serve.mjs：不需要任何套件的靜態 server，port 8080。用 node tools/serve.mjs 啟動。
- web/index.html?level=<名稱> 讀 web/levels/<名稱>.json 並建出場景。
- 走動模式：pointer lock 滑鼠視角 + WASD，眼睛高度 1.7 m，和關卡碰撞盒做 AABB 碰撞。玩家手電筒（SpotLight）預設開啟。
- 架構要模組化（期末評分看物件導向設計）：
  LevelData（讀取並驗證 JSON）→ SceneBuilder（建碰撞與外觀）→ PropFactory（道具名稱 → mesh，不認得的名稱退回成碰撞盒大小的灰色方塊）。
  Atmosphere 讀 art/style/palette.json 設定霧、燈光、後製。
- 關卡 JSON 至少要有：colliders（x,z,w,d,h）、props（name、位置、旋轉，可對應一個 collider）、spawns.players、spawns.zombies、bookmarks（具名機位：位置＋朝向）。寫一份 web/levels/README.md 說明格式。
- 解析度倍率上限 1.5。後製保持輕量：tone mapping、暗角、顆粒；bloom 可選，用半解析度。
- ?shot=<機位名稱> 時把相機放到該機位，畫完一幀後設 window.__ready = true，給截圖工具用。
- 用一個 web/levels/test.json（幾個方塊）確認能走、能撞牆。
- 加 .gitignore（node_modules/、截圖暫存資料夾）。
```

## T2 氣氛樣板

```
任務 T2：氣氛樣板（先把「陰森」定下來，再做任何模型）。

- web/levels/mood.json：約 30 m 長的灰盒森林山路：路面、兩旁一排排方塊或圓柱當樹、一台廢車的剪影、路的盡頭有紅色自發光尾燈當引導色。
- art/style/palette.json 加 "mood" 區塊，放三組預設：subtle / medium / heavy（霧的顏色與密度、曝光、飽和度、暗角、顆粒、半球光、月光、手電筒）。起點用 SCENE_PIPELINE.md 第 2 節的數值：灰綠霧約 #2a3330、視距 20～30 m、曝光 0.8～0.95、飽和度 0.75～0.85。網址 ?preset=<名稱> 切換。
- tools/art/shots.mjs：用 Playwright 截圖。repo 根目錄加 package.json，playwright 放 devDependencies，執行 npx playwright install chromium。headless 的 WebGL 需要啟動參數，例如 --use-angle=swiftshader、--enable-unsafe-swiftshader。
- 每組預設 × 3 個機位，存成 art/style/refs/candidates/<preset>-<機位>.png，1280×720。
- 自評標準：陰森，但路和紅色引導光看得清楚；不是全黑；不是上一版那種藍色月光的感覺。
- 寫 art/style/STYLE_GUIDE.md（簡短）：SCENE_PIPELINE.md 第 2 節的規則，加上三組預設各是什麼感覺。
```

做完後三人一起看 `art/style/refs/candidates/`，選定一組。把結果告訴 Fable：「選 medium，把它設成預設，其他兩組留著」，再進 T3。

## T3 第二章灰盒

```
任務 T3：第二章灰盒 web/levels/ch2.json。

- MVIDIA 總部大門前約 40 × 40 m 的廣場。玩家背對大門，殭屍從三個方向進來：左邊街道、右邊街道、前方停車場。
- 要有：碰撞（大門與建築正面的牆、保全亭、拒馬與沙包掩體、停著或撞爛的車、矮牆）；掩體的位置要讓三個人各守一邊。
- 3 個以上的殭屍出生區，在玩家視線外；大門旁一個商店位置；3 個玩家出生點；6～8 個機位。
- 每個外觀項目都用道具名稱（barricade、sandbags、guard_booth、mvidia_gate、car_wreck、warning_light ...），之後換成真模型時不用動碰撞。
- 現在用灰色方塊，但要套第二章的氣氛：palette.json 加 "ch2" 區塊，濕柏油的深藍灰基調；重點色是故障閃爍的公司綠色招牌 #76ff3a（自己設計的標誌形狀，不要仿任何真實公司的 logo）；旋轉的紅色警示燈。
- 從每個玩家出生點都要走得到每個掩體。
- 機位截圖存到 art/style/refs/ch2-greybox/。
- 回報 ch2 的 draw call 和三角面數（renderer.info）。
```

## T4 資產工具

```
任務 T4：資產工具（Blender 已安裝）。

照 SCENE_PIPELINE.md 第 3 節和第 5 節第 1 步，建立：
- tools/art/build_assets.py：在 Blender 背景模式批次執行 art/blender/<id>.py，每支輸出 web/assets/models/<id>.glb。
- tools/art/preview.py：每個資產輸出 4 個角度的預覽圖到 art/previews/<id>/。
- tools/art/check_assets.mjs：檢查 art/manifest.json 裡每一筆的三角面上限、檔案大小、尺寸、命名、方向（公尺、+Y 朝上、正面朝 -Z、原點在底部中心）。不合格就以非 0 結束。
- art/manifest.json：資產清單格式（id、章節、來源 kit/blender、三角面上限、狀態）。
- 用一個簡單的測試資產（例如 test_crate.py）把整條流程跑通一次，並在 docs/art/ 補一段「如何新增一個資產」。
```

## T5 轉換素材包

素材包先自己下載到 repo 外面的資料夾（例如 `../asset_drop/`），**不要放進 repo**：

- Quaternius（CC0）：Ultimate Nature Pack、Zombie Apocalypse Kit、Cars Pack，到 [quaternius.com](https://quaternius.com) 下載。
- Kenney（CC0）：Survival Kit、Furniture Kit，到 [kenney.nl](https://kenney.nl/assets) 下載。

```
任務 T5：轉換素材包。素材在 <你的素材資料夾路徑>。

- tools/art/convert_kit.py：把選定的 FBX 轉成 GLB，修正縮放與方向，材質統一改成陰森色調（降飽和、加髒污），讓不同來源看起來是同一套。
- 這次先轉第二章需要的：廢車、路障、油桶、路燈、垃圾、圍欄。每個都登記到 art/manifest.json，跑 preview.py 和 check_assets.mjs。
- 只把實際要用的 GLB 放進 repo。授權寫進 art/CREDITS.md（作者、包名、網址、CC0）。
```

## T6 第二章專屬資產

```
任務 T6：用 Blender Python 腳本做第二章的專屬資產，一個資產一支 art/blender/<id>.py。

清單：mvidia_gate（總部大門、門禁面板，標誌自己設計）、guard_booth（保全亭，可做翻倒版本）、barricade 和 sandbags、warning_light（紅色旋轉警示燈的燈罩，光由程式加）。

每個資產走：寫腳本 → build_assets.py → preview.py → 自己看 4 張預覽圖，對照 manifest 規格自評，不合格回去改（最多 3 輪）→ check_assets.mjs 通過 → commit。
面數上限照 SCENE_PIPELINE.md 第 5 節第 1 步的表。能用頂點色就不用貼圖。
```

章節負責人看過 `art/previews/` 再進 T7。

## T7 第二章擺模型與打光

```
任務 T7：把第二章灰盒換成模型並打光。

- PropFactory 改成用 GLTFLoader（https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js）載入 web/assets/models/ 的 GLB；同一種道具重複出現時用 InstancedMesh 或共用 geometry。
- 不動 ch2.json 的 colliders，只改 props 的名稱、旋轉和小幅位置。
- 打光：套 palette.json 的 ch2 數值；加招牌閃爍、警示燈旋轉、霧的緩慢流動。同時開的動態燈不超過 4 盞（含手電筒）。
- 重拍所有機位，存到 art/style/refs/ch2/，並和 ch2-greybox 的截圖並排比較。
- 回報 draw call、三角面數、這一章的模型總大小，對照 PERFORMANCE_PLAN.md 第 3.1 節的預算。
```

## 第一章、第三章

第二章做完、流程跑順之後，同樣照 T3 → T6 → T7 做第一章和第三章。每章要改的地方：

| 章 | T3 灰盒重點 | T6 專屬資產 |
|---|---|---|
| 第一章 | 約 300 m 的山路，分 3 段、2 個檢查點；兩旁用濃霧和樹牆擋住；每隔一段有一個小景（翻倒的車、空帳篷）；終點是車 | road_segment（直線、彎道、坡道）、guardrail、guardrail_broken、escape_car（尾燈自發光） |
| 第三章 | 一樓燃料桶區（約 20 個放置點）、貨梯、頂樓發射台三個區塊；室內以 2 m 格子拼 | office_kit（牆、門、窗、走廊、轉角）、server_rack、freight_elevator、fuel_barrel 三種狀態、rocket、launch_pad、cage |

角色（殭屍、Boss、老黃、主角）不在場景任務範圍內。
