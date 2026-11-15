# 三人分工：一人一章

框架已完成（資產工具、每章各自的檔案、GLB 載入）。現在三個人**平行**做，各自用自己的 Claude。

| 組員 | 負責 | 分支 | 要負責的共用道具（`art/manifest/common.json`） |
|---|---|---|---|
| A | 第一章：起霧的山路 | `feat/scene-ch1` | `car_wreck` |
| B | 第二章：MVIDIA 大門廣場（灰盒已完成） | `feat/scene-ch2-art` | `car_parked`、`truck_wreck`、`van_wreck`、`street_lamp`、`fence` |
| C | 第三章：總部大樓、機房、頂樓 | `feat/scene-ch3` | `oil_barrel`、`trash_pile` |

共用道具誰先需要就誰做，做好後另外兩人直接用，不要重做。名單想換，三個人講好就換，記得改這張表。

## 開工前（每人一次）

1. `git pull`，從最新的 `main` 開自己的分支（`git checkout -b feat/scene-chN`）。
2. 裝 [Node.js LTS](https://nodejs.org) 和 [Blender 4.2 LTS](https://www.blender.org/download/lts/)，`blender` 要在 PATH 上。或者直接跟你的 Claude 說「幫我裝 Node.js 和 Blender 4.2 LTS」。
3. 在 repo 根目錄開 Claude Code，**開新對話**，把下面「給 Claude 的開場」加上你那章的段落一起貼上。

## 規則（避免互相衝突、省 token）

- **只改自己那章的檔案**，清單在 [OWNERSHIP.md](OWNERSHIP.md)。共用檔案（`PropFactory.js`、`Palette.js`、`index.html`、工具程式等）要改，先在群組講。
- 一個步驟做完就停，自己看截圖或預覽圖，滿意再叫它做下一步。
- **每個步驟開新的 Fable 子代理，effort 用 medium**；截圖最多改 2 輪；不要做任務以外的東西。Fable 額度用完就改用 Opus 接手。
- 對話太長時，Claude 會先整理進度，再提醒你開新對話。
- 已知問題在 [docs/tech/KNOWN_ISSUES.md](../tech/KNOWN_ISSUES.md)，不在自己範圍內的不用修。
- 做完一章：push 自己的分支 → 開 PR → 另外一個人看過再合併。

## 給 Claude 的開場（三人共用，貼在最前面）

```
我負責這個 repo（404-huang-not-found）場景美術的其中一章。請你當協調者：每個步驟開一個新的 Fable 子代理（model fable，effort medium）去做，Fable 額度用完就改用 Opus 接手。每個步驟做完先停下來，把截圖或預覽圖傳給我看，我說好再做下一步。

開始前先讀：docs/art/TEAM_SPLIT.md、docs/art/OWNERSHIP.md、docs/art/ADDING_AN_ASSET.md、docs/art/PROGRESS.md、art/style/STYLE_GUIDE.md、docs/tech/PERFORMANCE_PLAN.md 第 3.1 節、docs/story/ 裡我這章的故事。

給子代理的共同規則：
- 只改我這章擁有的檔案（OWNERSHIP.md），共用檔案不要改；真的需要改就停下來問我。
- 玩法資料（碰撞、出生點、出怪點）和外觀分開；換外觀不能動碰撞。顏色、霧、燈光只放在 palette 檔，程式裡不寫死。
- 資產走 ADDING_AN_ASSET.md 的流程，`node tools/art/assets.mjs all --chapter <章>` 沒過就不能 commit。
- 截圖 JPEG 品質 85、1280×720，自評最多 2 輪；不要做任務以外的東西。
- 每做完一件事 commit 一次（英文 Conventional Commits），不要 push。
- 回報：commit 清單、截圖／預覽圖路徑、draw call 與三角面數（對照 PERFORMANCE_PLAN 3.1）、還不滿意的地方。

我的章節和步驟如下：
```

## 組員 A：第一章

```
我負責第一章（分支 feat/scene-ch1）。步驟：
1. 灰盒 web/levels/ch1.json：約 300 m 的山路，分 3 段、2 個檢查點；兩旁用濃霧和樹牆擋住；每隔一段有一個小景（翻倒的車、空帳篷）；終點是車，紅色尾燈 #ff3b2f 一路當引導。3 個玩家出生點、出怪區、6～8 個機位。從起點要走得到終點（用 PathFinder 驗證）。氣氛以 mood 的 heavy 為基準，寫在 art/style/chapters/ch1.json。注意 KNOWN_ISSUES.md 的「尾燈超過約 45 m 會消失」和「StaticBatcher 不能剔除」，300 m 的路會遇到，要處理就只在 ch1 自己的檔案裡處理，不行就停下來問我。
2. 第一章專屬資產（art/manifest/ch1.json）：road_segment（直線、彎道、坡道）、guardrail、guardrail_broken、escape_car（尾燈自發光）。
3. 共用道具：car_wreck（登記在 common.json）。
4. 把灰盒換成模型、打光（霧的流動、遠景剪影），重拍所有機位並和灰盒截圖比較。
```

## 組員 B：第二章

```
我負責第二章（分支 feat/scene-ch2-art）。灰盒 web/levels/ch2.json 已經做好，截圖在 art/style/refs/ch2-greybox/，碰撞不要動。步驟：
1. 第二章專屬資產（art/manifest/ch2.json）：mvidia_gate（總部大門、門禁面板，標誌自己設計，不要仿任何真實公司的 logo）、guard_booth（可做翻倒版本）、barricade、sandbags、warning_light（燈罩，光由程式加）。
2. 共用道具：car_parked、truck_wreck、van_wreck、street_lamp、fence（登記在 common.json）。
3. 把灰盒換成模型、打光（招牌閃爍、警示燈、霧的流動），重拍所有機位，存到 art/style/refs/ch2/，和 ch2-greybox 並排比較。
注意：動態燈已用滿 4 盞；20 m 外的殭屍太淡（見 KNOWN_ISSUES.md），打光時順便改善。
```

## 組員 C：第三章

```
我負責第三章（分支 feat/scene-ch3）。步驟：
1. 灰盒 web/levels/ch3.json：一樓燃料桶區（約 20 個放置點，寫在關卡資料裡）、貨梯、頂樓發射台三個區塊；室內以 2 m 格子拼。停電後的黑、紅色應急燈，重點色是燃料桶的橘黃 #ffb020（一定要醒目）。3 個玩家出生點、出怪區、6～8 個機位，PathFinder 驗證走得到每個燃料桶。氣氛寫在 art/style/chapters/ch3.json。
2. 第三章專屬資產（art/manifest/ch3.json）：office_kit（牆、門、窗、走廊、轉角）、server_rack（LED 自發光）、freight_elevator、fuel_barrel 三種狀態（一般、冒煙、毀損）、rocket、launch_pad、cage。
3. 共用道具：oil_barrel、trash_pile（登記在 common.json）。
4. 把灰盒換成模型、打光（閃爍日光燈、機房綠色 LED、探照燈打在火箭上），重拍所有機位並和灰盒截圖比較。
角色（殭屍、Boss、老黃、主角）不在範圍內。
```
