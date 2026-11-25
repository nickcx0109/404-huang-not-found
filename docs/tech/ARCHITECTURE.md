# 程式架構與擴充方式

預設仍是場景展示；`?play=1` 才動態載入單人玩法骨架，提供武器、敵人、地上物品與彈藥箱，尚無連線。玩法資料與外觀保持分離，替換模型不能改變碰撞。契約、設計模式與組員擴充步驟見 [GAMEPLAY.md](GAMEPLAY.md)。

## 啟動與版本

- `node tools/serve.mjs` 啟動靜態伺服器，根目錄是 repo，不是 `web/`；`.js`、`.mjs` 都以 `text/javascript` 傳送。
- `web/index.html` 只有一個模組入口 `js/main.js`。瀏覽器依 `import` 解析相依關係，不再依賴多個 script tag 的載入順序。
- import map 的 `three` 指向 `https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js`；`three/examples/jsm/` 指向 `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/`。`ModelLibrary` 使用 jsm `GLTFLoader`。
- **Three.js 固定 0.128.0，不要升級**。新版的光照與色彩管理可能改變已調好的第二章。模組檔依然由 CDN 提供，首次載入需要網路；沒有打包或編譯步驟。
- `main.js` 依序將 `CommonProps`、`Ch1Props`、`Ch2Props`、`Ch3Props` 註冊給 `PropFactory`，再呼叫 `App.boot()`。這是組合入口，不在各個道具模組匯入時偷偷註冊。

## 模組地圖

| 模組 | 職責與主要相依 |
|---|---|
| `App`、`AppOptions` | 解析網址參數並組合場景、氣氛、控制器與 HUD；每個 App 擁有一個 `events` |
| `LevelData`、`LevelError` | 讀取、驗證、正規化關卡 JSON，提供 collider／bookmark／marker 查詢；不依賴 Three.js 或 DOM |
| `CollisionWorld`、`Aabb` | 只依關卡 colliders 建立碰撞，處理移動與滑牆；不讀外觀 |
| `PathFinder` | 展示用 findPath 維持既有行為；玩法另用預配置 buffer 的 createRoute／findPathInto，Brain 決定何時重算 |
| `SceneBuilder`、`BuiltLevel` | 將資料組成碰撞與場景，整合工廠、靜態合併、模型實例化與除錯標記 |
| `PropFactory` | 名稱到外觀：已載入模型 → 已註冊替身 → 灰色方塊；保留所有權重複警告 |
| `props/PropSet` | 以繼承統一道具 builders 與模型 extras 的註冊，不依賴 Three.js 執行期 |
| `props/CommonProps`、`props/ChNProps` | 共用與各章的外觀建置函式；既有章節不需改入口就能新增表內項目 |
| `ModelLibrary`、`ModelInstancer`、`StaticBatcher` | 載入清單核可的 GLB、合併重複模型、合併同材質靜態網格 |
| `Palette`、`Emitters` | palette 合併與顏色；自發光材質、燈與其動畫 |
| `Atmosphere`、`Flashlight`、`PostFX` | 霧、環境光、手電筒與後製；數值仍由 palette 決定 |
| `PlayerController`、`Hud` | 既有走動／滑鼠鎖定控制，以及 DOM 提示、錯誤與效能資訊 |
| `core/` | 不需 Three.js、DOM 或外部套件的 Observer、物件池與 State pattern |
| `game/`、`game/states/` | App 擁有 GameSession，GameContext 傳遞依賴；四種 State、WaveDirector、集中事件常數。installGameplay 是唯一跨模組具體範例組合點 |
| `entities/` | 純邏輯 Entity、Damageable 組合、DamageInfo 值物件與 DamagePipeline 責任鏈 |
| `weapons/`、`player/` | Weapon 模板、HitscanFire 策略、Pistol 範例、WeaponHolder、玩家戰鬥與瀏覽器輸入；PlayerBody 是共用尺寸來源 |
| `enemies/`、`enemies/behaviour/` | Enemy 基底、Brain 策略、最小行為樹、Walker 範例、註冊 Factory 與 ObjectPool |
| `pickups/` | 地上武器、投擲物與治療物的拾取，以及可重用的彈藥箱；`InteractionList` 統一 E 鍵互動 |
| `ui/` | `ui/hud/` 的 SurvivalHud 繼承既有 Hud（不替換錯誤面板），由一組 HudWidget 組成 |
| `cutscenes/` | 劇情過場，獨立頁面 `web/cutscene.html`，不經過 App。`logic/` 的 `Typewriter`、`CutsceneTimeline`、`SplitLine`、`CameraMove` 是純邏輯；`Shot` 子類（`ImageShot`、`SplitShot`）由 `ShotTypes` 註冊，`CutscenePlayer` 只呼叫 `Shot` 介面。內容在 `web/assets/cutscenes/<名稱>.json` |
| `audio/` | 音效：`SoundBoard`、`SpatialMix`、`SoundRule` 和它的子類是純邏輯；`WebAudioOutput`、`Synth`、`Sound` 子類用 WebAudio，只在 `play=1` 由 `installAudio` 組起來 |

原有檔名及類別名保留；同檔原本公開的輔助類別（例如 `Aabb`、`LevelError`、`AppOptions`、`BuiltLevel`）也用具名 export 匯出。

## 新增一般模組

1. 在適合的目錄新增 `.js`，使用 `export class 類別名稱`。純邏輯放 `core/`，不要讓它相依 DOM 或渲染器。
2. 在使用者檔案明確匯入，例如 `import { EventBus } from './core/EventBus.js';`；相對路徑要寫 `.js`。
3. 需要渲染時使用 `import * as THREE from 'three';`，不要建立全域命名空間，也不要新增 classic script tag。
4. 一般類別只宣告行為，不在匯入時啟動 App。由真正的使用者建立實例，只有啟動組合才放 `main.js`。
5. 純邏輯的案例加到 `test/*.test.js`，執行 `npm test`。不需新增 npm 套件或 build 步驟。

## 新增道具

既有 `ChNProps` 已繼承 `PropSet`。新增一筆 `static builders`，對應到同類別的 static 建置方法；模型額外的燈放 `static extras` 或 `static get extras()` 回傳的表。基底提供 `registerAll(factory)`，不用每章重寫註冊迴圈。

建置函式接收 `{ prop, size, factory }`，其中 `size` 是 `{ w, h, d }`，回傳以底部中心為原點的 `Object3D`（公尺、+Y 朝上、正面朝 -Z）。extras 接收同樣內容與 `object`，只在使用真實模型時補上子物件。顏色依然由工廠讀 palette，不能寫死色碼。

只有新增「整組」道具模組時，才需要在 `main.js` 匯入新類別並加入 `registerWith(PropFactory)` 的清單。詳細流程見 [ADDING_AN_ASSET.md](../art/ADDING_AN_ASSET.md) 與 [CHAPTER_FILES.md](../art/CHAPTER_FILES.md)。

## 共用核心類別

### EventBus：Observer

`on(event, listener)` 與 `once(event, listener)` 回傳取消訂閱函式；`off(event, listener)` 移除該事件中符合回呼的所有訂閱，回傳是否有移除。相同回呼可各自訂閱，單筆取消不影響其他筆。

`emit(event, ...args)` 同步依註冊順序傳送，回傳呼叫筆數。傳送中新增的訂閱留到下次；已取消的訂閱不再呼叫。`once` 在呼叫前移除，所以遞迴 emit 不會重複觸發。回呼錯誤直接往外拋，後續回呼不繼續執行。

App 建立並公開 `app.events`；只有 play 模式會由玩法模組發送／訂閱 `game/events.js` 的事件。一般事件使用方式：

```js
const unsubscribe = app.events.on('preview-ready', (detail) => console.log(detail));
app.events.emit('preview-ready', { level: 'test' });
unsubscribe();
```

### ObjectPool：物件池

`new ObjectPool(factory, reset)` 延遲建立物件；`acquire()` 優先取最後釋放的物件，沒有才呼叫 factory。`release(object)` 先執行 reset 再歸還，可用 `activeCount`、`availableCount` 觀察數量；reset 可省略。

只能釋放自己從此池借出的物件，重複或外來物件會拋錯；factory 不能回傳仍借出的同一個物件。reset 失敗時物件仍屬於借出狀態，可修復後重試。play 模式的 EnemyFactory 每種類型持有一個池，死亡後隱藏並歸還。

### State 與 StateMachine：State pattern

繼承 `State`，只覆寫需要的 `enter(context, previous)`、`exit(context, next)`、`update(dt, context)`。`new StateMachine(context)` 起初沒有狀態，`change(state)` 先退出舊狀態再進入新狀態；同一實例不重進，`change(null)` 停止。`update(dt)` 只更新目前狀態，dt 單位為秒。

可在 update 要求轉換，不可在 enter／exit 遞迴 change。生命週期錯誤會往外拋；exit 失敗保留舊狀態，enter 失敗則保留已切換的新狀態，轉換鎖都會解除。play 模式由 App → GameSession → StateMachine 更新；未鎖定滑鼠時暫停玩法時鐘。

## 驗證與工具介面

- `npm test` 使用 `node --test`，測試 core、PropSet、LevelData、PathFinder、CollisionWorld；只用 Node 內建模組，不需要瀏覽器、CDN 或新增測試套件。
- `node tools/art/assets.mjs check` 不需 Blender；`all --all` 還會建置、預覽，需 Blender 4.2 LTS。失敗時先對照主分支，不能為重構順便改美術。
- 截圖維持 `node tools/art/shots.mjs --level ch2 --out <目錄>`；可用 `--format png` 拍改前、改後兩份，再用 `node tools/art/compare.mjs <改前> <改後>` 比較：`same` 完全相同，`noise` 只有軟體繪圖造成的少數像素差一兩階，`DIFF` 才是畫面改變（結束碼 1）。走動模式另外確認沒有 console error。
- `?level`、`?shot`、`?t`、`?debug`、`?perf`、`?models` 等既有參數不變。`window.__ready`、`window.__error`、`window.__stats`、`window.__app` 保留給工具；它們不是舊式的類別命名空間。
- 已知問題以 [KNOWN_ISSUES.md](KNOWN_ISSUES.md) 為準；#1 起始重疊瞬移與 #2 出生點尺寸檢查已各自修復及加測試。沒有改關卡、材質、palette 或既有燈光；mood 新增一個正確的出生點重疊警告。

PostFX composites exposure, ACES, saturation, vignette, sRGB and grain, then runs a separate `FXAAPass` on the display-encoded result without further colour conversion. FXAA uses drawing-buffer texel sizes, updated after resize/pixel-ratio changes. It defaults on; `?aa=0` disables it. The constructor option `{ antialias: false }` takes precedence over the URL, and `postfx.antialiasEnabled` can change at runtime for quality tiers. Disabling it sends the original composite directly to screen and skips the extra draw call.

## 劇情過場

- 打開 `web/cutscene.html`（預設播 `opening`；`?name=` 換腳本）。`?at=c1_12` 從某個鏡頭開始，`?at=c1_12&freeze=2` 停在那個鏡頭第 2 秒，方便截圖。播完或按 Esc 跳過後，前往腳本的 `next`。
- 腳本 `web/assets/cutscenes/<名稱>.json`：`shots` 依序排列，每鏡有 `id`、`type`、`duration`；有 `captions`（打字機字幕）的鏡頭可以省略 `duration`，字幕打完再停 0.8 秒。圖片放在同一個資料夾。
- `image`：`{ image, move? }`。`split`：`{ line: { top, bottom }, left: { image, move? }, right: { image, move? } }`，`top`、`bottom` 是斜線碰到上下邊的位置（0 到 1）。`move` 是 `{ from: { x, y, scale }, to: {...} }`，`x`、`y` 是百分比。
- 新增一種鏡頭：寫一個繼承 `Shot` 的類別（覆寫 `build`、`update`，需要預先載入的圖放 `pictures`），在 `cutscenes/main.js` 加一行 `register('種類', 類別)`。不要在 `CutscenePlayer` 裡判斷種類。
