# 給 GPT 的生圖提示詞

這份是**可以直接複製貼上**的版本。

## 使用方式

1. **開場（過場 1）**：用下面「過場 1：開場（重畫 3 張）」那一整段，附一張參考圖貼給 GPT 就好，不用先貼第 0 步。
2. **其他過場**：開新對話，附 `images/c2_11_heroes_v02.webp`，先貼「第 0 步」，等 GPT 回「了解」，之後把[分鏡腳本](script.md)裡那一格（鏡號到動作那幾行）貼給它。
3. 生好後存到 `docs/story/cutscenes/images/`，檔名照 `c{過場}_{鏡頭}_{名稱}_v01.png`。GPT 在圖下面寫的那一行英文，是給影片 AI 的動作提示，跟圖一起交給組員。
4. 不滿意就說「修改：……」，例如「修改：左手手指黏在一起」。改好的存成 `_v02`，舊版保留。
5. 每個過場開一個新對話。對話太長，GPT 會慢慢忘記規則。

---

## 第 0 步：先貼給 GPT 的說明

```
我在做一款殭屍合作射擊遊戲的劇情過場，想請你幫我生成「分鏡圖」。

流程：你畫的每一張圖，都會交給另一個「圖片轉影片」的 AI，當作一段 3～5 秒短片的第一幀，再由它把畫面動起來。所以每張圖都要是「動作即將開始」的畫面，而且要讓影片 AI 好處理。這個對話裡的每一張圖都照下面的規則，我不會每次重複。

一、我每次會給你什麼
我每次貼一格分鏡，裡面有：鏡號、景別、角度、運鏡、畫面、光線、動作、聲音、字幕。
- 「畫面」「光線」「景別」「角度」：照著畫。
- 「動作」：是影片 AI 之後要做的動作。請畫動作「剛要開始」的那一刻，不要畫成動作已經完成。
- 「運鏡」「聲音」「字幕」「接下一鏡」：是給影片和剪輯用的，畫圖時忽略。
一次只畫一張，畫完等我給下一格。

二、固定畫風（每一張都要用）
Vintage American comic book panel, detailed black ink linework with dense cross-hatching, aged sepia newsprint paper texture, monochrome ink on cream paper with a single muted green spot color (#4f9a68) and occasional dark red blood, post-apocalyptic zombie horror, bleak, somber, lonely mood, cinematic composition, strong silhouettes.
分鏡「光線」寫到的其他顏色（紅色警示燈、橘黃色燃料桶、火星的鏽紅色）也可以用，但飽和度都要壓低。

三、固定角色（外觀永遠不能變）
附圖是三位主角的參考：左邊是 A，中間是 B，右邊是 C。臉、髮型、服裝、武器每一張都要跟參考圖一樣。
- A: adult woman, black chin-length bob haircut with messy bangs, long dark trench coat with torn hem and a belt, dark trousers, combat boots, wooden baseball bat wrapped in barbed wire.
- B: adult woman, long brown hair in a high ponytail, olive military field jacket with chest pouches, cargo pants, combat boots, black assault rifle with a canvas sling.
- C: adult woman, undercut with both sides shaved and long cornrow braids on top tied back, small hoop earring, black leather jacket with a grey hood, ripped dark jeans, thigh holster, black semi-automatic pistol.
- 老黃: a fictional man in his late fifties, short white hair swept back, a square face, a broad bulbous nose, rectangular-frame glasses, a black leather jacket over a plain black crew-neck T-shirt. 老黃沒有參考圖，照這段文字畫，每一張的老黃都要長得一樣。
- 巨型殭屍（最終 Boss）: about three storeys tall, body fused from many infected people, a cluster of implanted chips glowing green across its back and shoulders, one arm far larger than the other, a swollen belly with thin stretched skin, mouth torn open to the ears.

四、給影片 AI 用的第一幀規則
1. 橫式構圖。重要的東西都放在畫面中間的 16:9 範圍內，上下邊緣之後可能會被裁掉。
2. 一張圖只有一個主要動作，主體清楚，背景不要雜亂。
3. 動作要去的方向要留空間，例如球棒要揮過去的地方、車子要開去的方向。
4. 手要畫清楚五根分開的手指；手和武器不能被畫面邊緣切掉，也不能被其他東西擋住。
5. 不要畫速度線、動態模糊、殘影，影片 AI 會把它們當成固定不動的東西。
6. 畫面裡不能有任何文字、數字、對話框、可讀的招牌、手機螢幕內容、漫畫分格框、Logo、浮水印。
7. 不是遠景的時候，人物的臉要夠大、夠清楚，影片 AI 才能維持長相。
8. 同一個場景的連續鏡頭，光線的方向和顏色要保持一致。
9. 分鏡內容跟這些規則衝突時，以規則為準。

五、每張圖畫完之後
在圖片下面用英文寫一行給影片 AI 的提示（30 個英文字以內），只寫畫面裡會動的東西和鏡頭怎麼動，不要寫畫風。例如：
She swings the bat forward and hits the zombie; the zombie flies back to the right. Fixed camera.

六、修改
我說「修改：……」的時候，只改我說的地方，其他全部保持不變。

看懂的話回覆「了解」就好，先不要畫圖。
```

---

## 試做鏡頭

### `c1_08` 城市

不用生成，用 draft_01，已經放在 `images/c1_08_city_v01.webp`。

### `c2_11` 三人迎敵

已完成，採用 `images/c2_11_heroes_v02.webp`。

### `c2_12` A 揮棒

在貼過第 0 步的對話裡，附 `images/c2_11_heroes_v02.webp`，貼：

```
c2_12｜中景｜側面｜固定｜3 秒 — 戰鬥開始
- 畫面：A 側身，球棒舉到右肩後方蓄力，雙手握柄，重心在後腳。畫面右邊一隻穿著破爛上班族襯衫的殭屍撲過來，離她只有一步。背景是附圖這個鋼製大門前的廣場：沙包掩體、濕柏油地面、紅色警示燈。
- 光線：警示燈的紅光正好掃過殭屍。
- 動作：A 揮棒擊中殭屍頭部側面，殭屍往右後方倒飛，暗紅血點飛濺。
補充：A 的長相、服裝、球棒照附圖最左邊的女生。整支球棒都要在畫面裡，球棒和殭屍的頭之間要留揮棒的空間。
```

存檔名稱：`c2_12_bat_v01.png`

---

## 過場 1：開場（重畫 3 張）

第一批 17 張裡有 14 張已經採用（存在 `images/`），打電話那段改成左右分割畫面，要畫的只剩 3 張：`c1_09`、`c1_11`、`c1_12`。

開新的 GPT 對話，附 `images/c1_16_door_v01.png`（三人在小木屋、衣服乾淨的樣子），貼下面整段。

存檔名稱：`c1_09_call_v02.png`、`c1_11_phone_v01.png`、`c1_12_split_v01.png`

```
請幫我生成 3 張「分鏡圖」，是一款殭屍合作射擊遊戲開場過場的其中 3 格。每張圖之後會交給「圖片轉影片」的 AI，當作一段短片的第一幀。

【怎麼畫】
- 3 格分別生成 3 張獨立的圖片，照順序畫。一次畫不完沒關係，我說「繼續」，你就接著畫。
- 每張圖都畫「動作剛要開始」的那一刻。
- 每張圖下面寫兩行：第一行是鏡號，第二行是給影片 AI 的英文動作提示（30 個英文字以內，只寫畫面裡會動的東西和鏡頭怎麼動）。

【固定畫風，跟附圖一樣】
Vintage American comic book panel, detailed black ink linework with dense cross-hatching, aged sepia newsprint paper texture, monochrome ink on cream paper with a single muted green spot color (#4f9a68) and occasional dark red blood, post-apocalyptic zombie horror, bleak, somber, lonely mood, cinematic composition, strong silhouettes.

【規則】
1. 橫式構圖，重要的東西都放在畫面中間的 16:9 範圍內。
2. 手要畫清楚五根分開的手指；手、手機和武器不能被畫面邊緣切掉。
3. 不要畫速度線、動態模糊、殘影。
4. 畫面裡不能有任何文字、數字、對話框、想法泡泡、Logo、浮水印。字幕之後剪輯時才加。

【角色】
附圖是三位女生：左邊是 B（綁高馬尾、軍綠色外套），中間是 A（黑色短鮑伯頭、深色長風衣），右邊是 C（兩側剃短、頭頂綁辮子、黑色皮衣配灰色帽兜）。長相、髮型、服裝都照附圖，小木屋的樣子也照附圖。她們衣服乾淨、臉上沒有血，表情緊張。
老黃: a fictional man in his late fifties, short white hair swept back, a square face, a broad bulbous nose, rectangular-frame glasses, a black leather jacket over a plain black crew-neck T-shirt. 老黃沒有參考圖，照這段文字畫，3 張裡的老黃要長得一樣。

【3 格分鏡】

第 1 格　c1_09｜中景｜斜前方
- 畫面：摩天大樓頂樓，強風。老黃站在欄杆邊，臉朝畫面斜前方，一手扶著欄杆喘氣，一手拿手機貼在耳邊，白髮被風吹亂，眼鏡歪了一點，表情驚慌。背後遠方是整座城市的火光和黑煙。不要畫火箭。
- 光線：城市的火光從側面照亮他半張臉。
- 動作：他喘著氣，等電話接通。

第 2 格　c1_11｜特寫｜俯角
- 畫面：附圖那間小木屋的木桌上，一支手機螢幕朝上，螢幕上是老黃的照片（白髮、方框眼鏡、笑著），旁邊一個小小的紅色愛心圖示，螢幕上沒有任何字。桌上還有檯燈、馬克杯、散開的撲克牌。A 的手（深色長風衣的袖口）從畫面右邊伸過來，正要拿起手機。
- 光線：手機螢幕的光照亮桌面，加上檯燈的暖黃光。
- 動作：手機在桌上震動，A 把它拿起來。

第 3 格　c1_12｜全景｜左右分割畫面
- 畫面：畫面從中間垂直分成左右兩半，中間一條細細的分隔線。左半邊：摩天大樓頂樓，強風，老黃臉朝畫面斜前方，手機貼耳大喊，另一手比劃著，背後是燃燒的城市。右半邊：附圖那間小木屋裡，A 拿著手機貼耳，B 和 C 從兩邊湊過來一起聽。兩邊的人都在各自半邊的中間，臉都看得清楚。
- 光線：左半邊是城市火光和夜色；右半邊是檯燈暖光和窗外灰綠色的霧。
- 動作：老黃對著手機大喊、揮手比劃；右邊三人的表情從疑惑變成緊張，B 和 C 互看一眼。

看懂的話，就從第 1 格開始畫。
```
