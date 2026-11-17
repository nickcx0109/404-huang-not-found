# 已知問題（之後再修）

來源：2026-11-16 對 PR #1（T1 場景骨架、T2 氣氛樣板）做的程式碼審查。都不會讓遊戲壞掉，排在框架完成之後修。修好一項就把它刪掉，或標上修好的 commit。

| # | 嚴重度 | 位置 | 問題 | 會發生什麼 | 修法方向 |
|---|---|---|---|---|---|
| 1 | ✅ 已修復 | `web/js/CollisionWorld.js` | 起始重疊先按最小穿透深度解開，再分軸移動 | 四個方向、原地重疊與滑牆皆有回歸測試 | `fix(collision): depenetrate overlapping bodies before movement` |
| 2 | ✅ 已修復 | `web/js/LevelData.js`、`player/PlayerBody.js` | 出生點以玩家圓柱檢查（含角落、上下高度） | `PlayerController` 與驗證器共用 `PLAYER_BODY` | `fix(level): validate spawns against shared player dimensions` |
| 3 | 🟠 | `web/levels/mood.json:81`、`web/js/PropFactory.js:52-54` | 綁了 collider 的道具，旋轉或縮放後，外觀會超出碰撞盒 | mood 的 `car_wreck` 轉 28°，玩家可以走進車角約 0.18 m | LevelData 驗證時發出警告；或讓碰撞盒依旋轉後的外框計算 |
| 4 | 🟡 | `tools/serve.mjs:63` | 隱藏檔過濾只擋開頭是 `.` 的路徑；Windows 的 8.3 短檔名（如 `GIT~1`）可以繞過 | 用 `HOST=0.0.0.0` 開放給區網時，別人可能讀到 `.git/config`、`.env` | 解析成真實路徑後再檢查，或只開放 `web/`、`art/` 等白名單資料夾 |
| 5 | ✅ 已修復 | `web/js/PostFX.js`、`core/bloomLevels.js` | 明確的 levels: 0 關閉 bloom，不建立 targets 或執行 bloom pass；缺省為 3，非零層數限制為 1～4 | 純函式測試涵蓋 0、缺省、邊界與無效值 | `fix(postfx): treat bloom.levels 0 as a valid value` |
| 6 | 🟡 | `tools/art/shots.mjs:150` | `waitForFunction` 逾時時直接丟錯，跳出整個迴圈 | 某一張卡住，後面的截圖全部不拍 | 每張各自 try/catch，算進 `failures`；`--gpu` 的 d3d11 參數只適用於 Windows |
| 7 | ✅ 已修復 | `web/js/App.js`、`core/frameTime.js` | fps 統計與 dt 共用限制在 0～maxFrameTime 的 elapsed | 第一幀、分頁恢復與時鐘倒退不再累加越界時間 | `fix(app): clamp elapsed time for fps statistics` |
| 8 | ✅ 已修復 | `web/js/App.js`、`core/LightCountCache.js` | 快取燈光集合；監聽每個節點 add/remove 追蹤巢狀動態燈，提供 invalidate() | 每幀只檢查燈及祖先可見性，不再走訪整個場景；強度 0 仍計數 | `fix(app): cache scene lights across frames` |
| 9 | ⚪ 效能 | `web/js/StaticBatcher.js:33` | 同材質的東西整關合併成一個 mesh，邊界球涵蓋整個關卡 | 相機和手電筒陰影都沒辦法剔除，看不到的東西也照畫。**第一章 300 m 的山路會受影響** | 改成按區塊（例如 20 m 一格）合併 |
| 10 | ⚪ | `web/js/Flashlight.js:34` | 改了 `shadow.camera.near` 卻沒呼叫 `updateProjectionMatrix` | 某些角度下，0.5 m 以內的陰影會被切掉 | 改完 near 之後呼叫 `updateProjectionMatrix()` |

另外在 T1～T3 回報中已知、還沒處理的：

- 沒有抗鋸齒（MSAA 關閉，也沒做 FXAA）。
- 1.5 倍解析度在 Intel 內顯上約 39 fps，要做 PERFORMANCE_PLAN 3.3 的品質分級／自動降解析度。
- AABB 碰撞不會跟著道具的 rotY 轉（和第 3 項有關）。
- 尾燈超過約 45 m（相機遠平面）會消失，第一章 300 m 的山路要處理。
- 第二章的動態燈已經用滿 4 盞，沒有算其他玩家的手電筒；接多人連線時要把 `alarm.light.count` 降到 1 或 0。
- 第二章 20 m 外的殭屍只剩很淡的剪影。
