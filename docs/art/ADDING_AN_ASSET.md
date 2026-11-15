# 如何新增一個資產

一個資產（模型）從規格到出現在關卡裡，走這七步。範例是流程測試用的 `test_crate`，新資產可以直接抄它的腳本 [art/blender/test_crate.py](../../art/blender/test_crate.py) 來改。

需要：Node.js、Blender 4.2 LTS。工具會用 PATH 上的 `blender`；裝在別的地方就設環境變數 `BLENDER` 為 blender 執行檔的完整路徑。

一個資產的 `id` 同時是四個東西的名字，所以要全專案唯一、小寫加底線（`fuel_barrel`）：

| 東西 | 位置 |
|---|---|
| 規格卡 | `art/manifest/<章>.json` 裡的一筆 |
| 腳本 | `art/blender/<id>.py` |
| 模型 | `web/assets/models/<id>.glb` |
| 關卡裡的道具名稱 | `"name": "<id>"` |

## 1. 登記規格卡

在**自己那一章**的清單（`art/manifest/ch1.json`、`ch2.json`、`ch3.json`；跨章共用的在 `common.json`，要先跟組長說）加一筆，或把已經列在裡面的 `planned` 改成 `wip`：

```json
{ "id": "fuel_barrel", "class": "small_prop", "source": "blender", "status": "wip", "size": [0.6, 0.9, 0.6], "notes": "燃料桶" }
```

| 欄位 | 說明 |
|---|---|
| `class` | 決定三角面上限：`small_prop` 1,500（桶子、拒馬）、`large_prop` 6,000（車、保全亭）、`module` 3,000（牆、門、走廊一段）、`landmark` 20,000（總部大樓、火箭） |
| `size` | `[寬 X, 高 Y, 深 Z]`，公尺，遊戲裡的軸向。做出來的模型要在 ±10 % 以內 |
| `status` | `planned` 還沒做（工具會跳過）、`wip` 製作中、`ready` 已核可。**遊戲只載入 `ready` 的模型** |
| `maxTriangles` | 選填，比類別上限更嚴的面數上限 |
| `pivot` | 選填。原點在地面但不在模型正中間時寫 `"custom"`（例如燈臂伸出去的路燈） |

## 2. 寫腳本

`art/blender/<id>.py` 只要一個函式 `build(asset)`，用 `asset` 畫出形狀：

```python
"""fuel_barrel: 燃料桶。"""


def build(asset):
    steel = asset.color("metal")
    asset.cylinder("body", radius=0.3, height=0.9, at=(0, 0, 0), color=steel, segments=12)
    asset.cylinder("band", radius=0.31, height=0.06, at=(0, 0, 0.42), color=asset.color("rust"))
    asset.box("label", size=(0.25, 0.01, 0.18), at=(0, -0.305, 0.5), glow="accent")
```

腳本裡用的是 **Blender 的軸向**：公尺、Z 朝上、X 向右、**正面朝 -Y**（就是 Blender 前視圖看到的那一面），原點在**底部中心**（站在 z = 0 上，x、y 置中）。匯出時工具會轉成遊戲的「+Y 朝上、正面朝 -Z」，不用自己轉。

`asset` 提供的東西（[art/blender/_lib/asset.py](../../art/blender/_lib/asset.py)）：

| 呼叫 | 作用 |
|---|---|
| `asset.color("rust")` | 用名字取顏色。顏色表在 `art/style/palette.json` 的 `_assets.colors` |
| `asset.box(name, size=(x, y, z), at=(x, y, z), color=…, rot=(rx, ry, rz), taper=1)` | 方塊。`at` 是它**底面中心**的位置，`rot` 是繞 `at` 轉的角度（度），`taper` 小於 1 上面會收窄 |
| `asset.cylinder(name, radius, height, at=…, color=…, segments=12, radius_top=None)` | 直立圓柱；給 `radius_top` 變成錐形 |
| `asset.mesh(name, verts, faces, at=…, color=…)` | 任意形狀：頂點清單＋面清單（從外面看逆時針） |
| `glow="accent"`（代替 `color=`） | 會發光的部分。種類：`accent`（該章重點色）、`accent_faulty`（招牌壞掉的部分）、`alarm`（紅色警示燈）、`screen`（螢幕）。顏色和閃爍由遊戲依 palette 決定，腳本不用管 |
| `asset.align_bottom_center()` | 畫完後整個移到「站在 z = 0、x y 置中」 |

規則：

- **腳本裡不寫顏色數值**。要新顏色：自己那一章用的，加在 `art/style/chapters/<章>.json` 的 `"_assets": { "colors": { "名字": "#rrggbb" } }`；大家都會用到的才加進 `palette.json`（共用檔，先跟組長說）。
- 不用貼圖，顏色都是頂點色。「降飽和＋髒污」由工具在匯出前統一加上去（越靠近地面越髒、每個面深淺略有不同），所以不同人做的東西看起來是同一套。
- 面數算三角面：一個方塊 12 面，12 邊的圓柱 44 面。
- 腳本只能用 `asset`，不要自己開檔、匯出或改場景設定。

## 3. 建置

```
node tools/art/assets.mjs build fuel_barrel
```

會輸出 `web/assets/models/fuel_barrel.glb`，並印出面數、尺寸、檔案大小。一次建一整章：`--chapter ch3`（只建自己那一章，不會動到別人的模型；`planned` 的會跳過）。

## 4. 預覽

```
node tools/art/assets.mjs preview fuel_barrel
```

會把**建好的 GLB**（遊戲實際用的那個檔）算成 4 張圖放進 `art/previews/fuel_barrel/`：`front.jpg`（正面）、`back.jpg`、`side.jpg`、`three_quarter.jpg`（旁邊有一個 1.75 m 的深色人形當比例尺）。

打開這 4 張圖，對照規格卡自己檢查：正面對不對、比例對不對、認不認得出是什麼、會不會太乾淨或太花。不滿意就回去改腳本，最多 3 輪。

## 5. 檢查

```
node tools/art/assets.mjs check fuel_barrel
node tools/art/assets.mjs check --chapter ch3
```

不需要 Blender。有任何一項不合格就以非 0 結束，**沒過不能 commit**。檢查的項目：

| 項目 | 規則 |
|---|---|
| 命名 | `id` 小寫加底線，全專案唯一；腳本、GLB 檔名都是 `<id>` |
| 三角面 | 不超過類別上限（或 `maxTriangles`） |
| 檔案大小 | `small_prop` 300 KB、`large_prop` 1,200 KB、`module` 600 KB、`landmark` 4,000 KB |
| 尺寸 | 和規格卡的 `size` 差 10 % 以內（或 5 cm 以內） |
| 原點 | 最低點在 y = 0（±2 cm）；x、z 置中（除非 `pivot: "custom"`） |
| 軸向與單位 | GLB 要是 `build_assets.py` 匯出的（工具會蓋章：公尺、+Y 朝上、正面朝 -Z）。自己從 Blender 介面匯出的檔案不會過 |
| 變形 | mesh 節點不能留有旋轉、縮放、位移 |
| 貼圖 | 有的話不超過 1024 px（建議不要用） |
| 預覽圖 | `ready` 的資產要有 4 張預覽圖 |
| 沒登記的檔案 | `web/assets/models/` 裡不能有清單沒列的 GLB |
| 單章總量 | 該章＋共用的模型加起來不超過 15 MB |

三步一次做完：`node tools/art/assets.mjs all fuel_barrel`（或 `all --chapter ch3`）。

## 6. 核可與 commit

章節負責人看過預覽圖，覺得可以，就把規格卡的 `status` 改成 `ready`，再跑一次 check，然後 commit 這個資產的四樣東西：規格卡的修改、腳本、GLB、預覽圖。

```
git add art/manifest/ch3.json art/blender/fuel_barrel.py web/assets/models/fuel_barrel.glb art/previews/fuel_barrel
git commit -m "feat(art): add fuel_barrel"
```

## 7. 在關卡裡用它

1. 關卡檔最上面列出要用的清單（只要做一次）：`"manifests": ["common", "ch3"]`。
2. 道具的 `name` 寫資產的 `id`：`{ "name": "fuel_barrel", "collider": "barrel_07" }`。

如果這個名字原本有灰盒替身（例如 `barricade`），**什麼都不用改**：資產一變成 `ready`，關卡裡同名的道具就自動換成模型。碰撞盒不會變，因為碰撞只看關卡的 `colliders`。

要注意的事：

- 模型是實際大小，不會被拉成碰撞盒的大小。碰撞盒要和模型差不多大，檢查方法是網址加 `&debug=1` 看黃色外框。
- 網址加 `&models=0` 可以看回灰盒，方便前後比較。
- GLB 載不到（檔案不見、壞掉）時，會自動退回替身或灰色方塊，console 有一行 `[models] … did not load`，`debug=1` 的左上角也會列出來。
- 同一個模型在一關裡出現兩次以上，會自動合成一次繪製（InstancedMesh），不用特別處理。

### 模型上要有燈

GLB 帶不了燈。發光的部分用 `glow=`（上面第 2 步），真的會照亮周圍的燈，在**自己那一章的** `web/js/props/Ch?Props.js` 裡用 `registerExtras` 加：

```js
factory.registerExtras('warning_light', (ctx) => {
  const rig = ctx.factory.emitters.alarmLight();   // palette 決定有沒有、有幾盞
  if (rig) {
    rig.position.y = 0.3;                          // 相對於模型的原點（底部中心）
    ctx.object.add(rig);
  }
});
```

它只在這個名字用**模型**顯示時才會被呼叫；灰盒替身自己已經有燈。每一盞真的燈都算進「同時 4 盞動態燈（含手電筒）」的上限。

## 用現成素材包的模型

免費素材包（CC0 或允許任意使用的授權）下載後解壓到 repo **外面**的 `../asset_drop/`（或設環境變數 `ASSET_DROP`），不要放進 repo。腳本裡用 `asset.import_model()` 把模型帶進來，其他步驟（建置、預覽、檢查、核可）完全一樣：

```python
"""car_parked: a parked saloon. Model: PSX Style Cars by GGBotNet (CC0), Car 02."""


def build(asset):
    asset.import_model("psx_cars/Car 02/Car2.blend", length=4.2)
```

| 參數 | 作用 |
|---|---|
| 路徑 | 相對於 `asset_drop/`；可讀 `.glb`、`.gltf`、`.obj`、`.fbx`、`.blend` |
| `length=` | 等比例縮放，讓地面上最長的一邊是這麼多公尺 |
| `scale=`、`rot=`、`at=` | 沒給 `length` 時的縮放；轉向（度，讓正面朝 -Y）；放的位置 |

匯入的模型保留自己的貼圖，工具會把貼圖放大（最多 512 px）、補銳利度、加上顆粒、污漬和雨痕，再依 palette 調灰調暗。規格卡的 `notes` 要寫素材包名稱、作者和授權。

## 牆、建築、地面的材質

大小每處都不同的東西（建築、牆、圍欄、沙包、地面）不用模型，而是灰盒方塊貼上**會依實際大小重複的材質**：

1. 材質清單在 [art/textures.json](../../art/textures.json)，`node tools/art/assets.mjs textures` 會從素材包（或工具自己畫，例如沙包）做出 `web/assets/textures/<id>.jpg`，無縫、放大、加髒污。
2. 哪個顏色鍵用哪個材質，寫在自己那章 palette 檔的 `greybox.surfaces`，例如 `"building": { "texture": "brick", "metres": [4, 4] }`（一格貼圖蓋 4 × 4 m），可加 `tint`、`roughness`。`ground` 是地面。
3. 網址加 `&models=0` 會關掉模型和材質，回到純灰盒。

## 出問題時

| 訊息 | 怎麼辦 |
|---|---|
| `cannot start "blender"` | Blender 不在 PATH。重開終端機，或設 `BLENDER` 環境變數 |
| `unknown asset id` | 還沒在 `art/manifest/` 登記 |
| `unknown asset colour` | 顏色名字不在顏色表裡，照第 2 步加 |
| `needs either color=… or glow=…` | 每個形狀都要給 `color` 或 `glow` 其中一個 |
| `lowest point is at y = …` | 模型沒有站在地面上，檢查各個 `at` 的 z，或在最後呼叫 `asset.align_bottom_center()` |
| `not centred` | 模型偏離原點。置中，或真的需要偏的話在規格卡寫 `"pivot": "custom"` |
| `not exported by tools/art/build_assets.py` | GLB 不是工具建出來的，重新 build |
