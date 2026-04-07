# Tasks: Planner Rotation Cloud Sync

## 1. GAS (`code.gs`) — 新增 API 分支

- [x] 在 `doGet()` 新增 `type=rotation` 分支
  - 讀取 `[PlannerRotation]` 工作表（若不存在回傳 `{error:"no_rotation_data"}`）
  - 組裝並回傳 `planners`, `staffNames`, `baseDate`, `baseIndex`, `currentI1`
- [x] 在 `doPost()` 新增 `type=saveRotation` 分支
  - 清空 `[PlannerRotation]` A2:F 並重寫傳入資料
  - [V14.1] 強制以 `ss.getSheetByName("Schedule")` 尋找工作表寫入 I1，防止寫錯頁面
  - [V14.1] 若 payload 帶有 `todayPlannerName` 時同步更新 I1，省去額外 POST
- [x] 在 `doPost()` 新增 `type=updateI1` 分支
  - 寫入 `[Schedule].I1`

---

## 2. `program/app-core.js` — 新增同步函式 & 版本管理

- [x] 新增 `syncRotationToGAS()` 函式 (V14.0)
  - 讀取 `PlannerModel.get()` 與 `StaffModel.getAll()`
  - 組裝 payload 並以 fire-and-forget 方式 POST
- [x] 修正 `syncRotationToGAS()` 的今日值班者計算邏輯 (V14.1)
  - 改為直接用公式（baseDate + diffWeeks）計算，不再依賴可能回傳 null 的
    `PlannerService.getTodayPlanner(null)`
- [x] 新增 `APP_VERSION` / `APP_CODENAME` 常數 (V14.1)
  - DOMContentLoaded 自動注入所有 `.app-version` / `.app-codename` 元素
  - 未來只需修改 app-core.js 一行即可同步全站版號

---

## 3. `program/tab-others.js` — 輪值操作後觸發同步

- [x] 「點擊切換本週負責人」onclick 結尾加 `syncRotationToGAS()`
- [x] `advanceWeekBtn` click handler 結尾加 `syncRotationToGAS()`
- [x] `movePlanner()` 呼叫後加 `syncRotationToGAS()`
- [x] `setBaseDateToToday()` 呼叫後加 `syncRotationToGAS()`
- [x] `boot()` 中加入 `fetchAndApplyCloudRotation()` 確保啟動時從雲端覆蓋本機快取

---

## 4. `program/tab-schedule.js` — 排班結果即時更新

- [x] `updatePlannerBanner()` 加入同步重新渲染邏輯 (V14.1)
  - 若畫面已有排班結果，輪值切換後排班結果區塊的負責人姓名即時更新

---

## 5. `index.html` — 從雲端讀取輪值並計算今日責任者

- [x] 改寫 Script 中「計算今日責任者」的邏輯
  - `GET GAS_URL?type=rotation` 取得雲端設定
  - 用 `baseDate` + 今日計算 `diffWeeks`，得出今日值班者
  - 顯示於 `#plannerInfo`
- [x] 比對算出的姓名與 `currentI1`
  - 若不同，fire-and-forget `POST type=updateI1`
- [x] 加入 Fallback：GAS 不可用時讀取 `data.json` 原邏輯

---

## 6. `frontend/setup.html` / HTML 標頭版本號自動化

- [x] 版本號改為 `.app-version` / `.app-codename` 動態注入 (V14.1)
- [x] `frontend/viewer.html` 同步更新
- [x] `index.html` 同步更新

---

## 7. 手動驗證

- [x] 在 Google Sheets 手動新增 `[PlannerRotation]` 工作表（首次部署前）
- [x] 在 `setup.html` 調整輪值順序，確認 `[PlannerRotation]` 更新
- [x] 多台電腦開啟 `index.html`，確認今日責任者一致
- [x] 確認 `[Schedule].I1` 正確更新（含 saveRotation 一次 POST 完成）
- [x] 確認 `viewer.html` 顯示的今日負責人與 I1 一致
