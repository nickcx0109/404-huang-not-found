# 關卡資料格式

一個關卡就是一個 `web/levels/<名稱>.json`。裡面只有玩法資料（碰撞、出生點、出怪點、機位）和「這裡要放什麼道具」的名稱，沒有任何顏色或模型檔路徑。外觀由 `PropFactory` 依道具名稱決定，顏色、霧、燈光由 `art/style/palette.json` 決定，所以換外觀不需要改這個檔。

## 執行

```
node tools/serve.mjs
```

打開 <http://localhost:8080/web/index.html?level=test>（氣氛樣板：<http://localhost:8080/web/index.html?level=mood&preset=medium>）。`level` 是檔名去掉 `.json`，只能用英數字、`-`、`_`。

## 座標

- 單位公尺，+Y 朝上，地面是 y = 0。
- 角度都是「度」。`yaw` 0 朝 -Z，正值往左轉（從上往下看是逆時針）：`yaw: 90` 朝 -X，`yaw: -90` 朝 +X。`pitch` 正值往上看。
- 道具模型的慣例和 SCENE_PIPELINE.md 一樣：正面朝 -Z、原點在底部中心。

## 欄位

```jsonc
{
  "version": 1,
  "name": "test",              // 選填，預設用檔名
  "title": "Skeleton test room", // 選填
  "palette": "default",        // 選填，氣氛區塊的名稱：palette.json 裡的，或 art/style/chapters/<名稱>.json；不寫就用 default
  "manifests": ["common", "ch2"], // 選填，這一關可以用哪幾份資產清單（art/manifest/<名稱>.json）裡的模型

  "bounds": { "x": 0, "z": 0, "w": 30, "d": 30 },

  "colliders": [
    { "id": "wall_n", "x": 0, "z": -14.75, "w": 30, "d": 0.5, "h": 3 },
    { "id": "beam", "x": 0, "z": -1, "w": 5.5, "d": 0.5, "h": 0.4, "y": 2.4 },
    { "id": "fence", "x": -10, "z": 8, "w": 4, "d": 0.3, "h": 2, "visible": false }
  ],

  "props": [
    { "name": "crate", "collider": "crate_a" },
    { "name": "generator", "collider": "generator", "rotY": 90 },
    { "name": "debris", "x": -9, "y": 0, "z": -9, "rotY": 30, "scale": 1 },
    { "name": "road", "x": 0, "y": 0, "z": 0, "size": [6, 0.04, 120] }
  ],

  "spawns": {
    "players": [ { "x": 0, "z": 10, "yaw": 0 } ],
    "zombies": [ { "id": "north", "x": 0, "z": -13, "r": 2 } ]
  },

  "bookmarks": [
    { "name": "spawn", "pos": [0, 1.7, 10], "yaw": 0, "pitch": 0 },
    { "name": "overview", "pos": [9, 6.5, 12], "lookAt": [-1, 0.5, -3] }
  ]
}
```

（上面的 `//` 註解只是說明，實際的檔案是純 JSON，不能有註解。）

### `colliders`（必填）

軸對齊的碰撞盒（AABB），不能旋轉。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `x`, `z` | 是 | 盒子中心在地面上的位置 |
| `w`, `d`, `h` | 是 | X 方向寬度、Z 方向深度、高度，都要大於 0 |
| `y` | 否 | 盒子底部的高度，預設 0。底部在 1.8 m 以上的盒子（例如橫樑）玩家可以從下面走過 |
| `id` | 否 | 給 `props` 對應用，不能重複。不寫會自動叫 `c0`、`c1`… |
| `visible` | 否 | 設成 `false` 就是看不見的空氣牆，只有碰撞 |

### `props`（必填，可以是空陣列）

看得到的東西。只影響外觀，**不會產生碰撞**；要擋人就另外寫一個 collider，再用 `collider` 指過去。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `name` | 是 | 道具名稱，由 `PropFactory` 對應到 mesh |
| `collider` | 否 | 這個道具代表哪一個 collider 的 `id` |
| `x`, `z` | 有 `collider` 時可省略 | 位置；省略時放在 collider 的中心 |
| `y` | 否 | 底部高度，預設 0（有 collider 時預設是 collider 的 `y`） |
| `rotY` | 否 | 繞 Y 軸旋轉的角度，預設 0 |
| `scale` | 否 | 等比例縮放，預設 1 |
| `size` | 否 | `[寬, 高, 深]`，灰盒替身要畫多大。不寫就用 collider 的大小，也沒有 collider 就是 1 m。只影響外觀 |

規則：

- 沒有被任何道具指到的 collider，會直接畫成 collider 大小的灰色方塊（灰盒）。
- 被道具指到的 collider 不再另外畫，由那個道具負責外觀。
- 每個道具照這個順序決定外觀：**模型**（`web/assets/models/<name>.glb`，要這一關的 `manifests` 裡有一份把它標成 `ready`，而且檔案載得到）→ **灰盒替身**（`web/js/props/` 裡註冊的）→ **灰色方塊**。模型壞掉或不見只會退回下一種，關卡照常能玩，console 會有一行警告。模型有自己的實際大小，`size` 和 collider 的大小只影響替身。
- `PropFactory` 不認得的名稱會退回成灰色方塊：有 `collider` 就畫成碰撞盒的大小和位置（不套 `rotY`，因為碰撞盒不能轉），沒有就畫 1 m 的方塊。所以可以先把之後要用的名稱（`barricade`、`guard_booth`…）寫進去，等模型做好再換，碰撞不用動。
- 目前有灰盒替身的名稱，大小用 `size`，沒有就跟著 collider。新的替身加在**自己那一章**繼承 `PropSet` 的檔案裡（`static builders` 的 `name: builder`），由基底統一註冊；一個名稱只能由一個檔案擁有。
  - `web/js/props/CommonProps.js`（共用）：`crate`（方塊）、`pillar`（圓柱）、`road`（路面，要給 `size`）、`building`、`low_wall`、`fence`、`car_wreck`（廢車）、`car_parked`（停著的車）、`truck_wreck`、`van_wreck`、`street_lamp`。
  - `web/js/props/Ch1Props.js`：`tree`（枯樹）、`escape_car`（尾燈會亮的車，用 palette 的重點色）。
  - `web/js/props/Ch2Props.js`：`mvidia_gate`（大門）、`mvidia_sign`（發光招牌，不要 collider，`size` 是 `[板寬, 字高, 厚度]`）、`gate_panel`（門禁面板）、`guard_booth`、`shop_terminal`（場景裝飾終端機）、`sandbags`、`barricade`、`warning_light`（警示燈，給 `size` 就立在那麼高的桿子上，`rotY` 是光一開始照的方向）、`hq_wall`。
  - `web/js/props/Ch3Props.js`：還沒有。
  - `test_crate` 沒有替身，只有模型（流程測試用，在 test 關卡）。
- `warning_light` 只有關卡裡**排在最前面的幾個**有真的燈（數量是 palette 的 `alarm.light.count`），其餘只有發光的燈罩。動態燈上限 4 盞（含手電筒），要調整就改 palette，不用改關卡。

### `spawns`（必填）

| 欄位 | 說明 |
|---|---|
| `players[]` | 至少一個。`x`、`z` 必填，`yaw` 選填（預設 0） |
| `zombies[]` | 可以是空陣列。`x`、`z` 必填；`r` 是出生區半徑（預設 1）；`id` 選填 |

出生點落在碰撞盒裡面時，載入會在 console 出現警告。

### `bookmarks`（必填，可以是空陣列）

具名機位，給截圖和檢查用。`name` 只能用英數字、`-`、`_`，不能重複。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `pos` | 是 | `[x, y, z]`，相機位置（站著的視角 y 用 1.7） |
| `lookAt` | 二擇一 | `[x, y, z]`，相機看向的點 |
| `yaw`, `pitch` | 二擇一 | 直接給角度；`pitch` 可省略 |
| `fov` | 否 | 垂直視角（度），不寫就用預設的 70 |

在走動模式按 `B`，console 會印出目前位置的機位 JSON，可以直接貼進來。

### `markers`（選填）

具名的玩法位置：地上的武器和道具點、彈藥箱、目標、防守點，之後的檢查點、燃料桶放置點也放這裡。只是資料，不會畫出東西（`debug=1` 時畫成青色方框）。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `type` | 是 | 種類，例如 `weapon`、`objective`、`post` |
| `x`, `z` | 是 | 位置 |
| `id` | 否 | 不能重複，不寫會自動叫 `m0`、`m1`… |
| `r` | 否 | 範圍半徑，預設 1 |
| `yaw` | 否 | 朝向（度），預設 0 |
| `item` | 否 | 這個點給的東西，英數字、`-`、`_`。`type: "weapon"` 用它指定地上的槍：`rifle`、`shotgun`、`smg`、`revolver`；不寫就每局隨機 |

程式用 `level.markersOfType('objective')` 取。

地上的槍：`{ "id": "gun_left_post", "type": "weapon", "x": -6.8, "z": 6.4, "r": 1.2 }`，位置固定、每局隨機一把；要固定哪一把就加 `"item": "rifle"`。`r` 是撿得到的距離（從玩家身體邊緣算）。只有 `play=1` 會畫出來（地上的槍加亮色邊框），寫了沒註冊的 `item` 會在開始玩的時候報錯。

### 出口與擋路的障礙物（`exit` marker）

一個 marker 的 `type` 是 `exit`、`id` 是 `to_<關卡名稱>` 時，玩家走進它的範圍（`r`）就會載入那一關，例如第三章一樓的 `to_ch3_2f`。到了另一關，玩家會站在指回來的那個出口（`to_<原本的關卡>`）上，面向它的 `yaw`；剛到的出口要先走出去再走回來才會再觸發。

出口前面可以先擋住：放一個 `id` 是 `block_<出口的 id>` 的 collider（例如 `block_to_ch3_2f`），並讓一個道具綁在它上面。這個 collider 還在的時候出口不會動；玩家站在旁邊按住 `E` 約 2.5 秒，collider 會被移除、綁在上面的道具會隱藏。清掉的障礙物在同一個瀏覽器分頁裡會被記住，回到這一關時不會再出現。

程式在 `web/js/level/`：`LevelFlow` 是規則（不依賴 DOM，測試在 `test/LevelFlow.test.js`），`installLevelFlow` 接上按鍵、提示和換關。沒有出口的關卡不受影響。

### `objective`（選填）

這一關怎樣算過關，例如第二章：

```json
"objective": { "type": "hold", "seconds": 180, "label": "GATE OPENS IN", "goal": "HOLD THE GATE UNTIL THE LOCK OPENS" }
```

| 欄位 | 必填 | 說明 |
|---|---|---|
| `type` | 是 | 種類，在 `web/js/game/objectives/Objectives.js` 註冊。目前只有 `hold`：撐過 `seconds` 秒就勝利 |
| `seconds` | `hold` 要 | 要撐多久（秒），正數 |
| `label` | 否 | 畫面上倒數前面的字，預設 `HOLD OUT` |
| `goal` | 否 | 開始畫面的副標題 |

不寫就是無限波次，撐到全滅為止。

### `bounds`（選填）

可活動範圍的矩形（中心 `x`、`z`，大小 `w`、`d`），玩家走不出去。不寫的話，用所有 collider 和出生點的範圍往外加 2 m。地板會比這個範圍多鋪 60 m，邊緣藏在霧後面。

### 其他欄位

不認得的欄位會被忽略。

## 驗證

`LevelData` 載入時會檢查整個檔案，一次列出所有問題（例如 `colliders[3].w: must be > 0`、`props[1].collider: unknown collider id "x"`），顯示在頁面上，並寫進 `window.__error`。

## 網址參數

| 參數 | 說明 |
|---|---|
| `level=<名稱>` | 讀 `web/levels/<名稱>.json`，預設 `test` |
| `shot=<機位名稱>` | 截圖模式：相機放到該機位，不顯示操作提示，畫完一幀後設 `window.__ready = true`。顆粒固定，每次畫面都一樣 |
| `palette=<區塊>` | 改用 palette.json 的另一個區塊（蓋過關卡的 `palette`） |
| `preset=<名稱>` | 選該區塊 `presets` 裡的一組。區塊有 `presets` 但還沒設 `defaultPreset` 時（例如還沒選定的 `mood`）一定要給 |
| `debug=1` | 顯示碰撞盒外框（含看不見的）、出生點、出怪區、markers、機位，左上角顯示位置和沒有模型的道具名稱。也會檢查每個出怪區、marker、其他玩家出生點是不是從第一個玩家出生點走得到，走不到會列出來 |
| `perf=1` | 左上角顯示 FPS、draw call、三角面、燈數、解析度倍率 |
| `scale=<數字>` | 解析度倍率，會被限制在 0.5～1.5。不給就用 `devicePixelRatio`，上限 1.5 |
| `flashlight=0` | 一開始關手電筒 |
| `spawn=<編號>` | 從第幾個玩家出生點開始（從 0 算） |
| `models=0` | 不載入模型，全部用灰盒替身（拿來和有模型的畫面比較） |
| `dummies=1` | 在每個出怪區走到玩家的路線上放 3 個殭屍大小的方塊，用來看這個氣氛下看不看得到敵人 |
| `t=<秒>` | 截圖模式用的動畫時間（招牌閃爍、警示燈擺動都是時間的函數），預設 0 |

走動模式：點一下畫面鎖定滑鼠，滑鼠看、`WASD` 走、`Shift` 跑、`F` 開關手電筒、`Esc` 放開滑鼠。

## 給截圖工具

現成的工具是 `tools/art/shots.mjs`（會自己開、關 server）：

```
npm install
npx playwright install chromium
node tools/art/shots.mjs --level mood --presets subtle,medium,heavy --out art/style/refs/candidates
```

第二章灰盒的三組截圖（氣氛、俯視配置圖、放了假殭屍的版本）：

```
node tools/art/shots.mjs --level ch2 --out art/style/refs/ch2-greybox --shots gate_view,left_post,right_post,front_post,gate,street_in,overview
node tools/art/shots.mjs --level ch2 --out art/style/refs/ch2-greybox --shots plan --palette blockout --query "debug=1&flashlight=0"
node tools/art/shots.mjs --level ch2 --out art/style/refs/ch2-greybox --shots gate_view,left_post,right_post,front_post --query "dummies=1" --suffix=-dummies
```

`plan` 是從正上方看的機位，要配 `blockout` 這個沒有霧的區塊才看得到東西。

自己寫工具的話，頁面提供這些：

```js
await page.goto('http://localhost:8080/web/index.html?level=test&shot=overview');
await page.waitForFunction(() => window.__ready || window.__error);
```

- `window.__ready`：畫完第一幀後變成 `true`。
- `window.__error`：載入失敗時是錯誤訊息（例如找不到機位），否則是 `null`。
- `window.__stats`：`{ calls, triangles, lights, fps, frameMs, pixelRatio }`，來自 `renderer.info`，包含陰影和後製的 draw call；`lights` 不含半球光。
- `window.__app`：目前的 `App` 實例；`window.__app.events` 是該實例自己的 `EventBus`，不是全域事件單例。

## 程式架構

```
LevelData ──▶ SceneBuilder ──▶ CollisionWorld   碰撞（只看 colliders）
（讀取、驗證）      │
                   └──▶ PropFactory ──▶ mesh     外觀（道具名稱 → 模型 → 灰盒替身 → 灰色方塊）
                          ▲ ModelLibrary          讀資產清單，載入標成 ready 的 GLB；載不到就退回替身
                          ▲ props/*.js            灰盒替身，一章一個檔案：CommonProps、Ch1Props、Ch2Props、Ch3Props
                          ▲ Emitters              會發光的材質和小燈：重點色、紅色警示燈、螢幕，以及閃爍和擺動
                   └──▶ StaticBatcher            同材質的靜態 mesh 合併，減少 draw call
                   └──▶ ModelInstancer           同一個模型出現兩次以上，改成一個 InstancedMesh

Palette（art/style/palette.json ＋ chapters/<章>.json）──▶ Atmosphere ──▶ 霧、背景、半球光、月光（霧色是「畫面上看到的顏色」）
                                               ──▶ Flashlight（玩家的 SpotLight）
                                               ──▶ PostFX（tone mapping、暗角、顆粒、1/4 解析度 bloom）

PlayerController  pointer lock + WASD，眼睛高度 1.7 m，和 CollisionWorld 做 AABB 碰撞
PathFinder        在 CollisionWorld 上找走得通的路線；檢查灰盒用（不是遊戲裡殭屍的尋路）
App               把上面接起來；處理網址參數、走動模式與截圖模式
```

類別放在 `web/js/`，以具名 `export` 匯出，使用者明確 `import`。`index.html` 只載入一個 `type="module"` 入口 `js/main.js`，不再依賴 script tag 順序或全域命名空間。import map 將 `three` 與 `three/examples/jsm/` 固定到 CDN 的 **0.128.0**，GLB 使用 jsm `GLTFLoader`；不要升級版本，以免改變第二章打光與色彩。

`main.js` 先註冊 `CommonProps`、`Ch1Props`、`Ch2Props`、`Ch3Props`，再執行 `App.boot()`。`PropSet` 共用道具建置與模型 extras 的註冊契約；`core/` 提供尚未接入玩法的事件、物件池和狀態機。沒有打包步驟，仍用 `node tools/serve.mjs` 啟動；`npm test` 執行不需瀏覽器的單元測試。詳細模組地圖與擴充方式見 [ARCHITECTURE.md](../../docs/tech/ARCHITECTURE.md)。

章節檔案和共用檔案的區分，看 [docs/art/CHAPTER_FILES.md](../../docs/art/CHAPTER_FILES.md)；怎麼做一個模型，看 [docs/art/ADDING_AN_ASSET.md](../../docs/art/ADDING_AN_ASSET.md)。
