# 音效檔

遊戲啟動時會讀 `manifest.json`，把裡面列出的檔案載進來，取代程式合成的音效。
沒有列出來、或載入失敗的音效，會自動退回程式合成，不會報錯。

## 一定要用 http.server 開

直接雙擊 HTML（網址是 `file://...`）時，瀏覽器不准讀音效檔，就只會聽到合成音效。請在專案資料夾用 PowerShell：

```powershell
python -m http.server 8765 --directory prototype-web
```

再打開 http://localhost:8765/index-v0.4.1.html

## 換成自己的音效

1. 把音檔放進這個資料夾（`.ogg`、`.wav`、`.mp3`、`.flac` 都可以）。
2. 打開 `manifest.json`，把對應的 key 改成你的檔名。想要每次隨機播不同版本，就寫成陣列：
   ```json
   "katana_swing": ["my_swing_a.ogg", "my_swing_b.ogg"]
   ```
3. 重新整理網頁（按 Ctrl+F5 強制重新載入）。

不用先剪檔案：程式會自動切掉開頭的空白、把音量調到一致，每次播放還會隨機改一點速度（0.93～1.07 倍），聽起來才不會一模一樣。

## 可以用的 key

| key | 什麼時候播 | 沒有音檔時 |
|---|---|---|
| `katana_swing` | 武士刀每次揮刀 | 合成的風切聲＋「鏘」 |
| `katana_hit` | 武士刀砍中殭屍 | 合成的切割聲 |
| `chainsaw_idle` | 拿著電鋸、沒按左鍵（**循環播放**） | 合成引擎聲 |
| `chainsaw_cut` | 電鋸按住左鍵（**循環播放**） | 合成引擎聲 |
| `grenade_explode` | 手榴彈、榴彈、自爆殭屍爆炸 | 合成爆炸聲 |
| `tesla` | 閃電槍開火 | 合成電流聲 |
| `tesla_crackle` | 閃電跳到下一隻殭屍 | 合成嗶聲 |
| `zombie_groan` | 殭屍在附近時平常的低吼 | 合成人聲 |
| `zombie_death` | 殭屍被打死（爆頭不叫；Boss 會放慢播） | 合成人聲 |
| `zombie_scream` | 尖叫殭屍召喚同伴 | 合成人聲 |
| `zombie_hiss` | 自爆殭屍衝到旁邊 | 合成嘶聲 |
| `zombie_windup` | 坦克砸地板前的蓄力（放慢到 0.6～0.7 倍播） | 合成人聲 |

殭屍叫聲的候選錄音都在 `zombie/`，開 http://localhost:8765/sfx-audition.html 可以逐個試聽、勾選，再把結果貼進 `manifest.json`。

電鋸的兩個 key 要**兩個都有**才會換成音檔；循環用的檔案頭尾要接得起來，不然每次循環會「喀」一聲。

## 去哪裡找音效

優先用 **CC0（公共領域）**，下載前在頁面上確認授權；用 CC-BY 的話要在 `CREDITS.md` 寫作者和連結。

- https://opengameart.org （搜尋時「Art Type」選 Sound Effect）
- https://kenney.nl/assets （全部 CC0）
- https://bigsoundbank.com （大部分 CC0，下載頁會寫）

## 想調合成音效

合成音效都在 HTML 裡的 `class Sfx`。最常用的兩個方法：

- `tone({ f, f2, dur, type, vol })`：一個音。`f` 是開始的音高（Hz），`f2` 是結束的音高（滑音），`dur` 是秒數，`type` 是波形（`'sine'` 圓潤、`'triangle'` 柔和、`'square'` / `'sawtooth'` 比較刺、比較 8-bit）。
- `noise({ f, f2, dur, type, q, vol })`：一段雜音，用濾波器決定音色。`type: 'lowpass'` 只留低頻（悶悶的爆炸），`'highpass'` 只留高頻（嘶嘶聲），`'bandpass'` 只留 `f` 附近（`q` 越大越窄、越像口哨）。
- 殭屍的叫聲用 `voice()`：`f` 是音高、`vowel` 是母音（`uh` `aa` `ah` `oo` `ee`）、`rasp` 是沙啞程度、`gurgle` 是喉嚨咕嚕聲。

改完存檔、重新整理網頁就能聽到。
