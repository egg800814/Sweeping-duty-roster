# Specs: Planner Rotation Cloud Sync

## GAS API 規格

### GET `?type=rotation`
- **回傳格式**：
  ```json
  {
    "planners": ["s11", "s07", "s08"],
    "staffNames": { "s11": "林書豪", "s07": "李哲旭" },
    "baseDate": "2026-03-13",
    "baseIndex": 16,
    "currentI1": "李哲旭"
  }
  ```
- **若 `[PlannerRotation]` 工作表不存在或為空**：回傳 `{ "error": "no_rotation_data" }`。

### POST `type=saveRotation`
- **payload**：
  ```json
  {
    "type": "saveRotation",
    "planners": ["s11", "s07"],
    "staffNames": { "s11": "林書豪" },
    "baseDate": "2026-03-13",
    "baseIndex": 16
  }
  ```
- **動作**：清空 `[PlannerRotation]` A2:F 並依序寫入。
- **回傳**：`{ "status": "success" }`

### POST `type=updateI1`
- **payload**：`{ "type": "updateI1", "plannerName": "李哲旭" }`
- **動作**：寫入 `[Schedule].I1`。
- **回傳**：`{ "status": "success" }`

---

## 前端行為規格

### `index.html` 計算邏輯
```
diffWeeks = floor((today - baseDate) / 7天)
actualIndex = (baseIndex + diffWeeks) % planners.length
今日值班者 = planners[actualIndex]
```
- 若 GAS 不可用或回傳 error，退回讀取 `data.json` 的原有邏輯（不中斷使用者流程）。
- I1 回寫為 **fire-and-forget**，不等待回應。

### `syncRotationToGAS()` 觸發時機
| 使用者操作 | 是否觸發 |
|---|---|
| 點擊人員切換本週負責人 | ✅ |
| 點擊 🔼🔽 移動順序 | ✅ |
| 點擊「⏩ 推進下一週」 | ✅ |
| 點擊「📅 設為自動輪值基準點」 | ✅ |
| 開啟頁面（讀取時） | ❌（只讀不寫） |
