# 大流行預測圖像素材生成記錄

生成方式：Codex 內建 ImageGen。所有插畫均為單獨透明素材，之後使用既有 Sharp 依規格統一縮放和量化；不使用外部圖片或遠程 URL。完整生成原圖保存在 ImageGen 生成目錄，主資料保留適合專案的高解析來源版本。

## 共用畫風

- 暖羊皮紙航海圖中的黃銅與深褐細線刻印插畫，少量深海綠點綴。
- 區域徽記用簡化單一圖形、透明背景，無文字、標牌、外框或陰影；縮小到 64×64 仍能辨識。
- 首頁圖示以羅盤與時間刻度組合；將主體置中並保留透明留白，最後正規化至 320×320。
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

首頁來源 `../feature-major-events-source.png` 是透明羅盤與時間盤圖示，黃銅搭配深海綠；沒有字、數字或遊戲 Logo。
