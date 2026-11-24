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
| `snapshot` | `tick`, `time`（server ms）, `ack`（這個玩家最後處理的 input `seq`）, `state`, `wave`, `kills`, `players:[…]`, `enemies:[…]`, `pickups?` | 每秒 20 次 |
| `event` | `name`（`game/events.js` 的事件名）, `detail` | 需要立刻反應的事件：開槍、命中、死亡、倒地、波次開始、撿到東西。只送畫面和音效需要的欄位 |

快照裡的玩家：`{id, x, y, z, yaw, pitch, health, downed, alive, weapon, ammo, reserve}`；殭屍：`{id, type, x, z, yaw, health, state}`。

- 快照：`tick` 是 server 的模擬步數，`time` 是那一步的 server 時間（和 `pong.s` 同一個時鐘）。`health` 也四捨五入到小數點後 2 位。
- 玩家的 `ammo`、`reserve`：`ammo` 是 `null` 表示這把武器沒有子彈（近戰、道具）；`ammo` 是數字而 `reserve` 是 `null` 表示備彈無限（開局手槍；JSON 沒有 Infinity）。`event` 裡武器事件的 `ammo`、`reserve` 也一樣。
- 殭屍的 `type` 是註冊名稱（`walker`、`runner`、`tank`、`exploder`）；`state` 是 `chase`（有追的對象）、`idle`、`dead`（這一步剛死，下一步就不在快照裡）；`yaw` 是面向它追的玩家，沒有對象時維持上一次的方向。
- `pickups` 是 `[{id, item}]`：關卡上每個武器點和上面現在放的東西（`WeaponCatalog` 的 id），被拿走沒留東西時 `item` 是 `null`。
- `event` 轉送的事件和 `detail`（都是純資料，不送 entity）：`weapon.fired` `{ownerId, weaponId, ammo, reserve, count?, hit: {targetId, hitPart}|null}`、`weapon.reload-started`（多 `duration`）、`weapon.reloaded`、`weapon.changed`、`entity.damaged` `{targetId, sourceId, amount, health, hitPart, kind, downed}`（玩家被打到 0 血就是 `downed: true`，玩家沒有 `entity.died`）、`entity.died` `{targetId, sourceId}`、`entity.healed` `{targetId, sourceId, amount, health}`（救起來也是這個）、`enemy.spawned` `{id, type, x, z, wave}`、`weapon.picked-up` `{ownerId, pickupId, weaponId, droppedId}`、`ammo.refilled` `{ownerId, crateId}`、`item.thrown` `{ownerId, itemId}`、`effect.exploded` `{kind, x, y, z, radius, ownerId}`、`wave.started` `{wave, count}`、`wave.cleared` `{wave, kills}`、`game.state-changed` `{state, wave}`、`game.over`、`game.victory` `{wave, kills}`。

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

## 部署

- 網頁照舊是靜態檔；server 另外跑，`node server/main.mjs`，port 用環境變數 `PORT`（預設 8787），本機開發時網址加 `?server=ws://localhost:8787`。
- 雲端選亞洲機房（東京或新加坡），避開閒置會休眠的方案，或示範前先連一次。
- 網頁是 https 時必須用 `wss://`。

## 拆分

見 `TODO.md` 的 G8a～G8f。相依：G8a、G8b、G8c 可以同時做；G8d 要等 G8a、G8b；G8e 要等 G8c、G8d；G8f 最後。
