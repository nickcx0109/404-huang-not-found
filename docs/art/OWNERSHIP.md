# 誰改哪些檔案

三章由三個人各自用自己的 Claude 平行製作。為了不互相衝突，檔案分成「每章自己的」和「共用的」兩種：

- **自己那一章的檔案**：隨便改，不用問人。
- **共用檔案**：改之前先跟組長說，由一個人改、大家再更新。
- **別章的檔案**：不要改。需要別章的東西，請那一章的人做。

## 每章自己的檔案

把 `N` 換成自己的章（1、2、3）。

| 用途 | 檔案 | 說明 |
|---|---|---|
| 關卡 | `web/levels/chN.json`（以及 `chN_*.json`） | 碰撞、道具、出生點、出怪區、markers、機位。格式見 [web/levels/README.md](../../web/levels/README.md) |
| 灰盒替身 | `web/js/props/ChNProps.js` | 繼承 `PropSet`，在 `static builders` 列替身，在 `static extras`（或 getter）列模型上要加的燈。三章都由 `main.js` 匯入並註冊，不必改 HTML |
| 氣氛 | `art/style/chapters/chN.json` | 這一章的 palette 區塊（霧、光、後製、重點色、灰盒顏色），以及這一章的資產顏色（`_assets.colors`） |
| 資產清單 | `art/manifest/chN.json` | 這一章的規格卡 |
| 資產腳本 | `art/blender/<id>.py` | `<id>` 是自己清單裡的資產 |
| 模型 | `web/assets/models/<id>.glb` | 由工具產生，不要手改 |
| 預覽圖 | `art/previews/<id>/` | 由工具產生 |
| 截圖 | `art/style/refs/chN*/` | 例如 `ch2-greybox/`、`ch2/` |

目前的狀況：

| | 第一章 | 第二章 | 第三章 |
|---|---|---|---|
| 關卡 | 還沒有（`mood.json` 是氣氛樣板，可以參考） | `ch2.json` 灰盒完成 | 還沒有 |
| 替身 | `tree`、`escape_car` | 大門、招牌、沙包、拒馬等 9 種 | 空的骨架 |
| 氣氛 | 等於 heavy | 已調整（見 STYLE_GUIDE） | heavy＋橘黃重點色 |
| 清單 | 7 筆 `planned` | 9 筆 `planned` | 14 筆 `planned` |

## 共用檔案（改之前先跟組長說）

| 檔案 | 為什麼是共用的 |
|---|---|
| `web/index.html`、`web/js/main.js` | import map 固定 Three.js 0.128.0；唯一模組入口負責註冊三章的 props，平常不需要動 |
| `web/js/*.js`（`App`、`LevelData`、`SceneBuilder`、`PropFactory`、`ModelLibrary`、`ModelInstancer`、`StaticBatcher`、`Emitters`、`Palette`、`Atmosphere`、`PostFX`、`Flashlight`、`CollisionWorld`、`PathFinder`、`PlayerController`、`Hud`） | 引擎，三章都在用 |
| `web/js/props/CommonProps.js` | 跨章共用的替身：車、卡車、路燈、圍欄、矮牆、大樓、路面 |
| `web/js/props/PropSet.js`、`web/js/core/`、`test/` | 共用的道具契約、事件／物件池／狀態機，以及不需瀏覽器的單元測試 |
| `art/style/palette.json` | `default`、`mood`、`blockout` 三個共用區塊，還有共用的資產顏色與髒污設定（`_assets`） |
| `art/manifest/common.json` 和它列的資產 | 跨章共用的模型（廢車、卡車、路燈、圍欄、油桶、垃圾）。誰做哪一個，先分配好 |
| `art/manifest/test.json`、`test_crate` | 流程測試用 |
| `art/blender/_lib/` | 所有資產腳本共用的小工具 |
| `tools/`（`serve.mjs`、`art/assets.mjs`、`build_assets.py`、`preview.py`、`check_assets.mjs`、`shots.mjs`、`_common.py`） | 工具 |
| `web/levels/test.json`、`web/levels/mood.json`、`web/levels/README.md` | 測試關卡、氣氛樣板、格式說明 |
| `art/style/STYLE_GUIDE.md`、`docs/` | 文件。`docs/story/` 不能改 |
| `package.json`、`package-lock.json`、`.gitignore` | 專案設定 |

## 常見需求，不用動共用檔案的做法

| 想做的事 | 做法 |
|---|---|
| 加一種灰盒替身 | 在自己的 `ChNProps.js` 的 `static builders` 加 `名字: ChNProps.builder`；共用基底統一呼叫 `factory.register` |
| 替身要一個新顏色 | 在自己的 `chapters/chN.json` 的 `greybox` 裡加一個鍵，替身用 `factory.material('鍵')` 取 |
| 模型要一個新顏色 | 在自己的 `chapters/chN.json` 加 `"_assets": { "colors": { "名字": "#rrggbb" } }` |
| 調整這一章的霧、光、手電筒 | 改自己的 `chapters/chN.json`。不要改 `mood` |
| 模型上要有燈 | 在自己的 `ChNProps.js` 的 `static extras`（或 getter）加 `名字: callback`，基底統一呼叫 `factory.registerExtras`，見 [ADDING_AN_ASSET.md](ADDING_AN_ASSET.md) |
| 關卡要記一種新的位置（補給點、檢查點、燃料桶放置點） | 用關卡的 `markers`，自己取 `type` |
| 只建、只檢查自己的模型 | 工具都加 `--chapter chN` |

真的需要改共用檔案的情況（例如關卡格式要加新欄位、替身需要 `PropFactory` 沒有的形狀、發現引擎的 bug）：跟組長說，由一個人改完、合併之後大家再更新自己的分支。已知還沒修的問題列在 [docs/tech/KNOWN_ISSUES.md](../tech/KNOWN_ISSUES.md)。

## 名字不能撞

- **道具名稱**（`static builders` 的鍵）和**資產 id** 全專案唯一。兩個檔案註冊同一個名字時，瀏覽器 console 會警告；兩份清單有同一個 id 時，`check_assets` 會失敗。
- 通用的名字（`car_wreck`、`fence`、`street_lamp`…）留給共用的。自己章節的東西用認得出來的名字（`mvidia_gate`、`fuel_barrel`、`guardrail`），有疑慮就加章節字首（`ch3_door`）。
- palette 的灰盒顏色鍵、資產顏色名字，自己章節加的建議也帶字首，避免之後和共用的撞名。

## 交回來之前自己檢查

```
npm test
node tools/art/assets.mjs check --chapter chN
node tools/art/shots.mjs --level chN --out art/style/refs/chN
```

再開 `http://localhost:8080/web/index.html?level=chN&debug=1`（先 `node tools/serve.mjs`），左上角不能有 `unreachable`、`warning`、`model failed`。
