# 玩法骨架

這一版只建立共用契約，以及每個模組各一個最小範例：`Pistol`、`Walker`、`AmmoRefillItem`。其他槍枝、敵人、商品、章節任務與多人連線列在 [TODO.md](../../TODO.md)，照下面的步驟擴充，不把舊 prototype 整套搬回來。

## 啟動與範圍

```text
npm run serve
http://localhost:8080/web/index.html?level=ch2&play=1
```

- 只有 **`play=1`** 開啟玩法；沒有此參數、`play=0`、`play=true` 都仍是原有走動展示。
- `shot` 優先於 `play`，連 `?level=ch2&play=1&shot=gate_view` 也只拍原場景，不建立玩法實體或 HUD。
- 點畫面取得滑鼠鎖定才從 Lobby 開始。WASD 移動、Shift 跑步、左鍵單發、R 換彈、1–9 換武器、F 手電筒。
- Esc 解除鎖定會暫停玩法時鐘；重新點畫面繼續。不要用系統時間決定射速或換彈，以免暫停期間偷偷完成。
- 波次清空後整備 8 秒；靠近關卡 `type: "shop"` marker 按 E，以 $25 補滿目前武器的彈匣與備彈。波次中或離商店太遠不能買。
- 生命歸零進入 GameOver，凍結戰鬥，重新整理才重開。暫無救援、復活、獲勝／開大門條件，也不實作故事章節目標。
- 波次範例為 2 → 3 → 4 隻，此後維持 4 隻，不是最終遊戲平衡。單人離線而已，沒有網路協定。

## 類別關係

```mermaid
classDiagram
  App *-- GameSession
  App ..> installGameplay
  GameSession *-- GameContext
  GameSession *-- StateMachine
  GameSession --> WaveDirector
  GameSession --> EnemyFactory
  GameSession --> Economy
  GameSession --> DamagePipeline
  GameContext o-- EventBus
  GameContext o-- CollisionWorld
  GameContext o-- PathFinder
  GameContext o-- ObjectPool
  State <|-- LobbyState
  State <|-- PlayingState
  State <|-- WaveBreakState
  State <|-- GameOverState
  StateMachine --> State
  Entity <|-- CombatPlayer
  Entity <|-- Enemy
  Enemy <|-- Walker
  Entity : id
  Entity : position
  Entity : update(dt, ctx)
  Entity : dispose()
  CombatPlayer *-- Damageable
  Enemy *-- Damageable
  Damageable ..> DamageInfo
  DamagePipeline o-- DamageRule
  DamageRule <|-- HeadshotRule
  DamageRule --> DamageRule : next
  CombatPlayer *-- WeaponHolder
  WeaponHolder o-- Weapon
  Weapon <|-- Pistol
  Weapon --> HitscanFire
  Enemy --> Brain
  Brain <|-- ChaseBrain
  ChaseBrain --> Node
  Node <|-- Sequence
  Node <|-- Selector
  Node <|-- Condition
  Node <|-- Action
  EnemyFactory o-- ObjectPool
  WaveDirector <|-- ExampleWaveDirector
  CombatPlayer *-- Wallet
  Economy --> ShopItem
  ShopItem <|-- AmmoRefillItem
  Hud <|-- GameplayHud
```

## 檔案與介面

| 位置 | 契約與責任 |
|---|---|
| `game/installGameplay.js` | 唯一玩法組合入口，建立實例、註冊範例；Three.js 灰盒外觀也在此建立，使用既有 `greybox.dummy` 顏色，沒有新增燈或陰影 |
| `game/GameContext.js` | `scene`、`collision`、`pathFinder`、`events`、`pools`、`players`、`enemies`、`rng`、`time`、`aim`、`session`；容器不是全域變數 |
| `game/GameSession.js` | 唯一模擬權威：輸入命令、傷害套用、擊殺獎金、購物限制、波次與 GameOver；App 擁有它並推進時鐘 |
| `game/states/` | 薄的 State 子類，將生命週期／更新交回 Session，使用現有 `core/StateMachine` |
| `game/WaveDirector.js` | `start(wave, ctx)` 與 `nextSpawn(ctx, reusableResult)`；`remaining` 是尚未產生的數量。範例只在波次開始出怪，從既有出怪圓形區域抽點，檢查碰撞與邊界 |
| `entities/Entity.js` | 可辨識的實體，`position` 是普通 `{x,y,z}` 而非 THREE.Vector3；不在匯入時啟動任何事情 |
| `entities/DamageInfo.js` | 不可變值物件：`amount`、`sourceId`、`targetId`、`hitPart`、`kind`。`withAmount()` 回傳新值，不覆寫原始傷害 |
| `entities/Damageable.js` | 組合而非多重繼承：`health`、`maxHealth`、`alive`、`takeDamage(info)`、`reset()`；傷害限於剩餘生命，每條生命只發一次死亡事件 |
| `entities/DamagePipeline.js` | 按順序串接 `DamageRule.handle/modify`，每個 rule instance 只屬於一條鏈；範例 `HeadshotRule` 為 2 倍 |
| `weapons/Weapon.js` | `fire(ctx)` 固定檢查／扣彈／策略／通知流程，子類實作 `createShot(ctx)`，可覆寫 `onFired(ctx, hit)`；冷卻與換彈都用 `ctx.time` deadline |
| `weapons/HitscanFire.js` | Fire-mode Strategy：`fire(shot, ctx, ownerId)`，輸出命中摘要或 null；只讀敵人 `hitVolume`／`headHeight` 契約，牆比敵人近就擋住子彈 |
| `weapons/WeaponHolder.js` | `add`、`switchTo`、`current`、`update`。切走的槍仍會完成換彈，切槍不重設冷卻 |
| `player/CombatPlayer.js`、`player/PlayerCombat.js` | 前者接合走動控制器、Damageable、WeaponHolder、Wallet；後者是瀏覽器輸入與重用瞄準向量，不決定命中結果 |
| `player/PlayerBody.js` | `PLAYER_BODY` 是玩家半徑 0.35 m、身高 1.8 m、視線高度 1.7 m 的單一來源，PlayerController、LevelData、PathFinder 共用 |
| `enemies/Enemy.js` | Entity 子類與 Damageable 組合，持有 Brain、重用路徑、碰撞結果與命中盒；`activate/deactivate` 為物件池生命週期 |
| `enemies/Brain.js`、`enemies/behaviour/Nodes.js` | Brain Strategy 與最小 reactive 行為樹；Sequence 遇非成功就停止，Selector 遇非失敗就停止，running 會向上傳遞；下次 tick 從首個子節點重新判斷，沒有有記憶的游標 |
| `enemies/EnemyFactory.js` | `register(type, EnemySubclass)`、`create(type, spawn)`、`release(enemy)`、`dispose()`；每種類型獨立 ObjectPool，拒絕重複註冊與重複歸還 |
| `economy/` | Wallet 驗證整數金額；Economy 控制交易並在 apply 失敗時退費；ShopItem 的 `canBuy/apply` 以多型擴充，不在 Economy 寫商品 switch |
| `ui/GameplayHud.js` | 繼承既有 Hud，只加獨立節點；原有 `showError`、`#error`、debug/perf 顯示保留。生命／彈藥／波次／金錢以 10 Hz 更新且文字變動才寫 DOM |

### 傷害與行為的邊界

1. 武器或敵人只送出 `DamageInfo` 的 `DAMAGE_REQUESTED`，不能自己改對方的 health。
2. Session 驗證目前是 Playing、來源仍活著、目標存在、敵我不同，才套用 DamagePipeline 並呼叫目標 Damageable。
3. Damageable 發送傷害／死亡通知；Session 對自己追蹤的敵人只結算一次獎金，其他 UI／特效可訂閱通知，但不要再加一次錢。
4. 已死敵人在下一個 simulation step 歸還 Factory，重新借出時用新的 id、生命與 deadline，舊的命中不能傷害新的生命。
5. 目前 **Session 就是未來 Host 的放置點**。未來 Client 只送輸入，Host Session 決定傷害、擊殺、金錢與狀態，再傳送快照；不要讓各 Client 的 HUD 或 Weapon 各自裁定獎勵。這次不新增網路協定或連線實作。

## 設計模式對照

| 模式 | 實際位置與理由 |
|---|---|
| Template Method | `Weapon.fire` 固定開火流程，`Pistol.createShot` 提供射擊規格，`onFired` 為選用 hook |
| Strategy | Weapon 注入 fire-mode 物件，Enemy 注入 Brain；可換攻擊／決策而不用改使用者 |
| State | 四種 State 經由現有 StateMachine 管理；不能在 enter／exit 遞迴切換，要在 update 請 Session 轉換 |
| Observer | 所有玩法通知及輸入命令名稱統一在 `game/events.js`，用 App 的 EventBus 解耦 |
| Chain of Responsibility | DamagePipeline 串接 DamageRule.next，先前規則輸出交給下一個；目前只提供爆頭範例 |
| Object Pool | EnemyFactory 每種類型使用既有 ObjectPool；死亡隱藏、重設、歸還，跨波次重用 mesh 與路徑 buffer |
| Factory／Registry | EnemyFactory 依字串類型建構已註冊子類；不靠大量 if/else 或匯入各種具體敵人 |

## 事件清單

全部從 `EVENTS` 匯入。命令和通知不同：命令可能被 Session 拒絕，收到 `*_REQUESTED` 不代表已成功。

| 常數 | 字串 | Payload／方向 |
|---|---|---|
| `START_REQUESTED` | `game.start-requested` | 無；輸入 → Session（僅 Lobby） |
| `FIRE_REQUESTED` | `player.fire-requested` | `{ownerId}`；輸入 → Session |
| `RELOAD_REQUESTED` | `player.reload-requested` | `{ownerId}`；輸入 → Session |
| `SWITCH_REQUESTED` | `player.switch-requested` | `{ownerId,index}`；輸入 → Session |
| `PURCHASE_REQUESTED` | `shop.purchase-requested` | `{ownerId,itemId}`；輸入 → Session |
| `DAMAGE_REQUESTED` | `entity.damage-requested` | `DamageInfo`；攻擊策略 → Session |
| `ENTITY_DAMAGED` | `entity.damaged` | `{entity,info,amount,health}`；Damageable 通知，amount 為實際扣血 |
| `ENTITY_DIED` | `entity.died` | 同上；Damageable 通知，單一生命只發一次 |
| `ENEMY_SPAWNED` | `enemy.spawned` | `{enemy,wave}`；Session 通知 |
| `WEAPON_FIRED` | `weapon.fired` | `{ownerId,weaponId,hit}`；Weapon 通知，miss 時 hit 為 null |
| `WEAPON_RELOADED` | `weapon.reloaded` | `{ownerId,weaponId}`；Weapon 換彈完成通知 |
| `WEAPON_CHANGED` | `weapon.changed` | `{ownerId,weaponId}`；WeaponHolder 通知 |
| `WALLET_CHANGED` | `wallet.changed` | `{ownerId,balance,delta}`；Wallet 通知 |
| `ITEM_PURCHASED` | `shop.purchased` | `{ownerId,itemId,cost}`；Economy 成功通知 |
| `STATE_CHANGED` | `game.state-changed` | `{state,wave}`；Session 通知，state 是 lobby／playing／wave-break／game-over |
| `WAVE_STARTED` | `wave.started` | `{wave,count}`；Session 通知 |
| `WAVE_CLEARED` | `wave.cleared` | `{wave,kills}`；Session 通知，kills 為本局累計 |
| `GAME_OVER` | `game.over` | `{wave,kills}`；Session 通知 |

Payload 中的 entity 是同步事件借用的實體參照，不是網路快照。長期保存請複製所需數值與當時 id；物件池會重用該物件。訂閱 `on()` 回傳的取消函式由訂閱者在 dispose 時呼叫。

## 新增武器

1. 從 `weapons/Weapon.js`、`weapons/Pistol.js`、`test/Weapon.test.js` 開始，新增自己的檔案與具名 export，不更動 Pistol 範例來冒充新武器。
2. 繼承 Weapon，constructor 呼叫 super，提供唯一 `id`、`magazine`、`reserve`、`reloadSeconds`、`cooldownSeconds`、`fireMode`。子彈數是非負整數、彈匣與時間必須為正值。
3. 覆寫 `createShot(ctx)`，回傳 `{damage,range}`。固定規格可在模組層 Object.freeze 一次；不要每幀建物件。沿用 HitscanFire，或自行寫 `fire(shot,ctx,ownerId)` Strategy。
4. 命中時只發 DAMAGE_REQUESTED，不直接讀 Walker 類別、加錢或扣血。視覺／音效用 onFired 或訂閱 WEAPON_FIRED，別把 Three.js 引進純邏輯基底。
5. 在共用組合入口 `game/installGameplay.js` 匯入新類別，呼叫 `player.weapons.add(new 你的類別())`。WeaponHolder 已支援數字鍵切換，不需改 Enemy 或 Economy。
6. 自己補假時鐘測試（射速、空彈、換彈、切槍），用 Conventional Commit 提交，一把武器一組 commit。

## 新增敵人類型

1. 從 `enemies/Enemy.js`、`enemies/Walker.js`、`enemies/Brain.js`、`test/Enemy.test.js` 開始，新增自己的 Enemy 子類。
2. constructor 接收 Factory 傳入的 dependencies，呼叫 `super(dependencies,{health,speed,reward,brain})`。所有新生命狀態在 activate 重設；有自訂狀態時覆寫 activate 並先呼叫 super。
3. 自訂 Brain 的 `update(enemy,dt,ctx)`，或組合 Sequence／Selector／Condition／Action，明確回傳 STATUS。移動沿用 moveToward，攻擊沿用事件傷害，不直接操作玩家或 HUD 的具體類別。
4. 在組合入口呼叫 `factory.register('你的唯一類型', 你的類別)`，再由 WaveDirector 回傳相同 type。Factory 本身不用新增 switch；不要在 update 使用 new Enemy。
5. 範例由共用 PathFinder 的 radius／height 決定碰撞及灰盒大小；若要不同體型，要一起調整對應的尋路 clearance 與 hitVolume 契約，不能只放大 mesh。
6. 自己測試註冊、池回收、重新出生狀態、路徑可達與牆後攻擊。調整 WaveDirector 的難度／出怪表時，不改關卡 JSON 來掩蓋碰撞問題。

## 新增商店商品

1. 從 `economy/ShopItem.js`、`economy/AmmoRefillItem.js`、`test/Economy.test.js` 開始，新增自己的 ShopItem 子類。
2. constructor 使用唯一 id 與整數 cost，覆寫 `canBuy(player,ctx)` 時先呼叫 super 檢查資金，再檢查商品條件；判斷過程不可產生副作用。
3. `apply(player,ctx)` 成功必須回傳 true；拒絕回傳 false。先完整驗證再改狀態，不要改到一半拋錯；Economy 只保證退還金錢，無法回復商品自行改動的其他狀態。
4. 只呼叫介面或發事件，不依賴 Pistol 或 Walker。商品也不能自行扣錢，成功交易由 Economy 發 ITEM_PURCHASED。
5. 將實例加入組合入口的 items 陣列；UI 發 `{ownerId,itemId}` 的 PURCHASE_REQUESTED。狀態與距離檢查仍由 Session 執行，現在 E 僅綁定補彈範例。
6. 測試買不起、條件不符、成功一次、apply 失敗退費，以及波次中／遠離商店的 Session 拒絕路徑，再提交修改。

## 新增狀態

1. 從 `core/State.js`、`game/states/`、`test/GameSession.test.js` 開始，在 states/ 新增 State 子類，提供唯一 name。
2. enter／exit 只處理該狀態生命週期，update(dt,ctx) 委派給 Session 對應方法；不可在 enter／exit 內呼叫 changeState。
3. 決定哪些命令可用、是否移動、如何離開、是否處理死亡。在 Session.states 建立實例，將條件與轉換集中於 Session，避免 UI、敵人各自判斷勝負。
4. 用 `session.changeState(state)` 轉換以保留 STATE_CHANGED 通知，不從其他模組直接呼叫 machine.change。
5. 加上可進入、可離開、事件只發一次、禁用命令被拒絕的測試；如果增加事件，先在 events.js 定義常數再讓其他模組訂閱。

## 效能與生命週期

- Enemy 是一隻一個 mesh、沒有新增動態燈／投影，沿用原有霧、遠平面與後製。灰盒使用既有 palette 顏色，不更動美術。
- 每個 Enemy 重用 position、hitVolume、路徑 Float64Array、移動結果及攻擊 ray；`CollisionWorld.move(..., result)` 支援 caller-owned 結果，PlayerController 也重用結果。
- `PathFinder.createRoute()` 在建立 pooled enemy 時配置 buffer，`findPathInto(...,route)` 在預配置 BFS queue／from 上運作，與展示用 `findPath()` 分開。BFS 不切障礙對角，針對固定 collider 網格；動態碰撞更新尚未支援。
- 玩法專用 finder 多留 0.002 m clearance，避免貼牆格點的浮點誤差讓敵人卡住；不改展示模式的網格結果。遠距路徑每 1.5 秒、近距每 0.75 秒才重算，移動仍按每幀 dt 更新。
- 這不是最終大量殭屍方案：24／40／64 隻、品質分級、自動降解析度、Worker flow field 還是 PERFORMANCE_PLAN 的後續工作，不在這次擴寫。
- DamageInfo、事件摘要、換波出怪等只在離散事件配置；不要新增每幀的 map/filter、new Vector3 或尋路陣列。HUD 限頻，不每幀重建 DOM。
- Session.dispose 取消訂閱並釋放 Factory；Factory.dispose 清理所有曾建立的 mesh／材質／幾何。頁面離開會清理輸入與 HUD。若日後加入頁內重開，應先走完整 dispose，再建立新 Session。
- LevelData 以真正圓柱與 AABB 的最近點檢查出生點；移動仍沿用原本較保守的方柱碰撞。新驗證使 `mood.json` 的 `spawns.zombies[1]` 警告與 `tree_56` 重疊，未改該關卡；ch2／test 無新警告。

## 驗證與除錯

```text
npm test
node tools/art/assets.mjs check
node tools/art/shots.mjs --level ch2 --format png --out <OS-temp>/ch2
node tools/art/shots.mjs --level test --format png --out <OS-temp>/test
```

Windows 若 npm.ps1 被執行政策擋住，改用 `npm.cmd test`／`npm.cmd run serve`，不要改 PowerShell 政策。

加 `&debug=1` 才有 `window.__gameDebug`：`start()`、`snapshot()`、`aimAt(enemyId)`、`fire()`、`reload()`、`advance(seconds)`。advance 每次至多 120 秒、內部切成最多 0.05 秒的模擬步；fire 仍走正常命中、遮擋、扣彈、冷卻及 Session 傷害流程，不能直接送錢或殺敵。這不是公開遊戲 API，無 debug 參數不建立它。自動測試若用 advance，先停止一般 rAF，避免同時推進兩個時鐘。

本次驗收：56 個 node:test 全過（含 ch2 四個出怪區都能走到玩家）；素材檢查與 main 輸出相同。ch2 的 8 張、test 的 5 張 shot PNG，以及兩關固定時間的 walk PNG，全部 SHA-256 相同。Playwright 另確認無 debug 時實際滑鼠／R／W 輸入、兩隻敵人在出怪區域產生、命中擊殺 +$25、清完 +$50、整備後第二波 3 隻且重用兩個物件、受到近戰傷害進 GameOver，以及 shot 優先。測試腳本與 PNG 只放 OS temp，不加入版本控制。
