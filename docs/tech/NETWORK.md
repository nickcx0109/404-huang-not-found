# 連線設計（G8）

2026-11-24 定案。G8 的每一項都先讀這份。

## 架構：server 跑遊戲（authoritative server）

```
 瀏覽器（最多 3 個）                    雲端 Node server（server/）
 ┌───────────────────────┐   WebSocket   ┌───────────────────────────────┐
 │ PlayerController      │ ── input ───▶ │ RoomServer                    │
 │  自己的移動在本地算    │ ── action ──▶ │  rooms: Map<code, Room>       │
 │ NetClient             │ ◀─ snapshot ─ │ Room                          │
 │ SnapshotBuffer（補間） │ ◀─ event ──── │  GameSession（和單機同一個類別）│
 │ 畫面、HUD、音效        │               │  每秒 30 步模擬、20 次快照     │
 └───────────────────────┘               └───────────────────────────────┘
```

- **Session 是唯一的裁判。** 傷害、擊殺、波次、撿東西、救人都由 server 上的 `GameSession` 決定，瀏覽器不自己判定。
- **單機不變。** 沒連線時照舊在瀏覽器裡跑 `GameSession`。兩邊共用同一個建構函式 `createSession()`（G8b），不准複製一份遊戲邏輯到 server。
- **server 端不能 import three.js 或碰 DOM。** 遊戲邏輯（`web/js/game`、`entities`、`enemies`、`player/CombatPlayer`、武器的邏輯類別、`CollisionWorld`、`PathFinder`、`LevelData`）已經可以在 Node 跑（見 `test/GameSession.test.js`）。用到 three.js 的類別（`PlayerController`、各種 `*View`、`WeaponModel`）只在瀏覽器用。
- **為什麼不是「玩家的瀏覽器當 Host」：** 多一趟轉送，延遲大約兩倍；Host 分頁切到背景時瀏覽器會暫停動畫迴圈、把計時器壓到約每秒一次，全隊會卡住。

## 隊伍編號

- 建房間的人拿到 4 碼編號，字元只用 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（去掉容易看錯的 0 O 1 I L）。
- 最多 3 人；遊戲開始後不能再加入（G8 先不做中途加入）。
- 房間裡最後一個人離開，房間就刪掉。建房的人離開不會解散房間（server 跑遊戲，誰走都一樣）。
- 一個連線同時只在一個房間。

## 協定

JSON 文字訊息，每則都有 `t`（type）。數字座標四捨五入到小數點後 2 位，角度用弧度、小數點後 3 位。

### Client → Server

| `t` | 欄位 | 說明 |
|---|---|---|
| `create` | `name`, `level` | 建房間；`level` 是 `web/levels/` 的檔名（不含 `.json`） |
| `join` | `name`, `code` | 加入房間 |
| `leave` | | 離開房間 |
| `start` | | 房間裡任何人都可以按開始 |
| `ping` | `c`（client 時間 ms） | 對時用，server 回 `pong` |
| `input` | `seq`, `x`, `z`, `y`, `yaw`, `pitch` | 每秒 30 次，自己算好的位置和視角 |
| `action` | `seq`, `kind`, `at`, 其他 | `kind`：`fire`、`reload`、`secondary`、`switch`（`index`）、`cycle`（`step`）、`pickup`、`revive`（`holding`）。`at` 是 client 估計的 server 時間（ms），開槍倒回時間用 |

### Server → Client

| `t` | 欄位 | 說明 |
|---|---|---|
| `room` | `code`, `you`（玩家 id）, `players:[{id,name}]`, `level`, `state` | 進房間或名單變動時送 |
| `error` | `code`：`no-room`、`full`、`started`、`bad-message`、`bad-level`、`start-failed`、`server-error` | 被拒絕的原因；`start-failed` 是遊戲沒能開始（例如關卡載入失敗），房間裡每個人都會收到，房間留在 `lobby`，可以再按一次開始；`bad-level` 是 `create` 的 `level` 不在 server 啟動時讀到的 `web/levels/*.json` 裡；`server-error` 是 server 處理這則訊息時出錯，狀態維持原樣（例如建房失敗時人還在原本的房間） |
| `pong` | `c`, `s`（server 時間 ms） | 對時 |
| `snapshot` | `tick`, `time`（server ms）, `ack`（這個玩家最後處理的 input `seq`）, `state`, `wave`, `kills`, `players:[…]`, `enemies:[…]`, `pickups?`，以及 HUD 用的 `goal`, `objective`, `breakSeconds` | 每秒 20 次 |
| `event` | `name`（`game/events.js` 的事件名）, `detail` | 需要立刻反應的事件：開槍、命中、死亡、倒地、波次開始、撿到東西。只送畫面和音效需要的欄位 |

快照裡的玩家：`{id, x, y, z, yaw, pitch, health, downed, alive, weapon, ammo, reserve}`；殭屍：`{id, type, x, z, yaw, health, state}`。

- 快照：`tick` 是 server 的模擬步數，`time` 是那一步的 server 時間（和 `pong.s` 同一個時鐘）。`health` 也四捨五入到小數點後 2 位。
- 玩家的 `ammo`、`reserve`：`ammo` 是 `null` 表示這把武器沒有子彈（近戰、道具）；`ammo` 是數字而 `reserve` 是 `null` 表示備彈無限（開局手槍；JSON 沒有 Infinity）。`event` 裡武器事件的 `ammo`、`reserve` 也一樣。
- 殭屍的 `type` 是註冊名稱（`walker`、`runner`、`tank`、`exploder`）；`state` 是 `chase`（有追的對象）、`idle`、`dead`（這一步剛死，下一步就不在快照裡）；`yaw` 是面向它追的玩家，沒有對象時維持上一次的方向。
- HUD 欄位（瀏覽器的 `SnapshotStatus` 讀，`protocol.js` 不檢查，舊 client 會忽略）：每個玩家多了 `maxHealth`、`magazine`（彈匣容量，沒有子彈的武器是 `null`）、`reloading`、`slots`（`[{id, count, charge}]`，空格 `id` 是 `null`，和單機 `PlayerStatus.slots` 同格式）、`slot`（手上那格的 index）、`healing`（身上有治療道具）、`offer`（腳下能撿的東西 `{name, swap, full, verb, note}` 或 `null`）、`action`（正在治療／被治療／救人 `{text, fraction}` 或 `null`）、`rooted`（server 不會移動這個玩家：倒地、死亡或正在包紮，即 `session.isRooted(id)`）、`speed`（移動速度倍率，例如腎上腺素時是 1.3）；最上層多了 `goal`（開始畫面的目標文字）、`objective`（關卡倒數 `{label, seconds}` 或 `null`）、`breakSeconds`（波次間休息剩幾秒）。
- `pickups` 是 `[{id, item}]`：關卡上每個武器點和上面現在放的東西（`WeaponCatalog` 的 id），被拿走沒留東西時 `item` 是 `null`。
- `event` 轉送的事件和 `detail`（都是純資料，不送 entity）：`weapon.fired` `{ownerId, weaponId, ammo, reserve, count?, hit: {targetId, hitPart}|null}`、`weapon.reload-started`（多 `duration`）、`weapon.reloaded`、`weapon.changed`、`entity.damaged` `{targetId, sourceId, amount, health, hitPart, kind, downed}`（玩家被打到 0 血就是 `downed: true`，玩家沒有 `entity.died`）、`entity.died` `{targetId, sourceId, kind}`、`entity.healed` `{targetId, sourceId, amount, health}`（救起來也是這個）、`enemy.spawned` `{id, type, x, z, wave}`、`weapon.picked-up` `{ownerId, pickupId, weaponId, droppedId}`、`ammo.refilled` `{ownerId, crateId}`、`item.thrown` `{ownerId, itemId}`、`effect.exploded` `{kind, x, y, z, radius, ownerId}`、`wave.started` `{wave, count}`、`wave.cleared` `{wave, kills}`、`game.state-changed` `{state, wave}`、`game.over`、`game.victory` `{wave, kills}`。

## 手感

1. **自己的移動零延遲。** 瀏覽器照舊用 `PlayerController` 算移動，送 `input` 給 server。server 用 `RemoteController` 收下位置，檢查兩次 input 之間的移動距離不超過「速度 × 經過時間 × 1.5 + 0.5 m」，也檢查碰撞；不合理就夾回去，並在快照裡給正確位置，client 看到差距超過 1 m 才拉回。
2. **別人和殭屍用補間。** `SnapshotBuffer` 存最近約 1 秒的快照，畫面時間 = 估計的 server 時間 − 100 ms，在前後兩張快照之間線性補間（角度走最短的方向）。缺快照時最多往前外插 250 ms，之後停在原地。
3. **開槍倒回時間。** server 每一步把殭屍位置存進歷史（約 1 秒）。收到 `fire` 時，把殭屍暫時放回 `at − 100 ms`（client 看到的時間）的位置做命中判定，再放回去。倒回最多 250 ms，超過就用 250 ms。
4. **本地先播回饋。** 槍聲、火光、後座、彈殼在本地按下去就播；傷害數字、殭屍死亡、子彈數以 server 為準。
5. **頻率。** 模擬每秒 30 步（`update(1/30)`），快照每秒 20 次，input 每秒 30 次。快照只送離任何玩家 60 m 內的殭屍。

## server 實作（G8d）

`server/game/` 裡的類別，房間開始後才建立；server 不 import three.js。

- `SessionRoomGame extends RoomGame`：`server/main.mjs` 的 `createGame` 每個房間建一個。開始時讀 `web/levels/<level>.json`，`p1`～`p3` 站在關卡的 `spawns.players[0..2]`（不夠就用最後一個），呼叫 `createSession()` 再 `start()`；讀檔失敗或沒有出生點就丟錯，房間收到 `start-failed` 留在 lobby。`tick(dt)` 把真實經過的時間累積成固定的 1/30 秒步，快照每 50 ms 一張（每秒 20 張；一步是 33 ms，所以三步裡送兩張，落在第 2、3、5、6… 步）。計時器晚了最多一次補 5 步，其餘丟掉。
- `RemoteController`：每個玩家一個，`input` 收進來就處理，不等下一步。`seq` 不比上一個大就整則忽略；`ack` 是最後處理的 `seq`。允許的距離是 `PLAYER_SPEED.sprint × speedMultiplier × 經過時間 × 1.5 + 0.5 m`，經過時間是兩則 input 抵達 server 的間隔，最多算 1 秒。超過就沿原方向縮短，再用 `CollisionWorld.move` 走一次，所以穿不過牆。`session.canMove` 是 false 或 `session.isRooted(id)` 時只改視角不移動。`y` 夾在 0～1 m（只有跳躍會離地），`pitch` 夾在 ±85°。
- `fire` 是扣一次扳機：server 發一次 `FIRE_REQUESTED`，武器自己的冷卻決定有沒有射出去。自動武器按住時，client 每次本地扳機會發射就送一則 `fire`（最多和 input 一樣每秒 30 次）。
- 動作：`ActionRegistry` 依 `kind` 找處理類別。`fire`、`secondary` 先用這個玩家最後接受的姿勢填 `ctx.aim`；`fire` 在 `ShotRewind` 裡判定：殭屍暫時放到 `EnemyHistory` 在 `at − 100 ms` 的位置（最多倒回 250 ms，不會超過現在），判定完放回去。`pickup`、`secondary` 先把玩家位置同步成最後接受的座標。`revive` 呼叫 `session.revives.hold(id, holding)`。
- 有人離開：那個玩家從 `ctx.players` 拿掉並 dispose，放開救援，其他人繼續玩；最後一個人離開時 Session dispose。
- 測試：`test/SessionRoomGame.test.js` 用真的 `RoomServer` 加假連線跑完整流程，並用 `web/js/net/protocol.js` 的 `parseServerMessage` 檢查每一則送出的訊息。

## 瀏覽器端（G8e）

- **開關。** `?play=1&server=ws://host:port` 才有連線功能；`web/js/net/ServerConfig.js` 的 `DEFAULT_SERVER_URL` 是空字串，部署後可以填上預設 server（網址參數優先）；由 game server 自己送出的網頁不用參數（見「部署」）。只收 `ws:`／`wss:`。沒設定 server 時連線程式完全不載入，單機和以前一樣。
- **開始畫面。** 有 server 時單機的開始按鈕不變，下面多一區：名字（存在 localStorage `net:player-name`，讀不到就不記）、「建立隊伍」、4 碼編號和「輸入編號加入」（只收 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`，小寫自動轉大寫）。錯誤碼都有中文說明（`teamErrors.js`）。網址加 `&join=CODE` 會自動加入；隊伍玩的關卡和網頁不同時，網頁換到那個關卡再加入一次。
- **隊伍房間。** 大字顯示編號（可複製）、名單（p1～p3 的顏色和遠端玩家膠囊一樣）、開始和離開。任何人按開始都行；`start-failed` 顯示在房間裡，可以再按。斷線時 `ConnectionScreen` 顯示「正在重新連線」；重連後 server 拒絕重新加入（遊戲已開始、房間不見）就顯示原因，按鈕回開始畫面。重新加入後 `room.you` 可能換了編號（例如 p2 斷線、p1 離開，p2 回來變成 p1），這時 `OnlineHost` 用同一條連線重建 `OnlineMode`，HUD、音效和開火都換成新編號。
- **模式。** `installGameplay` 用 `ModeSwitch` 在 `LocalMode`（瀏覽器裡跑 `GameSession`）和 `OnlineMode` 之間切換（Strategy，`GameMode`）。`OnlineMode` 不建 `GameSession`：
  - `PlayerController` 照舊每格算移動，`InputSender` 每秒送 30 次姿勢；`PoseReconciler` 拿 snapshot 的位置和同一個 `ack` 送出的姿勢比，差超過 1 m 才直接拉回（第一張 snapshot 把玩家放到 server 的出生點）。動作送出前先補送一次姿勢，因為 server 用最後收到的姿勢瞄準。自己的 `rooted`（倒地、死亡、正在包紮）和 `speed`（腎上腺素等速度倍率）照 snapshot 套到 `PlayerController`，所以本機走法和 server 的檢查一致，包紮時不會一直被拉回。
  - `PlayerCombat` 照舊發 `*_REQUESTED`，`ActionForwarder` 轉成 `action`。開火用 `FireCadence` 控制：每按一下送一次，自動武器按住時每「冷卻 + 8 ms」（最多每秒 30 次）再送一次。槍和近戰在本機立刻播槍聲、槍口火光、後座力和第一人稱動畫（本機 `weapon.fired`，`hit: null`）；server 回來的同一槍改成 `net.shot-confirmed`，只用來顯示命中標記，傷害數字、擊殺都等 server。投擲物和治療物不預測。
  - 畫別人用 `SnapshotBuffer` 在 `clock.now() − 100 ms` 取樣：殭屍用和單機一樣的 `createEnemyBox`，隊友是依編號上色的膠囊加名字。server 的 `event` 由 `NetEventTranslator` 用同樣的事件名稱發到網頁的 bus，需要 entity 的地方放 `EntityStandIns`（從各殭屍類別的 prototype 建，`instanceof` 和聲音的類別對照照常可用），所以單機的音效、HUD 元件、爆炸效果不用改。隊友的 `weapon.fired` 照常發成 `weapon.fired`，`TeammateWeaponSounds` 用 `ownerId` 找 `EntityStandIns` 裡那個隊友（快照插值後的位置），在那裡播他那把武器的槍聲（左右聲道跟著自己的 yaw，60 m 外聽不到）；自己的槍已經在本機播過，server 回來的那一槍是 `net.shot-confirmed`，不會再播一次。`event` 的 `detail` 不用加欄位。
  - HUD 讀 `SnapshotStatus`（`PlayerStatus` 的子類別）：血量、彈藥（`reserve: null` 有彈匣時是無限備彈）、波次、擊殺、道具欄、隊友、倒地／救人、腳下的東西，自己的彈數會先扣掉還沒被 server 確認的子彈。
  - 地上的槍位置來自關卡 marker，上面放什麼只看 snapshot 的 `pickups`（`PickupMirror`）。
- **重開。** 線上沒有「同一隊再來一局」：GameOver／Victory 的按鈕或 Enter 會離開隊伍、回到開始畫面，要再玩就重新建立或加入隊伍。
- **燈光預算。** 能連線的網頁（`play=1` 且有 server）建場景前用 `LightBudget` 把 `alarm.light.count` 降到 1（第二章原本 3 盞），線上每格還要多畫遠端玩家和插值。
- **關卡出口與障礙物**（`installLevelFlow`）線上一律不反應 E，由 server 的遊戲決定。
- 除錯：`&debug=1` 時 `window.__netDebug` 有 `state()`、`start()`、`aimAt(x, z, y)`、`fire()`、`leave()`。

## 部署

- **一個 port 包辦。** `npm start`（`node server/main.mjs`）同一個 port 給網頁、`GET /health` 和 WebSocket，雲端只要分享一個 https 網址，網頁連同一個 origin 的 `wss://`。環境變數 `PORT`（預設 8787）、`HOST`（預設 `0.0.0.0`，雲端要聽所有介面）。
- **HTTP。** `server/http/`：`StaticFiles`（只讀、只服務 `web/` 和 `art/`，和 `tools/serve.mjs` 一樣的路徑，因為網頁讀 `../art/`；擋 `..`、隱藏檔、`:`、`\0`，連結和 8.3 短檔名會再用真實路徑檢查一次；`Content-Type` 照副檔名；`Cache-Control: no-cache`）、`HttpApp`（只收 GET／HEAD，依序找第一個符合的 `Route`）、`Route` 的子類別 `HealthRoute`（`/health` → 200 `ok`）、`RedirectRoute`（`/` → `/web/index.html?play=1`，請求的參數接在後面，例如 `/?join=ABCD`）、`StaticRoute`、`ServerTaggedPage`。`createGameHttp()` 把它們組起來；`WsTransport.attach(httpServer)` 讓 `ws` 共用那個 http server（任何路徑的 upgrade 都收）。`WsTransport.listen(port)` 仍然可以單獨開一個 port（測試用）。`tools/serve.mjs` 用同一組 `StaticFiles`／`HttpApp`，但服務整個 repo、`no-store`、不加標記。
- **網頁怎麼知道 server 在哪。** game server 送出的 `web/index.html` 由 `ServerTaggedPage` 在 `</head>` 前加 `<meta name="coop-server" content="same-origin">`；`ServerConfig.pageServerUrl(document, location)` 看到這個標記就用網頁自己的 host：https 頁面用 `wss://host/`，http 用 `ws://host/`（雲端 TLS 在 proxy 結束，server 看到的是 http，所以由瀏覽器依 `location` 決定）。普通靜態主機沒有這個標記，`pageServerUrl` 回 `DEFAULT_SERVER_URL`，不發任何請求去探測。優先順序：`?server=` > 頁面標記 > `DEFAULT_SERVER_URL`。沒有 `play=1` 時這些都不看，畫面不變。
- **雲端。** `Dockerfile`（node:22-slim，`npm ci --omit=dev`，只複製 `server/`、`web/`、`art/` 和 package 檔）。`fly.toml`：東京 `nrt`，`auto_stop_machines = "off"`、`min_machines_running = 1`（房間在記憶體裡，機器停了隊伍就沒了），`/health` 檢查。`render.yaml`：新加坡，`healthCheckPath: /health`；免費方案閒置約 15 分鐘會休眠，示範前先開一次。步驟見 README「線上多人」。
- **量延遲。** `node tools/net-latency.mjs <ws-url> [count]` 用協定的 `ping`／`pong` 連續量 `count` 次（預設 20），印出 RTT 的 min、median、p95、max，和用最快那次估的時鐘差（server − 本機，算法同 `ServerClock`）。統計在 `tools/net/LatencyStats.js`。
- 本機開發也可以照舊：`npm run serve` 開靜態網頁、另外 `npm start`，網址加 `?play=1&server=ws://localhost:8787`。

## 拆分

見 `TODO.md` 的 G8a～G8m。相依：G8a、G8b、G8c 可以同時做；G8d 要等 G8a、G8b；G8e 要等 G8c、G8d；G8f 部署準備之後，G8m 實際部署和實測最後。
