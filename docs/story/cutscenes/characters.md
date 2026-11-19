# 角色與視覺規格

所有分鏡圖都照這份規格生成，要改角色外觀先改這裡，再套用到所有畫面。外觀以 [drafts/draft_07.webp](drafts/draft_07.webp)（正面）與 [drafts/draft_03.webp](drafts/draft_03.webp)（背面）為準。

## 共同風格前綴

每張圖的提示詞都以這段開頭：

```
Vintage American comic book panel, detailed black ink linework with dense cross-hatching, aged sepia newsprint paper texture, monochrome ink on cream paper with a single muted green spot color (#4f9a68) and occasional dark red blood, post-apocalyptic zombie horror, bleak, somber, lonely mood, cinematic composition, strong silhouettes. NO text, NO letters, NO speech bubbles, NO panel borders, NO logos, NO watermark.
```

每張圖的提示詞都以這段結尾：

```
Wide landscape composition, keep all important subjects inside the central 16:9 area. Hands drawn with five clearly separated fingers. Leave empty space in the direction of motion. Do not crop weapons or hands at the frame edge.
```

## 角色外觀（提示詞用）

生圖時把該角色的英文描述整段貼進提示詞，不要改字。

### A：球棒

成年女性，黑色短鮑伯頭，深色長風衣，纏鐵絲網的木製球棒。

```
Woman A: adult woman, black chin-length bob haircut with messy bangs, long dark trench coat with torn hem and a belt, dark trousers, combat boots, carries a wooden baseball bat wrapped in barbed wire, stained with dried blood.
```

### B：步槍

成年女性，長馬尾，軍用外套，突擊步槍。

```
Woman B: adult woman, long brown hair tied in a high ponytail, olive military field jacket with chest pouches, cargo pants, combat boots, holds a black assault rifle with a canvas sling.
```

### C：手槍

成年女性，兩側剃短、頭頂留辮子，連帽皮衣，手槍。

```
Woman C: adult woman, undercut hairstyle with both sides shaved short and long cornrow braids on top tied back, small hoop earring, black leather jacket with a grey hood, ripped dark jeans, thigh holster, holds a black semi-automatic pistol.
```

### 老黃：受困者

虛構的男性，五十多歲：白色短髮往後梳、方臉、蒜頭鼻、方框眼鏡，黑色皮夾克配黑色圓領 T 恤。可以露臉，每一張都要長得一樣。

```
A fictional man in his late fifties: short white hair swept back, a square face, a broad bulbous nose, rectangular-frame glasses, a black leather jacket over a plain black crew-neck T-shirt.
```

提示詞不要寫老黃、MVIDIA、伊龍馬等名字，也不要寫任何真實人物或公司名稱；也不要上傳真人照片當參考，照上面的文字描述畫。

### 巨型殭屍：最終 Boss

建議外型（待確認）：大約三層樓高，像很多個裝了晶片的人融合在一起；背上和肩膀嵌著一大片晶片，一起發綠光；一隻手臂特別巨大；肚子腫脹、皮膚繃得很薄（結局老黃從這裡滑出來）。

```
A giant zombie about three storeys tall, its body fused from many infected people, a large cluster of implanted chips glowing green across its back and shoulders, one arm far larger than the other, a swollen distended belly with thin stretched skin, a mouth torn open to the ears, broken black nails.
```

## 場景與道具（提示詞用）

| 項目 | 英文描述 |
|---|---|
| 總部大樓 | `a tall dark glass corporate skyscraper with antennas on the roof and a glowing green rectangular panel at the top (blank, no text)` |
| 總部大門 | `a massive steel double gate set in a thick concrete frame, horizontal steel reinforcement bars, a band of yellow and black hazard stripes along the bottom, flanked by very tall concrete walls; above it a glowing green sign with no readable letters, one segment dead and flickering; a small guard booth on the right with a red rotating beacon on its roof` |
| 門禁面板 | `a chest-high black metal access terminal standing beside the gate, a glowing green screen on top showing a progress bar of eight blocks (no text), a numeric keypad and a card slot below` |
| 大門前廣場 | `a wet dark blue-grey asphalt plaza with three U-shaped sandbag barriers, abandoned cars, trucks and vans, scattered roadblocks, red warning lights sweeping left and right at the street entrances` |
| 吉普裝甲車 | `a battered armored off-road jeep with steel plates bolted on the sides, a welded front ram bar, and mesh-covered windows` |
| 火箭 | `a small sleek escape rocket standing on a launch pad on the skyscraper rooftop` |
| 指紋掃描器 | `a palm scanner pedestal beside the rocket with a row of indicator lights (no text)` |

## 生圖注意事項

- 一律橫式。GPT 輸出的橫圖是 3:2（1536×1024，跟初稿一樣），重要內容放在中間的 16:9 範圍內，剪輯時裁成 16:9 才不會切到。
- 畫面內不要有文字、手機訊息、可讀的招牌。
- 打電話用左右分割畫面（`c1_12`），通話內容用剪輯時加的英文字幕，圖裡不畫泡泡也不畫字。
- 開場（過場 1）的三人還沒變兇悍：服裝款式照設定，但衣服乾淨、臉上沒有血和傷，表情緊張害怕。從過場 2 開始才是又髒又帶血的樣子。
- 畫的是「動作剛開始」的那一刻，留空間給動畫繼續。
- 同一個角色在不同鏡頭裡，髮型、衣服、武器不能變。生圖時可以把 draft_07 或已採用的人物圖一起上傳給 GPT 當參考。
