# Zombie Co-op（AOOP 期末專題）

三人區網合作的第一人稱殭屍波次生存射擊遊戲。正式版用 Unity 6 LTS + C# + Netcode for GameObjects 開發，目前 repo 裡只有瀏覽器版的玩法原型。

## 目前內容

| 路徑 | 說明 |
|---|---|
| `prototype-web/index.html` | 單人瀏覽器原型 v0.2（Three.js）：波次、四種殭屍、交易站、抽獎機 |
| `tools/contrib_report.py` | 統計每個人的 commit 與改動行數 |
| `docs/DEVLOG.md` | 每週開發紀錄 |
| `AGENTS.md` / `CLAUDE.md` | 給 coding agent 的規則 |
| `CONTRIBUTING.md` | 給組員的協作流程 |

線上試玩：<https://claude.ai/artifact/VXEMFKxysPmSHeTRyPvGR4>（需要 repo 擁有者分享權限）

## 本機執行原型

```bash
node prototype-web/server.mjs
```

需要 Node.js 18 以上，不需安裝 npm 套件。瀏覽器打開 <http://localhost:8765>，需要鍵盤與滑鼠。從其他工作目錄執行時，請傳入 `server.mjs` 的完整路徑；靜態檔案位置會自動以伺服器檔案所在資料夾為準。可用環境變數 `PORT` 更改連接埠。

伺服器會列出本機的 IPv4 網址。同一區網的其他電腦可以打開列出的網址，例如 `http://192.168.1.23:8765`；第一次執行時，若 Windows 防火牆詢問，請允許「私人網路」。打開 `index-v0.5.html` 後，一個人在選單按「建立房間」當 Host，其他人按「加入房間」（最多 3 人），由 Host 按開始。殭屍、波次與流程由 Host 決定，其他人只送命中請求；倒地後隊友靠近按住 E 可以救援，全員倒地才結束。隊友的近戰、火焰與投擲物動畫目前還不會同步顯示。

Node 開發伺服器提供 live reload：修改 CSS 會即時替換樣式並維持遊戲；其他公開檔案變更會重新載入頁面。伺服器重啟後，已連線的分頁會重連並重新載入。修改 `server.mjs` 只會提示重新啟動。

也能沿用 `python -m http.server 8765 --directory prototype-web` 玩單人原型，只是沒有 live reload。前端辨識不到 Node 伺服器時，會安靜地停止重試。

伺服器只使用 Node 內建模組。執行測試需 Node.js 22 以上的內建 WebSocket client：

```bash
node --test prototype-web/test/
```

測試會在暫存資料夾以隨機連接埠啟動伺服器，結束後關閉並清理，不會改動遊戲檔案。`test/index.js` 讓上述目錄形式的指令也能執行測試。

## 原型階段 1：依 A/B/C 拆檔

| 分工 | 路徑 | 內容 |
|---|---|---|
| A 玩家與武器 | `prototype-web/player/player.js` | 玩家移動、武器、射擊策略、傷害修正鏈 |
| B 敵人與波次 | `prototype-web/enemy/enemy.js` | 行為樹、四種殭屍、工廠與物件池、波次、局內升級 |
| B 尋路 | `prototype-web/enemy/flow-field.js` | 格狀 flow field |
| C 場景與表現 | `prototype-web/core/world.js`、`audio.js`、`effects.js` | Three.js 場景、地圖、音效與特效 |
| C 流程與互動 | `prototype-web/core/game.js`、`shop.js`、`input.js`、`main.js` | 狀態、遊戲管理、經濟與交易站、輸入、啟動與主迴圈 |
| C UI | `prototype-web/ui/hud.js`、`store-guide.js`、`styles.css` | HUD、選單、小地圖、商店引導與樣式 |
| 共用 | `prototype-web/shared/shared.js` | 工具函式、儲存、EventBus、ObjectPool |

JavaScript 使用依序載入的傳統 script，共用原本的全域宣告，各檔保留嚴格模式（`'use strict'`）。請維持 `index.html` 的載入順序，不加 `async` 或 `defer`；`core/net.js` 在 `core/main.js` 之前載入。

## 分工

| 模組 | 範圍 | 負責人 |
|---|---|---|
| A 玩家與武器 | 移動、射擊、武器、倒地救援 | 待定 |
| B 敵人與波次 | 殭屍 AI、波次、升級效果 | 待定 |
| C 網路、流程與 UI | 連線、遊戲狀態、HUD、交易站 | 待定 |

完整設計見專題 handoff 文件。
