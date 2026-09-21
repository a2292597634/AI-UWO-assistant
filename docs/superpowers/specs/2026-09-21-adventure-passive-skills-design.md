# 新增三个冒险被动技能设计

## 目标

在不修改 `archive/` 的前提下，为小程序新增「採集險地」「平定險地」「觀察險地」三个冒险被动技能，保存用户提供的十级效果数值，并将技能追加到指定航海士现有冒险技能组的末尾。

## 已确认资料

三个技能都属于 `skill_category_adventure`，技能关系均属于 `sk5` 冒险技能组，新增关系统一使用 `slot: 2`，保留每名航海士现有 `slot: 0`、`slot: 1` 的顺序。

| 技能 ID | 名称 | 基础说明 | Lv.1–Lv.10 效果 |
| --- | --- | --- | --- |
| `skill_wo_offline_adventure_collect_hazard` | 採集險地 | 探險中採集力增加3。 | `3 / 5 / 6 / 7 / 9 / 10 / 11 / 12 / 13 / 15` |
| `skill_wo_offline_adventure_battle_hazard` | 平定險地 | 探險中戰鬥力增加3。 | `3 / 5 / 6 / 7 / 9 / 10 / 11 / 12 / 13 / 15` |
| `skill_wo_offline_adventure_observation_hazard` | 觀察險地 | 探險中觀察力增加3。 | `3 / 5 / 6 / 7 / 9 / 10 / 11 / 12 / 13 / 15` |

三项技能的 `levelInfo` 采用现有格式：

```text
Lv1: 3 | Lv2: 5 | Lv3: 6 | Lv4: 7 | Lv5: 9 | Lv6: 10 | Lv7: 11 | Lv8: 12 | Lv9: 13 | Lv10: 15
```

技能实体使用离线手动资料的 `sourceRefs.workOrderId`，不伪造 `voyageTw` 来源；关系的 `level` 表示该航海士当前拥有的技能等级，按现有冒险技能记录为 `1`，不把十级效果数值写入关系等级。未另行提供解锁门槛，依现有 `sk5` 冒险技能关系统一记录 `unlockLevel: 1`。

## 挂载对象

| 技能 | 目标航海士 | Canonical ID | 资料文件 |
| --- | --- | --- | --- |
| 採集險地 | 約翰·戴維斯 | `officer_chabbd046` | `data/master/officers.json` |
| 採集險地 | 瑪麗亞·西碧拉·梅里安 | `officer_chaabd005` | `data/master/officers.json` |
| 平定險地 | 皮雅利·帕夏 | `officer_custom_piyale` | `data/master/custom-officers.json` |
| 平定險地 | 約翰尼斯·克卜勒 | `officer_chaabd009` | `data/master/officers.json` |
| 平定險地 | 伊本·巴圖塔 | `officer_chaabd010` | `data/master/officers.json` |
| 觀察險地 | 瑪麗亞·瑪格麗塔·基希 | `officer_chasbd003` | `data/master/officers.json` |
| 觀察險地 | 維奧蘭特·多利亞 | `officer_chacbd017` | `data/master/officers.json` |
| 觀察險地 | 賽莉梅 | `officer_chast099` | `data/master/officers.json` |

每笔关系使用：

```json
{
  "kind": "passive",
  "sourceGroup": "sk5",
  "slot": 2,
  "unlockLevel": 1,
  "level": 1
}
```

## 素材与数据流

用户提供的三张图片是包含说明面板的截图。实施时从每张截图中裁出左上方技能图标，分别保存为与 Canonical 技能 ID 对应的 PNG 文件，交给现有 `data/assets/staging/` 素材流程处理。不会把截图整张当成技能图标，也不会修改 `archive/`。

技能数据和航海士关系只手动维护于 `data/master/`；`miniprogram/generated/`、`data/assets/asset-dependencies.json`、运行时索引和 CDN 发布清单由既有工具生成。若发布环境具备 CloudBase 凭证，则通过现有资源发布流程将三个新图标加入发布清单；若发布凭证不可用，必须明确报告图标发布仍待外部发布，不伪造 CDN 记录。

## 验收与非目标

实施后以测试先行，至少验证：

1. 三个技能实体的名称、分类、说明、`levelInfo` 和离线来源引用正确。
2. 八名目标航海士各自新增正确的被动 `sk5` 关系，并且新增关系处于最后一个 slot，不改变既有关系顺序。
3. 技能关系使用 `level: 1` 与 `unlockLevel: 1`，十级效果只存在于技能实体的 `levelInfo`。
4. 三个图标素材均为可解码 PNG，资产依赖索引能为每个技能解析对应文件。
5. `npm run data:check`、`npm run generate:check` 及最终 `npm run verify` 通过。

本次不修改 UI 组件、样式、技能等级显示规则、`archive/` 快照或无关航海士资料。
