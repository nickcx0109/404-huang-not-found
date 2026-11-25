# 分鏡（中英對照）｜Storyboards (Chinese / English)

過場 2 到 5 的分鏡，照開場（過場 1）的做法：每一格一張圖，之後再做成影片；遊戲裡先用圖播，字幕由遊戲的打字機效果打出來，**圖裡不畫字**。

Storyboards for cutscenes 2–5, made the same way as the opening: one picture per shot, turned into video later. The game plays the pictures first and types the captions itself, so **no text is drawn in the pictures**.

| 檔案 File | 過場 Cutscene | 鏡數 Shots | 長度 Length |
|---|---|---|---|
| [c2_to-hq.md](c2_to-hq.md) | 過場 2：前往總部（第一章 → 第二章）／To the HQ (Ch.1 → Ch.2) | 9 | 約 30 秒 |
| [c3_inside-hq.md](c3_inside-hq.md) | 過場 3：進入總部（第二章 → 第三章）／Inside the HQ (Ch.2 → Ch.3) | 8 | 約 33 秒 |
| [c4_rooftop.md](c4_rooftop.md) | 過場 4：頂樓，老黃被抓／The rooftop: Lao Huang is taken | 8 | 約 25 秒 |
| [c5_mars.md](c5_mars.md) | 過場 5：結局，飛向火星／Ending: off to Mars | 9 | 約 40 秒 |

每格寫法：**畫面**（給 GPT 生圖）、**動作**（給圖轉影片的 AI，30 個英文字以內）、**字幕**（遊戲打字機打出來的英文，附中文意思）。英文欄可以直接貼給 GPT。

Each shot has **Image** (for GPT), **Motion** (for the image-to-video AI, under 30 words) and **Captions** (English typed by the game, with the Chinese meaning). The English column can be pasted to GPT as is.

---

## 1. 每個過場開新對話，先貼這段｜Paste this first in a new chat for each cutscene

附參考圖：開場的 `c1_08`（三人和老黃的長相）。

Attach as reference: the opening's `c1_08` (faces of the three women and Lao Huang).

**中文**

```
我在做一款殭屍合作射擊遊戲的劇情過場，請你幫我生成分鏡圖。每張圖之後會交給「圖片轉影片」的 AI 當作第一幀。

規則：
1. 一次畫一張，畫「動作剛要開始」的那一刻。畫完等我給下一格。
2. 橫式構圖，重要的東西放在中間 16:9 範圍內，畫面下方 1/5 保持暗、簡單（之後疊字幕）。
3. 畫面裡不能有任何文字、數字、對話框、Logo、浮水印；螢幕和招牌只用光和色塊。
4. 手要畫清楚五根手指，手和武器不能被畫面邊緣切掉。不要畫速度線、動態模糊。
5. 人物長相照附圖，每一張都要一樣。三位女生從這段開始衣服髒、有血跡和小傷，表情堅定。
6. 每張圖下面寫兩行：第一行鏡號，第二行是我給你的英文動作提示。

固定畫風：（貼下面「固定畫風」那段英文）
角色：（貼下面「角色」那段英文）
看懂就回「了解」。
```

**English**

```
I'm making story cutscenes for a co-op zombie shooter. Please draw storyboard frames. Each picture will be the first frame of a clip made by an image-to-video AI.

Rules:
1. One picture at a time, showing the moment an action is about to start. Wait for my next shot after each one.
2. Landscape. Keep important things inside the central 16:9 area, and keep the bottom fifth dark and simple (captions go there later).
3. No text, numbers, speech bubbles, logos or watermarks anywhere. Screens and signs are only light and colour blocks.
4. Hands with five clearly separated fingers; never crop hands or weapons at the frame edge. No speed lines, no motion blur.
5. Faces follow the reference picture and stay the same in every frame. From now on the three women look dirty, with blood stains and small cuts, and determined faces.
6. Under each picture write two lines: the shot id, then the English motion prompt I give you.

Fixed style: (paste the "Fixed style" block below)
Characters: (paste the "Characters" block below)
Reply "OK" if you understand.
```

## 2. 固定畫風｜Fixed style

```
Vintage American comic book panel, detailed black ink linework with dense cross-hatching, aged sepia newsprint paper texture, monochrome ink on cream paper with a single muted green spot color (#4f9a68) and occasional dark red blood, post-apocalyptic zombie horror, bleak, somber, lonely mood, cinematic composition, strong silhouettes.
```

（中文意思：復古美式漫畫分格，細密的黑色墨線和交叉排線，泛黃的舊報紙紙質，米色紙上單色墨，只用一個暗綠色點綴，偶爾有暗紅的血；末日殭屍恐怖，陰沉、孤獨，電影感構圖，強烈剪影。）

## 3. 角色｜Characters

```
Woman A: adult woman, black chin-length bob with messy bangs, long dark trench coat with torn hem and a belt, dark trousers, combat boots, carries a wooden baseball bat wrapped in barbed wire.
Woman B: adult woman, long brown hair in a high ponytail, olive military field jacket with chest pouches, cargo pants, combat boots, black assault rifle with a canvas sling.
Woman C: adult woman, undercut with both sides shaved and long cornrow braids on top tied back, small hoop earring, black leather jacket with a grey hood, ripped dark jeans, thigh holster, black semi-automatic pistol.
The man: a fictional man in his late fifties, short white hair swept back, square face, broad bulbous nose, rectangular-frame glasses, black leather jacket over a plain black crew-neck T-shirt.
The giant: a zombie about three storeys tall, its body fused from many infected people, a cluster of implanted chips glowing green across its back and shoulders, one arm far larger than the other, a swollen belly with thin stretched skin, a mouth torn open to the ears.
The astronaut: a tall adult man in a bulky white spacesuit with a fully mirrored gold visor that hides his face completely.
```

| 英文 | 中文 |
|---|---|
| Woman A | A：黑色短鮑伯頭、深色長風衣、纏鐵絲網的球棒 |
| Woman B | B：高馬尾、軍綠外套、突擊步槍 |
| Woman C | C：兩側剃短留辮子、黑皮衣灰帽兜、大腿槍套和手槍 |
| The man | 老黃：五十多歲，白髮往後梳、方臉、蒜頭鼻、方框眼鏡、黑皮夾克 |
| The giant | 巨型殭屍：三層樓高、許多人融合、背上一片發綠光的晶片、一隻手特別大、肚子腫脹皮很薄、嘴裂到耳根 |
| The astronaut | 伊龍馬：白色太空衣，金色鏡面面罩完全遮住臉 |

**名字不寫進提示詞**：老黃、伊龍馬、MVIDIA 都不寫，只用上面的外觀描述，避免畫成真實人物。伊龍馬一律戴著鏡面面罩，不露臉。

**Keep names out of the prompts.** Use only the descriptions above so no real person is drawn. The astronaut always keeps his mirrored visor down.

## 4. 存檔｜Saving

檔名照開場的方式：`01_c2_01.png`、`02_c2_02.png`……一個過場一個資料夾（`ch2`、`ch3`、`ch4`、`ch5`）。

Name files like the opening: `01_c2_01.png`, `02_c2_02.png`… one folder per cutscene.
