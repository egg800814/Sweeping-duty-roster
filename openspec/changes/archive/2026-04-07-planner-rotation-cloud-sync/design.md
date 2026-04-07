# Design: Planner Rotation Cloud Sync

## 架構概覽

```
index.html (每人必經)
  ↓ 1. GET ?type=rotation
  GAS code.gs → [PlannerRotation] 工作表
  ↓ 2. 本地計算今日值班者
  ↓ 3. 比對 I1 現有值 (來自 doGet 回傳的 todayPlanner)
  ↓ 4. 若不同 → POST type=updateI1 → I1 更新
  ↓ 5. 顯示在頁面

setup.html 輪值設定操作
  ↓ 任何輪值變動
  syncRotationToGAS() → POST type=saveRotation → [PlannerRotation] 更新
```

---

## 一、Google Sheets 新工作表：`[PlannerRotation]`

### Schema
| 欄 | 欄位 | 說明 |
|---|---|---|
| A | seq | 順序編號 (1-based) |
| B | staffId | 人員 ID (e.g. s07) |
| C | staffName | 人員姓名 |
| D | isRotate | 是否參與輪值 (TRUE/FALSE) |
| E | baseDate | 基準日期 (僅第1筆填入，e.g. 2026-03-13) |
| F | baseIndex | 基準索引 (僅第1筆填入，e.g. 16) |

### 範例資料
```
seq | staffId | staffName | isRotate | baseDate   | baseIndex
1   | s11     | 林書豪    | TRUE     | 2026-03-13 | 16
2   | s07     | 李哲旭    | TRUE     |            |
3   | s08     | 王小明    | TRUE     |            |
```

---

## 二、GAS (`code.gs`) 修改

### 新增：`doGet?type=rotation`
讀取 `[PlannerRotation]` 全表，回傳 JSON：
```json
{
  "planners": ["s11", "s07", "s08", ...],
  "staffNames": { "s11": "林書豪", "s07": "李哲旭" },
  "baseDate": "2026-03-13",
  "baseIndex": 16,
  "currentI1": "李哲旭"
}
```
- `currentI1` 取自 `[Schedule]` 的 I1 儲存格現有值，供前端比對。

### 新增：`doPost type=saveRotation`
接收 payload：
```json
{
  "type": "saveRotation",
  "planners": ["s11", "s07", ...],
  "staffNames": { "s11": "林書豪" },
  "baseDate": "2026-03-13",
  "baseIndex": 16
}
```
動作：清空 `[PlannerRotation]` A2:F 並重寫。

### 新增：`doPost type=updateI1`
接收 payload：
```json
{ "type": "updateI1", "plannerName": "李哲旭" }
```
動作：寫入 `[Schedule].I1`。

### 原有邏輯：**完全不動**

---

## 三、`index.html` 修改

在現有 Script 區塊中，將原本「讀 data.json → 本地推算 → 顯示」的邏輯替換為：

**步驟：**
1. 讀取 `data.json` 取得 `GAS_API_URL`（保留現有）。
2. `GET GAS_URL?type=rotation` 取得雲端輪值設定。
3. 用 `baseDate` + 今日日期計算 `diffWeeks`，算出今日值班者 ID 與姓名。
4. 顯示姓名於 `#plannerInfo`。
5. 比對算出的姓名與 `currentI1`：若不同，`POST type=updateI1` 更新 I1（非阻塞）。

**Fallback：** 若 GAS 無回應或雲端無資料，退回讀 `data.json` 原有邏輯。

---

## 四、`app-core.js` 新增函式：`syncRotationToGAS()`

```javascript
function syncRotationToGAS() {
  if (!GAS_API_URL || GAS_API_URL.includes('YOUR_GAS')) return;
  const rot = PlannerModel.get();
  const allStaff = StaffModel.getAll();
  const staffNames = {};
  allStaff.forEach(s => staffNames[s.id] = s.name);
  const payload = {
    type: 'saveRotation',
    planners: rot.planners,
    staffNames,
    baseDate: rot.baseDate,
    baseIndex: rot.baseIndex,
  };
  fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }).catch(err => console.warn('syncRotationToGAS 失敗:', err));
}
```

---

## 五、`tab-others.js` 修改

在以下操作之後，新增 `syncRotationToGAS()` 呼叫：
- `renderRotation()` 中「點擊切換本週負責人」的 `onclick`
- `advanceWeekBtn` click handler
- `movePlanner()` 呼叫後
- `setBaseDateToToday()` 呼叫後

---

## 六、安全性

| 項目 | 結論 |
|---|---|
| 原有 APK / viewer.html | 不受影響，仍讀 A:I 欄 |
| 多人同時寫入 I1 | GAS 順序執行，最終值一致，無衝突 |
| 比對後才寫入 | 避免無謂 POST，減少 GAS 配額消耗 |
| GAS 超時 | 所有新操作為 fire-and-forget，不阻塞 UI |

---

## 七、V14.1 修正備忘

| 問題 | 根本原因 | 解法 |
|---|---|---|
| saveRotation 後 I1 沒更新 | `sheet` 變數指向 `PlannerRotation` 而非 `Schedule` | 改用 `ss.getSheetByName("Schedule")` 強制鎖定 |
| syncRotationToGAS 傳入空 todayPlannerName | `PlannerService.getTodayPlanner(null)` 在 presentIds=null 時可能回傳 null | 改為直接用 baseDate+diffWeeks 公式計算 |
| 排班結果中的負責人不即時更新 | renderScheduleResult 不會在輪值切換後重新呼叫 | 在 updatePlannerBanner() 加入條件式重新渲染邏輯 |
| 各頁面版本號需手動逐一修改 | 版本號硬寫在各 HTML | APP_VERSION 常數 + .app-version CSS class 動態注入 |
