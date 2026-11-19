# 玩法骨架

這一版建立共用契約，以及 `Pistol`、`Walker`、`AmmoRefillItem` 最小範例，並已加入 `Rifle`、`Shotgun`。其他敵人、商品、章節任務與多人連線列在 [TODO.md](../../TODO.md)，照下面的步驟擴充，不把舊 prototype 整套搬回來。

## 啟動與範圍

```text
npm run serve
http://localhost:8080/web/index.html?level=ch2&play=1
```

- 只有 **`play=1`** 開啟玩法；沒有此參數、`play=0`、`play=true` 都仍是原有走動展示。
- `shot` 優先於 `play`，連 `?level=ch2&play=1&shot=gate_view` 也只拍原場景，不建立玩法實體或 HUD。
- 點畫面取得滑鼠鎖定才從 Lobby 開始。WASD 移動、Shift 跑步、左鍵開火（步槍按住連射）、R 換彈、1–7 或滑鼠滾輪換道具欄（滾輪跳過空格）、E 撿地上的槍、F 手電筒。放開左鍵、失去視窗焦點或解除鎖定會停止連射。
- Esc 解除鎖定會暫停玩法時鐘；重新點畫面繼續。不要用系統時間決定射速或換彈，以免暫停期間偷偷完成。
- 波次清空後依波次表整備 6～10 秒；靠近關卡 `type: "shop"` marker 按 E，以 $25 補滿目前武器的彈匣與備彈。波次中或離商店太遠不能買。
- 生命歸零進入 GameOver，凍結戰鬥，重新整理才重開。暫無救援、復活、獲勝／開大門條件，也不實作故事章節目標。
- 預設使用資料驅動的混合波次，陸續出怪且限制同時在場數量（見下方 G3 波次表）；數值不是最終遊戲平衡。單人離線而已，沒有網路協定。

## 類別關係

```mermaid
classDiagram
  App *-- GameSession
  App ..> installGameplay
  GameSession *-- GameContext
  GameSession *-- StateMachine
  GameSession --> WaveDirector
  GameSession --> CrowdSeparation
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
  WaveDirector <|-- TimedWaveDirector
  TimedWaveDirector *-- WaveTable
  CombatPlayer *-- Wallet
  Economy --> ShopItem
  ShopItem <|-- AmmoRefillItem
  Hud <|-- SurvivalHud
  SurvivalHud o-- HudWidget
  SurvivalHud *-- PlayerStatus
  HudWidget *-- Attention
  HudWidget <|-- HealthWidget
  HudWidget <|-- AmmoWidget
  HudWidget <|-- CrosshairWidget
  HudWidget <|-- DamageOverlay
  HudWidget <|-- PromptWidget
  HudWidget <|-- EventCard
  HudWidget <|-- TeamWidget
  HudWidget <|-- StatusLine
```

## 檔案與介面

| 位置 | 契約與責任 |
|---|---|
| `game/installGameplay.js` | 唯一玩法組合入口，建立實例、註冊範例；Three.js 灰盒外觀也在此建立，使用既有 `greybox.dummy` 顏色，沒有新增燈或陰影 |
| `game/GameContext.js` | `scene`、`collision`、`pathFinder`、`events`、`pools`、`players`、`enemies`、`rng`、`time`、`aim`、`session`；容器不是全域變數 |
| `game/GameSession.js` | 唯一模擬權威：輸入命令、傷害套用、擊殺獎金、購物限制、波次與 GameOver；App 擁有它並推進時鐘 |
| `game/states/` | 薄的 State 子類，將生命週期／更新交回 Session，使用現有 `core/StateMachine` |
| `game/WaveDirector.js` | `start(wave, ctx)`、`update(dt, ctx)` 與 `nextSpawn(ctx, reusableResult)`；`remaining` 是尚未產生的數量。基底 update 為空操作，ExampleWaveDirector 保留即時出完 2 → 3 → 4 隻 walker 的範例行為 |
| `game/TimedWaveDirector.js`、`game/WaveTable.js` | 新 director 子類以模擬時鐘控制間隔、在場上限與輪流種類；WaveTable 在建構時驗證並複製資料，依明確規則延伸後續波次 |
| `game/waves/survival.js` | 純 JS 波次資料模組，供瀏覽器和 Node 直接載入，無需額外 fetch、JSON import assertions 或 build；資料與出怪演算法分開 |
| `game/CrowdSeparation.js` | 可注入／替換的 Strategy；Session.simulate 後套用，使用兩者半徑相加的距離，透過 ctx.collision.move/hit 防止推入牆與越界，同步外觀和 hitVolume |
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
| `ui/hud/SurvivalHud.js` | 遊戲內介面，繼承既有 Hud（`showError`、`#error`、debug/perf 顯示保留），裡面裝一組 `HudWidget`。只有 `play=1` 才建立；字型、`css/hud.css` 也是這時才加進頁面 |
| `ui/hud/HudWidget.js` 和各元件 | 每個元件一個類別、一個檔案：血量、彈藥、準星、受傷效果、提示文字、事件字卡、隊友、頂端狀態列。`bind()` 訂閱事件處理「某一刻發生的事」，`sync(status)` 收目前的數字、有變才寫 DOM；元件不持有遊戲物件 |
| `ui/hud/PlayerStatus.js` | HUD 唯一會讀 Session 的類別，每幀把血量、彈藥、金錢、波次、位置、隊友抄成普通數字。事件沒帶的數字（子彈數、是否換彈中）從這裡來；之後連線時 Client 可以用 Host 的快照填同樣的欄位 |
| `ui/hud/logic/` | 不碰 DOM 的純邏輯，各有測試：`Attention`（多久淡回去）、`HealthMeter`（低於 30% 算低血量）、`AmmoMeter`、`HitMark`、`DamagePulse`、`HitDirection`、`CardQueue`、`BrushStroke` |

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
| Strategy | Weapon 注入 fire-mode 物件，Enemy 注入 Brain，Session 注入 separation.apply(ctx) 物件；可替換行為而不用改使用者 |
| State | 四種 State 經由現有 StateMachine 管理；不能在 enter／exit 遞迴切換，要在 update 請 Session 轉換 |
| Observer | 所有玩法通知及輸入命令名稱統一在 `game/events.js`，用 App 的 EventBus 解耦 |
| Chain of Responsibility | DamagePipeline 串接 DamageRule.next，先前規則輸出交給下一個；目前只提供爆頭範例 |
| Object Pool | EnemyFactory 每種類型使用既有 ObjectPool；死亡隱藏、重設、歸還，跨波次重用 mesh 與路徑 buffer |
| Composite | `SurvivalHud` 裝著一組 `HudWidget`，每幀對每個元件呼叫 `sync` 和 `tick`；加元件不用改其他元件 |
| Template Method（介面） | `HudWidget.tick` 固定「計時的 class → 子類的 `advance` → 共用的淡入淡出」，子類只覆寫 `bind`、`sync`、`advance` |
| Factory／Registry | EnemyFactory 依字串類型建構已註冊子類；不靠大量 if/else 或匯入各種具體敵人。`WeaponCatalog`（含 pool）、`EffectViews.register`、`RecoilKick.register` 也是註冊表 |
| Template Method（投擲物） | `ThrownObject.update` 固定「重力 → 撞牆 → 落地 → afterMove」，`ThrownGrenade`、`ThrownMolotov` 只覆寫 `onWall`、`onGround`、`afterMove` |
| 多型 hook | `Weapon.secondary`、`holster`、`progress`、`depleted`、`canAbsorb`、`absorb`、`refuses` 預設什麼都不做，`CarriedItem`、`Bandage` 覆寫；`LoadoutHolder`、Session、HUD 只呼叫介面，不判斷種類 |
| Observer＋Strategy（音效） | `SoundRule` 子類（`WeaponSounds`、`HitSounds`、`PlayerSounds`、`PickupSounds`、`ZombieSounds`、`WorldSounds`）訂閱事件、叫 `SoundBoard.play`；聲音本身是 `Sound` 子類（`SampleSound` 音檔、`SynthSound` 程式合成），武器和殭屍完全不知道有音效 |

## 事件清單

全部從 `EVENTS` 匯入。命令和通知不同：命令可能被 Session 拒絕，收到 `*_REQUESTED` 不代表已成功。

| 常數 | 字串 | Payload／方向 |
|---|---|---|
| `START_REQUESTED` | `game.start-requested` | 無；輸入 → Session（僅 Lobby） |
| `FIRE_REQUESTED` | `player.fire-requested` | `{ownerId}`；輸入 → Session |
| `RELOAD_REQUESTED` | `player.reload-requested` | `{ownerId}`；輸入 → Session |
| `SWITCH_REQUESTED` | `player.switch-requested` | `{ownerId,index}`；輸入 → Session |
| `SECONDARY_REQUESTED` | `player.secondary-requested` | `{ownerId}`；滑鼠右鍵 → Session，呼叫手上物品的 `secondary(ctx)`（繃帶：治療前方隊友） |
| `PURCHASE_REQUESTED` | `shop.purchase-requested` | `{ownerId,itemId}`；輸入 → Session |
| `DAMAGE_REQUESTED` | `entity.damage-requested` | `DamageInfo`；攻擊策略 → Session |
| `ENTITY_DAMAGED` | `entity.damaged` | `{entity,info,amount,health}`；Damageable 通知，amount 為實際扣血 |
| `ENTITY_DIED` | `entity.died` | 同上；Damageable 通知，單一生命只發一次 |
| `ENTITY_HEALED` | `entity.healed` | `{entity,sourceId,amount,health}`；`Damageable.heal` 通知，amount 為實際補的血 |
| `AMMO_REFILLED` | `ammo.refilled` | `{ownerId,crateId}`；彈藥箱補滿時通知 |
| `ITEM_THROWN` | `item.thrown` | `{ownerId,itemId,effect}`；`ThrowFire` 通知 |
| `EXPLODED` | `effect.exploded` | `{kind,x,y,z,radius,ownerId}`；手榴彈爆炸通知，`EffectViews` 畫閃光 |
| `ENEMY_SPAWNED` | `enemy.spawned` | `{enemy,wave}`；Session 通知 |
| `WEAPON_FIRED` | `weapon.fired` | `{ownerId,weaponId,hit}`；Weapon 通知，miss 時 hit 為 null |
| `WEAPON_RELOADED` | `weapon.reloaded` | `{ownerId,weaponId}`；Weapon 換彈完成通知 |
| `WEAPON_CHANGED` | `weapon.changed` | `{ownerId,weaponId}`；WeaponHolder 通知 |
| `WALLET_CHANGED` | `wallet.changed` | `{ownerId,balance,delta}`；Wallet 通知 |
| `ITEM_PURCHASED` | `shop.purchased` | `{ownerId,itemId,cost}`；Economy 成功通知 |
| `STATE_CHANGED` | `game.state-changed` | `{state,wave}`；Session 通知，state 是 lobby／playing／wave-break／game-over |
| `WAVE_STARTED` | `wave.started` | `{wave,count}`；Session 通知，count 是整波預計總數（含尚未出生者），在第一隻出生前發送 |
| `WAVE_CLEARED` | `wave.cleared` | `{wave,kills}`；Session 通知，kills 為本局累計 |
| `GAME_OVER` | `game.over` | `{wave,kills}`；Session 通知 |
| `PROMPT_CHANGED` | `hud.prompt-changed` | `{id,text,progress}`；任何模組 → HUD，在畫面下方顯示一行提示。`progress` 是 0–1（省略就不畫進度線）；`text` 給 `null` 表示收掉這個 `id` 的提示 |
| `ANNOUNCED` | `hud.announced` | `{text}`；任何模組 → HUD，在畫面中上顯示一張字卡，約 2 秒後淡出 |

Payload 中的 entity 是同步事件借用的實體參照，不是網路快照。長期保存請複製所需數值與當時 id；物件池會重用該物件。訂閱 `on()` 回傳的取消函式由訂閱者在 dispose 時呼叫。

## G3 波次資料與群體分離

| 波次 | Walker | Runner | Tank | Exploder | 出怪間隔（秒） | 同時存活上限 | 清波休息（秒） |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 0 | 0 | 0 | 1.2 | 3 | 6 |
| 2 | 4 | 2 | 0 | 0 | 1 | 4 | 7 |
| 3 | 5 | 2 | 1 | 1 | 0.9 | 6 | 8 |
| 4 | 6 | 3 | 1 | 2 | 0.75 | 8 | 9 |
| 5 | 8 | 4 | 2 | 2 | 0.65 | 10 | 10 |

第 `5 + k` 波（k ≥ 1）依資料中的 `overflow.addPerWave` 計算：walker = `8 + 2k`、runner = `4 + k`、tank = `2`、exploder = `2 + k`；間隔、上限及休息時間維持第五波數值。增加的是整波待出怪量，在場上限仍為 10，驗證器允許的最大上限為 40。

每波第一隻立即可出生，其後從最近一次成功出生起等待完整間隔。種類依 walker → runner → tank → exploder 輪流選尚有配額的類型，空配額略過。到上限後暫停出怪；等待期間不累積補發額度，空位出現最多先出一隻，再等完整間隔。出生點沿用關卡圓形區域與碰撞／邊界檢查，32 次嘗試都失敗時這次不出怪、不消耗配額，0.25 秒後（`SPAWN_RETRY_SECONDS`）再試，不會從遊戲迴圈拋錯；完全沒有出生區域仍會在 `start()` 拋錯。

Session.beginWave 只啟動 director、讀取該波 breakSeconds 並要求當下已到期的怪；Playing 每幀模擬、分離，再呼叫 director.update 與 nextSpawn。只有 `director.remaining === 0` 且場上陣列已空，才算過波，出怪間隔中的空場不會提早清波。舊 ExampleWaveDirector 的 update 不等待，因此原有測試與一次出完的範例仍成立。

CrowdSeparation 對存活、啟用且高度相交的敵人做兩輪 O(n²) 配對修正，重疊距離按兩者半徑總和計算；中心相同時固定沿 X 軸分開。推力先對半分配，一方受牆限制時由另一方補足可移動的距離。每次位移透過 CollisionWorld.move（含薄牆分段和邊界夾限），再以 hit 驗證終點。狹小空間可能仍有重疊，不會為了完全分開而穿牆。每幀重用碰撞結果，不配置陣列、向量或新物件；最後同步 hitVolume 與 mesh。此任務只實作設計文件 6.1 第 1 點，沒有包抄、分流或其他 AI 擴充。

資料錯誤會在 WaveTable 建構時拋出帶欄位路徑的錯誤，例如 `waves[0].counts.runner`。四種數量必須完整、為非負安全整數且總數大於零；未知種類會被拒絕，間隔必須為正有限數、上限為 1～40 整數、休息為非負有限數，overflow 也必須完整指定四種增量。後續波次溢出安全整數範圍亦會明確拒絕。

## 開局裝備和地上的槍（G11）

- 玩家用 `LoadoutHolder`（`WeaponHolder` 子類），固定七格，順序也是數字鍵：1 `primary`（槍）、2 `sidearm`（手槍）、3 `melee`（球棒）、4 `special`（撿到的近戰）、5 `throwable`、6 `healing`、7 `booster`。`cycle(step)` 是滾輪：往前或往後跳到下一個有東西的格子，會繞回來；`CYCLE_REQUESTED` 由 Session 檢查後呼叫。右側的 `InventoryWidget` 從 `PlayerStatus.slots`／`selected` 畫每一格，圖示是 `hud.css` 裡依物品 id 的 mask，沒有 mask 的物品就印名字。武器用 `slot` getter 說自己放哪一格，`Weapon` 預設是 `primary`，所以 `Rifle`、`Shotgun` 不用改。
- 開局只有 `StarterPistol`（繼承 `Pistol`，備彈 `Infinity`，彈匣打完還是要換彈）和 `Bat`，手上拿手槍。這兩格永遠不會丟。
- `MeleeWeapon` 是近戰基底：`usesAmmo` 為 false，`fire` 不扣子彈、`reload` 不做事，冷卻照舊。`Bat`：傷害 45、距離 2.2 m（算到敵人身體邊緣）、前方 90 度、冷卻 0.6 秒。命中用 `MeleeSwing` Strategy：最近、在前方扇形內、沒被牆擋的活敵人，送 `kind: 'melee'` 的 `DAMAGE_REQUESTED`，打的是身體，不算爆頭。
- 地上的槍是關卡 `type: "weapon"` marker。位置固定；`item` 寫了就放那一把，**不寫就每局用 `ctx.rng` 從 `WeaponCatalog` 隨機抽一把**（`installGameplay` 註冊 `rifle`、`shotgun`、`smg`、`revolver`，機率相同）。**規則：所有撿得到的武器（槍和撿來的近戰）都要在這份名單裡**，新武器在 `WeaponCatalog` 註冊就會自動加入。開局就有、不會丟的手槍和球棒不在名單裡。**投擲物和治療物不放進這份名單**：之後各有自己的清單和 marker 種類（`throwable`、`healing`），三種分開抽。**每個場景（每個關卡檔）至少 8 個 `weapon`、4 個 `healing`、4 個 `throwable`、2 個 `melee` marker 和 3 個 `ammo` 彈藥箱**，`test/LevelPickupSpots.test.js` 會檢查；`healing`、`throwable` 的點從各自的 pool 抽（見下一節）。`PickupField.fromLevel` 每個 marker 建一個 `WeaponPickup`，裡面放的是真的 Weapon 物件。
- E 送 `PICKUP_REQUESTED`；Session 在玩家能移動時（Playing、WaveBreak）呼叫 `PickupField.take`：撿最近、搆得到的那把，用 `LoadoutHolder.equip` 放進主武器格並拿在手上，原本那把留在同一個位置，子彈數不變。撿到同款的槍也是交換，**不會補子彈**。成功發 `WEAPON_PICKED_UP`。
- 畫面：`WeaponPickupViews` 為每個 pickup 畫一個躺在地上、大小照槍的方塊，外面加一圈會脈動的亮色邊框（inverted hull：稍大的方塊只畫背面，不吃霧），不加燈。HUD 的提示從 `PlayerStatus.pickup` 來（`E  PICK UP RIFLE` 或 `E  SWAP FOR RIFLE`）；撿到時不跳字卡。拿球棒時 `PlayerStatus.armed` 為 false，彈藥欄不顯示。
- E 目前同時送 `PURCHASE_REQUESTED`，站的位置不對的那個會被 Session 拒絕。

## 治療物、投擲物、跳躍、後座力（G16、G20）

- `CarriedItem`（`Weapon` 子類，抽象）：一小疊物品，`count`／`maxCount`，不用子彈。用完 `depleted`，`LoadoutHolder.update` 把它拿出格子，手上的換到下一格。撿到同一種就疊（`canAbsorb`／`absorb`），放不下的留在地上；滿了就不能撿（`refuses`）；別種就整疊交換。槍不疊，同款也是交換。
- `Bandage`（第 6 格 `healing`，最多 2）：左鍵治療自己、右鍵（`SECONDARY_REQUESTED`）治療前方 2.5 m、70 度內的隊友；3 秒後補 40，這時才扣一個。滿血不能用；換武器（`holster`）、自己或對方死掉都會取消，不扣。`progress(time)` 給 HUD：`PlayerStatus.action` 是「自我治療」「正在治療 ○○」「○○ 正在治療你」，`PromptWidget` 在下方畫字和進度線。
- `Throwable`（第 5 格 `throwable`，最多 2，抽象）用 `ThrowFire` Strategy 丟出：從眼睛沿準心方向，速度 13 m/s 加上 3 m/s 往上，丟出去的東西放進 `ctx.effects`。`Grenade` → `ThrownGrenade`：撞牆、落地會彈，3 秒後爆，半徑 5 m，中心 150、邊緣 30，牆後的擋住。`Molotov` → `ThrownMolotov`：碰到牆或地就破，留下 `FireArea`：半徑 3 m、6 秒、每 0.5 秒 12.5（每秒 25）。傷害都只送 `DAMAGE_REQUESTED`（`kind` 是 `explosion`／`fire`），Session 規則不變，所以不會傷到玩家。
- `ctx.effects`：`Effect` 子類，`update(dt, ctx)` 回傳 false 就被 `GameSession.updateEffects` 移除（Playing 和 WaveBreak 都跑）。畫面是 `EffectViews`，依 `kind` 註冊做 mesh 的函式，App 每幀呼叫 `update(dt)`。
- 地上的點：`WeaponCatalog.register(id, { pool })`，pool 就是 marker 種類。`healing` 抽 `bandage`，`throwable` 從 `grenade`、`molotov` 等機率抽；新的治療物、投擲物註冊到對的 pool 就會出現。
- 傷害自己和隊友：`AreaDamage.damageInRadius` 對範圍內的敵人和玩家（包括丟的人）都送傷害，`DamageInfo.friendlyFire` 為 true。Session 只讓這種傷害從玩家打到玩家，子彈和近戰還是打不到隊友。

## 撿來的近戰和彈藥箱（G18、G19、G13）

- `Katana`（`MeleeWeapon` 子類，第 4 格 `special`）：用 `MeleeSweep` Strategy（`MeleeSwing` 子類），範圍內、前方 150 度、沒被牆擋的殭屍**全部**砍到，各 70，間隔 0.5 秒，距離 2.6 m。
- `Chainsaw`（第 4 格）：`automatic`，按住每 0.1 秒對前方 60 度、3 m 內最近的殭屍打 20（每秒 200）。每次砍扣電，電量 100 約 30 秒用完，沒電 `fire` 回傳 false。換電就是撿另一把鏈鋸（交換）。`Weapon.charge` 讓道具欄顯示剩餘百分比。
- 兩者註冊在 `pool: ['weapon', 'melee']`：一般武器點也可能抽到，`melee` 點只抽這兩把。球棒（第 3 格）不會丟。
- 彈藥箱：關卡 `type: "ammo"` marker → `AmmoCrateField` 裡的 `AmmoCrate`。按 E 把身上所有槍的彈匣和備彈補滿，之後這個箱子休息 60 秒（大家共用）。槍都滿的時候不會用掉。提示：`E  REFILL AMMO`、`AMMO  READY IN 42s`、`AMMO  FULL`。發 `AMMO_REFILLED`。畫面是 `AmmoCrateViews`：橄欖色箱子加綠色脈動邊框，休息時變暗。
- E 現在交給 `InteractionList`（Composite）：`[PickupField, AmmoCrateField]`，誰在這裡有東西誰回應。兩者都實作 `take(player, ctx)` 和 `offerFor(player, out, time)`；offer 帶 `verb`（PICK UP／SWAP FOR／REFILL）和 `note`（FULL、READY IN …），`PromptWidget` 只照著拼字。

- 跳躍：空白鍵，`PlayerController` 裡組合一個 `JumpMotion`（起跳 4.6 m/s、重力 13，約 0.8 m 高、0.7 秒）。只抬高眼睛，碰撞還是照地面算，所以跳不過矮牆和沙包。
- 後座力：`RecoilKick` 聽自己的 `WEAPON_FIRED`，依武器 id 查表把視角往上（和隨機往旁邊）踢，60% 在約 0.25 秒內回來，連射會一路往上飄。數值在 `installGameplay`：手槍 1.6°、步槍 0.9°、衝鋒槍 0.6°、霰彈槍 4.5°、左輪 4°。沒登記的（球棒、投擲物）不踢。

## 音效（G10）

- 只有 `play=1` 才裝：`installGameplay` 呼叫 `audio/installAudio.js`，它回傳的物件放進 `gameViews` 每幀 `update`。瀏覽器規定要先點一下或按鍵才會出聲，`WebAudioOutput.unlock()` 在第一次 `pointerdown`／`keydown` 才建立 AudioContext。
- 分兩層：`SoundBoard`（純邏輯，有測試）決定播什麼、多大聲、左右聲道；`WebAudioOutput`（瀏覽器）決定聽起來怎樣。`SoundBoard` 用 `SpatialMix` 把世界座標換成左右 pan 和距離音量（30 m 外聽不到），`cooldown` 防止同一個音效疊太多次，`hold`／`loop` 管電鋸這種持續的聲音。
- 規則都是 `SoundRule` 子類，只聽事件：`WeaponSounds`（自己的 `WEAPON_FIRED`、`WEAPON_CHANGED`、`WEAPON_RELOADED`，用 `register(武器 id, { fire, hit, held, working })` 查表）、`HitSounds`（自己子彈的命中、爆頭、擊殺）、`PlayerSounds`（受傷、治療、丟東西）、`PickupSounds`（`register(武器 id, 音效)`：槍是金屬卡榫聲、刀和電鋸是拿起重物的聲音，沒登記的補給品是塞進包包的沙沙聲；彈藥箱是壓子彈的喀喀聲。不用叮咚提示音）、`ZombieSounds`（`register(敵人類別, { spawn, groan, death })`，沒登記的用 `Enemy` 的；隨機一隻每 1.5～3.5 秒叫一聲）、`WorldSounds`（爆炸、波次開始、清完、結束）。
- 音檔在 `web/assets/sfx/`：刀、電鋸、爆炸、殭屍從舊專案複製（CC0）；五把槍的槍聲（`gun/`）來自 gunsoundeffect.com。來源都在 `CREDITS.md`。`manifest.json` 是「音效名稱 → 檔名（陣列就隨機挑）」。沒有音檔的（換彈、受傷等）用 `SynthSounds.js` 的合成配方，音檔載入前或載入失敗也會先用合成的。
- 新增武器的聲音：`installAudio` 裡 `WeaponSounds` 加一行 `register`；有音檔就放進 `sfx/`、寫進 `manifest.json`，沒有就在 `SynthSounds.js` 加一個配方。
- 還沒有：開始換彈的聲音（沒有這個事件，見 B13，現在只有換完的「喀」）；隊友的聲音（等 G8）。

## 新增武器

1. 從 `weapons/Weapon.js`、`weapons/Pistol.js`、`test/Weapon.test.js` 開始，新增自己的檔案與具名 export，不更動 Pistol 範例來冒充新武器。
2. 繼承 Weapon，constructor 呼叫 super，提供唯一 `id`、`magazine`、`reserve`、`reloadSeconds`、`cooldownSeconds`、`fireMode`。子彈數是非負整數、彈匣與時間必須為正值。
3. 覆寫 `createShot(ctx)`，回傳 `{damage,range}`。固定規格可在模組層 Object.freeze 一次；不要每幀建物件。沿用 HitscanFire，或自行寫 `fire(shot,ctx,ownerId)` Strategy。
4. 命中時只發 DAMAGE_REQUESTED，不直接讀 Walker 類別、加錢或扣血。視覺／音效用 onFired 或訂閱 WEAPON_FIRED，別把 Three.js 引進純邏輯基底。
5. 在共用組合入口 `game/installGameplay.js` 匯入新類別，呼叫 `player.weapons.add(new 你的類別())`。WeaponHolder 已支援數字鍵切換，不需改 Enemy 或 Economy。
6. 自己補假時鐘測試（射速、空彈、換彈、切槍），用 Conventional Commit 提交，一把武器一組 commit。

### G23 衝鋒槍和左輪

- `SubmachineGun`（id `smg`）：傷害 13、40 發彈匣／240 備彈、0.06 秒冷卻（約每分鐘 1000 發）、1.6 秒換彈、散布 0.02、射程 45 m，按住連射。
- `Revolver`：傷害 90（打身體一發倒 walker）、6 發／36 備彈、0.75 秒冷卻、2.4 秒換彈、射程 70 m，一次點一發。
- 兩把都放主武器格，只能在地上撿到。

### G1 武器與散布

- `Rifle`：傷害 24、30 發彈匣／210 備彈、0.095 秒冷卻、1.7 秒換彈、單顆彈丸散布 0.006，可按住連射。
- `Shotgun`：每顆傷害 15、每發 9 顆彈丸、6 發彈匣／36 備彈、0.85 秒冷卻、2.1 秒換彈、散布 0.065。每次點擊只消耗一發，完成全部彈丸後只發一次 WEAPON_FIRED。
- 上述數值取自舊 prototype 的 player/player.js；射程沿用現有武器契約的 60 公尺，不引用 reference/ 模組，也不移植後座力、熱量或移動散布加成。
- `SpreadFire` 以均勻圓盤取樣偏移，轉換到瞄準方向的正交平面後正規化，各彈丸委派既有 `HitscanFire`，因此沿用最近命中、牆壁遮擋、爆頭與 Session 傷害流程。回傳第一顆命中摘要，全部未命中則回傳 null，不修改共用 ctx.aim。
- 亂數可用 `new SpreadFire({rng})` 注入，否則採用 `ctx.rng`；測試不依賴 Math.random。`WeaponTrigger` 僅送輸入命令，Session 仍決定是否允許開火，Weapon 仍管理彈藥與模擬時鐘 deadline。

## 新增敵人類型

已註冊 `walker`、`runner`、`tank`、`exploder`。Runner：40 HP、速度 3.4、近戰 10；Tank：240 HP、速度 0.8、近戰 30；兩者沿用每秒一次近戰。Exploder：50 HP、速度 1.8，接觸玩家且視線無遮擋時立即自爆；半徑 3 公尺（含玩家身體半徑）內、無牆壁遮擋的存活玩家各受 40 爆炸傷害，再向自己送出致死傷害，全部走 `DAMAGE_REQUESTED` → Session → DamagePipeline。自爆不給擊殺獎金，每次池重生只可自爆一次；被射殺不引爆。數值是此版灰盒平衡，不實作參考文件的敵人屬性成長；預設混合出怪使用上方 G3 波次資料。

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

## 新增 HUD 元件

1. 從 `ui/hud/HudWidget.js`、`ui/hud/HealthWidget.js`、`test/HudSurvivalHud.test.js` 開始，在 `ui/hud/` 新增自己的 `HudWidget` 子類，一個元件一個檔案。
2. constructor 呼叫 `super(doc, '名字')`，用 `this.part()` 建立節點。CSS class 會是 `hud-名字`，樣式加在 `web/css/hud.css` 自己的一段。
3. 「某一刻發生的事」（開槍、被打、波次開始）在 `bind(events, playerId)` 用 `this.listen()` 訂閱 `game/events.js` 的事件；「現在是多少」從 `sync(status)` 的 `PlayerStatus` 拿，數字有變才寫 DOM。需要新的數字就加在 `PlayerStatus`，不要在元件裡讀 Session 或實體。
4. 平常要淡下去的元件用 `this.attention.poke()`（有變化）和 `this.attention.pin(條件)`（有狀況時不淡）；短暫的 class 用 `this.flash(class, 秒數)`。判斷和計時寫成 `ui/hud/logic/` 裡不碰 DOM 的類別，並加測試。
5. 在 `SurvivalHud.standard()` 加一行 `.add(new 你的類別(doc))`。其他模組要顯示提示或字卡，不用匯入 HUD，發 `PROMPT_CHANGED`、`ANNOUNCED` 事件就好。
6. 顏色只用 `hud.css` 最上面那四個，不加方框和面板；動畫只動 `transform` 和 `opacity`，並在 `prefers-reduced-motion` 那一段關掉。

## 效能與生命週期

- Enemy 是一隻一個 mesh、沒有新增動態燈／投影，沿用原有霧、遠平面與後製。灰盒使用既有 palette 顏色，不更動美術。
- 每個 Enemy 重用 position、hitVolume、路徑 Float64Array、移動結果及攻擊 ray；`CollisionWorld.move(..., result)` 支援 caller-owned 結果，PlayerController 也重用結果。
- `PathFinder.createRoute()` 在建立 pooled enemy 時配置 buffer，`findPathInto(...,route)` 在預配置 BFS queue／from 上運作，與展示用 `findPath()` 分開。BFS 不切障礙對角，針對固定 collider 網格；動態碰撞更新尚未支援。
- 玩法專用 finder 多留 0.002 m clearance，避免貼牆格點的浮點誤差讓敵人卡住；不改展示模式的網格結果。遠距路徑每 1.5 秒、近距每 0.75 秒才重算，移動仍按每幀 dt 更新。
- 這不是最終大量殭屍方案：24／40／64 隻、品質分級、自動降解析度、Worker flow field 還是 PERFORMANCE_PLAN 的後續工作，不在這次擴寫。
- DamageInfo、事件摘要、換波出怪等只在離散事件配置；不要新增每幀的 map/filter、new Vector3 或尋路陣列。HUD 每幀只比對數字，有變才寫 DOM，不重建節點。
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

G3 驗收：126 個 node:test 全過，包含每波數量／種類／間隔／上限、延伸波次、資料錯誤、Session 空場等待／逐波休息，以及重疊敵人分離、薄牆與命中盒同步。修改前後 ch2 共 8 組 shot PNG 的 SHA-256 全部相同（無 play=1）。以 npm run serve 啟動後，瀏覽器在 `?level=ch2&play=1&debug=1` 停止一般 rAF，再使用 start／advance／snapshot：模擬時間 0.05／1.24／1.25／2.45 秒，場上為 1／1／2／3 隻；再前進 10 秒仍為 3 隻、remaining 為 1，符合第一波 1.2 秒間隔與 3 隻上限。PNG 放 OS temp，不加入版本控制；驗收後關閉 server。
