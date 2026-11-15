# 關卡資料格式

一個關卡就是一個 `web/levels/<名稱>.json`。裡面只有玩法資料（碰撞、出生點、出怪點、機位）和「這裡要放什麼道具」的名稱，沒有任何顏色或模型檔路徑。外觀由 `PropFactory` 依道具名稱決定，顏色、霧、燈光由 `art/style/palette.json` 決定，所以換外觀不需要改這個檔。

## 執行

```
node tools/serve.mjs
```

打開 <http://localhost:8080/web/index.html?level=test>。`level` 是檔名去掉 `.json`，只能用英數字、`-`、`_`。

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
    { "name": "debris", "x": -9, "y": 0, "z": -9, "rotY": 30, "scale": 1 }
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

規則：

- 沒有被任何道具指到的 collider，會直接畫成 collider 大小的灰色方塊（灰盒）。
- 被道具指到的 collider 不再另外畫，由那個道具負責外觀。
- `PropFactory` 不認得的名稱會退回成灰色方塊：有 `collider` 就畫成碰撞盒的大小和位置（不套 `rotY`，因為碰撞盒不能轉），沒有就畫 1 m 的方塊。所以可以先把之後要用的名稱（`barricade`、`guard_booth`…）寫進去，等模型做好再換，碰撞不用動。
- 目前內建的名稱只有 `crate`（方塊）和 `pillar`（圓柱），大小跟著 collider。新的名稱用 `PropFactory.register(name, builder)` 加。

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

### `bounds`（選填）

可活動範圍的矩形（中心 `x`、`z`，大小 `w`、`d`），玩家走不出去，地板也鋪這麼大。不寫的話，用所有 collider 和出生點的範圍往外加 2 m。

### 其他欄位

不認得的欄位會被忽略，之後的任務（商店位置、補給點、檢查點…）可以直接加。

## 驗證

`LevelData` 載入時會檢查整個檔案，一次列出所有問題（例如 `colliders[3].w: must be > 0`、`props[1].collider: unknown collider id "x"`），顯示在頁面上，並寫進 `window.__error`。

## 網址參數

| 參數 | 說明 |
|---|---|
| `level=<名稱>` | 讀 `web/levels/<名稱>.json`，預設 `test` |
| `shot=<機位名稱>` | 截圖模式：相機放到該機位，不顯示操作提示，畫完一幀後設 `window.__ready = true`。顆粒固定，每次畫面都一樣 |
| `palette=<區塊>` | 改用 palette.json 的另一個區塊（蓋過關卡的 `palette`） |
| `preset=<名稱>` | 選該區塊 `presets` 裡的一組 |
| `debug=1` | 顯示碰撞盒外框（含看不見的）、出生點、出怪區、機位，左上角顯示位置和沒有模型的道具名稱 |
| `perf=1` | 左上角顯示 FPS、draw call、三角面、燈數、解析度倍率 |
| `scale=<數字>` | 解析度倍率，會被限制在 0.5～1.5。不給就用 `devicePixelRatio`，上限 1.5 |
| `flashlight=0` | 一開始關手電筒 |
| `spawn=<編號>` | 從第幾個玩家出生點開始（從 0 算） |

走動模式：點一下畫面鎖定滑鼠，滑鼠看、`WASD` 走、`Shift` 跑、`F` 開關手電筒、`Esc` 放開滑鼠。

## 給截圖工具

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
                   └──▶ StaticBatcher            同材質的靜態 mesh 合併，減少 draw call

Palette（art/style/palette.json）──▶ Atmosphere ──▶ 霧、背景、半球光、月光
                                               ──▶ Flashlight（玩家的 SpotLight）
                                               ──▶ PostFX（tone mapping、暗角、顆粒、1/4 解析度 bloom）

PlayerController  pointer lock + WASD，眼睛高度 1.7 m，和 CollisionWorld 做 AABB 碰撞
App               把上面接起來；處理網址參數、走動模式與截圖模式
```

每個類別一個檔案，放在 `web/js/`，用一般 `<script>` 依序載入，掛在全域的 `Game` 底下（例如 `Game.LevelData`）。
