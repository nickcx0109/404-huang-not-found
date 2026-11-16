# reference：舊專案參考

這裡放舊專案的內容，**只供參考，不是這個專案的程式**。不要從遊戲頁面引用這裡的檔案，也不要在這裡繼續開發。

## old-web-prototype

舊 repo `aoop-zombie-coop` 的網頁原型（commit `67f8635`，2026-11-15）。原本的 `AGENTS.md`、`CLAUDE.md`、`.gitattributes`、`.gitignore`、`.mailmap` 沒有放進來，因為那些是給舊的 Unity 專案用的規則。

| 路徑 | 可以參考的內容 |
|---|---|
| `prototype-web/index-v0.5.html` | 最新版原型：區網三人連線、波次、四種殭屍、交易站 |
| `prototype-web/core/` | 遊戲流程、連線、商店、音效、特效 |
| `prototype-web/player/`、`enemy/` | 武器、殭屍 AI（flow field、行為樹） |
| `prototype-web/server.mjs` | 靜態伺服器＋WebSocket 房間轉送＋live reload |
| `prototype-web/sfx/` | 音效檔 |
| `docs/GAMEPLAY_DESIGN.md` | 玩法設計 |
| `docs/UNITY_*.md` | 舊的 Unity 版計畫（已不採用） |

在本機跑舊原型：

```bash
node reference/old-web-prototype/prototype-web/server.mjs
```

瀏覽器打開 <http://localhost:8765>。
