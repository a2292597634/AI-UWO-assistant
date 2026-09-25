# 大流行預測圖像素材生成記錄

生成方式：Codex 內建 ImageGen。所有插畫均為單獨透明素材，之後使用既有 Sharp 依規格統一縮放和量化；不使用外部圖片或遠程 URL。完整生成原圖保存在 ImageGen 生成目錄，主資料保留適合專案的高解析來源版本。

## 共用畫風

- 暖羊皮紙航海圖中的黃銅與深褐細線刻印插畫，少量深海綠點綴。
- 區域徽記用簡化單一圖形、透明背景，無文字、標牌、外框或陰影；縮小到 64×64 仍能辨識。
- 首頁功能圖示採深海軍藍／炭黑圓角方形徽章、黃銅外框與立體高光；羅盤與時鐘置中，徽章外角保持透明，正規化至 320×320、16 色。
- 圖片來源正規化採 16 色 PNG。羅盤 icon 主體縮放置於透明畫布中央，目標可見邊界約 86%，保留既有圖形細節。

## 區域徽記

| 來源 zone ID | 檔名                        | 圖形主體                   |
| ------------ | --------------------------- | -------------------------- |
| `zone_37`    | `region-zone-37-source.png` | 北海：單桅商船與錨         |
| `zone_41`    | `region-zone-41-source.png` | 東地中海：古港拱廊與柱廊   |
| `zone_57`    | `region-zone-57-source.png` | 南歐與西地中海：海岸燈塔   |
| `zone_21`    | `region-zone-21-source.png` | 西非：棕櫚海岸             |
| `zone_22`    | `region-zone-22-source.png` | 南非：海角峭壁             |
| `zone_23`    | `region-zone-23-source.png` | 東非：三角帆船             |
| `zone_58`    | `region-zone-58-source.png` | 阿拉伯與西印度：棕櫚和商船 |
| `zone_59`    | `region-zone-59-source.png` | 東印度與印度支那：寺塔屋簷 |
| `zone_50`    | `region-zone-50-source.png` | 南亞：象影與海岸           |
| `zone_53`    | `region-zone-53-source.png` | 東亞：帆船與山巒           |
| `zone_54`    | `region-zone-54-source.png` | 東北亞：雪峰               |
| `zone_33`    | `region-zone-33-source.png` | 大洋洲：珊瑚島             |
| `zone_63`    | `region-zone-63-source.png` | 大洋洲東部：袋鼠與海浪     |
| `zone_34`    | `region-zone-34-source.png` | 北極海：冰山               |
| `zone_18`    | `region-zone-18-source.png` | 西南美：安地斯山與飛鳥     |
| `zone_60`    | `region-zone-60-source.png` | 美東：港口燈塔             |
| `zone_20`    | `region-zone-20-source.png` | 西北美：針葉林山脈         |
| `zone_55`    | `region-zone-55-source.png` | 太平洋：浪紋羅盤           |

## 背景和裝飾

| 檔名                               | 圖形主體                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| `paper-chart-tile-source.png`      | 淡羊皮紙纖維、少量無標籤海岸等高線和稀疏海圖刻度，可平鋪 |
| `matrix-ship-engraving-source.png` | 矩陣頁邊緣用的簡潔側面帆船線描                           |
| `compass-rose-source.png`          | 無方位字母與數字的八向羅盤玫瑰                           |
| `journey-harbor-footer-source.png` | 行程列表底端的淺港口、岸線和海面剪影                     |

首頁來源 `../feature-major-events-source.png` 是 320×320、16 色 PNG：深海軍藍圓角徽章、黃銅外框與羅盤，搭配略偏右下的象牙白時鐘；徽章外角透明，沒有文字、數字、Logo 或水印。

## 首頁功能入口圖示

- 來源：`../feature-major-events-source.png`。保留羅盤與時鐘題材，改為深色圓角方形徽章、黃銅外框與立體高光，外角透明。
- ImageGen 原稿：`C:/Users/XB/.codex/generated_images/01a0d972-6607-7022-ae4c-f37549f2a436/exec-5339f0f8-5868-45a7-9615-bfd7d8c93ec5.png`。
- 來源 alpha 邊界為 286×286，置中於 320×320 透明畫布，16 色 PNG；`feature-major-events` 配方產出 96×96、16 色 PNG，最大 4 KiB。

### 最終 ImageGen 提示詞

Use case: precise-object-edit
Asset type: 《Uncharted Waters Origin》微信小程序首頁功能圖示，來源正規化為 320×320，最終為 96×96
Primary request: 以圖 1 為唯一編輯目標，保留現有羅盤＋時鐘徽章設計，只微調徽章外框的尺寸與佔位。圖 2 是目前新版圖示，圖 3 是同系列首頁圖示的材質與邊框參考。
Input images: 圖 1 為唯一編輯目標；圖 2 與圖 3 僅作為徽章風格參考。
Scene/backdrop: 透明方形畫布。保留深海軍藍與炭黑色琺瑯圓角方形徽章底，四角與徽章外側必須是真正透明。
Subject: 原有黃銅羅盤玫瑰與右下方象牙白圓形時鐘，保留目前的造型、細節、比例和相對位置。羅盤、時鐘、裝飾球、刻度和指針都不可裁切。
Style/medium: 延續圖 1 的精緻遊戲 UI 浮雕徽章；拋光黃銅外框、深色琺瑯底、清晰輪廓、溫暖立體高光，與圖 2、圖 3 的材質和光影一致。
Composition/framing: 將深色圓角方形徽章與黃銅外框在 320×320 等效畫布上均衡放大，令完整圖形的可見 alpha 外框接近置中的 286×286 正方形（寬、高各 284–288px）。上、下外框稍微向外延展，使高度配合寬度；保持徽章方正，不拉伸羅盤或時鐘。畫布四周保留透明邊界，所有內容完整置於 320×320 內。
Lighting/mood: 保留柔和暖金高光與穩定清晰的深淺對比。
Color palette: 深海軍藍、炭黑、黃銅金、少量象牙白；適合 16 色量化。
Materials/textures: 與圖 1 相同的拋光黃銅邊框、琺瑯徽章面及微妙內陰影。
Text (verbatim): 無文字。
Constraints: 僅調整圖 1 的外框佔位，維持徽章風格及羅盤＋時鐘主題；完整圖形外框目標為 284–288×284–288px／320×320；四角透明；不裁切、不超出畫布、不改變主體比例。無字、無數字、無 Logo、無水印。
Avoid: 改變羅盤星芒或時鐘設計、移動時鐘、拉伸物件、裁切羅盤尖端或時鐘、增加額外物件、填滿透明角落、文字、數字、Logo、水印。
