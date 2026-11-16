# 程式架構與擴充方式

目前是場景與未來玩法的基礎，不包含武器、敵人、商店或連線實作。玩法資料與外觀保持分離，替換模型不能改變碰撞。

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
| `PathFinder` | 依碰撞網格尋路，供關卡可達性檢查與既有替身展示；不是敵人 AI |
| `SceneBuilder`、`BuiltLevel` | 將資料組成碰撞與場景，整合工廠、靜態合併、模型實例化與除錯標記 |
| `PropFactory` | 名稱到外觀：已載入模型 → 已註冊替身 → 灰色方塊；保留所有權重複警告 |
| `props/PropSet` | 以繼承統一道具 builders 與模型 extras 的註冊，不依賴 Three.js 執行期 |
| `props/CommonProps`、`props/ChNProps` | 各負責人的外觀建置函式；既有章節不需改入口就能新增表內項目 |
| `ModelLibrary`、`ModelInstancer`、`StaticBatcher` | 載入清單核可的 GLB、合併重複模型、合併同材質靜態網格 |
| `Palette`、`Emitters` | palette 合併與顏色；自發光材質、燈與其動畫 |
| `Atmosphere`、`Flashlight`、`PostFX` | 霧、環境光、手電筒與後製；數值仍由 palette 決定 |
| `PlayerController`、`Hud` | 既有走動／滑鼠鎖定控制，以及 DOM 提示、錯誤與效能資訊 |
| `core/` | 不需 Three.js、DOM 或外部套件的 Observer、物件池與 State pattern |

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

只有新增「整組」道具模組時，才需要在 `main.js` 匯入新類別並加入 `registerWith(PropFactory)` 的清單；共用檔案先與組長協調。詳細流程見 [ADDING_AN_ASSET.md](../art/ADDING_AN_ASSET.md) 與 [OWNERSHIP.md](../art/OWNERSHIP.md)。

## 共用核心類別

### EventBus：Observer

`on(event, listener)` 與 `once(event, listener)` 回傳取消訂閱函式；`off(event, listener)` 移除該事件中符合回呼的所有訂閱，回傳是否有移除。相同回呼可各自訂閱，單筆取消不影響其他筆。

`emit(event, ...args)` 同步依註冊順序傳送，回傳呼叫筆數。傳送中新增的訂閱留到下次；已取消的訂閱不再呼叫。`once` 在呼叫前移除，所以遞迴 emit 不會重複觸發。回呼錯誤直接往外拋，後續回呼不繼續執行。

App 目前只建立並公開 `app.events`，尚未發送或訂閱玩法事件：

```js
const unsubscribe = app.events.on('preview-ready', (detail) => console.log(detail));
app.events.emit('preview-ready', { level: 'test' });
unsubscribe();
```

### ObjectPool：物件池

`new ObjectPool(factory, reset)` 延遲建立物件；`acquire()` 優先取最後釋放的物件，沒有才呼叫 factory。`release(object)` 先執行 reset 再歸還，可用 `activeCount`、`availableCount` 觀察數量；reset 可省略。

只能釋放自己從此池借出的物件，重複或外來物件會拋錯；factory 不能回傳仍借出的同一個物件。reset 失敗時物件仍屬於借出狀態，可修復後重試。此類別尚未接到任何場景或玩法系統。

### State 與 StateMachine：State pattern

繼承 `State`，只覆寫需要的 `enter(context, previous)`、`exit(context, next)`、`update(dt, context)`。`new StateMachine(context)` 起初沒有狀態，`change(state)` 先退出舊狀態再進入新狀態；同一實例不重進，`change(null)` 停止。`update(dt)` 只更新目前狀態，dt 單位為秒。

可在 update 要求轉換，不可在 enter／exit 遞迴 change。生命週期錯誤會往外拋；exit 失敗保留舊狀態，enter 失敗則保留已切換的新狀態，轉換鎖都會解除。狀態機尚未接到 App 更新迴圈。

## 驗證與工具介面

- `npm test` 使用 `node --test`，測試 core、PropSet、LevelData、PathFinder、CollisionWorld；只用 Node 內建模組，不需要瀏覽器、CDN 或新增測試套件。
- `node tools/art/assets.mjs check` 不需 Blender；`all --all` 還會建置、預覽，需 Blender 4.2 LTS。失敗時先對照主分支，不能為重構順便改美術。
- 截圖維持 `node tools/art/shots.mjs --level ch2 --out <目錄>`；可用 `--format png` 與預先拍下的同機位影像逐像素比較。走動模式另外確認沒有 console error。
- `?level`、`?shot`、`?t`、`?debug`、`?perf`、`?models` 等既有參數不變。`window.__ready`、`window.__error`、`window.__stats`、`window.__app` 保留給工具；它們不是舊式的類別命名空間。
- 既有已知問題仍以 [KNOWN_ISSUES.md](KNOWN_ISSUES.md) 為準，本次不改關卡、材質、燈光或那些行為。
