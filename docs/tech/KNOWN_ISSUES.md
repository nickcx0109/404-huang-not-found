# 已知問題（之後再修）

來源：2026-11-16 對 PR #1（T1 場景骨架、T2 氣氛樣板）做的程式碼審查。都不會讓遊戲壞掉，排在框架完成之後修。修好一項就把它刪掉，或標上修好的 commit。

| # | 嚴重度 | 位置 | 問題 | 會發生什麼 | 修法方向 |
|---|---|---|---|---|---|
| 1 | ✅ 已修復 | `web/js/CollisionWorld.js` | 起始重疊先按最小穿透深度解開，再分軸移動 | 四個方向、原地重疊與滑牆皆有回歸測試 | `fix(collision): depenetrate overlapping bodies before movement` |
| 2 | ✅ 已修復 | `web/js/LevelData.js`、`player/PlayerBody.js` | 出生點以玩家圓柱檢查（含角落、上下高度） | `PlayerController` 與驗證器共用 `PLAYER_BODY` | `fix(level): validate spawns against shared player dimensions` |
| 3 | ✅ 已修復 | `web/js/level/ColliderFootprint.js`、`LevelData.collisionBoxes` | 綁了 collider 的道具，碰撞盒自動放大到包住道具轉 `rotY`、乘 `scale` 後的外框（只會變大，不會比寫的 collider 小）；繞底邊翻倒或不對稱的替身用 `footprint` 的 `{min, max}` 寫出實際範圍 | mood 的 `car_wreck`（28°）、ch2 的四台廢車、ch3 的斜桌和翻倒的桌子、ch1 倒下的拒馬都不能再走進去；畫面不變 | `fix(collision): grow collider boxes to cover rotated and scaled props` |
| 4 | ✅ 已修復 | `tools/serve.mjs` `isServable` | 除了檢查請求路徑，讀檔前再用 `realpath.native` 取得真實路徑（8.3 短檔名會還原成 `.git`，連結會跟到目的地），必須在 repo 裡且沒有隱藏的部分；路徑含 `:`（ADS、磁碟代號）也直接 403 | `test/Serve.test.js`：`/GIT~1/config`、`/git~1/HEAD`、`/%2egit/config`、`::$DATA` 都是 403，遊戲檔照常 200 | `fix(tools): stop the dev server from serving hidden files by short name` |
| 5 | ✅ 已修復 | `web/js/PostFX.js`、`core/bloomLevels.js` | 明確的 levels: 0 關閉 bloom，不建立 targets 或執行 bloom pass；缺省為 3，非零層數限制為 1～4 | 純函式測試涵蓋 0、缺省、邊界與無效值 | `fix(postfx): treat bloom.levels 0 as a valid value` |
| 6 | ✅ 已修復 | `tools/art/shots.mjs` `takeShot` | 每張各自 try/catch，逾時或頁面錯誤只算那一張失敗，其他照拍，最後仍以失敗數結束（exit 1）；`--timeout <秒>` 可調等待時間（預設 120） | 用 `--timeout 0.01` 驗證過：8 張都記為 FAIL、迴圈沒有中斷 | `fix(tools): keep taking screenshots after one shot times out`；`--gpu` 的 d3d11 參數只適用於 Windows 仍未處理 |
| 7 | ✅ 已修復 | `web/js/App.js` | dt 仍限制在 0～maxFrameTime；fps 統計用真實的幀時間，但超過 0.5 秒（第一幀、切回分頁）或時鐘倒退的間隔不算進統計 | 低於 20 fps 的機器也量得準，切分頁不會讓數字跳 | `fix(app): clamp elapsed time for fps statistics`、`fix(app): keep real frame times in fps stats` |
| 8 | ✅ 已修復 | `web/js/App.js` `_countLights` | `stats.lights` 改成 getter，只有被讀到時（資訊文字、`?perf`、`shots.mjs`）才走訪場景，不再每幀數燈 | 讀到的永遠是當下的燈數，動態加入的燈也算得到 | `fix(app): count lights only when stats are read` |
| 9 | ✅ 已修復 | `web/js/StaticBatcher.js` | 同材質的靜態 mesh 按世界座標的 XZ 格子合併，預設 20 m 一格 | 視角相機和手電筒陰影相機可依各批次的包圍球分別剔除。三章 25 張截圖皆為 `same` 或 `noise` | `perf(render): batch static meshes by spatial chunk`（PR #66） |
| 10 | ✅ 已修復 | `web/js/Flashlight.js` | 設定 shadow.camera.near = 0.2 後立即更新投影矩陣 | 陰影相機投影與 near 一致，避免近處陰影使用舊裁切面 | `fix(flashlight): update shadow camera projection after near changes` |

另外在 T1～T3 回報中已知、還沒處理的：

- 沒有抗鋸齒（MSAA 關閉，也沒做 FXAA）。
- 1.5 倍解析度在 Intel 內顯上約 39 fps，要做 PERFORMANCE_PLAN 3.3 的品質分級／自動降解析度。
- 尾燈超過約 45 m（相機遠平面）會消失，第一章 300 m 的山路要處理。
- 第二章的動態燈已經用滿 4 盞，沒有算其他玩家的手電筒；接多人連線時要把 `alarm.light.count` 降到 1 或 0。
- 第二章 20 m 外的殭屍只剩很淡的剪影。
