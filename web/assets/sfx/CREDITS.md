# 音效來源

從舊專案 `reference/old-web-prototype/prototype-web/sfx/` 複製過來（G10），只留遊戲有用到的檔案。授權都是 CC0，舊專案在 2026-10-19 和 2026-11-14 到原始頁面確認過。

| 檔案 | 原始檔案 | 作者 | 授權 | 來源 |
|---|---|---|---|---|
| `katana_swing_1~5.ogg` | `sword.8 / 10 / 7 / 9 / 5.ogg` | StarNinjas | CC0 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes |
| `katana_hit_1~5.ogg` | `sword_clash.1 / 9 / 3 / 2 / 10.ogg` | StarNinjas | CC0 | 同上 |
| `explosion.flac` | `synthetic_explosion_1.flac` | qubodup | CC0 | https://opengameart.org/content/synthesized-explosion |
| `chainsaw_idle.wav` | 「Chainsaw, Using」104.5～107 秒 | Joseph Sardin | CC0 | https://bigsoundbank.com/chainsaw-using-s0983.html |
| `chainsaw_cut.wav` | 同一個檔案 67.25～68.45 秒 | Joseph Sardin | CC0 | 同上 |
| `zombie/z*.wav` | `zombie-<編號>.wav` | artisticdude | CC0 | https://opengameart.org/content/zombies-sound-pack |
| `zombie/m*.wav` | `Monster-<編號>.wav` | Ogrebane | CC0 | https://opengameart.org/content/monster-sound-pack-volume-1 |

`manifest.json` 的 key 是音效名稱，value 是檔名（陣列就每次隨機挑一個）。沒列在裡面的音效（槍聲、換彈、受傷、撿東西、波次開始等）用程式合成，見 `web/js/audio/SynthSounds.js`。
