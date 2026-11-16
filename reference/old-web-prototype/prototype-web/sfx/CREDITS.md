# 音效來源

下載前都在原始頁面確認過授權（2026-10-19）。CC0 不需要標示作者，這裡還是列出來方便查。

| 本資料夾的檔案 | 原始檔案 | 作者 | 授權 | 來源 |
|---|---|---|---|---|
| `katana_swing_1~5.ogg` | `sword.8 / 10 / 7 / 9 / 5.ogg` | StarNinjas | CC0 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes |
| `katana_hit_1~5.ogg` | `sword_clash.1 / 9 / 3 / 2 / 10.ogg` | StarNinjas | CC0 | 同上 |
| `tesla_zap.wav` | `spark.wav` | BMacZero | CC0 | https://opengameart.org/content/electricity-sound-effects-0 |
| `tesla_crackle.wav` | `continuousspark.wav` | BMacZero | CC0 | 同上 |
| `explosion.flac` | `synthetic_explosion_1.flac` | qubodup | CC0 | https://opengameart.org/content/synthesized-explosion |
| `chainsaw_idle.wav` | 「Chainsaw, Using」104.5～107 秒（待機） | Joseph Sardin | CC0 | https://bigsoundbank.com/chainsaw-using-s0983.html |
| `zombie/z01~z23.wav` | `zombie-1 ~ 23.wav`（編號相同，只留 20 個） | artisticdude | CC0 | https://opengameart.org/content/zombies-sound-pack |
| `zombie/m01~m18.wav` | `Monster-1 ~ 7.wav`、`monster-11 / 18.wav`（編號相同） | Ogrebane | CC0 | https://opengameart.org/content/monster-sound-pack-volume-1 |
| `zombie/s01~s07.mp3` | `01 ~ 07_zombey.mp3`（原檔，沒有 05） | saturn91 | CC0 | https://opengameart.org/content/zomby-sfx-pack |
| `chainsaw_cut.wav` | 同一個檔案 67.25～68.45 秒（油門全開、沒有卡進木頭的那段） | Joseph Sardin | CC0 | 同上 |

電鋸兩段是用 `cut_chainsaw.py` 從原始檔剪出來的：轉成單聲道 24 kHz（待機 2.5 秒、鋸東西 1.2 秒），把慢慢起伏的音量拉平，頭尾交叉淡化做成無縫循環。

殭屍叫聲（`zombie/`）的授權是 2026-11-14 在原始頁面確認的。`z`、`m` 開頭的檔案從 24-bit 立體聲轉成 16-bit 單聲道、切掉頭尾空白，內容沒有另外處理。哪些檔案實際用在遊戲裡看 `manifest.json` 的 `zombie_*`；要重新挑選可以開 `sfx-audition.html` 試聽。
