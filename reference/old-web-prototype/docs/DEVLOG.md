# 開發紀錄

每週一段，每個人寫自己的部分，幾行就好：做了什麼、卡在哪、下週要做什麼。和 commit、PR 一起當作期末報告的貢獻佐證。

週數以 10/19 為第 1 週。

---

## 第 0 週（10/19 前）

- 定案：三人區網合作的第一人稱殭屍波次射擊，Unity + C#。
- 做了瀏覽器原型 v0.1、v0.2（`prototype-web/`），驗證波次節奏、殭屍預告動作、交易站、抽獎機。
- 參考遊戲：Killing Floor 2（交易站）、CoD Zombies（繞圈與區域設計）、Left 4 Dead（特殊殭屍音效預告）。

### 階段 1 驗證（2026/10/15）

- 13 個 JavaScript 檔皆通過 `node --check`，diff 通過 `git diff --check`。
- 與拆檔前的 `main` 比對：移除每檔的嚴格模式宣告後，按載入順序串接的 JavaScript 與原碼逐字一致；CSS 逐字一致，HTML 畫面結構一致。
- 使用無頭 Edge 瀏覽器，以相同亂數種子與固定更新步長，對原版及拆檔版取得 14 組狀態快照，結果全部一致：大廳、開始、移動／跳躍／視角、射擊、換彈、爆頭擊殺、四種敵人、清波、購物、抽獎選項、套用升級、下一波、結算、返回大廳。
- 上述瀏覽器驗證沒有 JavaScript 例外或資源載入失敗。未做人工滑鼠鎖定操作與音效聽感驗收，也尚未驗證多人連線。

### 階段 2：連線伺服器與 live reload（2026/10/15）

- 新增零 npm 依賴的 Node 靜態伺服器、RFC 6455 文字 JSON WebSocket、三人單房間與 Host/client 轉送。遊戲本身仍是單人，尚未使用 hello 或轉送來同步玩法；玩家與敵人模組未變更。
- 新增 `core/net.js`，處理 CSS 熱替換、整頁重載與斷線重連。啟動設定改用 Node，原本的 Python 單人啟動方式仍可用。
- Node v24.19.0 實跑 `node --test prototype-web/test/`：11 項全部通過。包含 MIME、no-store、路徑穿越與私有檔案、不同工作目錄啟動、連接埠占用、握手、三人容量與 ID 回收、權限與轉送、超過 65535 bytes 的往返、Host 離開清房、TCP 拆包／黏包、分段與插入 ping、錯誤訊息／未遮罩／binary／1 MiB 上限、watcher 忽略規則、實際等待 10 秒 ping 與 20 秒未 pong 斷線。
- 使用已安裝的無頭 Edge 瀏覽器實測 `http://localhost:8765`：Node 與 Python 都能開始單人遊戲，實際送出鍵盤／滑鼠輸入完成移動、射擊、換彈，console 沒有錯誤。
- 兩個分頁都連線後，暫改 `ui/styles.css` 的文字顏色：兩邊即時變色，頁面識別值未變，進行中的遊戲時間持續增加；恢復原色同樣成功。暫改 `core/net.js` 後兩邊自動重載；停掉並重啟伺服器後，兩邊自動重連並重載。驗證用的 CSS／JS 變更均已還原。
- 同一台電腦以區網 IP `http://192.168.0.229:8765` 開啟，網頁與 WebSocket 皆成功，console 沒有錯誤。未用第二台實體電腦驗證跨機存取，也未驗證 Windows 防火牆首次詢問或 Node 18／22 執行環境。
- 原本占用 8765 的 Python 原型服務在瀏覽器驗證期間暫停，驗證結束已恢復。
- 實作補充：用成功的 HEAD 請求檢查 `X-Prototype-Server` 標頭，避免 Python 下建立失敗 WebSocket 而出現瀏覽器錯誤；三次辨識失敗後停止。`net.js` 補上空白 data URL favicon，消除原型原本缺少 `/favicon.ico` 的 404，沒有新增圖片檔或更動遊戲邏輯。`test/index.js` 提供目錄形式測試指令的入口。
- Windows watcher 也會回報父資料夾的 metadata 變更，因此額外排除現存資料夾通知，避免 CSS 編輯誤觸整頁重載。Host 離線時清除所有房間成員資格，現有 WebSocket 保留以接收 live reload，之後可重新 hello。
- 階段 2 到此停止，等待使用者確認；沒有 push，也沒有開始階段 3。

---

## 第 1 週

### A 玩家與武器（姓名）
-

### B 敵人與波次（姓名）
-

### C 網路、流程與 UI（姓名）
-

### 本週貢獻統計

（貼上 `python tools/contrib_report.py --since 2026-10-19` 的輸出）
