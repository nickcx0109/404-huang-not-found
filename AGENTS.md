# 給 agent 的說明

AOOP 期末專題（第 8 組）：網頁版第一人稱三人合作殭屍射擊。課程評分看物件導向設計（類別、繼承、多型、設計模式）和每個人的 commit。

## 要做什麼

讀 [TODO.md](TODO.md)，照最上面「怎麼用」的步驟挑一項、認領、做完、交回。使用者沒有指定項目時，先告訴使用者你挑了哪一項，等他同意再開工。

## 專案事實

- 原生 ES modules，沒有 build 步驟，不用 React。入口是 `web/index.html` → `web/js/main.js`。
- Three.js 固定 **0.128.0**（import map），不要升級，升級會改變第二章的打光和顏色。
- 啟動：`npm run serve`，打開 `http://localhost:8080/web/index.html?level=ch2`。加 `&play=1` 才有玩法，加 `&debug=1` 有除錯資訊。
- 測試：`npm test`（Node 內建 test runner，只跑 `test/`）。
- 架構：[docs/tech/ARCHITECTURE.md](docs/tech/ARCHITECTURE.md)；玩法介面：[docs/tech/GAMEPLAY.md](docs/tech/GAMEPLAY.md)；場景檔案：[docs/art/CHAPTER_FILES.md](docs/art/CHAPTER_FILES.md)；已知問題：[docs/tech/KNOWN_ISSUES.md](docs/tech/KNOWN_ISSUES.md)。
- `reference/` 是舊專案，只能參考，不要從遊戲引用裡面的檔案，也不要改它。

## 規則

- **commit 用使用者自己的 git 身分**，不要用別人的名字或 email。訊息用英文 Conventional Commits（`feat(weapons): add rifle`），一個 commit 一件說得清楚的事。
- 新功能用新類別和新檔案加進去（繼承、Strategy、註冊），不要在既有類別裡加 `switch` 或 `if` 判斷種類。
- 沒有 `play=1` 時，畫面必須和改之前一模一樣。動到引擎或玩法共用檔案時，用 `node tools/art/shots.mjs --level ch2 --format png --out <暫存資料夾>` 在改前、改後各拍一次，確認 PNG 相同（美術項目本來就會改畫面，不用比）。
- 純邏輯（`core/`、`entities/`、`game/`、`weapons/`、`enemies/`、`economy/`）不依賴 DOM，每個新類別都要有 `test/` 裡的測試。
- `docs/story/` 是故事設定，不要改。
- 不要做清單項目以外的事；看到別的問題就加進 TODO.md。
