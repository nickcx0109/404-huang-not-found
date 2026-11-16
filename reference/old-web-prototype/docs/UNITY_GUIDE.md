# Unity 正式版製作手冊

給接手實作的 coding agent（GPT / Codex）以及組員看的手冊。目標是把瀏覽器原型 `prototype-web/` 的玩法完整搬進 Unity 6，做成三人區網合作、看起來像樣、玩起來有手感的殭屍波次射擊遊戲。

> **給 agent：** 這份手冊很長，不要一次全部實作。照第 10 節的里程碑一次做一個，每個里程碑達到驗收標準並 commit 之後再往下。規則衝突時，`AGENTS.md` 優先於本手冊。

---

## 目錄

0. 給 agent 的工作守則
1. 目前 demo 為什麼醜、為什麼難玩
2. 專案設定與套件
3. 程式架構
4. A 玩家與武器
5. B 敵人與波次
6. C 網路、流程與 UI
7. 美術、燈光與音效
8. 手感清單（game feel）
9. 新功能（網頁版還沒有的）
10. 里程碑與驗收
11. Netcode 常見錯誤
12. 期末報告用的設計模式對照
13. 附錄：數值總表

---

## 0. 給 agent 的工作守則

1. **先讀原型再寫。** 每個功能都先打開 `prototype-web/` 對應檔案，照著它的行為與數值做。原型已經調過手感，數值不要自己亂改。對照表：

   | 原型檔案 | Unity 對應 |
   |---|---|
   | `player/player.js` | `Assets/Scripts/Player/` |
   | `enemy/enemy.js`、`enemy/flow-field.js` | `Assets/Scripts/Enemy/` |
   | `core/game.js`、`core/shop.js`、`core/input.js` | `Assets/Scripts/Core/` |
   | `ui/hud.js`、`ui/store-guide.js`、`ui/styles.css` | `Assets/Scripts/UI/` |
   | `shared/shared.js` | `Assets/Scripts/Shared/` |
   | `core/world.js` | 場景 `Assets/Scenes/Town.unity` + Prefabs |
   | `core/audio.js`、`core/effects.js` | `Assets/Audio/`、`Assets/VFX/` + C 模組的 `AudioManager` |

2. **只改使用者負責的模組**（見 `AGENTS.md`）。要動 `Shared/` 或別人的資料夾時，先停下來列出要改什麼、為什麼，等使用者同意。
3. **小步 commit。** 一個 commit 一件事，英文 Conventional Commits，例如 `feat(enemy): add runner scream telegraph`。不要一次塞一整個里程碑。
4. **數值放 ScriptableObject。** 程式裡不要出現 `34f`、`0.16f` 這種武器或敵人數值。
5. **Host 權威。** 會影響結果的事（命中判定、扣血、發錢、生成殭屍、抽獎結果）只在 Host 算。客戶端只送輸入／請求、只負責顯示。
6. **每一步都要能跑。** 每完成一項就進 Play Mode 實測。網路功能要用兩個實例（Multiplayer Play Mode 或 build 一份 exe）測過 Host 與 Client 兩邊。
7. **回報要誠實。** 沒測過就說沒測過；有 Console 錯誤或警告要列出來，不要說「應該可以」。
8. **不要改** `ProjectSettings/`、`Packages/manifest.json`，除非使用者明確同意。需要新套件時，列出套件名稱與版本，請使用者確認後再加。

---

## 1. 目前 demo 為什麼醜、為什麼難玩

多數「Unity 初版很醜」的原因都一樣，依影響大小排序：

| 問題 | 症狀 | 修法（細節見第 7、8 節） |
|---|---|---|
| 用 Built-in 管線或 URP 預設設定 | 顏色灰、沒有對比、像 2010 年 | 用 URP，加 Global Volume：ACES Tonemapping、Bloom、Color Adjustments、Vignette |
| 預設天空盒＋白天陽光 | 整片亮藍天，沒有氣氛 | 改夜晚：深藍天色、低強度月光、霧、橘色路燈點光源 |
| 預設灰白材質的方塊 | 看不出是什麼東西 | 用免費低多邊形素材包（Kenney、Quaternius），或至少每類物件給固定配色 |
| 殭屍是膠囊或方塊、沒有動畫 | 看不出在走、在攻擊 | 用 Mixamo 角色與動畫，或照原型的方塊人並程序化擺動手腳 |
| 沒有手持槍模型、沒有槍口火光 | 開槍沒感覺 | 第一人稱 view model、火光、彈道線、後座力、鏡頭晃動 |
| 沒有音效 | 完全沒回饋 | 槍聲、命中、爆頭、殭屍呻吟、預告音，全部要有 |
| 命中沒回饋 | 不知道有沒有打到 | 準心命中標記、爆頭不同音效與顏色、殭屍閃白、血花 |
| 殭屍直線走、卡牆 | 很蠢 | NavMesh + NavMeshAgent，加分離力避免疊在一起 |
| UI 用預設字型、隨便擺 | 很業餘 | TextMeshPro + Noto Sans TC，照原型 HUD 的位置與配色 |
| 滑鼠靈敏度、FOV、移動加速度不對 | 操作卡卡、暈 | 照第 4 節的數值，FOV 75（可調），移動有加速度 |

**修法順序：** 先修手感（第 4、8 節），再修燈光後處理（第 7 節，CP 值最高），最後換素材。

---

## 2. 專案設定與套件

### 2.1 版本

- Unity 6 LTS（6000.0.x），範本 **Universal 3D (URP)**。
- 專案根目錄就是 repo 根目錄：`Assets/`、`Packages/`、`ProjectSettings/` 與 `prototype-web/`、`docs/` 並列。

### 2.2 套件（加之前先問使用者）

| 套件 | 用途 |
|---|---|
| `com.unity.netcode.gameobjects`（2.x） | 網路 |
| `com.unity.transport` | NGO 的傳輸層（NGO 會自動帶） |
| `com.unity.multiplayer.playmode` | 編輯器內開多個玩家實例測試 |
| `com.unity.inputsystem` | 新輸入系統 |
| `com.unity.ai.navigation` | NavMeshSurface |
| `com.unity.textmeshpro`（Unity 6 已內建在 uGUI） | 文字 |
| `com.unity.probuilder` | 直接在場景搭建築、牆、櫃台 |
| `com.unity.cinemachine` | 不需要，第一人稱直接控制 Camera 即可 |

### 2.3 資料夾

```
Assets/
  Scripts/
    Shared/   ZombieCoop.Shared   (介面、事件、資料定義、NetworkObjectPool)
    Player/   ZombieCoop.Player
    Enemy/    ZombieCoop.Enemy
    Core/     ZombieCoop.Core
    UI/       ZombieCoop.UI
  Data/       ScriptableObject 資產 (Weapons/, Enemies/, Waves/, Upgrades/, Shop/)
  Prefabs/    Player/, Enemies/, Weapons/, Pickups/, Environment/, UI/
  Scenes/     Boot.unity, Lobby.unity, Town.unity
  Art/        Models/, Materials/, Textures/, Animations/
  Audio/      SFX/, Music/
  VFX/
  Settings/   URP Asset、Volume Profile
```

每個 `Scripts/<模組>/` 放一個 Assembly Definition（`ZombieCoop.Player.asmdef` 等）。Player、Enemy、Core、UI 都只引用 `ZombieCoop.Shared`，**彼此不互相引用**。這樣違反「模組只透過 Shared 溝通」時會直接編譯失敗，是最好的防呆。

### 2.4 必要的專案設定（請使用者在編輯器操作，或經同意後修改）

- Player Settings → Active Input Handling：Input System Package (New)。
- Physics Layers：`Player`、`Enemy`、`EnemyHitbox`、`Environment`、`Pickup`、`Interactable`。Collision Matrix 讓 `Enemy` 之間不碰撞（分離靠程式），`EnemyHitbox` 只給射線用。
- Quality：URP Asset 開 MSAA 4x、HDR、Soft Shadows。
- Time：Fixed Timestep 0.02。NetworkManager Tick Rate 30。

---

## 3. 程式架構

### 3.1 Shared 介面（三人同意後先建好，之後少改）

```csharp
namespace ZombieCoop.Shared
{
    public interface IDamageable
    {
        // 只在 Server 呼叫，回傳是否致死
        bool TakeDamage(in DamageInfo info);
        bool IsAlive { get; }
    }

    public struct DamageInfo
    {
        public float Amount;
        public DamageSource Source;   // Bullet, Explosion, Burn, Shock, Melee, Self
        public bool IsHeadshot;
        public ulong AttackerClientId; // 敵人造成的傷害用 ulong.MaxValue
        public Vector3 HitPoint;
        public Vector3 Direction;
        public float Knockback;
    }

    public interface IPlayerTarget       // 給敵人 AI 找目標用，Player 模組實作
    {
        ulong ClientId { get; }
        Vector3 Position { get; }
        bool IsDowned { get; }
        void ServerHurt(float amount, Vector3 knockDir, float knockForce);
    }

    public interface IInteractable       // 交易櫃台、抽獎機、救援、門
    {
        string GetPrompt(ulong clientId, out bool enabled);
        float Radius { get; }
        void ServerInteract(ulong clientId);
    }

    public interface IPlayerWallet       // C 模組實作，A/B 只透過介面加錢
    {
        int GetMoney(ulong clientId);
        void ServerAddMoney(ulong clientId, int amount, string reason);
        bool ServerTrySpend(ulong clientId, int amount);
    }
}
```

查找實作的方式：一個 `ServiceLocator`（`Shared/Services.cs`，靜態欄位 `Services.Wallet`、`Services.Players`），由各模組在 `Awake` 註冊。這樣 B 不需要知道 C 的具體類別。

### 3.2 EventBus

原型的事件全部保留，名稱一樣。Unity 版用靜態 C# event，payload 用 struct：

```csharp
public static class GameEvents
{
    public static event Action<WaveStartedEvent> WaveStarted;
    public static void RaiseWaveStarted(WaveStartedEvent e) => WaveStarted?.Invoke(e);
    // WaveCleared, EnemyHit, EnemyKilled, PlayerDamaged, PlayerDowned, PlayerRevived,
    // WeaponFired, Reloaded, UpgradePicked, WeaponUnlocked, TokenCollected,
    // ItemPurchased, GachaRolled, GameOver
}
```

**重要：** EventBus 是「單機內」的事件。Server 上觸發的事件只在 Server 上有人聽。需要客戶端知道的事（例如某玩家拿到升級），要另外用 ClientRpc 或 NetworkVariable 同步，客戶端收到後再在本機 Raise 一次給 UI。建議規則：

- 遊戲邏輯監聽者（Economy、ScoreKeeper、Upgrade 效果、TokenDropper）只在 Server 註冊。
- 表現監聽者（HUD、音效、特效）在每台機器註冊，資料來源是 ClientRpc。

### 3.3 ScriptableObject 資料

| SO 類別 | 欄位 | 由誰建 |
|---|---|---|
| `WeaponData` | id、名稱、damage、fireInterval、magSize、reserve（-1 = 無限）、reloadTime、auto、pellets、spread、heatPerShot、recoil、knockback、ammoUnitCost、viewModel prefab、音效 | A |
| `EnemyData` | id、hp、speed、radius、scale、score、cash、tokenDropChance、prefab、攻擊參數 | B |
| `WaveConfig` | 波次類型規則、數量公式係數、maxAlive、spawnInterval、hpScalePerWave | B |
| `UpgradeData` | id、名稱、流派、稀有度、描述、icon、效果類別（用 `SerializeReference` 或字串對應工廠） | B |
| `ShopItemData` | id、名稱、描述、價格、類型 | C |
| `EconomyConfig` | 起始金錢 250、起始抽獎幣 1、清波獎金 100+30n、抽獎幣價格 400(+100/次)、休息時間 45 秒 | C |

### 3.4 Server 與 Client 的分工

```
Client（每個玩家自己）               Host / Server
───────────────────────              ─────────────────────────
讀輸入、移動自己的角色 ──────────▶   位置用 ClientNetworkTransform 同步
按下開火：本機立刻播火光、音效、彈道   ◀── 收到 FireServerRpc(origin, dir, seed)
         送 FireServerRpc                  驗證彈藥與射速 → Raycast → 扣血
                                          → HitConfirmClientRpc(打中誰、是否爆頭、是否擊殺)
收到 HitConfirm → 命中標記、爆頭音效
                                          殭屍 AI、波次、經濟、抽獎都在這裡
看到殭屍：NetworkTransform 插值 ◀──────  殭屍位置、動畫狀態（NetworkAnimator 或 NetworkVariable）
```

玩家移動用 owner 權威（`ClientNetworkTransform`），這是課程專題最合理的選擇：手感好、程式簡單。區網延遲很低，作弊不是考量。

---

## 4. A 玩家與武器（`Assets/Scripts/Player/`）

### 4.1 類別

| 類別 | 說明 | 原型對應 |
|---|---|---|
| `PlayerController : NetworkBehaviour` | 移動、跳躍、視角，只有 owner 執行 | `Player.update` |
| `PlayerHealth : NetworkBehaviour, IPlayerTarget` | hp、armor、倒地、救援，NetworkVariable | `Player.hurt` |
| `PlayerWeapons : NetworkBehaviour` | 持有的武器、切換、開火請求 | `Player.weapons` |
| `Weapon`（抽象，Template Method） | `TryFire` 流程固定，`IFireMode` 決定怎麼打 | `Weapon` |
| `IFireMode` / `HitscanFire` / `PelletFire` | 射擊策略 | `HitscanFire` |
| `DamageChain` + `IDamageModifier` | 責任鏈，依 priority 排序 | `DamageChain` |
| `ViewModelAnimator` | 槍的晃動、後座、換彈、切槍動作，純表現 | `Player.update` 下半段 |
| `PlayerInputReader` | 包 Input System，提供 `Move`、`Look`、`FirePressed`、`FireHeld`… | `core/input.js` |

### 4.2 移動（照原型）

- `CharacterController`，半徑 0.4，高 1.8，眼睛高度 1.6。
- 走路 5.0 m/s，衝刺（Shift 且往前）7.6 m/s，腎上腺素升級 ×1.3。
- 加速度用指數趨近：`vel += (target - vel) * (1 - exp(-k * dt))`，地面 k=14，空中 k=3。這就是原型「順」的原因，不要直接設速度。
- 跳躍初速 7.2，重力 22。
- 擊退：另一個向量 `knock`，每幀 `knock *= exp(-6 * dt)`，加在位移上。
- 滑鼠靈敏度預設 0.0022 rad/pixel（設定頁可調 0.5×～2×），pitch 限制 ±1.45 rad（約 ±83°）。
- 鏡頭晃動：步伐 bob（Y 振幅 0.04、X 0.03，依速度縮放），受傷與爆炸的 shake。`prefers-reduced-motion` 對應設定頁的「減少畫面晃動」選項。

### 4.3 武器

| | 手槍 | 步槍 | 霰彈槍 |
|---|---|---|---|
| 傷害 | 34 | 24 | 15 × 9 顆 |
| 射擊間隔 (s) | 0.16 | 0.095 | 0.85 |
| 自動 | 否 | 是 | 否 |
| 彈匣 / 備彈 | 12 / 無限 | 30 / 210 | 6 / 36 |
| 換彈 (s) | 1.1 | 1.7 | 2.1 |
| 擴散 (rad) | 0.004 | 0.006 | 0.065 |
| 每發 heat | 0.5 | 0.22 | 0 |
| 後座力 | 0.032 | 0.016 | 0.085 |
| 擊退 | 1.4 | 1.4 | 1.1 |
| 補彈單價 | — | $0.5/發 | $3/發 |
| 價格 | 起始 | $450 | $700，撐過第 3 波後永久解鎖 |

- 擴散公式：`spread * (1 + heat) * (移動中 1.7 : 1) * (空中 2.2 : 1)`，heat 上限 2.5，每秒衰減 3.2。
- 爆頭 ×2（`HeadshotRule`，priority 0）。
- 空彈匣按開火自動換彈；打完最後一發自動換彈。切槍時取消換彈，切槍硬直 0.28 秒。
- 按鍵：左鍵開火、R 換彈、1/2/3 或滾輪切槍、E 互動、Shift 衝刺、Space 跳、G 跳過休息倒數、Esc 暫停選單。

### 4.4 開火的網路流程

1. Owner 本機：檢查冷卻／彈藥 → 扣本機彈藥（預測）→ 播火光、槍聲、後座、彈道線 → `FireServerRpc(origin, direction, randomSeed)`。
2. Server：檢查射速（容許 10% 誤差）與彈藥 → 用 seed 產生同樣的擴散方向 → 對 `EnemyHitbox` 與 `Environment` 做 `Physics.Raycast`（霰彈槍 9 次）→ 跑 `DamageChain` → `IDamageable.TakeDamage`。
3. Server → `FireResultClientRpc`：給所有人看彈道線與血花；給射擊者命中標記資訊（hit / head / kill）。
4. 其他玩家看到射擊者的第三人稱槍口火光與聲音（3D 音效）。

彈藥用 NetworkVariable 同步，Server 為準；本機預測只是讓 UI 即時。

### 4.5 第一人稱表現

- 槍的 view model 掛在 Camera 底下，用獨立的 Layer `ViewModel`，以 URP Renderer Feature（Render Objects）或第二台 Overlay Camera 畫在最上層，避免槍插進牆裡。View model 的 FOV 固定 60，不跟著設定變。
- 位置偏移 (0.24, -0.22, -0.36)。開火時往後 0.07 並上抬 0.12 rad，用 `exp(-16 dt)` 回復。
- 換彈：槍往下沉、旋轉，曲線 `sin(π * progress)`。
- 槍口火光：0.05 秒的加法混合面片 + 點光源（強度 2.2、範圍 9、暖橘 #FFC070）。
- 其他玩家看到的是第三人稱模型：同一把槍掛在手上，簡單的持槍 Idle / Run 動畫即可。

### 4.6 倒地與救援（原型只預告，正式版要做）

- hp 歸零 → `IsDowned = true`，可以爬行（速度 1.0）、只能用手槍、畫面變暗變紅、30 秒流血計時。
- 隊友靠近 2 公尺按住 E 3 秒救起，起身 hp 30。救援中被打會中斷。
- 30 秒內沒被救 → 死亡，變成觀戰（Tab 切換觀看隊友），下一波開始時以 hp 50 重生。
- **全員倒地或死亡 → GameOver。** 單人時倒地直接 GameOver（和原型一樣）。
- 敵人 AI 不會以倒地玩家為目標（原型 `NearestTarget` 已經跳過 `downed`）。

---

## 5. B 敵人與波次（`Assets/Scripts/Enemy/`）

### 5.1 類別

| 類別 | 說明 | 原型對應 |
|---|---|---|
| `Enemy : NetworkBehaviour, IDamageable` | 基底，hp、受傷、死亡、表現 | `Enemy` |
| `Walker`、`Runner`、`Tank`、`Exploder` | 各自 `BuildTree()` | 同名類別 |
| `BTNode`、`Sequence`、`Selector`、`Condition`、`ActionNode`、`Cooldown` | 行為樹（Composite） | 同名類別 |
| `ITargetSelector` / `NearestTarget` | 選目標策略 | `NearestTarget` |
| `ZombieFactory` | 透過 `NetworkObjectPool` 取物件 | `ZombieFactory` |
| `WaveManager : NetworkBehaviour` | 波次組成與生成 | `WaveManager` |
| `Upgrade` 與 11 個子類別、`LootTable`、`UpgradeSet` | 局內升級 | 同名類別 |

AI、受傷、死亡全部只在 Server 跑：`Update()` 開頭 `if (!IsServer) return;`。

### 5.2 移動與尋路

- 用 `NavMeshAgent` 取代原型的 flow field。地圖上 bake 一個 NavMeshSurface。
- Agent 參數：speed 依 EnemyData、angularSpeed 480、acceleration 20、stoppingDistance = 攻擊距離 × 0.8、obstacleAvoidance Medium。
- 數量多時 `SetDestination` 不要每幀呼叫：每 0.2 秒一次（原型 flow field 也是 0.2 秒更新），各隻錯開時間。
- 距離 < 7 且有視線時直接朝玩家走（跟原型一樣），避免繞路。
- 擊退：暫時停用 agent 的 `updatePosition`，自己用 `knock` 向量位移再 `Warp`；或用 `agent.Move(knock * dt)`，比較簡單。
- 坦克受到的擊退 ÷4。

### 5.3 四種殭屍（行為、數值、預告）

| | Walker | Runner | Tank | Exploder |
|---|---|---|---|---|
| HP | 100 | 55 | 480 | 60 |
| 速度 | 2.0 | 3.0 | 1.35 | 2.2（引燃後 ×2.1） |
| 半徑 / 體型 | 0.42 / 1 | 0.38 / 0.92 | 0.72 / 1.45 | 0.5 / 1.08 |
| 分數 / 金錢 | 100 / $15 | 150 / $20 | 500 / $75 | 200 / $25 |
| 抽獎幣掉落率 | 5% | 7% | 40% | 10% |
| 攻擊 | 距離 1.6 揮擊 12，冷卻 1.1 | 1.5 揮擊 9，冷卻 0.8；4.5～13 公尺有視線時衝刺，冷卻 4.5 | 2.5 內重擊 30，範圍 2.8，冷卻 2.0 | 7.5 內引燃發光加速，1.9 內 0.4 秒後爆炸 |
| 預告 | 舉手 0.42 秒 | **尖叫 0.8 秒**（頭後仰、手張開、尖叫音效）→ 直線衝刺速度 9、1.3 秒，撞到傷害 16＋擊退 7 | **舉手 1.0 秒＋地面紅色圈逐漸放大** → 重擊、鏡頭晃動、擊退 9、0.55 秒硬直 | **身體橘色閃爍＋嘶嘶聲**，越近閃越快 |
| 硬直 | 爆頭或單發 ≥30 | 同左 | 不會 | 引爆中不會 |

- 爆炸：半徑 4.2（Boss 5），對玩家最多 42 傷害（距離線性遞減 +5），對殭屍最多 140。**被玩家打死也會爆炸**，可以拿來炸屍群。
- Boss：坦克 ×3.2 HP、×1.35 體型、×0.9 速度、重擊 40 範圍 3.5、掉 2 枚抽獎幣、分數 ×4、金錢 ×5，頂部顯示 Boss 血條。
- 每波 HP 倍率 `1 + 0.07 × (n - 1)`。
- 燃燒：每秒 9 傷害，身上冒火粒子並發橘光。
- 預告是這個遊戲的核心樂趣，**表現一定要做到位**：預告動作、音效、地面標記三者都要有，而且三台電腦都看得到（用 ClientRpc 觸發表現）。

### 5.4 命中判定

- 每個殭屍 prefab 有兩種 hitbox collider（Layer `EnemyHitbox`）：頭一個 SphereCollider、身體一個 CapsuleCollider，各掛 `Hitbox` 元件標示 `Part.Head` / `Part.Body`。
- 若用 Mixamo 骨架，hitbox 綁在對應骨頭上，跟著動畫動。
- 死亡：停用 hitbox，播倒地動畫（或 ragdoll），2.2 秒後下沉，3.4 秒後回收到 pool。

### 5.5 波次

照原型 `WaveManager.compose`：

- 第 n 波類型：n%5==0 → Boss 波；n%3==0 → 衝刺波（70% Runner）；其他 → 普通波。
- 第 1 波：10 隻 Walker。
- 普通波數量 `7 + 3n`，Boss 波 `6 + 2n` 再加 Boss；衝刺波 `8 + 3n`。
- 種類機率：n≥4 有 8% Tank、n≥3 有 Exploder（累計 22%）、n≥2 有 Runner（累計 42%），其餘 Walker。第 3 波保證至少一隻 Exploder、第 4 波保證一隻 Tank。
- 同時存活上限 `min(8 + 2n, 30)`，生成間隔 `max(0.3, 1.0 - 0.06n)`。
- **多人倍率（新）：** 數量 × `1 + 0.5 × (玩家數 - 1)`，同時存活上限 × `1 + 0.35 × (玩家數 - 1)`，上限 45。HP 不加倍。
- 生成點：12 個（地圖邊緣），條件改成「離**所有**存活玩家都 > 16 公尺，且不在任何玩家正前方 ±70° 視野內」，找不到就放寬。
- 第一次遇到新種類時，全員顯示提示 toast（原型 `TIPS`）。

### 5.6 局內升級

11 個升級全部照原型 `UPGRADE_DEFS`（名稱、流派、稀有度、效果見附錄）。注意：

- 升級是**每個玩家各自的**。效果只對擁有者生效，例如「燃燒彈」只對該玩家子彈命中的殭屍點火，事件 payload 要帶 `AttackerClientId` 來篩選。
- 修正型升級（神射手、縱火狂、空尖彈）加進該玩家的 `DamageChain`，在 Server 上計算。
- 「冷靜」影響後座力 → 要同步給 owner 客戶端（升級清單用 `NetworkList<FixedString32Bytes>`）。
- 抽獎：依稀有度權重 普通 60 / 稀有 30 / 傳說 10 抽 3 個不重複、未擁有的選項，選 1。抽獎在 Server 算，結果送給該玩家選擇，選擇再送回 Server。

---

## 6. C 網路、流程與 UI（`Assets/Scripts/Core/`、`Assets/Scripts/UI/`）

### 6.1 連線

- 主選單三個按鈕：**建立房間（Host）**、**加入房間（輸入 IP）**、**單人遊戲**（就是只有自己的 Host）。
- Host 畫面顯示自己的區網 IPv4，方便口頭告訴隊友。用 `System.Net.NetworkInformation` 列出非 loopback 的 IPv4。
- 連接埠 7777，UnityTransport。最多 3 人：`ConnectionApprovalCallback` 拒絕第 4 人，並回傳原因字串給客戶端顯示。
- 大廳：顯示三個玩家欄位（名字、準備狀態），Host 按「開始」才進遊戲。名字在主選單輸入並存在 `PlayerPrefs`。
- 斷線：客戶端斷線時顯示「與房主的連線中斷」並回主選單；Host 這邊該玩家角色移除，遊戲繼續。
- 切場景用 `NetworkManager.SceneManager.LoadScene`（只有 Server 呼叫）。

### 6.2 遊戲狀態機

和原型一樣用 State pattern：`LobbyState`、`PlayingState`、`WaveBreakState`、`GameOverState`。

- 目前狀態、波次、休息倒數用 `NetworkVariable` 同步；狀態轉換只有 Server 決定。
- 休息時間 45 秒；所有存活玩家都按 G 才跳到 3 秒（多人版規則；畫面顯示「2/3 已準備」）。
- 倒數最後 5 秒每秒顯示大字；抽獎機轉動中不進下一波。
- 第 3 波清除後永久解鎖霰彈槍（存在 Host 的 `PlayerPrefs`），全員 toast。

### 6.3 經濟

- 每個玩家錢包獨立，`NetworkVariable<int>` 掛在玩家物件上，只有 Server 寫。
- 擊殺給擊殺者：金錢 × 爆頭 1.5 × Boss 5。清波每人 `100 + 30n`。
- **助攻（新）：** 對殭屍造成 ≥25% 最大 HP 傷害但沒擊殺的玩家拿 30% 金錢。
- 抽獎幣掉在地上，誰先碰到（1.6 公尺）是誰的；30 秒後消失，最後 5 秒閃爍。

### 6.4 交易站

- 位置：地圖中央便利商店的櫃台。波次間營業，波次中招牌變暗、按 E 顯示「櫃台在波次之間才營業」。
- 商品（Command pattern，每個商品自己知道能不能買、買了做什麼）：

  | 商品 | 價格 | 條件 |
  |---|---|---|
  | 步槍 | $450 | 未擁有 |
  | 霰彈槍 | $700 | 未擁有且已解鎖 |
  | 補滿彈藥 | 依缺少量計算 | 有缺 |
  | 護甲 +50 | $250 | 護甲 < 100；吸收 75% 傷害 |
  | 急救包 | $150 | 未滿血；回 50 |
  | 抽獎幣 | $400，每買一枚 +$100（每個玩家各自計） | — |

- 客戶端按購買 → `BuyServerRpc(itemId)` → Server 檢查並扣錢 → 結果 ClientRpc 回傳（成功音效或拒絕音效＋原因）。
- 打開商店時解鎖滑鼠，不暫停遊戲（多人遊戲沒有暫停）。
- **商店引導：** 清波後地上出現發光線，從玩家位置指到櫃台（原型 `store-guide.js`），用 LineRenderer 沿 NavMesh 路徑畫。

### 6.5 HUD（照原型配置）

- 左下：HP 條、護甲條、金錢、抽獎幣數。
- 右下：武器名、彈匣 / 備彈，換彈中顯示進度。
- 上方中央：第 N 波、類型、剩餘殭屍數；Boss 出現時顯示 Boss 血條。
- 右上：小地圖（RenderTexture 俯視相機或 UI 繪製），顯示隊友（藍）、殭屍（Tank 紅、其他灰）、抽獎幣（金）、商店（波次間青色閃爍框）。
- 中央：準心（依目前擴散動態張開）、命中標記（普通白、爆頭紅、擊殺加粗）、互動提示。
- **隊友資訊（新）：** 左側列出隊友名字＋HP 條；倒地時變紅並顯示倒數。
- **隊友標記（新）：** 隊友頭上顯示名字；被牆擋住時在螢幕邊緣顯示方向箭頭；倒地隊友顯示紅色救援圖示與距離。
- Toast、Banner、事件紀錄（除錯用，原型右側的 event log，按 F3 開關）。
- 字型：TextMeshPro + Noto Sans TC（中文）與 Big Shoulders Display（數字、標題）。配色沿用 `ui/styles.css` 的 CSS 變數，做成一個 `UITheme` ScriptableObject。

### 6.6 選單

- 主選單、大廳、暫停（Esc，只開選單不暫停遊戲）、設定、結算。
- **設定（新）：** 滑鼠靈敏度、FOV（70～100）、主音量／音效／音樂、減少畫面晃動、顯示 FPS。存 `PlayerPrefs`。
- **結算（新）：** 撐過的波數、總分、最佳紀錄，以及每位玩家的擊殺、爆頭、造成傷害、救援次數、花費金額，並給「MVP」標籤。

---

## 7. 美術、燈光與音效

### 7.1 風格

**夜晚的台灣小鎮街角**：便利商店（青綠色招牌，是安全感的來源）、加油站、公園、公車總站、貨櫃場。低多邊形、不追求寫實，靠燈光撐氣氛。原型配色：

| 用途 | 色碼 |
|---|---|
| 天空／霧 | #232B36 |
| 地面 | #2C3036 |
| 牆 | #3A4049 |
| 路面標線 | #B59A45 |
| 商店／安全 | #5FE3D0 |
| 危險／血 | #DC4A3D |
| 金錢／抽獎幣 | #FFC94A |
| 路燈 | 暖橘 #FFC48A |

### 7.2 燈光設定（CP 值最高的一步）

1. Lighting → Environment：Skybox 換成純色或漸層深藍；Environment Lighting 用 Gradient（天 #A9BBD2 ×0.4、地 #3B3228 ×0.3）。
2. Directional Light（月光）：強度 0.3、色 #8FA8CC、Soft Shadows。
3. 路燈：每支一個 Point Light（#FFC48A、強度 3～5、範圍 12），只讓最近的 4～6 支開陰影。
4. 便利商店：室內 Spot/Area Light 青白色，招牌用 Emissive 材質 + Bloom，讓它在遠處就看得見。
5. Fog：Linear，起點 22、終點 80，顏色 #232B36（原型數值）。
6. 靜態物件標 Static，Bake 一次 Lightmap（Mixed lighting）。
7. Global Volume：
   - Tonemapping ACES
   - Bloom：Threshold 1.0、Intensity 0.6
   - Color Adjustments：Post Exposure 0.2、Contrast 15、Saturation -10
   - Vignette 0.3
   - 受傷時程式把 Vignette 調紅、強度拉到 0.5 再回復
   - 倒地時 Saturation -80

### 7.3 模型素材（免費、可商用、適合課程）

- 環境：Kenney City Kit、Quaternius Ultimate Modular / Post-Apocalyptic pack。
- 殭屍：Mixamo 的 Zombie 角色與動畫（Walk、Run、Attack、Scream、Death、Hit Reaction）。四種殭屍用同一個骨架，換材質顏色＋縮放（Tank 1.45×）。
- 武器：Quaternius 或 Kenney Blaster Kit。
- 如果時間不夠：照原型用方塊組角色，每個部位分開、程序化擺動手腳，也比膠囊好太多。
- 每個素材的來源與授權記在 `Assets/Art/CREDITS.md`，報告會用到。

### 7.4 音效

原型 `core/audio.js` 是程式合成音，列出了需要的全部音效：

`shot(pistol/rifle/shotgun)`、`empty`、`reload`、`reloaded`、`hit`、`headshot`、`kill`、`hurt`、`groan`、`scream`、`windup`、`slam`、`hiss`、`boom`、`coin`、`buy`、`deny`、`bell`（商店開門）、`tick`（抽獎）、`jackpot`（依稀有度）、`pick`。

- 來源：Freesound（CC0）、Kenney Audio、Sonniss GDC bundle。
- 殭屍聲音全部用 3D AudioSource（Spatial Blend 1、Logarithmic、最大距離 25），**這是玩家判斷背後有沒有 Runner 的關鍵**。
- 自己的槍聲 2D、隊友的槍聲 3D。
- AudioMixer 分 Master / SFX / Music / UI 四組，對應設定頁。
- **動態音樂（新）：** 波次中緊張的循環、休息時安靜的商店音樂、Boss 波換曲。用兩個 AudioSource 交叉淡入淡出。

---

## 8. 手感清單（game feel）

全部做完遊戲就「像遊戲」了。每一項都很小，可以各自一個 commit。

**射擊**
- [ ] 槍口火光（面片＋點光源 0.05 秒）
- [ ] 彈道線（LineRenderer，0.05 秒淡出）
- [ ] 後座力：鏡頭上抬並指數回復、隨機左右偏移
- [ ] 準心依擴散張開
- [ ] 命中標記：X 形，爆頭紅色，擊殺時放大
- [ ] 命中音效與爆頭音效不同，爆頭要「叮」一聲
- [ ] 殭屍被打中閃白 0.07 秒（材質 Emission）
- [ ] 血花粒子；爆頭更多
- [ ] 牆上彈孔 decal（URP Decal Projector，pool 最多 64 個）
- [ ] 擊殺時極短的 hitstop（0.03 秒 timeScale，**只在單人時**；多人改成只放大命中標記）
- [ ] 傷害數字（可在設定關閉）

**移動與鏡頭**
- [ ] 步伐 bob 與腳步聲
- [ ] 落地時鏡頭輕微下沉
- [ ] 衝刺時 FOV +5
- [ ] 受傷時鏡頭晃動＋紅色 vignette＋受傷方向指示（螢幕邊緣紅色弧形）
- [ ] 爆炸與坦克重擊依距離晃鏡頭

**殭屍**
- [ ] 從地面爬出（0.7 秒）
- [ ] 隨機呻吟（4～10 秒，18 公尺內）
- [ ] 硬直動畫
- [ ] 死亡倒地、下沉、回收
- [ ] 預告：Runner 尖叫、Tank 紅圈、Exploder 閃爍（第 5.3 節）

**經濟與獎勵**
- [ ] 抽獎幣上下浮動旋轉、靠近自動吸過來、撿起音效＋粒子
- [ ] 抽獎機轉動 1.3 秒、燈光換色、依最高稀有度不同音效
- [ ] 選升級卡片依稀有度上色、有翻開動畫
- [ ] 錢增加時 HUD 數字跳動

---

## 9. 新功能（網頁版還沒有的）

依優先順序。**Must 是期末展示一定要有的**；Should 時間夠就做；Could 是加分。

### Must（多人合作的核心，網頁版做不到的）

| 功能 | 說明 | 模組 |
|---|---|---|
| 倒地救援與觀戰 | 第 4.6 節 | A（＋C 的 UI） |
| 多人波次倍率 | 第 5.5 節 | B |
| 隊友 HUD 與標記 | 第 6.5 節 | C |
| 各自錢包、各自升級 | 第 6.3、5.6 節 | C、B |
| 每人結算統計與 MVP | 第 6.6 節 | C |
| 準備跳過倒數 | 全員按 G 才跳 | C |

### Should

| 功能 | 說明 | 模組 |
|---|---|---|
| **標記（ping）系統** | 按中鍵在準心位置放標記，全隊看得到 3 秒；對著殭屍按會標成「危險」並顯示種類 | C |
| **轉帳** | 交易站裡可以給隊友 $50 / $100 / $250 | C |
| **手榴彈** | Q 鍵丟手榴彈（G 保留給跳過倒數），每波開始補 1 顆、商店 $200 一顆，拋物線、3 秒引信、半徑 5 | A |
| **近戰** | V 鍵刀擊，傷害 50、冷卻 0.6 秒、對背後 ×2，彈藥用完時的保命手段 | A |
| **瞄準（ADS）** | 右鍵：FOV -15、擴散 ×0.4、移動速度 ×0.6、view model 移到中央 | A |
| **可開的門／區域** | 地圖五區一開始只開商店周圍，花 $750～1250 開路障解鎖其他區域（CoD Zombies 的核心機制），新區域有新生成點 | B（生成點）＋C（互動、價格） |
| **第五種殭屍：Spitter** | 遠距離吐酸，地上留 3 秒酸液區（每秒 10 傷害），預告是脖子鼓起＋咕嚕聲。逼玩家移動，不能站樁 | B |
| **精英修飾** | 第 6 波後 10% 機率生成精英：發光外框，隨機一種詞綴（快速、裝甲 -50% 身體傷害、分裂死亡時生 2 隻 Walker），掉落金錢 ×3 | B |
| **動態音樂** | 第 7.4 節 | C |

### Could

| 功能 | 說明 |
|---|---|
| **武器升級台** | 波次間 $2000 把目前武器升級成金色版：傷害 ×1.6、彈匣 ×1.5、加一個特性（步槍穿透 1 隻、霰彈槍點火、手槍爆頭回血） |
| **隊伍升級** | 傳說稀有度新增「全隊生效」類型，例如「戰地醫護：救援時間 -50%，救起時隊友回滿血」 |
| **夜間事件** | 每 4 波隨機一個：停電（只剩手電筒，F 開關）、濃霧（霧距 30）、商店被攻擊（守住櫃台 60 秒，失敗本波商店關閉） |
| **難度選擇** | 簡單／普通／困難：殭屍 HP ×0.75/1/1.3、傷害 ×0.75/1/1.25、金錢 ×1.2/1/0.9 |
| **永久進度** | 累積分數解鎖起始配件（起始多 $100、起始護甲 25…），沿用原型 `zwp.meta` 的想法 |
| **排行榜** | 本機前 10 名紀錄（波數、分數、隊員名字） |
| **教學提示** | 第一次進遊戲時依序提示 WASD、射擊、交易站、抽獎機，原型 toast 系統就能做 |

---

## 10. 里程碑與驗收

每個里程碑結束：Console 無錯誤、兩個實例實測過、`docs/DEVLOG.md` 寫一段、分步 commit。

### M0 專案骨架（C 主導，三人確認 Shared）
- URP 專案、套件、資料夾、asmdef、Layers。
- `Shared/` 的介面、`GameEvents`、`NetworkObjectPool`、`Services`。
- **驗收：** 空場景按 Host / Join，兩個實例都連上，Console 印出 client id。

### M1 能走能射（A）
- 玩家 prefab、移動、視角、三把槍、view model、開火網路流程。
- 測試場景放幾個「靶子」（實作 `IDamageable` 的方塊）。
- **驗收：** 兩個玩家互相看得到對方移動與開槍；打靶子 Server 扣血，射擊者看到命中標記；手槍爆頭 68 傷害。

### M2 殭屍與波次（B）
- NavMesh、Walker、WaveManager（先只有 Walker）、pool、死亡回收。
- **驗收：** 第 1 波 10 隻 Walker 從視野外生成並追最近的玩家，被打死會回收，清完觸發 `WaveCleared`；兩個客戶端看到的殭屍位置一致。

### M3 遊戲流程與 HUD（C）
- 狀態機、休息時間、GameOver、結算、HUD、主選單與大廳。
- **驗收：** 從主選單建房 → 隊友加入 → 開始 → 打完第 1 波 → 45 秒休息 → 第 2 波 → 全員倒地 → 結算 → 回主選單，全程不需重開遊戲。

### M4 地圖與美術（全員，C 統籌場景）
- 照原型 90×90 地圖搭場景：中央便利商店、四個區域、圍牆、路燈、12 個生成點。
- 第 7 節的燈光與後處理；換上素材。
- **驗收：** 截圖給使用者看，與原型同一個角度對比，明顯比原型好看。

### M5 完整敵人（B）
- Runner、Tank、Exploder、Boss，預告表現，燃燒。
- **驗收：** 第 5 波 Boss 出現；三種預告在客戶端都看得到、聽得到。

### M6 經濟、商店、抽獎、升級（C＋B）
- 錢包、交易站 UI、抽獎幣掉落與撿取、抽獎機、11 個升級。
- **驗收：** 兩個玩家各自買東西、各自抽升級互不影響；「燃燒彈」只點燃擁有者打中的殭屍。

### M7 合作功能（A＋C）
- 倒地救援、觀戰、重生、隊友 HUD 與標記、多人倍率。
- **驗收：** 三人遊戲中一人倒地、另一人救起；一人死亡後觀戰、下一波重生。

### M8 手感與音效（全員）
- 第 8 節清單全部打勾、全部音效、設定頁。

### M9 Should 功能（依剩餘時間選）

### M10 收尾
- Build Windows exe，在**兩台實體電腦**跨機測試（防火牆要允許）。
- 效能：30 隻殭屍＋三人時 60 FPS 以上（Profiler 截圖）。
- 寫 README 的遊玩說明、操作表、已知問題。

---

## 11. Netcode 常見錯誤

| 症狀 | 原因與修法 |
|---|---|
| 「Prefab not registered」 | 所有會 Spawn 的 prefab 都要加到 NetworkManager 的 Network Prefabs List |
| 客戶端看不到殭屍 | 只能 Server 呼叫 `NetworkObject.Spawn()`；從 pool 拿出來後要 Spawn，回收要 `Despawn(false)` |
| Pool 物件在客戶端重複生成 | `NetworkObjectPool` 要實作 `INetworkPrefabInstanceHandler` 並對每個 prefab `AddHandler`，**Host 與 Client 都要註冊** |
| 玩家移動很卡、被拉回 | 玩家用 `ClientNetworkTransform`（owner 權威），不是預設的 `NetworkTransform` |
| `NetworkVariable` 寫入報錯 | 預設只有 Server 能寫；別在客戶端寫，或明確設定 `NetworkVariableWritePermission.Owner` |
| RPC 沒被呼叫 | 物件還沒 Spawn；方法名稱要以 `Rpc` 結尾（`FireServerRpc`）；NGO 2.x 可用 `[Rpc(SendTo.Server)]` |
| 只對一個客戶端送 ClientRpc | `RpcParams` / `ClientRpcParams` 指定 `TargetClientIds` |
| 每個人都在跑 AI | `Update()` 開頭忘了 `if (!IsServer) return;` |
| `OnNetworkSpawn` 前存取 `IsOwner` | 初始化放在 `OnNetworkSpawn`，不要放在 `Awake`/`Start` |
| 換場景後物件不見 | 用 `NetworkManager.SceneManager.LoadScene`，不要用 `SceneManager.LoadScene` |
| 每個客戶端都開了一台 Camera | 玩家 prefab 的 Camera 預設停用，`OnNetworkSpawn` 裡 `if (IsOwner)` 才啟用；AudioListener 同理 |
| 第二台電腦連不上 | Host 監聽位址要 `0.0.0.0`（`UnityTransport.SetConnectionData(ip, port, "0.0.0.0")`），防火牆允許私人網路 |

---

## 12. 期末報告用的設計模式對照

課程是 AOOP，報告要寫設計模式。原型已經用了這些，Unity 版要保留並在程式註解標註：

| 模式 | 位置 | 說明 |
|---|---|---|
| State | `GameManager` + 四個 GameState | 遊戲流程 |
| Observer | `GameEvents` | Economy、ScoreKeeper、TokenDropper、升級效果、HUD 都只聽事件 |
| Strategy | `IFireMode`、`ITargetSelector`、`LootTable` | 射擊方式、選目標、抽獎權重 |
| Template Method | `Weapon.TryFire` | 開火流程固定，子類別換參數與策略 |
| Chain of Responsibility | `DamageChain` | 爆頭、神射手、縱火狂、空尖彈依 priority 疊加 |
| Factory | `ZombieFactory`、`UpgradeFactory` | 依 id 建物件 |
| Object Pool | `NetworkObjectPool` | 殭屍、抽獎幣、彈孔、粒子 |
| Command | `ShopItem` 子類別 | 每個商品自己決定能不能買與執行內容 |
| Composite | 行為樹 `Selector`/`Sequence` | 殭屍 AI |
| Service Locator | `Services` | 模組之間透過介面取得服務 |

每個 commit 的訊息與 `tools/contrib_report.py` 的統計會當作貢獻度證據，所以**不要讓 agent 一次產生大 commit**。

---

## 13. 附錄：升級總表

| id | 名稱 | 流派 | 稀有度 | 類型 | 效果 |
|---|---|---|---|---|---|
| incendiary | 燃燒彈 | 火焰 | 稀有 | 事件 | 子彈命中點燃 3 秒（每秒 9） |
| wildfire | 火勢蔓延 | 火焰 | 傳說 | 事件 | 燃燒中的殭屍死亡時點燃 4 公尺內殭屍 4 秒 |
| pyromaniac | 縱火狂 | 火焰 | 稀有 | 修正 p20 | 對燃燒目標 ×1.4 |
| marksman | 神射手 | 精準 | 傳說 | 修正 p10 | 爆頭再 ×1.75 |
| resupply | 精準補給 | 精準 | 稀有 | 事件 | 爆頭擊殺回填 25% 彈匣 |
| steady | 冷靜 | 精準 | 普通 | 旗標 | 站定時後座力 ×0.4 |
| hollow | 空尖彈 | 精準 | 普通 | 修正 p30 | 對 HP>70% 目標 ×1.3 |
| shock | 換彈衝擊 | 通用 | 稀有 | 事件 | 換彈完成時對 4.5 公尺內殭屍 15 傷害＋擊退 9 |
| greed | 賞金獵人 | 通用 | 普通 | 事件 | 爆頭擊殺 +$10 |
| adrenaline | 腎上腺素 | 生存 | 普通 | 事件 | 擊殺後 2 秒移速 ×1.3 |
| thickskin | 厚皮 | 生存 | 普通 | 數值 | 最大 HP +30 並回 30 |

分數：擊殺分數 × 爆頭 1.5 × Boss 4；清波 +250×n。起始 $250、1 枚抽獎幣、HP 100、護甲 0。

---

## 給 agent 的開場提示範本

使用者可以把下面這段貼給 GPT，每次換里程碑時改最後一行：

```
你在 AOOP_final repo 裡工作。先讀 AGENTS.md 與 docs/UNITY_GUIDE.md。
我負責的模組是：<A 玩家與武器 / B 敵人與波次 / C 網路、流程與 UI>，只能改對應資料夾。
動手前先讀 prototype-web/ 裡對應的原始碼，數值與行為照原型。
一次只做一個小功能，做完進 Play Mode（必要時開兩個實例）實測，再用 Conventional Commits 單獨 commit。
回報時列出：改了哪些檔、怎麼測的、Console 有沒有錯誤、還沒做或沒測的部分。
現在要做：<例如 M1 的「三把槍的 WeaponData 與 Weapon 基底類別」>
```
