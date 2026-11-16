# Unity 原型擴充實作手冊（給 coding agent）

這份手冊的讀者是要動手寫程式的 coding agent（GPT 或其他）。目標是把使用者提出的七條遊戲性需求，以及畫面改善方向，實作進 Unity 原型。

- 需求與設計理由：[GAMEPLAY_DESIGN.md](GAMEPLAY_DESIGN.md)。
- 目前的差距：[UNITY_GAP_REVIEW.md](UNITY_GAP_REVIEW.md)。

本手冊決定**做什麼、照什麼順序、改哪些檔案、做到什麼程度算完成**。設計書和本手冊衝突時，**以本手冊為準**：手冊已經依現有程式碼簡化或調整過範圍。

---

## 目錄

0. [工作守則（必讀）](#0-工作守則必讀)
1. [現況快照](#1-現況快照)
2. [執行順序總覽](#2-執行順序總覽)
3. [階段 0：基礎重構](#3-階段-0基礎重構)
4. [階段 1：後座力與 ADS](#4-階段-1後座力與-ads)
5. [階段 2：口徑子彈、背包與資料化商店](#5-階段-2口徑子彈背包與資料化商店)
6. [階段 3：武器擴充與牆上武器](#6-階段-3武器擴充與牆上武器)
7. [階段 4：地圖開路](#7-階段-4地圖開路)
8. [階段 5：投擲物](#8-階段-5投擲物)
9. [階段 6：主動技能與抽獎改版](#9-階段-6主動技能與抽獎改版)
10. [階段 7：殭屍多樣化](#10-階段-7殭屍多樣化)
11. [階段 8（P2）：配件、元素、精英](#11-階段-8p2配件元素精英)
12. [美術軌道 V1–V5](#12-美術軌道-v1v5)
13. [驗收方法](#13-驗收方法)
14. [Commit 範例](#14-commit-範例)
15. [附錄：數值表](#15-附錄數值表)

---

## 0. 工作守則（必讀）

### 0.1 你在哪個 repo 工作

- 程式在 **`C:\Users\nick0\Desktop\Claude_repo\AOOP_UnityPrototype`**，以下路徑都相對於這個資料夾。
- 本手冊放在 `AOOP_final/docs/`。除非使用者要求，不要改 `AOOP_final` 裡的程式。
- Unity 版本是 6.3 LTS（6000.3.26f1），Editor 路徑：`C:\Program Files\Unity\Hub\Editor\6000.3.26f1\Editor\Unity.exe`。
- 用 batch mode 跑 Unity 前，先確認使用者沒有用 Editor 開著這個專案，否則會被 lockfile 擋住。

### 0.2 模組歸屬

本專案是三人小組作業，**每個 commit 的檔案範圍會被拿來評分**。

| 代號 | 模組 | 資料夾 |
|---|---|---|
| A | 玩家與武器 | `Assets/Scripts/Player/` |
| B | 敵人、波次、抽獎、技能 | `Assets/Scripts/Enemy/` |
| C | 流程、商店、地圖互動、HUD | `Assets/Scripts/Core/`、`Assets/Scripts/UI/` |
| 共用 | 介面、事件、純邏輯 | `Assets/Scripts/Shared/`（**改之前要使用者確認三人同意**） |
| 建置 | 場景產生器 | `Assets/Editor/`（階段 0 會拆成每個模組各自的檔案） |

規則：

1. **開始每個步驟前，先問使用者「這一步要用誰的身分做」。** 一個 commit 只放一個模組的檔案；Shared 的修改獨立成一個 commit。
2. 模組之間**只能透過 `Shared/` 的介面、`SessionServices` 和 `EventBus` 溝通**。不准在 `Core/` 裡 `using ZombieCoop.Player` 去拿具體類別，反過來也一樣。
3. 數值放 ScriptableObject（`Assets/Data/*.asset`）。預設值寫在 Editor 的建置程式裡，執行期的程式不寫死數字。只有「純粹表現用、不影響平衡」的常數可以留在程式裡，例如動畫速度。
4. 命名：命名空間 `ZombieCoop.<模組>`，類別 PascalCase，私有欄位 `_camelCase`。

### 0.3 不准自己動的東西

以下要先停下來問使用者：

- `ProjectSettings/`、`Packages/manifest.json`、`.gitattributes`、`.gitignore`。
- 匯入 TextMeshPro Essential Resources、任何第三方素材、任何新套件。
- **不要自己下載或購買素材。** 素材一律由使用者下載後放到指定資料夾，你只負責接上去。
- 加入超過 10 MB 的二進位檔前要先問，因為目前沒有 Git LFS 設定。
- 不要改 git config、不要用別人的名字 commit、不要 force push。這個 repo 沒有設定作者身分，要用 `git -c user.name="…" -c user.email="…" commit` 的方式指定，姓名和 email 由使用者提供，不要沿用歷史紀錄裡的作者。

### 0.4 每一步的工作流程

1. 讀相關檔案，確認本手冊描述的現況還成立。不成立就停下來回報，不要硬套。
2. 實作。
3. 編譯：用 batch mode 執行 `ZombieCoop.EditorTools.OfflineValidation.BuildAndRun`（見第 13 節）。
4. 把新功能的自動檢查加進 `OfflineValidation`，有純邏輯的再加進 `Tests/PureChecks.cs`。
5. 給使用者看 diff，經同意再 commit。commit 訊息用英文 Conventional Commits。
6. 每完成一個階段，在 `docs/DEVLOG.md` 補一段紀錄：做了什麼、驗證結果、已知問題。

### 0.5 遇到這些情況要停下來

- 需要改到別人模組的檔案。
- 需要改 Shared。
- 本手冊和程式碼現況不一致。
- 驗證連續兩次失敗，而且原因不明。
- 任何需要使用者做決定的取捨，例如素材風格、要不要烘焙光照。

---

## 1. 現況快照

截至 commit `bc53a6b`。

### 1.1 關鍵檔案

| 檔案 | 負責 | 內容 |
|---|---|---|
| `Assets/Editor/OfflineTownSetup.cs` | 建置 | **整個場景由程式產生**：地圖、超商、殭屍、槍都是 `Box()` 拼成的方塊，數值也在這裡寫進 `Assets/Data/Offline*.asset` |
| `Assets/Editor/OfflineValidation.cs` | 建置 | Play Mode 自動驗收，失敗時 exit code 1 |
| `Assets/Scripts/Shared/Contracts.cs` | 共用 | `ZombieKind`、`UpgradeId`、`IEnemyActor`、`IPlayerActor`、`ITrading`、`SessionServices` 等 |
| `Assets/Scripts/Shared/GameplayRules.cs` | 共用 | `WaveRecipe`、`DamageChain`、`DamageContext` |
| `Assets/Scripts/Shared/PrototypeInput.cs` | 共用 | KeyCode 轉 Input System；**目前不支援 Tab** |
| `Assets/Scripts/Player/Weapon.cs` | A | `HitscanFire`、`Weapon` 基底（開火、換彈、散布、槍模晃動） |
| `Assets/Scripts/Player/PlayerController.cs` | A | 移動、視角、`Recoil()`、3 格武器 `_owned = {true,false,false}` |
| `Assets/Scripts/Player/WeaponConfig.cs` | A | 武器數值 SO |
| `Assets/Scripts/Enemy/ZombieActor.cs` | B | 殭屍全部行為，用 `_special = 0…6` 整數切狀態 |
| `Assets/Scripts/Enemy/ZombiePool.cs` | B | 物件池、分離力、攻擊名額（最多 4）、`Blast()` |
| `Assets/Scripts/Enemy/FlowField.cs` | B | 90×90 格的 BFS 尋路；**`Size = 90` 寫死，障礙物只在建構時掃一次** |
| `Assets/Scripts/Enemy/WaveDirector.cs` | B | 波次組成、生成位置（地圖四邊隨機） |
| `Assets/Scripts/Enemy/UpgradeDirector.cs`、`UpgradeEffects.cs` | B | 11 個被動升級，每個用 `UpgradeEffect` 子類別實作 |
| `Assets/Scripts/Core/TradingStation.cs` | C | 櫃台與抽獎機，**6 個商品寫死在 `Offers` 與 `Buy()` 的 switch** |
| `Assets/Scripts/Core/PrototypeFlow.cs` | C | 遊戲狀態、金錢、清波獎金 |
| `Assets/Scripts/UI/OfflineHud.cs` | C | IMGUI HUD、商店與抽獎畫面、小地圖 |

### 1.2 一定要知道的細節

不知道這些，改了會壞：

- **爆頭判定**是 `hit.collider.name == "Head"`。
- **殭屍根物件在 layer 2（Ignore Raycast）**，所以射線打不到根物件的 CharacterController，只打到子物件的 `Head`、`Torso` 碰撞體（**layer 11 `EnemyHitbox`**，由建置程式設定）。換模型時要維持這個安排。
- **layer 8 是「阻擋」層**：`FlowField` 用它判斷牆壁，`ZombiePool.Direction()` 和衝刺的視線檢查也用它。新的牆、圍欄、路障都要放在 layer 8。
- **第一人稱槍模在 layer 14**，由另一台 FOV 60 的手部攝影機畫出；主攝影機 FOV 75。
- `Weapon` 用 `_model.Find("Muzzle")` 找槍口火光，**新槍模一定要有叫 `Muzzle` 的子物件**。
- `OfflineEffects.Fallen()` 只複製 `MeshFilter`，**換成 SkinnedMeshRenderer 後屍體會消失**，要改成 `SkinnedMeshRenderer.BakeMesh`。
- `OfflineValidation` 用反射讀 `ZombieActor._special`。重構殭屍狀態時要一起改驗收程式。
- `OfflineValidation` 第一關檢查開局數值：`waves.Remaining == 10`、`player.Ammo == 12`、`game.Money == 250`、`game.Tokens == 1`。除非有意改開局，否則要維持。
- 地圖四周有牆，範圍 ±45。現有區域：
  - 中央：便利商店（約 |x| ≤ 9、|z| ≤ 6）
  - 左上（−x、+z）：公車總站，約 (−29, 22…38)
  - 右上（+x、+z）：貨櫃場，約 (20…40, 17…40)
  - 右下（+x、−z）：加油站，約 (28, −26)
  - 左下（−x、−z）：公園，約 (−28, −26)
- 商店和抽獎機打開時，會用 `TogglePause()` 暫停遊戲。

---

## 2. 執行順序總覽

```
階段 0 基礎重構 ──┬─> 1 後座力/ADS ──> 3 武器擴充 ──> 8 配件（P2）
                  ├─> 2 子彈/背包/資料化商店 ──┬─> 3
                  │                            ├─> 4 地圖開路
                  │                            └─> 5 投擲物
                  ├─> 7 殭屍多樣化（可以和 1～5 平行做）
                  └─> 6 主動技能（需要 2 的 HUD 版面）
美術軌道 V1 可以馬上開始，和上面全部平行。V3～V5 要等使用者決定素材。
```

| 階段 | 內容 | 主要負責 | 優先 | 對應需求 |
|---|---|---|---|---|
| 0 | Shared 介面、拆建置程式、武器數值結構 | 全員 | P0 | 全部 |
| 1 | 後座力公式、ADS 開鏡 | A | P0 | #7 |
| 2 | 口徑子彈、背包、資料化商店 | A＋C | P0 | #2 |
| 3 | 6 把新武器、主副武器欄、牆上武器 | A＋C | P1 | #3 |
| 4 | 圍欄、路障、分區生成點 | C＋B | P1 | #1 |
| 5 | 破片、燃燒瓶、冷凍、誘餌 | A＋B | P1 | #4 |
| 6 | 主動技能欄、6 個技能、保底、重抽 | B＋A＋C | P1 | #5 |
| 7 | 走位多樣化、4 種新殭屍、成長公式 | B | P1 | #6 |
| 8 | 配件與工作台、元素統一、精英殭屍 | A＋B＋C | P2 | #7、#6 |
| V1–V5 | 光照、招牌、環境、殭屍模型、槍模 | C／B／A | 平行 | 畫面 |

三人工作量大致平均，符合課程的貢獻度評分。

---

## 3. 階段 0：基礎重構

這個階段不加任何新玩法，只讓之後的階段能分模組 commit、能擴充。**完成後遊戲行為必須和現在完全一樣**，`OfflineValidation` 要全部通過。

### 3.1 拆分場景建置程式（建置，用 C 的身分）

`OfflineTownSetup.cs` 改成 `partial class`，拆成四個檔案：

| 檔案 | 內容 | 之後誰改 |
|---|---|---|
| `OfflineTownSetup.cs` | 進入點 `Build()`、`Box()`、`Sign()`、`Mat()`、`Config<T>()` 等工具，依序呼叫下面三段 | 共用 |
| `OfflineTownSetup.World.cs` | 地圖、超商、燈光、交易站、流程、HUD | C |
| `OfflineTownSetup.Player.cs` | 玩家、攝影機、武器數值與槍模 | A |
| `OfflineTownSetup.Enemy.cs` | 殭屍 prefab、殭屍數值、波次、升級 | B |

做法是純搬移，不改邏輯。驗收：重新 Build 後場景物件數量和現在相同，驗收全過。

### 3.2 Shared 介面擴充（Shared，要三人同意）

一次加齊，之後各階段就不用一直回來改 Shared。新增 `Assets/Scripts/Shared/Expansion.cs`：

```csharp
namespace ZombieCoop.Shared
{
    public enum Caliber { None, Nine, Shell, FiveFiveSix, SevenSixTwo, Fuel, Cell }
    public enum WeaponSlotKind { Primary, Secondary }
    public enum StatusType { Burn, Frost, Shock }
    public enum CardKind { Passive, Active, Affix }

    // 玩家身上的子彈、投擲物。由 Player 模組實作，Core 的商店只透過這個介面賣東西。
    public interface IInventory
    {
        int GetAmmo(Caliber caliber);
        int GetAmmoCapacity(Caliber caliber);
        int AddAmmo(Caliber caliber, int amount);          // 回傳實際加入的量（受上限限制）
        bool TryConsumeAmmo(Caliber caliber, int amount);
        int GetThrowable(string throwableId);
        int ThrowableCapacity { get; }
        bool AddThrowable(string throwableId, int count = 1);
        string SelectedThrowable { get; }
        int BackpackLevel { get; }
        void UpgradeBackpack();
    }

    // 主副武器欄。武器用字串 Id 識別（例如 "pistol"、"smg"），對應 WeaponConfig.Id。
    public interface ILoadout
    {
        bool Owns(string weaponId);
        bool Grant(string weaponId);                        // 主武器欄滿時，取代目前手上的主武器
        string EquippedId { get; }
        IReadOnlyList<string> Owned { get; }
        int RefillCost(string weaponId);                    // 牆上武器「補彈」的價格
        void RefillWeapon(string weaponId);
    }

    // 技能與能力修正，由各種效果直接調整，玩家與武器每幀讀取。
    public sealed class PlayerModifiers
    {
        public float FireRate = 1, ReloadSpeed = 1, Recoil = 1, MoveSpeed = 1, DamageTaken = 1;
        public bool FreeAmmo;
        public void Reset() { FireRate = ReloadSpeed = Recoil = MoveSpeed = DamageTaken = 1; FreeAmmo = false; }
    }

    // 靠近顯示提示、按 E 互動的東西：牆上武器、路障、販賣機、商店櫃台。
    public interface IPurchasable
    {
        Vector3 Position { get; }
        float Radius { get; }
        string Prompt { get; }            // 例如「[E] 購買衝鋒槍 $800」，不能買時寫原因
        bool HoldToBuy { get; }           // 路障用按住 E 分段投錢
        void Interact();                  // 按一下
        void HoldTick(float deltaTime);   // 按住期間每幀呼叫
    }

    public interface IAbilities
    {
        int SlotCount { get; }
        string SlotName(int slot);         // 空欄回傳 null
        int SlotLevel(int slot);
        float CooldownFraction(int slot);  // 0 = 可施放，1 = 剛放完
        float CooldownRemaining(int slot);
        bool TryCast(int slot);
        void ResetRun();
    }

    public interface IStatusReceiver
    {
        void ApplyStatus(StatusType type, float stacks, float seconds);
        int FrostStacks { get; }
        bool Frozen { get; }
    }

    public struct ExplosionInfo
    {
        public Vector3 Position;
        public float Radius, CenterDamage, EdgeDamage, Knockback;
        public float SelfDamageCap;      // 對玩家自己的最大傷害，0 表示不傷玩家
        public StatusType? Status; public float StatusStacks, StatusSeconds;
    }

    public readonly struct DoorOpened { public readonly string ZoneId; public DoorOpened(string id) => ZoneId = id; }
    public readonly struct AbilityCast { public readonly string AbilityId; public AbilityCast(string id) => AbilityId = id; }
    public readonly struct ThrowableDetonated { public readonly string Id; public readonly Vector3 Position; public ThrowableDetonated(string id, Vector3 p) { Id = id; Position = p; } }
    public readonly struct AmmoChanged { }
    // 由 WaveDirector.BeginWave 透過 EventBus 發布。GameEvents.WaveStarted 在離線版沒人觸發，不要用它。
    public readonly struct WaveBegan { public readonly int Wave; public WaveBegan(int wave) => Wave = wave; }
}
```

既有介面的增改（同一個 commit）：

- `ZombieKind` 在**尾端**加 `Crawler, Spitter, Bat, Leaper`，不要改既有成員的順序，因為 `OfflineTownSetup` 用 `(ZombieKind)i` 建資料。
- `IEnemyActor` 加：
  - `void Stagger(float seconds);`
  - `bool Flying { get; }`
  - 讓 `ZombieActor` 同時實作 `IStatusReceiver`。
- `IEnemyField` 加：
  - `void Explode(in ExplosionInfo info);`：中心到邊緣線性內插傷害，取代投擲物不適用的 `Blast` 衰減公式。
  - `void AddLure(Vector3 position, float radius, float seconds);`：誘餌、全息分身用。
  - `void RebuildPaths();`：路障打開後重算尋路。
- `IPlayerActor` 加：
  - `IInventory Inventory { get; }`、`ILoadout Loadout { get; }`、`PlayerModifiers Modifiers { get; }`
  - `bool Aiming { get; }`
  - `void Dash(Vector3 direction, float distance, float invulnerableSeconds);`
  - `void Pin(object source);`、`void Unpin(object source);`、`bool Pinned { get; }`
  - `Vector3 AimOrigin { get; }`、`Vector3 AimDirection { get; }`
- `IPlayerActor` 舊的 `Owns(int)`、`Unlock(int)`、`RefillAmmo()`、`AmmoCost`、`Reserve` **先保留**，標 `[System.Obsolete]`，階段 2 換完再刪。
- `UpgradeOffer` 加 `public CardKind Kind; public string AbilityId; public int Level;`。
- `IUpgrades` 加 `int DrawsUntilLegend { get; }`、`int RerollCost { get; }`、`IReadOnlyList<UpgradeOffer> Reroll();`（階段 6 用）。
- `ICombatEffects` 加 `void Bolt(Vector3 from, Vector3 to, Color color, float seconds);`（鏈結閃電的線，由 C 實作）。
- `SessionServices` 加 `public static IAbilities Abilities;`、`public static readonly List<IPurchasable> Purchasables = new();`，並在 `ResetStatics()` 清空。
- `WaveKind` 加 `BatNight`。`WaveRecipe` 加入第 7 節的成長公式，詳見 10.5。
- `PrototypeInput.Convert` 加 `KeyCode.Tab → Key.Tab`。字母鍵已經支援，Q、F、C、X、V 不用改。

驗收：只改介面時要能編譯。新成員可以先在實作類別裡加空的實作或 `throw new NotImplementedException()`，但**已經會被呼叫到的路徑不能丟例外**。

### 3.3 武器有效數值（A）

新增 `Player/WeaponStats.cs`，把「基礎數值 × 配件 × 技能修正」算成一份結果。`Weapon` 只讀這份；HUD 屬於 C，**不能直接引用 `WeaponStats`**，要繼續透過 `IPlayerActor.Spread`、`Ammo`、`MagazineSize` 等屬性間接讀取：

```csharp
public struct WeaponStats
{
    public float Damage, ShotInterval, Spread, VerticalRecoil, HorizontalRecoil, ReloadSeconds, AdsFov, AdsSeconds, MoveSpreadPenalty;
    public int MagazineSize, Pellets, Pierce;
}
```

`Weapon` 加 `WeaponStats Stats { get; }`。先只用 `WeaponConfig` 和 `PlayerModifiers` 算，階段 8 再把配件接進來。

階段 0 不能改變手感，所以新欄位的初值要讓結果和現在完全一樣：

| 欄位 | 階段 0 的來源 |
|---|---|
| `VerticalRecoil` | 現有的 `WeaponConfig.Recoil`（階段 1 才換成公式） |
| `HorizontalRecoil` | `VerticalRecoil × 0.35`，等於現在 `Recoil()` 裡的左右隨機幅度 |
| `MoveSpreadPenalty` | 1.7，等於現在 `SpreadFactor` 裡寫死的值，改成放進 `WeaponConfig` |
| `Pierce` | 0 |
| `AdsFov`、`AdsSeconds` | 照附錄 15.1 填入既有三把槍的數值；階段 1 才會用到 |

### 3.4 commit 切法

直接擴充既有介面時，A、B、C 的實作類別必須同時補上新成員才能編譯。所以要先加獨立的新型別，再讓各模組先補好成員，最後才改既有介面，確保每個 commit 都能單獨編譯：

1. `refactor(prototype): split offline town setup into per-module partial files`（建置）
2. `feat(shared): add expansion types and standalone contracts`（Shared：只新增 `Expansion.cs`）
3. `refactor(player): prepare expansion contract members`（A：先補成員，還不實作介面）
4. `refactor(enemy): prepare expansion contract members`（B）
5. `refactor(core): prepare combat effects contract member`（C：`Bolt`）
6. `feat(shared): extend actor contracts and add wave growth helpers`（Shared：改 `Contracts.cs`、`GameplayRules.cs`、`PrototypeInput.cs`）
7. `refactor(player): compute effective weapon stats in one place`（A）
8. `test(prototype): cover stage zero refactoring`
9. `docs: record stage zero results in devlog`

成長公式（10.5）在階段 0 只加進 `WaveRecipe` 和 `WaveConfig`，**不接進生成流程，也不改 `WaveRecipe.Kind()` 的結果**。目前 7% 的血量成長維持原樣，到階段 7 才切換。

`Build()` 會寫 `EditorBuildSettings.scenes`，可能寫回 `ProjectSettings/EditorBuildSettings.asset`。內容相同時可以接受，但每個 commit 前都要確認這個檔案沒有 diff。

---

## 4. 階段 1：後座力與 ADS

負責：A。對應需求 #7（後座力加大、跟威力正相關、要能開鏡）。

### 4.1 後座力公式

`WeaponConfig` 新增欄位，`Recoil` 欄位改成由公式算：

| 欄位 | 說明 |
|---|---|
| `string Id` | `"pistol"`、`"rifle"`… |
| `WeaponSlotKind Slot` | 主武器或副武器 |
| `Caliber Caliber` | 口徑 |
| `int Tier` | 1～5 |
| `float RecoilCoefficient` | 武器類型係數 |
| `float RecoilRampStart = 6, RecoilRampPerShot = 0.05f, RecoilRampMax = 0.6f` | 全自動連射時後座力逐發加大 |
| `int Pierce` | 穿透數 |
| `float AdsFov, AdsSeconds` | 開鏡的視角與所需時間 |
| `int Price` | 價格 |

公式：

- **垂直後座力**（每發，單位度）＝ `0.06 × Damage × Pellets × RecoilCoefficient × Modifiers.Recoil × (Aiming ? 0.8 : 1) × 連射加成`。
  - 連射加成：第 `RecoilRampStart` 發以後，每發 `+RecoilRampPerShot`，最多 `+RecoilRampMax`；停火 0.3 秒後歸零。
- **水平後座力** ＝ 垂直 × `Random.Range(-0.35f, 0.35f)`。
- **回復**：改寫 `PlayerController.Recoil()`。每發把 70% 加進「可回復量」（`_recoil`），30% 直接加到 `_pitch`，這部分要玩家自己往下拉。可回復量在**停火 0.15 秒後**才開始回復，每秒回復 `10 + 3 × 目前值`（指數加線性）。現在的實作是立刻開始衰減，要改。
- 「冷靜」升級的 `StandingRecoilScale` 保留，乘在最後。

類型係數與結果（新槍的數值見附錄 15.1）：

| 武器 | 單發總傷害 | 係數 | 垂直後座力 |
|---|---|---|---|
| 手槍 | 34 | 1.0 | 2.0° |
| 步槍 | 24 | 0.9 | 1.3° |
| 霰彈槍 | 15×9 = 135 | 0.5 | 4.1° |

### 4.2 一開始要「不穩」

- 腰射擴散：基礎值維持，**移動時 ×1.7、空中 ×2.2**，現有。
- 新增**起步晃動**：剛開始移動或剛落地的 0.25 秒內，擴散額外 ×1.3。
- 連射擴散（`_heat`）維持現有機制。

### 4.3 ADS 開鏡

- 按住右鍵（`PrototypeInput.GetMouseButton(1)`）開鏡，放開恢復。開鏡進度 `_ads` 以 `1 / AdsSeconds` 的速度在 0～1 之間變化。
- 主攝影機 FOV：`Lerp(75, AdsFov, _ads)`。手部攝影機固定 60。
- 開鏡時：
  - 擴散 ×`Lerp(1, 0.3, _ads)`，後座力 ×0.8
  - 移速 ×`Lerp(1, 0.6, _ads)`，**不能衝刺**
  - 滑鼠靈敏度 ×(目前 FOV ÷ 75)
- 槍模位置：從腰射位置 `(0.19, -0.17, 0.72)` 內插到瞄準位置 `(0, -0.105, 0.5)`。讓槍模的 `Front sight` 對準畫面中心。之後換新槍模時，改用槍模上的 `SightAnchor` 子物件來定位。
- HUD（C）：`IPlayerActor.Aiming` 為 true 時不畫十字準心，只畫一個小點。
- 換彈、切槍時強制取消開鏡。

### 4.4 驗收

自動（加進 `OfflineValidation`）：

- 手槍開一槍後，`_pitch` 的永久變化 ≈ 0.3 × 2.04°，誤差 10% 內。
- 霰彈槍單發的垂直後座力 > 步槍的 3 倍。
- 按住右鍵 0.4 秒後，主攝影機 FOV 等於 `AdsFov`，`player.Spread` 小於腰射時的 40%。

手動（請使用者試玩）：

- 步槍連射 30 發，準心會明顯往上飄，需要往下拉槍。
- 霰彈槍每發都會明顯上跳。

Commits：

- `feat(player): derive recoil from damage with delayed partial recovery`
- `feat(player): add aim-down-sights with fov, spread and speed changes`
- `feat(ui): hide crosshair while aiming`

---

## 5. 階段 2：口徑子彈、背包與資料化商店

負責：A（背包、彈藥）、C（商店）。對應需求 #2。

### 5.1 背包（A）

新增 `Player/PlayerInventory.cs : MonoBehaviour, IInventory`，掛在玩家身上。

- 每種口徑分開記數量，上限見附錄 15.2。背包每升一級，所有口徑上限 ×1.25，最多 3 級。
- `Weapon` 不再自己存 `Reserve`。換彈時從 `Inventory.TryConsumeAmmo(Caliber, n)` 拿；`FreeAmmo` 修正為 true 時不扣彈匣。
- **手槍不再無限子彈。** 每波開始時，免費把 9mm 補到至少 36 發：`PlayerInventory` 透過 `EventBus` 訂閱 `WaveBegan`（3.2 新增的事件，由 B 在 `WaveDirector.BeginWave` 發布）。注意：`GameEvents.WaveStarted` 在離線版從來沒有被觸發，不要用它。
- 每波開始時，免費補 1 顆破片手榴彈（不超過上限）。
- 某口徑第一次用完時，發布 `GameNotice("5.56mm 用完了，去商店補充")`，每波只提示一次。
- 殭屍死亡有 4% 機率掉小彈藥包，撿到後**目前持有的每把槍**各補一個彈匣。做法和 `LocalTokenDrops` 一樣：A 訂閱 `EnemyKilled` 自己生成。

HUD（C）：右下角改成 `彈匣 / 背包內該口徑數量`，例如 `24 / 180`。

### 5.2 背包面板（C）

- 按 Tab 切換顯示，**不暫停遊戲**。
- 內容：各口徑「目前 / 上限」、投擲物數量、目前選擇的投擲物、技能欄、已獲得的被動升級。

### 5.3 資料化商店（C）

新增 `Core/ShopItemConfig.cs`（ScriptableObject），放在 `Assets/Data/Shop/`：

```csharp
public enum ShopItemKind { Weapon, Ammo, Throwable, Armor, Medkit, Token, Backpack, Attachment, Gear }
[CreateAssetMenu(menuName = "Zombie Co-op/Shop Item")]
public sealed class ShopItemConfig : ScriptableObject
{
    public string Id, DisplayName, Description;
    public ShopItemKind Kind;
    public int Price, PriceGrowth;            // PriceGrowth：每買一次漲價（抽獎幣）
    public string PayloadId;                  // 武器 Id、投擲物 Id
    public Caliber Caliber; public int Amount; // 彈藥一盒的數量
    public string RequiredZone;               // 空字串 = 一開始就有
}
```

- 新增 `ShopCounter : MonoBehaviour, IPurchasable`：放在場景中的櫃台，持有一份 `ShopItemConfig[]`。
  - 便利商店櫃台只在**休息時間**可用；其他區域的販賣機隨時可用，打開時不暫停。
- `TradingStation` 改成「目前打開的櫃台」的控制器。`Offers` 從那個櫃台的清單產生，`Buy()` 依 `Kind` 分派：
  - `Weapon` → `Player.Loadout.Grant(PayloadId)`
  - `Ammo` → `Player.Inventory.AddAmmo(Caliber, Amount)`
  - `Throwable` → `AddThrowable`
  - `Armor`、`Medkit`、`Token` 維持現有邏輯
  - `Backpack` → `UpgradeBackpack()`
- `Buy()` 的 switch **只能依 `Kind` 分派，不能依索引**。
- 彈藥列提供「+1 盒」和「補滿」兩個按鈕，補滿的總價依缺多少盒計算。
- 商店畫面改成分頁：武器、彈藥、投擲物、補給、其他。用滑鼠點分頁，數字鍵 1～6 購買目前分頁的項目，因為 IMGUI 的版面放不下全部。
- 新增 `Core/InteractionScanner.cs`：每幀從 `SessionServices.Purchasables` 找最近、而且在 `Radius` 內的物件，HUD 顯示它的 `Prompt`。按 E 呼叫 `Interact()`，按住 E 呼叫 `HoldTick()`。現在 `TradingStation.Update` 裡用固定座標判斷距離的寫法要改成這套。
- 移除「霰彈槍撐過第 3 波才上架」的 `PlayerPrefs` 機制（`ZombieCoop.Shotgun`），改成一般商品。驗收程式裡相關的 PlayerPrefs 備份要一起清掉。

便利商店起始商品清單見附錄 15.4。

### 5.4 驗收

自動：

- 開局 9mm = 36，手槍彈匣 12。打完一個彈匣換彈後，9mm 減少 12。
- 買一盒 5.56 後增加 30，超過上限時只加到上限。
- 第 2 波開始時，9mm 補到 ≥ 36。
- 商店 `Offers` 數量等於櫃台清單長度。錢不夠時 `Available == false`，原因是「錢不夠」。

手動：Tab 面板顯示正確；休息時間買子彈，HUD 的數字即時更新。

Commits：

- `feat(player): add caliber inventory and pull reloads from it`
- `feat(core): drive shop offers from shop item assets`
- `feat(core): add proximity interaction scanner`
- `feat(ui): add backpack panel and tabbed shop`

---

## 6. 階段 3：武器擴充與牆上武器

負責：A（武器）、C（牆上武器）。對應需求 #3。

### 6.1 武器欄

- **兩把主武器＋一把副武器。** 1、2 切主武器，3 切副武器，滾輪循環。
- `PlayerLoadout : MonoBehaviour, ILoadout`（A）：
  - 買主武器時，有空欄就放進空欄；主武器欄滿時，取代**目前手上那把**主武器。如果手上拿的是副武器，就取代第 1 欄。
  - 副武器同理，只有一格。
  - 被取代的武器直接消失，畫面提示「丟棄了 XX」。
- 實作方式：建置時就在玩家身上建好**所有武器**的 `Weapon` 元件與槍模，預設停用。`Loadout` 只記錄「哪一欄是哪個 Id」，切換時啟用對應的那把。不要在執行中 Instantiate 武器。
- `Pistol`、`Rifle`、`Shotgun` 三個子類別合併成一個 `Firearm : Weapon`。開火方式由 `WeaponConfig.FireKind` 決定，目前只有 `Hitscan`；火焰噴射器、榴彈之後才做。

### 6.2 新武器（P1：6 把）

數值見附錄 15.1：

- 衝鋒槍、突擊步槍、半自動霰彈槍、狙擊槍、輕機槍、左輪。
- 原有的步槍、泵動霰彈槍保留。

實作重點：

- **穿透**：`HitscanFire` 改成 `Physics.RaycastAll`，依距離排序，最多打中 `Pierce + 1` 隻殭屍；碰到 layer 8 停止；每穿透一隻，傷害 ×0.8。
- **狙擊槍**：`AdsFov = 30`，開鏡 0.35 秒，腰射擴散很大（0.05）。開鏡時畫面四周加黑色圓形遮罩（C 的 HUD）。
- **輕機槍**：換彈 5 秒，移速 ×0.85（`WeaponConfig.MoveSpeedMultiplier`）。
- **槍模**：先用方塊拼出可以分辨的外型。長度、彈匣、槍托、瞄準鏡不同就好，例如狙擊槍要有瞄準鏡圓筒、輕機槍要有彈鏈箱。正式模型在 V5。
- **音效**：`SoundKey` 可以先沿用 `rifle`、`shotgun`、`pistol`，並用 pitch 區分。新增合成音效是 C 的事（`ProceduralAudio`），要另外提出。

### 6.3 牆上武器（C）

- 新增 `WallWeapon : MonoBehaviour, IPurchasable`。
- 靠近時：
  - 沒有這把槍：提示「[E] 購買衝鋒槍 $800」
  - 已經有：提示「[E] 補滿彈藥 $200」（價格是槍價的 1/4），呼叫 `Loadout.RefillWeapon`
- 牆上畫武器剪影：用細長方塊在牆面拼出槍的形狀，加發光邊框。
- 位置依區域放置，見 7.4。牆上武器隨時可以買，不暫停遊戲。

### 6.4 驗收

- 自動：
  - 買衝鋒槍後 `Loadout.Owned` 含 `"smg"`。
  - 再買兩把主武器時，第三把會取代目前手上那把。
  - 狙擊槍一槍打穿排成一列的 3 隻 Walker。
- 手動：每把槍的手感要有明顯差異。輕機槍連射最難控制，狙擊槍每槍都要重新瞄。

Commits：

- `refactor(player): merge weapon subclasses into a data-driven firearm`
- `feat(player): add two-primary one-secondary loadout`
- `feat(player): add smg, assault rifle, auto shotgun, sniper, lmg and revolver`
- `feat(player): support bullet penetration`
- `feat(core): add wall weapon purchase points`
- `feat(ui): add sniper scope overlay`

---

## 7. 階段 4：地圖開路

負責：C（圍欄、路障、互動、小地圖）、B（生成點、尋路）。對應需求 #1。

**範圍調整：** 設計書寫地圖要擴大到 120×120。P1 **不擴大地圖**，直接利用現有 90×90 裡的四個區域，用圍欄分區。這樣 `FlowField` 不用改大小，小地圖比例也不變。擴大地圖留到 P3。

### 7.1 分區

| Zone Id | 名稱 | 範圍 | 開路價 | 路障位置 |
|---|---|---|---|---|
| `start` | 便利商店街區（起點） | \|x\| ≤ 19 且 \|z\| ≤ 19 | — | — |
| `bus` | 公車總站 | x < 0、z > 0，起點以外 | $750 | 西側圍欄 (−19, 0, 9.5) |
| `park` | 公園 | x < 0、z < 0，起點以外 | $1000 | 西側圍欄 (−19, 0, −9.5) |
| `gas` | 加油站 | x > 0、z < 0，起點以外 | $1250 | 東側圍欄 (19, 0, −9.5) |
| `yard` | 貨櫃場 | x > 0、z > 0，起點以外 | $1500 | 東側圍欄 (19, 0, 9.5) |

圍欄（C，在 `OfflineTownSetup.World.cs` 建）：

- 起點外圍一圈：x = ±19、z = ±19 的正方形。外圈另外沿 x = 0（\|z\| > 19 的部分）與 z = 0（\|x\| > 19 的部分）各拉一道，從起點圍欄一直接到地圖外牆，把外圍切成四塊。
- 圍欄高 2.6 公尺，比玩家跳躍高度高。用 layer 8 的實心碰撞方塊，外觀是鐵絲網：細長立柱加半透明網面。
- **起點範圍內不能有圍欄穿過既有物件。** 貨櫃 (20, 20) 會壓到角落，要移到 (24, 22)。其他物件請用 `Physics.OverlapBox` 逐一檢查，有重疊就挪開，並在 DEVLOG 記錄挪了什麼。

路障（C）：

- 新增 `Barrier : MonoBehaviour, IPurchasable`，`HoldToBuy = true`。
- 按住 E 時，每 0.3 秒投入 $50（不超過剩餘金額）。畫面顯示「$450 / $1000」。投入的錢不退還，進度會保留。
- 投滿後：播 0.8 秒開門動畫（鐵捲門上升，或路障往旁邊滑開），關閉碰撞體，然後依序發布 `DoorOpened(zoneId)`、呼叫 `SessionServices.Enemies.RebuildPaths()`。
- 波次中、休息時都可以開路。

### 7.2 生成點（B）

- 新增 `SpawnPoint : MonoBehaviour`，欄位 `string ZoneId`。由 B 在 `OfflineTownSetup.Enemy.cs` 建立。
- `WaveDirector` 改成只從**已開區域**的生成點挑位置。先套用現有的「距離 16～55、不在玩家正前方」條件，都不符合時選最遠的。B 訂閱 `DoorOpened` 來維護已開區域的清單。
- 建議座標（建置時用 `Physics.CheckCapsule` 確認沒有卡在物件裡，卡住就往外推 1 公尺重試）：

| 區域 | 生成點 |
|---|---|
| start | (16, 16)、(−16, 16)、(16, −16)、(−16, −16) |
| bus | (−40, 40)、(−12, 40) |
| park | (−40, −40)、(−12, −42) |
| gas | (40, −40)、(42, −12) |
| yard | (40, 12)、(42, 42)、(12, 42) |

### 7.3 尋路（B）

- `FlowField` 加 `Rebuild()`：重新掃描 layer 8 的障礙物。`ZombiePool.RebuildPaths()` 先 `Physics.SyncTransforms()` 再呼叫它，然後讓下一次 `Update` 強制重算距離場（把 `_last` 設成 −1）。
- 驗收：開門前，從 bus 生成點到起點中心的 `Direction()` 為零向量或繞不進來；開門後可以走到。

### 7.4 各區內容（P1）

| 區域 | 設施 | 賣什麼 |
|---|---|---|
| start | 便利商店櫃台（休息時）、抽獎機 | 步槍、泵動霰彈槍、左輪、9mm、12 號、5.56、破片手榴彈、護甲、急救包、抽獎幣 |
| bus | 牆上武器（衝鋒槍）、彈藥箱 | 衝鋒槍、9mm 大量包（5 盒價 4.5 盒） |
| park | 投擲物販賣機 | 燃燒瓶、冷凍手榴彈、誘餌彈 |
| gas | 牆上武器（半自動霰彈槍） | 半自動霰彈槍、12 號 |
| yard | 軍火庫櫃台（隨時可用） | 突擊步槍、狙擊槍、輕機槍、7.62、背包升級 |

### 7.5 小地圖（C）

- 未開的區域畫成暗灰色斜線，已開的正常顯示。
- 標出設施圖示：櫃台、牆上武器、販賣機、路障（附價格）。
- 開門時，小地圖對應區塊閃爍 2 秒，並跳出提示「公車總站已開放：牆上有衝鋒槍」。

### 7.6 驗收

- 自動：
  - 開局時只有 start 的 4 個生成點啟用。
  - 給 $750 並對 bus 路障呼叫 `HoldTick` 直到投滿後：`DoorOpened("bus")` 被發布、圍欄碰撞體關閉、生成點增加到 6 個。
  - 錢不夠時，投到身上剩 $0 就停止，進度保留。
- 手動：開門後殭屍真的會從新區域穿過門口走進來。

Commits：

- `feat(prototype): fence the town into a start block and four zones`
- `feat(core): add hold-to-fund barriers that open zones`
- `feat(enemy): spawn only from opened zones and rebuild paths on door open`
- `feat(core): stock zone counters and wall weapons`
- `feat(ui): show locked zones and facilities on the minimap`

---

## 8. 階段 5：投擲物

負責：A（投擲、拋物線、彈體）、B（`Explode`、狀態、誘餌）。對應需求 #4。

### 8.1 操作（A）

- **按住 Q** 顯示拋物線預覽，**放開**丟出；按 X 切換種類。
- 預覽：LineRenderer 畫 30 個點，起點是攝影機前方 0.5 公尺。
  - 初速 `AimDirection × 16 + Vector3.up × 4`，重力 −18，每段用 SphereCast（半徑 0.1）偵測碰撞，碰到就停。
  - 落點畫一個圓圈，大小等於該投擲物的作用半徑。
- **破片手榴彈可以煮雷**：按下 Q 就開始計時，HUD 顯示剩餘引信秒數；引信歸零時在手上爆炸。
- 數量：總共最多 4 顆，每種最多 3 顆；背包每升一級，總數 +1。

### 8.2 彈體（A）

- 新增 `Player/ThrownProjectile.cs`：自己模擬拋物線，不用 Rigidbody，避免和 CharacterController 互相干擾。
- 碰撞用 SphereCast 偵測，碰到地面反彈 1 次（速度 ×0.35）後停住。
- 引信方式：計時或撞擊，由 `ThrowableConfig` 決定。
- 新增 `Player/ThrowableConfig.cs`（SO）：

```csharp
public enum ThrowableEffect { Frag, Fire, Frost, Decoy }
public sealed class ThrowableConfig : ScriptableObject
{
    public string Id, DisplayName; public ThrowableEffect Effect;
    public float Fuse; public bool ImpactFuse, Cookable;
    public float Radius, CenterDamage, EdgeDamage, SelfDamageCap, Duration;
    public int Price;
}
```

### 8.3 效果

| 投擲物 | 效果（A 呼叫的介面） | 引信 | 價格 |
|---|---|---|---|
| 破片手榴彈 | `Enemies.Explode`：半徑 5，中心 300、邊緣 60，對自己最多 40 | 3 秒，可以煮 | $200 |
| 燃燒瓶 | 落地產生半徑 3.5 的火區 6 秒，每 0.5 秒對範圍內的殭屍 `Ignite(3)`；玩家站在火區內每秒受 5 傷害 | 撞擊 | $250 |
| 冷凍手榴彈 | `Explode`：傷害 20，對範圍內上冰凍 3 層；中心 2 公尺內直接凍結 | 2 秒 | $300 |
| 誘餌彈 | `Enemies.AddLure(pos, 20, 6)`，6 秒後爆炸：半徑 6，250 傷害 | 6 秒 | $500 |

- 火區由 A 生成和管理：地上畫橘色圓圈加火焰粒子，用 `SessionServices.Effects` 的 Burst 持續噴。
- 視覺：爆炸用 `Effects.Ring`、`Burst`、`Sound("explosion")`；冷凍用藍白色 Ring。

### 8.4 B 需要提供的部分

- `ZombiePool.Explode(in ExplosionInfo)`：傷害依距離在中心與邊緣之間線性內插；擊退 `Knockback`；有 `Status` 時套用到每隻命中的殭屍；`SelfDamageCap > 0` 時也照距離傷害玩家，最多到上限。
- **冰凍狀態**（`ZombieActor : IStatusReceiver`）：
  - 每層減速 15%，最多 4 層，每層持續 4 秒，命中時刷新秒數。
  - 疊滿 4 層時**凍結** 2 秒：完全不動、不攻擊、受到的傷害 ×1.5、身體變成淺藍色。
  - 凍結中被爆頭會碎裂直接死亡（Boss 除外），播玻璃碎裂音效（向 C 提出需求）和白色碎片 Burst。
  - 和燃燒互相抵消：對燃燒中的目標上冰凍，會解除燃燒，而且只疊 1 層；對冰凍中的目標點火，會清除冰凍層數。
- **誘餌**：`AddLure` 記錄一份清單（位置、半徑、結束時間）。`Chase()` 決定目標時，如果在某個誘餌的半徑內，就改追誘餌位置；到達誘餌後原地揮手攻擊空氣。

### 8.5 驗收

- 自動：
  - 在 3 隻 Walker 中間引爆破片手榴彈，3 隻都受到 60 以上的傷害。
  - 冷凍手榴彈命中後，`FrostStacks == 3`；再補 1 層後 `Frozen == true`。
  - 誘餌啟動 2 秒後，範圍內殭屍到誘餌的距離變短。
- 手動：拋物線預覽和實際落點一致；煮雷的倒數看得清楚。

Commits：

- `feat(shared): …`（若 3.2 沒有加齊才需要）
- `feat(player): add throwable inventory, arc preview and cooking`
- `feat(player): add frag, molotov, frost and decoy throwables`
- `feat(enemy): add explosion falloff, frost status and lures`

---

## 9. 階段 6：主動技能與抽獎改版

負責：B（技能資料與效果、抽獎規則）、A（按鍵、Dash、Modifiers、Pin）、C（HUD）。對應需求 #5。

### 9.1 技能系統（B）

- 新增 `Enemy/AbilityConfig.cs`（SO，放在 `Assets/Data/Abilities/`）：
  - 欄位：`Id`、`DisplayName`、`Rarity`、`Cooldown`、`Description`
  - 每級數值：`float[] Values`，長度 3，例如半徑、持續時間
- 新增 `Enemy/AbilityEffects.cs`：抽象類別 `AbilityEffect`，方法 `Cast(int level)`。寫法比照 `UpgradeEffect`，透過 `SessionServices` 取得玩家和敵人。
- 新增 `Enemy/AbilityDirector.cs : MonoBehaviour, IAbilities`：
  - 技能欄一開始只有 1 格（F）。抽到被動「戰術擴充」後開第 2 格（C）。
  - 每格記錄 Id、等級、冷卻結束時間。
  - **重複抽到同一個技能就升級**，最多 Lv3。每級冷卻 −20%，效果依 `Values` 強化。
  - 冷卻時間 ＝ 基礎冷卻 × 0.8^(等級−1) × 冷卻修正（快速冷卻 −15%）。
  - 被動「殺意回饋」：每次擊殺，所有技能冷卻 −0.5 秒。
  - 施放時發布 `AbilityCast(id)`。
  - 冷卻結束的那一幀播提示音（`Sound("pick")`，之後 C 可以換專屬音效）。
- 遊戲暫停或不在 Playing／Break 階段時不能施放。

### 9.2 P1 的 6 個主動技能

| Id | 名稱 | 稀有度 | 冷卻 | Lv1 效果 | Lv3 效果 | 需要的介面 |
|---|---|---|---|---|---|---|
| `dodge` | 翻滾閃避 | 普通 | 6 秒 | 朝移動方向（沒移動就往前）衝 5 公尺，0.3 秒無敵 | 2 次充能 | `Player.Dash` |
| `slam` | 震地 | 普通 | 25 秒 | 半徑 6、80 傷害、擊退、硬直 1.5 秒 | 半徑 9，外加 2 層冰凍 | `Enemies.Explode`、`Stagger` |
| `frenzy` | 狂暴 | 稀有 | 45 秒 | 8 秒內射速 ×1.4、換彈速度 ×2、不消耗彈匣 | 擊殺延長 0.5 秒 | `Player.Modifiers` |
| `frostnova` | 冰霜新星 | 稀有 | 30 秒 | 自己周圍半徑 7 的敵人直接凍結 2 秒 | 凍結 3.5 秒 | `ApplyStatus` |
| `chain` | 鏈結閃電 | 稀有 | 15 秒 | 準心瞄準的目標受 150 傷害，再跳到 4 公尺內最近的下一隻，最多 5 隻，每跳 ×0.7，每隻硬直 0.4 秒 | 8 隻，不衰減 | `AimOrigin`、`AimDirection`、`Stagger` |
| `healfield` | 治療力場 | 稀有 | 40 秒 | 腳下放置半徑 4 的力場 8 秒，站在裡面每秒回 6 HP | 每秒 10 HP | `Player.Heal` |

- 鏈結閃電的視覺：每跳一次呼叫 `Effects.Bolt(from, to, 青白色, 0.15f)`。C 用 LineRenderer 物件池實作成鋸齒線。
- `dodge` 的無敵期間 `Hurt()` 直接 return（A）。
- `frenzy` 結束時 `Modifiers.Reset()` 會把其他效果也清掉。改成每個效果記錄自己改了哪些欄位，結束時只還原自己改的部分。

### 9.3 新增的被動（B）

- 戰術擴充（稀有）：開第 2 格技能欄。
- 快速冷卻（普通）：技能冷卻 −15%。
- 殺意回饋（稀有）：擊殺時所有技能冷卻 −0.5 秒。

### 9.4 抽獎改版（B）

- `UpgradeDirector.Draw()` 的卡池合併三種卡：被動、主動、詞綴（詞綴在階段 8 才做）。
  - 主動卡在已經 Lv3 之前都會留在卡池裡。
  - 主動卡的 `UpgradeOffer.Kind = Active`，`Level` 顯示「抽到後的等級」。
- 稀有度：沿用 0 = 普通、1 = 稀有、2 = 傳說，權重 60 / 30 / 10。
- **新手保證**：本局的前 2 次抽獎，3 張卡中至少有 1 張主動技能。
- **保底**：
  - 每 5 抽至少出現一張稀有以上（計數 `_sinceRare`）。
  - 每 15 抽保證一張傳說（`_sinceLegend`）。
  - 計數放在 `UpgradeDirector`，每局重置，透過 `IUpgrades.DrawsUntilLegend` 給 HUD 顯示。
- **重抽**：$300，每局每次 +$150。抽獎畫面上加一顆「重抽」按鈕（C），扣 `RerollCost` 後呼叫 `IUpgrades.Reroll()`。
- **技能欄滿時**又選了新的主動技能：跳出第二層選單「替換哪一格：[F：技能名] [C：技能名] [放棄]」（C 畫、B 處理）。

### 9.5 A 的部分

- `PlayerController`：
  - 按 F → `SessionServices.Abilities?.TryCast(0)`；按 C → `TryCast(1)`。
  - 實作 `Dash`：在 0.18 秒內用 `CharacterController.Move` 走完距離，會被牆擋住，期間無敵。
  - 實作 `Modifiers`：移速 × `Modifiers.MoveSpeed`；受到的傷害 × `DamageTaken`。
- `Weapon`：射擊間隔 ÷ `FireRate`；換彈時間 ÷ `ReloadSpeed`；`FreeAmmo` 時不扣彈匣。

### 9.6 HUD（C）

- 準心下方 60 px 畫技能圖示：圓角方塊，裡面寫技能名稱的第一個字。
- 冷卻中蓋一層由上往下縮短的暗色遮罩，並寫剩餘秒數；冷卻好時邊框閃一下。
- 抽獎卡片依類型換邊框顏色：主動紫色 `#B57CFF`、被動沿用流派色、詞綴金色。
- 卡片上方顯示「距離傳說保底 N 抽」。

### 9.7 驗收

- 自動：
  - 給玩家 `dodge` 後 `TryCast(0)` 成功，玩家位移約 5 公尺；立刻再放一次會失敗；6 秒後成功。
  - `slam` 對半徑內 3 隻 Walker 各造成 80 傷害。
  - 連續 15 次 `Draw()`，至少出現一次稀有度 2 的卡。
  - 新局的第 1、2 次 `Draw()` 都至少有 1 張主動卡。
- 手動：冷卻圖示好讀；技能有手感，例如閃避有鏡頭往前推的感覺。

Commits：

- `feat(enemy): add ability director, cooldowns and leveling`
- `feat(enemy): add dodge, slam, frenzy, frost nova, chain and heal field`
- `feat(enemy): add active cards, pity counters and reroll to the draw`
- `feat(player): cast abilities and apply dash and modifiers`
- `feat(ui): show ability cooldowns and card kinds`

---

## 10. 階段 7：殭屍多樣化

負責：B。對應需求 #6。

### 10.1 先重構狀態機

`ZombieActor` 現在用 `_special` 整數加一大串 if 判斷，要改成「每種殭屍一個行為類別」：

```csharp
public abstract class ZombieBehavior
{
    public virtual void OnSpawn(ZombieActor self) { }
    public abstract bool TryStartSpecial(ZombieActor self);   // 回傳 true 表示進入特殊動作
    public abstract bool TickSpecial(ZombieActor self);       // 回傳 false 表示特殊動作結束
    public virtual float ArmPose(ZombieActor self) => -65;     // 動畫用
    public virtual bool UsesMeleeSlots => true;
}
```

- 對應關係：Walker → `MeleeBehavior`；Runner → `ChargerBehavior`；Tank → `SlamBehavior`；Exploder → `ExploderBehavior`。
- `ZombieActor` 保留移動、路徑、受傷、死亡、顏色這些共用邏輯，用 `internal` 方法開放給行為類別使用：`Move`、`PathDirection`、`HurtPlayer`、`Distance`、`HasLineOfSight`。
- 新增 `public string ActionName`，例如 `"idle"`、`"charge-windup"`、`"slam"`，取代驗收程式用反射讀 `_special` 的作法。`OfflineValidation` 要一起改成讀 `ActionName`。
- **重構完、還沒加新內容之前，先跑一次驗收**，確認四種殭屍的行為完全沒變，再 commit。

### 10.2 走位多樣化

解決「一直線直接掃」。每隻殭屍生成時隨機決定個性，數值放 `EnemyConfig`：

| 欄位 | 預設 | 說明 |
|---|---|---|
| `SpeedVariance` | 0.15 | 速度 × U(0.85, 1.15) |
| `WobbleAmplitude` | (0, 0.6) | 蛇行左右幅度，單位公尺；Runner 用 (0.3, 0.9) |
| `WobblePeriod` | (1.5, 3) | 蛇行週期，單位秒 |
| `LungeChance` | 0.25 | Walker 距離 8 公尺內時，**一次性**判定要不要撲過來 |
| `LungeSpeed` | 2.5 | 撲過來時速度倍率，持續 0.5 秒 |
| `LungeWindup` | 0.35 | 撲之前低吼、雙手張開的預告時間 |

- 蛇行：距離玩家大於 4 公尺時，在移動方向的垂直方向加 `sin(t × 2π / 週期) × 幅度` 的偏移速度；4 公尺內不蛇行，以免攻擊判定不穩。
- 撲擊：預告期間停下、手臂舉到 −110°、播放 `groan` 音效（pitch 0.8），然後衝刺 0.5 秒。命中只算一般攻擊，不額外加傷害。
- 現有的分離力、環形包圍點、攻擊名額全部保留。

### 10.3 新殭屍（P1：4 種）

外型都先用方塊拼，正式模型在 V4。生成數值見附錄 15.3。

**爬行者 Crawler（第 2 波起）**

- 身體壓低到 0.6 公尺高：沒有腿，用手臂往前拖。
- `Head` 碰撞體高度 0.5 公尺，很難爆頭。
- 行為等同 `MeleeBehavior`，攻擊 8。
- 預告：低沉的拖行聲，用 `step` 音效加 pitch 0.6。

**吐酸者 Spitter（第 5 波起）**

- 和玩家保持 8～20 公尺的距離：太近就後退，太遠就靠近。
- 有視線、冷卻 4 秒時：停下 0.8 秒預告（頭部放大到 1.3 倍並發綠光，播 `groan` 音效，pitch 1.4）。
- 預告結束後，朝「預告開始時玩家的位置」吐出一顆綠色酸球：拋物線，飛行 1 秒。
- 落地產生半徑 2.5 的酸池 4 秒：綠色 Ring，玩家在裡面每秒受 10 傷害。
- 不使用近戰攻擊名額（`UsesMeleeSlots = false`）。

**屍蝠 Bat（第 7 波「屍蝠夜」主力，第 8 波起混入其他波）**

- **一次生成 5 隻**作為一群，每隻 25 HP，速度 6。
- 外型：深色小身體，兩片翅膀每秒拍 8 次，紅色眼睛。用一個叫 `Body` 的碰撞體，所以**打中不算爆頭**。
- 飛行：
  - 行為覆寫移動，不加重力；平常在高度 3.5 公尺巡航，直接飛向玩家，不走尋路。
  - 水平距離小於 6 公尺時俯衝，目標是玩家頭部高度（1.6 公尺）。
  - 接觸到玩家時咬一口，6 傷害，然後爬升回巡航高度並繞到別的方向，2 秒後才能再俯衝。
- `Flying = true`，不受分離力影響地面的殭屍。
- 屍蝠夜：`WaveRecipe.Kind` 在 `wave % 7 == 0` 且不是 Boss 波時回傳 `BatNight`；組成 70% 屍蝠群、30% Walker；`NightVolume` 的曝光 −0.3（要 C 協助，透過事件通知）。
- 小地圖上用紫色小點顯示屍蝠。

**撲擊者 Leaper（第 10 波起）**

- 6～12 公尺、有視線、冷卻 6 秒時：蹲低 0.6 秒預告（身體 y 縮放到 0.8，播 `scream` 音效，pitch 1.3）。
- 預告後朝玩家位置跳躍：拋物線，0.6 秒到達。
- 落地時距離玩家 1.5 公尺內，就**壓制**玩家：呼叫 `Player.Pin(this)`。
  - 玩家不能移動、不能開槍，但可以轉視角。
  - 壓制期間每秒受 15 傷害。
  - **連按 E 8 下可以掙脫**，進度每秒衰減 0.5 下。HUD 顯示進度條（C）。
  - 掙脫後 Leaper 被推開 3 公尺，硬直 1.5 秒。
  - 爆炸、閃電等其他來源造成 Leaper 最大 HP 30% 以上的傷害時，也會解除壓制。
- 沒撲中：落地硬直 1 秒。這是反擊的好時機。

### 10.4 波次組成

`WaveConfig` 改成一份清單，每一筆包含：種類、從第幾波開始、權重。`BrowserComposition` 的寫法改成照清單加權抽籤：

| 種類 | 開始波次 | 權重 |
|---|---|---|
| Walker | 1 | 60 |
| Runner | 2 | 25 |
| Crawler | 2 | 15 |
| Exploder | 3 | 12 |
| Tank | 4 | 6 |
| Spitter | 5 | 10 |
| Bat（一群算 1 筆，生成 5 隻） | 8 | 6 |
| Leaper | 10 | 8 |

- 保留現有的特例：
  - 第 3 波第一隻一定是 Exploder，第 4 波第一隻一定是 Tank
  - 每 3 波是衝刺波（70% Runner），每 5 波是 Boss 波
- 新增特例：
  - 第 2 波第一隻是 Crawler，第 5 波第一隻是 Spitter，第 10 波第一隻是 Leaper
  - 每種新殭屍第一次出現時，`GameNotice` 跳出教學提示，沿用現有 `_seen` 機制
- 第 1 波的數量和組成**不變**，因為驗收程式檢查 `Remaining == 10`。

### 10.5 隨波次成長

寫在 `WaveRecipe`（Shared，純邏輯），並加進 `PureChecks`：

```csharp
public static float HealthMultiplier(int wave) => wave <= 10 ? 1 + 0.12f * (wave - 1) : 2.08f * (float)Math.Pow(1.08, wave - 10);
public static float DamageMultiplier(int wave) => Math.Min(1.6f, 1 + 0.03f * (wave - 1));
public static float SprinterRatio(int wave) => Math.Max(0, Math.Min(0.5f, 0.05f * (wave - 3)));
```

- `WaveDirector` 生成時把血量倍率和傷害倍率傳給 `ZombiePool.Spawn`。`Spawn` 加 `damageMultiplier` 參數，`HurtPlayer` 乘上它。
- 公式裡的係數（0.12、2.08、1.08、0.03、1.6、0.05、0.5）要放進 `WaveConfig`，`WaveRecipe` 改成接收參數，不要寫死。
- **奔跑 Walker**：Walker 生成時，依 `SprinterRatio` 的機率變成奔跑型：速度 ×1.7、手臂往前伸 −95°、步伐加快。
- 取代 `WaveConfig.HealthGrowth` 的線性 7%。

### 10.6 驗收

- 自動：
  - 重構後四種殭屍的既有檢查全過。
  - 每種新殭屍各生成 1 隻，在 15 秒內至少觸發一次特殊動作（看 `ActionName`）。
  - Leaper 壓制後 `Player.Pinned == true`；模擬按 8 下 E 之後變回 false。
  - `HealthMultiplier(10) ≈ 2.08`、`HealthMultiplier(15) ≈ 3.06`。
- 手動：
  - 10 隻 Walker 不再排成一直線。
  - 吐酸的預告看得出來，橫移就躲得掉。
  - 屍蝠要抬頭才打得到。

Commits：

- `refactor(enemy): move per-kind zombie actions into behavior classes`
- `feat(enemy): add speed variance, weaving and lunges`
- `feat(enemy): add crawler and spitter`
- `feat(enemy): add flying bat swarms and bat night`
- `feat(enemy): add leaper pin attack`
- `feat(shared): add wave health and damage growth curves`
- `feat(enemy): weight wave composition by data`
- `feat(ui): show pin escape progress and bat markers`（C）

---

## 11. 階段 8（P2）：配件、元素、精英

時間夠才做。完整內容見設計書第 3.4、5.4、6.4、7.3、7.4 節。這裡只列實作要點。

### 11.1 配件與改裝工作台（A＋C）

- `AttachmentConfig`（SO）：`Id`、`Slot`（Optic、Muzzle、Grip、Magazine、Stock、Laser）、適用的武器 Id 清單、價格，以及對 `WeaponStats` 的乘數：垂直後座、水平後座、ADS FOV、開鏡時間、彈匣、換彈、腰射擴散、移動擴散懲罰。
- `Weapon` 記錄每個槽位裝了什麼；`WeaponStats` 計算時把乘數乘上去。
- 槍模上的掛點：`Mount_Optic`、`Mount_Muzzle`、`Mount_Grip`、`Mount_Mag`。在掛點下生成配件的方塊模型。
- 工作台（C）：放在貨櫃場，是一個 `IPurchasable`，打開時暫停遊戲。
  - 左邊列出擁有的武器，右邊列出槽位與可以買的配件。
  - 每個選項顯示數值變化，例如「垂直後座 2.1° → 1.3°」。
  - 需要 `ILoadout` 提供讀取和安裝配件的方法（Shared 修改）。
- 便利商店只賣紅點和擴充彈匣。

### 11.2 元素統一（Shared＋B）

- 加入感電：0.4 秒硬直，跳到 4 公尺內，最多 3 次，每跳 ×0.7；同一隻 1 秒內只觸發一次。
- `chain` 技能改成使用感電狀態。
- 武器詞綴（霜咬、引燃）、冰凍彈頭都透過 `IStatusReceiver` 套用。

### 11.3 精英殭屍（B）

- 第 6 波起，每隻非 Boss 殭屍有 `min(5% + 1% × (波次 − 6), 20%)` 的機率成為精英：HP ×2.5、金錢 ×3、抽獎幣掉落率 ×3。
- 詞綴：迅捷、裝甲、分裂、炎爆，各自寫成一個 `EliteAffix` 類別。
- 外觀：外框發光（emission ×2），頭上浮一個詞綴字樣。

---

## 12. 美術軌道 V1–V5

和玩法階段平行進行。**原則：視覺和碰撞分離。** 碰撞一律維持現在的簡單方塊（可以把 Renderer 關掉），模型只負責外觀。這樣換模型不會影響尋路、射線、遊戲平衡，沒有素材的組員也能照常建置。

### V1 光照與後處理（C，馬上可以做，不需要任何素材）

修改 `Assets/Settings/PrototypeRenderer.asset`、`NightVolume.asset`，以及 `OfflineTownSetup.World.cs` 裡的燈光。這些不屬於 ProjectSettings，可以改。

| 項目 | 設定 |
|---|---|
| SSAO | Renderer 加 Screen Space Ambient Occlusion：Intensity 1.2、Radius 0.35、Direct Lighting Strength 0.25、Normals 用 Depth Normals |
| Decal | Renderer 加 Decal feature，Technique 選 Screen Space（給 V3 貼血跡、裂縫用） |
| 色調映射 | NightVolume 加 Tonemapping：ACES |
| Bloom | Threshold 1.0、Intensity 0.6、Scatter 0.65 |
| 白平衡 | Temperature −10，讓夜晚偏冷 |
| 月光 | 方向光顏色 `#9DB4FF`，強度 0.35，柔和陰影 |
| 超商室內 | 天花板 4 盞點光源，`#FFF2DC`，強度 2.5，範圍 8 |
| 超商窗戶 | 玻璃材質加暖色自發光 `#FFE3B0` × 1.5，從外面看得到裡面亮著燈 |
| 路燈 | 保留 `#FFC48A`，地面加一圈較亮的光暈 Decal |
| 反射探針 | 超商中央放一個 Box 反射探針，大小 20×6×14，Baked |
| 霧 | 現在是線性霧 40～115 公尺、顏色 `#232B36`。改成 25～90 公尺、顏色 `#1A2230`，目標是 40 公尺外的建築只剩輪廓 |
| 抗鋸齒 | 主攝影機 Anti-aliasing 從 None 改成 SMAA High（MSAA 4× 保留） |

- **烘焙光照（選做，要先問使用者）**：把環境方塊標成 Static，在 `Build()` 最後呼叫 `Lightmapping.Bake()`。烘焙超過 5 分鐘或出現明顯瑕疵就放棄，改用光源探針。
- **截圖工具**：新增 `Assets/Editor/ArtCapture.cs`（選單 `Tools/Zombie Co-op/Capture Art Views`），從 4 個固定視角各輸出一張 PNG 到 `Logs/ArtCaptures/`：超商正面、超商內部、十字路口、加油站。每個 V 階段做完都截一次，讓使用者比較前後差異。

驗收：使用者看截圖確認；`OfflineValidation` 全過；Windows 版在使用者電腦上維持 60 FPS 以上。

### V2 招牌與文字（C）

- **先問使用者**：要匯入 TMP Essential Resources（`Window > TextMeshPro > Import TMP Essential Resources`），這會新增 `Assets/TextMesh Pro/`。
- `Sign()` 改用 `TextMeshPro`（3D 版本，不是 UGUI 版本），用 SDF 字型，字面顏色用 HDR 讓 Bloom 產生霓虹光。
- 招牌加燈箱背板：深色方塊，邊緣加細長的發光條。
- 招牌維持英文，例如 ZOMBIE MART。需要中文字時，請使用者提供 Noto Sans TC（OFL 授權），再產生動態 SDF 字型資產。
- HUD 先維持 IMGUI，不在這個階段改。

### V3 環境素材（C，等使用者決定）

1. **先問使用者選哪一套素材**，並列出選項：
   - Kenney City Kit 系列（CC0）
   - Quaternius（CC0）
   - Synty POLYGON 系列（付費）
   - 只換貼圖：ambientCG 或 Poly Haven 的 PBR 貼圖（CC0）
   - **全遊戲只用一個系列**，不要混用。
2. 素材由使用者下載，放在 `Assets/ThirdParty/<素材包名>/`。**不要修改這個資料夾裡的檔案。**
3. 新增 `Core/EnvironmentKit.cs`（SO）：一份「key → prefab」的對照表。
   - key 例如：`shelf`、`fridge`、`counter`、`register`、`gacha`、`street_lamp`、`bus`、`car_wreck`、`container`、`fence`、`barricade`、`tree`、`bench`、`trash_bin`、`gas_pump`、`store_shell`
   - 建置程式提供 `Place(key, position, rotation, scale, fallback)`：表裡有 prefab 就生成 prefab，並把對應碰撞方塊的 Renderer 關掉；沒有就照舊畫方塊。
4. 自己的包裝 prefab 放在 `Assets/Art/Prefabs/Environment/`。素材的縮放、旋轉、材質替換都在包裝 prefab 裡處理。
5. 超商要有：
   - 外觀：玻璃門窗、燈箱招牌、雨遮
   - 室內：貨架與商品、冰櫃（自發光）、收銀台（取代交易櫃台的外觀）、天花板燈管、地磚
   - 抽獎機的外觀換成扭蛋機
6. 街道要有：路緣石、人行道、斑馬線、廢棄車輛（同時當掩體，要加碰撞）、垃圾桶、路障。7.1 的路障直接用素材的鐵捲門或水泥路障。
7. Decal：血跡、裂縫、油漬、道路標線，每種準備 3～4 張，隨機旋轉散布。
8. **每用一個素材，就在 `Assets/Art/CREDITS.md` 記錄名稱、作者、授權、網址。**
9. **大檔案**：素材加起來超過 50 MB，或單檔超過 10 MB 時，停下來問使用者要不要設定 Git LFS。這需要改 `.gitattributes`。

驗收：截圖比較；碰撞和尋路沒變（`OfflineValidation` 全過）；FPS ≥ 60。

### V4 殭屍模型與動畫（B）

1. 使用者提供有骨架的人形模型：Quaternius、Synty 的殭屍，或 Mixamo 角色。動畫用 Mixamo 的殭屍動畫或素材包附的動畫：Walk、Run、Crawl、Attack、Scream、Slam、Death。
2. 匯入設定：Rig 選 Humanoid；動畫 Loop Time 勾選走路類動畫。
3. Animator Controller 放 `Assets/Art/Animations/Zombie.controller`：
   - 參數：`Speed`（float）、`Action`（int，對應 `ActionName`）、`Dead`（trigger）
   - Crawler、Bat 各自一個 Override Controller
4. `ZombieActor`：
   - 有 Animator 時餵參數，沒有時沿用現在手動擺手腳的 `Animate()`，保留兩種模式。
   - 上色改成對所有 `SkinnedMeshRenderer` 設 `_BaseColor` 和 `_EmissionColor` 的 property block，不再只找名字叫 Head、Torso 的物件。
5. **碰撞體**：
   - 頭骨下掛 BoxCollider，命名 `Head`；脊椎下掛 CapsuleCollider，命名 `Torso`；都在 **layer 11（`EnemyHitbox`）**。
   - 根物件維持 layer 2。
   - `Awake()` 已經會讓 CharacterController 忽略子碰撞體，保留這段。
6. 屍體：`OfflineEffects.Fallen()` 要支援 `SkinnedMeshRenderer`，用 `BakeMesh` 產生靜態網格。這是 C 的檔案，要請 C 改，或經同意後以 C 的身分改。
7. 不同種類用不同材質顏色和縮放來區分（Runner 瘦高、Tank 巨大、Spitter 頸部腫大），沿用 `EnemyConfig.Skin`、`Shirt`、`ModelScale`。
8. 驗收：
   - 爆頭判定仍然正確：驗收程式射擊頭部，確認 `Headshot == true`
   - 每種殭屍的預告動作看得出來
   - 50 隻同時在場仍然 ≥ 60 FPS

### V5 第一人稱槍模（A）

1. 使用者提供槍模，風格要和 V3 同一系列。
2. 每把槍做一個包裝 prefab，放在 `Assets/Art/Prefabs/Weapons/`。子物件要有：
   - `Muzzle`：槍口，掛火光
   - `SightAnchor`：ADS 對準點
   - 4 個配件掛點 `Mount_*`
3. layer 一律設 14。建置程式的槍模改成用 prefab，沒有 prefab 時用方塊。
4. 加彈殼拋出：小圓柱，往右上飛 0.6 秒後消失，用物件池管理。
5. 換彈動作：彈匣往下掉、新彈匣插上。用程式做簡單位移即可，不需要動畫檔。
6. 驗收：ADS 時瞄準點在畫面正中央；槍口火光的位置正確。

---

## 13. 驗收方法

### 13.1 自動驗收

在 PowerShell 執行（先確認 Editor 沒有開著這個專案）：

```powershell
& "C:\Program Files\Unity\Hub\Editor\6000.3.26f1\Editor\Unity.exe" -batchmode -projectPath "C:\Users\nick0\Desktop\Claude_repo\AOOP_UnityPrototype" -executeMethod ZombieCoop.EditorTools.OfflineValidation.BuildAndRun -logFile "C:\Users\nick0\Desktop\Claude_repo\AOOP_UnityPrototype\Logs\offline-validation.log"
```

- exit code 0 表示通過。失敗時到 log 裡搜尋 `PASS:` 和 `Exception`。
- 要輸出 Windows 版時改用 `BuildAndVerify`，接著執行 `Tests/Check-OfflineBuild.ps1`。
- 純邏輯測試：`Tests/Check-PureLogic.ps1`。需要 PowerShell 7（`pwsh`）；這台電腦只有 5.1 時無法執行，要在 DEVLOG 註明。
- **每個階段都要把該階段「驗收」小節列的自動檢查寫進 `OfflineValidation`。** 總時間上限目前是 80 秒，檢查變多時可以調高，並在 DEVLOG 記錄。

### 13.2 手動試玩清單

每個階段做完，請使用者實際玩 1 局到第 5 波以上，並回答：

1. 有沒有錯誤訊息或卡住？
2. 這個階段的新東西，有沒有在不看說明的情況下看懂怎麼用？
3. 數值是不是太強或太弱？例如錢夠不夠用、後座力能不能控制。
4. 有沒有讓之前的功能變差？

把回答記到 DEVLOG，數值調整另外開 commit（`fix(balance): ...`，依模組改成 `fix(player)`、`fix(enemy)` 等）。

### 13.3 經濟檢查

階段 4 完成後，加一個除錯用的收入紀錄：按 F1 開關，顯示每波的收入與支出分類。對照設計書 8.2 的目標節奏：

- 第 3 波結束約 $1,500
- 第 6 波結束約 $5,000

差太多就調整擊殺獎金和清波獎金。

---

## 14. Commit 範例

一個 commit 只做一件事，只含一個模組。依序大致如下（每行一個 commit）：

```
（階段 0 的 9 個 commit 見 3.4）
feat(player): derive recoil from damage with delayed partial recovery
feat(player): add aim-down-sights with fov, spread and speed changes
feat(ui): hide crosshair while aiming
feat(player): add caliber inventory and pull reloads from it
feat(core): drive shop offers from shop item assets
feat(core): add proximity interaction scanner
feat(ui): add backpack panel and tabbed shop
refactor(player): merge weapon subclasses into a data-driven firearm
feat(player): add two-primary one-secondary loadout
feat(player): add smg, assault rifle, auto shotgun, sniper, lmg and revolver
feat(core): add wall weapon purchase points
feat(prototype): fence the town into a start block and four zones
feat(core): add hold-to-fund barriers that open zones
feat(enemy): spawn only from opened zones and rebuild paths on door open
feat(player): add throwable inventory, arc preview and cooking
feat(enemy): add explosion falloff, frost status and lures
feat(enemy): add ability director, cooldowns and leveling
feat(enemy): add active cards, pity counters and reroll to the draw
refactor(enemy): move per-kind zombie actions into behavior classes
feat(enemy): add crawler and spitter
feat(enemy): add flying bat swarms and bat night
feat(enemy): add leaper pin attack
feat(core): add ssao, tonemapping and store lighting
test(prototype): cover <階段> in offline validation
docs: record <階段> results in devlog
```

commit 訊息不加任何 attribution 或 Co-authored-by 尾註，除非使用者另外要求。push 前一定要讓使用者看過 diff。

---

## 15. 附錄：數值表

所有數值都要寫進 ScriptableObject，這裡是初始值。

### 15.1 武器

後座力由 4.1 的公式算出，表中的值僅供核對。擴散是 tan 值，現有手槍是 0.004。

| Id | 名稱 | 欄位 | 口徑 | 傷害 | 彈丸 | 間隔 | 自動 | 彈匣 | 換彈 | 擴散 | 係數 | 垂直後座 | 穿透 | ADS FOV／秒 | 價格 | 地點 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pistol` | 手槍 | 副 | 9mm | 34 | 1 | 0.16 | 否 | 12 | 1.1 | 0.004 | 1.0 | 2.0° | 0 | 62 / 0.2 | 起始 | — |
| `revolver` | 左輪 | 副 | 7.62 | 90 | 1 | 0.5 | 否 | 6 | 2.2 | 0.003 | 1.0 | 5.4° | 1 | 60 / 0.22 | $600 | start |
| `rifle` | 步槍 | 主 | 5.56 | 24 | 1 | 0.095 | 是 | 30 | 1.7 | 0.006 | 0.9 | 1.3° | 0 | 58 / 0.25 | $450 | start |
| `pump` | 泵動霰彈槍 | 主 | 12 號 | 15 | 9 | 0.85 | 否 | 6 | 2.1 | 0.065 | 0.5 | 4.1° | 0 | 65 / 0.25 | $700 | start |
| `smg` | 衝鋒槍 | 主 | 9mm | 20 | 1 | 0.065 | 是 | 32 | 1.6 | 0.009 | 0.8 | 1.0° | 0 | 62 / 0.2 | $800 | bus |
| `autoshotgun` | 半自動霰彈槍 | 主 | 12 號 | 14 | 8 | 0.3 | 否 | 8 | 2.6 | 0.07 | 0.5 | 3.4° | 0 | 65 / 0.28 | $1800 | gas |
| `ar` | 突擊步槍 | 主 | 5.56 | 38 | 1 | 0.1 | 是 | 30 | 2.0 | 0.005 | 0.9 | 2.1° | 1 | 55 / 0.27 | $1600 | yard |
| `sniper` | 狙擊槍 | 主 | 7.62 | 220 | 1 | 1.2 | 否 | 5 | 3.0 | 0.05（腰射） | 0.45 | 5.9° | 3 | 30 / 0.35 | $2200 | yard |
| `lmg` | 輕機槍 | 主 | 7.62 | 40 | 1 | 0.08 | 是 | 100 | 5.0 | 0.012 | 0.7 | 1.7° | 1 | 58 / 0.32 | $3000 | yard |

- 輕機槍移速 ×0.85。狙擊槍開鏡時擴散 ×0.02，接近零。
- 左輪的後座力 5.4° 是公式算出來的，比設計書高。這是有意的：高傷害單發槍就該難控。試玩後可以調低係數。

### 15.2 彈藥

| 口徑 | 每盒 | 價格 | 背包上限（Lv0） | 開局 |
|---|---|---|---|---|
| 9mm | 30 | $40 | 180 | 36 |
| 12 號 | 8 | $50 | 40 | 0 |
| 5.56 | 30 | $60 | 240 | 0 |
| 7.62 | 20 | $90 | 100 | 0 |

- 買槍時附 2 個彈匣的子彈，不超過上限。
- 背包升級 Lv1／Lv2／Lv3：$500／$900／$1400，每級上限 ×1.25（相對 Lv0 累乘），投擲物總數 +1。

### 15.3 新殭屍

| 種類 | HP | 速度 | 攻擊 | 冷卻 | 金錢 | 分數 | 抽獎幣機率 | 縮放 |
|---|---|---|---|---|---|---|---|---|
| Crawler | 60 | 1.5 | 咬 8 / 0.9 秒 | — | $15 | 120 | 5% | 1.0（高 0.6） |
| Spitter | 120 | 1.8 | 酸池 10/秒 | 4 秒 | $40 | 250 | 10% | 1.05 |
| Bat（每隻） | 25 | 6 | 咬 6 | 2 秒 | $8 | 60 | 2% | 0.5 |
| Leaper | 180 | 3.5 | 壓制 15/秒 | 6 秒 | $70 | 350 | 12% | 0.95 |

以上數值都會再乘上 10.5 的血量與傷害成長倍率。

### 15.4 便利商店起始清單

| Id | 名稱 | 類型 | 價格 | 內容 |
|---|---|---|---|---|
| `buy_rifle` | 步槍 | Weapon | 450 | `rifle` |
| `buy_pump` | 泵動霰彈槍 | Weapon | 700 | `pump` |
| `buy_revolver` | 左輪 | Weapon | 600 | `revolver` |
| `ammo_9` | 9mm ×30 | Ammo | 40 | Nine 30 |
| `ammo_12` | 12 號 ×8 | Ammo | 50 | Shell 8 |
| `ammo_556` | 5.56 ×30 | Ammo | 60 | FiveFiveSix 30 |
| `frag` | 破片手榴彈 | Throwable | 200 | `frag` |
| `armor` | 護甲 +50 | Armor | 沿用 SessionConfig | — |
| `medkit` | 急救包 | Medkit | 沿用 SessionConfig | — |
| `token` | 抽獎幣 | Token | 沿用，每次漲價 | — |

### 15.5 投擲物與技能

見 8.3 與 9.2 的表格。
