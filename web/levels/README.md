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
  "palette": "default",        // 選填，palette.json 裡的區塊名稱；不寫就用 default

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
- `PropFactory` 不認得的名稱會退回成灰色方塊：有 `collider` 就畫成碰撞盒的大小和位置（不套 `rotY`，因為碰撞盒不能轉），沒有就畫 1 m 的方塊。所以可以先把之後要用的名稱（`barricade`、`guard_booth`…）寫進去，等模型做好再換，碰撞不用動。
- 目前有灰盒替身的名稱，大小用 `size`，沒有就跟著 collider。新的名稱用 `PropFactory.register(name, builder)` 加。
  - `web/js/GreyboxProps.js`：`crate`（方塊）、`pillar`（圓柱）、`road`（路面，要給 `size`）、`tree`（枯樹）、`car_wreck`（廢車）、`car_parked`（停著的車）、`escape_car`（尾燈會亮的車，用 palette 的重點色）。
  - `web/js/PlazaProps.js`（第二章）：`mvidia_gate`（大門）、`mvidia_sign`（發光招牌，不要 collider，`size` 是 `[板寬, 字高, 厚度]`）、`gate_panel`（門禁面板）、`guard_booth`、`shop_terminal`（商店）、`sandbags`、`barricade`、`warning_light`（警示燈，給 `size` 就立在那麼高的桿子上，`rotY` 是光一開始照的方向）、`street_lamp`、`truck_wreck`、`van_wreck`、`building`、`hq_wall`、`low_wall`、`fence`。
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

具名的玩法位置：商店、目標、防守點，之後的補給點、檢查點、燃料桶放置點也放這裡。只是資料，不會畫出東西（`debug=1` 時畫成青色方框）。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `type` | 是 | 種類，例如 `shop`、`objective`、`post` |
| `x`, `z` | 是 | 位置 |
| `id` | 否 | 不能重複，不寫會自動叫 `m0`、`m1`… |
| `r` | 否 | 範圍半徑，預設 1 |
| `yaw` | 否 | 朝向（度），預設 0 |

程式用 `level.markersOfType('shop')` 取。

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

## 程式架構

```
LevelData ──▶ SceneBuilder ──▶ CollisionWorld   碰撞（只看 colliders）
（讀取、驗證）      │
                   └──▶ PropFactory ──▶ mesh     外觀（道具名稱 → mesh，不認得就退回灰色方塊）
                          ▲ GreyboxProps / PlazaProps   還沒有模型前的灰盒替身（樹、車、路面、大門、沙包…）
                          ▲ Emitters              會發光的材質和小燈：重點色、紅色警示燈、螢幕，以及閃爍和擺動
                   └──▶ StaticBatcher            同材質的靜態 mesh 合併，減少 draw call

Palette（art/style/palette.json）──▶ Atmosphere ──▶ 霧、背景、半球光、月光（霧色是「畫面上看到的顏色」）
                                               ──▶ Flashlight（玩家的 SpotLight）
                                               ──▶ PostFX（tone mapping、暗角、顆粒、1/4 解析度 bloom）

PlayerController  pointer lock + WASD，眼睛高度 1.7 m，和 CollisionWorld 做 AABB 碰撞
PathFinder        在 CollisionWorld 上找走得通的路線；檢查灰盒用（不是遊戲裡殭屍的尋路）
App               把上面接起來；處理網址參數、走動模式與截圖模式
```

每個類別一個檔案，放在 `web/js/`，用一般 `<script>` 依序載入，掛在全域的 `Game` 底下（例如 `Game.LevelData`）。
