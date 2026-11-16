# 已知問題（之後再修）

來源：2026-11-16 對 PR #1（T1 場景骨架、T2 氣氛樣板）做的程式碼審查。都不會讓遊戲壞掉，排在框架完成之後修。修好一項就把它刪掉，或標上修好的 commit。

| # | 嚴重度 | 位置 | 問題 | 會發生什麼 | 修法方向 |
|---|---|---|---|---|---|
| 1 | ✅ 已修復 | `web/js/CollisionWorld.js` | 起始重疊先按最小穿透深度解開，再分軸移動 | 四個方向、原地重疊與滑牆皆有回歸測試 | `fix(collision): depenetrate overlapping bodies before movement` |
| 2 | 🟠 | `web/js/LevelData.js:336` `_checkSpawnsAreFree` | 只檢查出生點的中心點，沒有算玩家半徑 0.35 m；身高 1.8 m 是寫死的，抄自 PlayerController | 出生點離牆 0.2 m 不會警告，第一步就會觸發第 1 項 | 用玩家的圓柱（半徑＋身高）檢查，數值從同一個地方讀 |
| 3 | 🟠 | `web/levels/mood.json:81`、`web/js/PropFactory.js:52-54` | 綁了 collider 的道具，旋轉或縮放後，外觀會超出碰撞盒 | mood 的 `car_wreck` 轉 28°，玩家可以走進車角約 0.18 m | LevelData 驗證時發出警告；或讓碰撞盒依旋轉後的外框計算 |
| 4 | 🟡 | `tools/serve.mjs:63` | 隱藏檔過濾只擋開頭是 `.` 的路徑；Windows 的 8.3 短檔名（如 `GIT~1`）可以繞過 | 用 `HOST=0.0.0.0` 開放給區網時，別人可能讀到 `.git/config`、`.env` | 解析成真實路徑後再檢查，或只開放 `web/`、`art/` 等白名單資料夾 |
| 5 | 🟡 | `web/js/PostFX.js:305` | `bloom.levels \|\| 3` 會把 0 當成沒有設定 | palette 設 `levels: 0` 想省效能，結果變成 3 層 | 改用 `??` 或明確判斷 undefined，再限制最小值 1 |
| 6 | 🟡 | `tools/art/shots.mjs:150` | `waitForFunction` 逾時時直接丟錯，跳出整個迴圈 | 某一張卡住，後面的截圖全部不拍 | 每張各自 try/catch，算進 `failures`；`--gpu` 的 d3d11 參數只適用於 Windows |
| 7 | ⚪ | `web/js/App.js:207` | fps 統計用的 `elapsed` 沒有限制範圍 | 第一幀或切回分頁時，fps 數字會跳 | 和 dt 一樣限制範圍 |
| 8 | ⚪ 效能 | `web/js/App.js:235` `_countLights` | 每一幀都走訪整個場景數燈，就算沒開 `?perf` | 白白花掉每幀的時間 | 建好場景後數一次，或只在 perf／截圖模式才數 |
| 9 | ⚪ 效能 | `web/js/StaticBatcher.js:33` | 同材質的東西整關合併成一個 mesh，邊界球涵蓋整個關卡 | 相機和手電筒陰影都沒辦法剔除，看不到的東西也照畫。**第一章 300 m 的山路會受影響** | 改成按區塊（例如 20 m 一格）合併 |
| 10 | ⚪ | `web/js/Flashlight.js:34` | 改了 `shadow.camera.near` 卻沒呼叫 `updateProjectionMatrix` | 某些角度下，0.5 m 以內的陰影會被切掉 | 改完 near 之後呼叫 `updateProjectionMatrix()` |

另外在 T1～T3 回報中已知、還沒處理的：

- 沒有抗鋸齒（MSAA 關閉，也沒做 FXAA）。
- 1.5 倍解析度在 Intel 內顯上約 39 fps，要做 PERFORMANCE_PLAN 3.3 的品質分級／自動降解析度。
- AABB 碰撞不會跟著道具的 rotY 轉（和第 3 項有關）。
- 尾燈超過約 45 m（相機遠平面）會消失，第一章 300 m 的山路要處理。
- 第二章的動態燈已經用滿 4 盞，沒有算其他玩家的手電筒；接多人連線時要把 `alarm.light.count` 降到 1 或 0。
- 第二章 20 m 外的殭屍只剩很淡的剪影。
