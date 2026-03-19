# MDI 打掃區域分配系統 — 現狀規格書 (Baseline)

> **版本**：v13.0（逆向工程文件，建立日期：2026-03-19）  
> **文件目的**：記錄系統現有架構、資料結構、API 端點與核心業務邏輯，作為導入 OpenSpec 框架的起點基準。

---

## 1. 系統架構概述

本系統為**輕量級 Vanilla Web App**，無後端伺服器，採純靜態前端 + Google Apps Script (GAS) 雲端 API 的架構。

```
┌─────────────────────────────────────────────────────────────┐
│  入口門戶 (index.html)                                       │
│    ├── 一般人員端 → frontend/viewer.html                     │
│    └── 管理員端  → frontend/setup.html                      │
└─────────────────────────────────────────────────────────────┘
           │ GET/POST (Fetch API)
           ▼
┌─────────────────────────────────────────┐
│  Google Apps Script (code.gs)           │
│  雲端 API Endpoint                      │
│    ├── doGet()  — 讀取排班/確認狀態     │
│    ├── doPost() — 寫入排班/確認/操作    │
│    └── doOptions() — CORS Preflight     │
└─────────────────────────────────────────┘
           │ 讀寫
           ▼
┌──────────────────────────────────────────────────┐
│  Google Sheets（雲端資料庫）                      │
│    ├── [Schedule]  — 每日排班明細                 │
│    ├── [StaffData] — 今日出勤人員名冊             │
│    └── [Logs]      — (選用) 系統操作紀錄          │
└──────────────────────────────────────────────────┘
```

### 本機儲存（localStorage）

管理端 (`setup.html`) 以 `localStorage` 為主要運行狀態儲存媒介。系統啟動時強制從 `data/data.json` 載入，覆蓋舊本機快取。

| 鍵名 (`STORAGE_KEYS`) | 用途 |
|---|---|
| `cleaning_staff` | 所有人員資料 |
| `cleaning_departments` | 部門列表 |
| `cleaning_roles` | 角色列表 |
| `cleaning_areas` | 清掃區域列表 |
| `cleaning_planner_rotation` | 每週負責人輪值狀態 |
| `cleaning_schedules` | 排班歷史紀錄 |
| `cleaning_data_version` | 資料版本號 (目前 `13.0`) |

---

## 2. 資料模型 Schema

### 2.1 人員（Staff）

```json
{
  "id": "s01",              // string, 前綴 's', 遞增
  "name": "張書友",          // string
  "gender": "male",         // "male" | "female"
  "active": true,           // boolean, 是否在職
  "isDefault": false,       // boolean, 預設是否勾選出勤
  "isRotate": true,         // boolean, 是否參與責任者輪值
  "role": "manager",        // string, 舊欄位（v13+ 改用 roleId）
  "roleId": null,           // string | null, 連結 RoleModel
  "departmentId": null,     // string | null, 連結 DepartmentModel
  "department": "技術部",    // string, 舊欄位（顯示用）
  "floorRestriction": null, // number | null, 限制樓層 (1 or 2)
  "excludeAreas": []        // string[], 排除的區域 ID 列表
}
```

### 2.2 部門（Department）

```json
{
  "id": "d1",          // string, 前綴 'd', 遞增
  "name": "技術部",     // string
  "sortOrder": 1       // number, 顯示排序
}
```

### 2.3 角色（Role）

```json
{
  "id": "r1",         // string, 前綴 'r', 遞增
  "name": "一般",      // string
  "weight": 1         // number, 排序權重 (越小越前)
}
```

### 2.4 清掃區域（Area）

```json
{
  "id": "a1",                       // string, 前綴 'a', 遞增
  "name": "2樓_廚房",                // string
  "floor": 2,                       // number, 0=跨樓層
  "priority": "daily",              // "daily" | "flexible" | "optional"
  "genderRestriction": "female",    // "none" | "female" | "malePreferred"
  "minPeople": 1,                   // number
  "maxPeople": 2,                   // number
  "order": 1,                       // number, 顯示與排班排序
  "holidayBoost": false             // boolean, 明日為假日時增加人數至 maxPeople
}
```

**區域優先順序分類：**
- `daily`（必掃）：每日必定分配，缺人則產生警告。共 7 個（a1~a7）
- `flexible`（彈性）：有人就分配，滿人則跳過。共 8 個（a8, a9, a11, a13, a14, a15, a16 等）
- `optional`（可選）：管理員手動勾選後才分配。共 2 個（a10, a12）

**現有 16 個區域清單：**

| ID | 名稱 | 樓層 | 優先度 | 性別限制 | 人數 |
|---|---|---|---|---|---|
| a1 | 2樓_廚房 | 2 | daily | female | 1–2 |
| a2 | 2樓_女廁 | 2 | daily | female | 1–2 |
| a3 | 2樓_男廁 | 2 | daily | malePreferred | 1–2 |
| a4 | 2樓_陽台 | 2 | daily | malePreferred | 1–4 (holidayBoost) |
| a5 | 1樓_食堂 | 1 | daily | none | 1–1 |
| a6 | 1樓_男廁 | 1 | daily | malePreferred | 1–2 |
| a7 | 1樓_女廁 | 1 | daily | female | 1–2 |
| a8 | 2樓_走廊、玄關、應接室 | 2 | flexible | none | 1–1 |
| a9 | 2樓_事務所全區 | 2 | flexible | none | 1–6 |
| a10 | 2樓_多目的室 | 2 | optional | none | 1–1 |
| a11 | 1樓_陽台 | 1 | flexible | none | 1–1 |
| a12 | 1樓_會議室1 | 1 | optional | none | 1–1 |
| a13 | 1樓_走廊 | 1 | flexible | none | 1–1 |
| a14 | 1~2樓_樓梯 | 0 | flexible | none | 1–1 |
| a15 | 1樓_無塵室更衣室 | 1 | flexible | none | 1–1 |
| a16 | 1樓_女子更衣室 | 1 | flexible | female | 1–1 |

### 2.5 責任者輪值（PlannerRotation）

```json
{
  "planners": ["s11", "s07", "..."],  // string[], 參與輪值的人員 ID 序列（有序）
  "currentIndex": 16,                 // number, 目前輪值指標
  "baseDate": "2026-03-13",           // string, 基準日期 (YYYY-MM-DD)
  "baseIndex": 16                     // number, 基準日對應的輪值指標
}
```

**推算邏輯**：每週自動依 `baseDate` + `diffWeeks` 計算當前責任者，不需手動推進。

### 2.6 排班紀錄（Schedule）

存放於 `localStorage` 的歷史快取：

```json
{
  "date": "2026-03-13",          // string, YYYY-MM-DD
  "plannerId": "s11",            // string, 今日責任者 ID
  "assignments": [
    {
      "areaId": "a1",            // string
      "staffIds": ["s07", "s08"] // string[]
    }
  ]
}
```

### 2.7 Google Sheets Schema（雲端資料庫）

#### [Schedule] 工作表

| 欄位 | 欄名 | 說明 |
|---|---|---|
| A | date | 日期（`yyyy-MM-dd`） |
| B | areaCode | 區域 ID（如 `a1`） |
| C | areaName | 區域名稱 |
| D | persons | 負責人員（逗號分隔） |
| E | status1 | 第 1 位人員確認狀態（`已確認` 或空白） |
| F | status2 | 第 2 位 |
| G | status3 | 第 3 位 |
| H | status4 | 第 4 位 |
| I1 | plannerName | 今日責任者姓名（單格，不 append 每排班行） |

#### [StaffData] 工作表

| 欄位 | 說明 |
|---|---|
| A（姓名） | 今日出勤人員名字 |
| B（性別） | `male` 或 `female` |

*每次同步時全量清空並重寫。*

---

## 3. GAS API 端點

**GAS 部署 URL（當前）**：  
`https://script.google.com/macros/s/AKfycbylxdMoFwSyolG-xonnAUzz5Obzp-qruRMf2NpPajdoXmnvreja_4aVyj3fAZzVyOZm/exec`

---

### 3.1 `GET /` — 讀取今日排班

| 參數 | 說明 |
|---|---|
| （無） | 一般確認頁（`viewer.html`）使用，回傳今日排班陣列 |
| `?type=admin` | 管理端（`setup.html`）使用，回傳完整資料物件 |

**回應（一般模式）**：`Assignment[]`

```json
[
  {
    "areaCode": "a1",
    "areaName": "2樓_廚房",
    "persons": "楊麗玉, 江辰平",
    "staffNames": "楊麗玉, 江辰平",
    "status1": "已確認",
    "status2": "",
    "gender1": "female",
    "gender2": "female",
    "genders": ["female", "female"]
  }
]
```

**回應（admin 模式）**：

```json
{
  "date": "2026-03-19",
  "todayPlanner": "楊麗玉",
  "staffMeta": [{ "name": "楊麗玉", "gender": "female" }],
  "assignments": [ ...同上... ]
}
```

---

### 3.2 `POST /` — 寫入資料（兩種模式）

**Content-Type**：`text/plain;charset=utf-8`（GAS CORS 限制）

#### 模式 A：全量同步排班（由 `setup.html` 觸發）

```json
{
  "date": "2026-03-19",
  "plannerName": "楊麗玉",
  "staffMeta": [{ "name": "楊麗玉", "gender": "female" }],
  "assignments": [
    {
      "areaId": "a1",
      "areaName": "2樓_廚房",
      "staffIds": ["s07"],
      "staffNames": "楊麗玉"
    }
  ]
}
```

- `assignments` 有值：清空並重寫 Schedule 工作表，保留已有的確認狀態（比對 `areaCode_personName`）。
- `staffMeta` 有值：清空並重寫 StaffData 工作表。
- `plannerName` 有值：更新 Schedule.I1。

**成功回應**：`{ "status": "success", "message": "..." }`

#### 模式 B：局部狀態操作（由 `viewer.html` 觸發）

```json
{
  "areaCode": "a1",
  "personIndex": 0,
  "action": "confirm"   // "confirm" | "delete" | "move"
}
```

| action | 說明 | 額外參數 |
|---|---|---|
| `confirm` | 在對應欄位（E–H）寫入「已確認」 | — |
| `delete` | 從 D 欄移除指定人員，清空其確認欄 | — |
| `move` | 將人員移至另一區域 | `targetAreaCode: string` |

**成功回應**：`{ "success": true }` 或 `{ "success": true, "movedName": "..." }`

---

## 4. 核心業務邏輯

### 4.1 排班演算法（`scheduler.js`）

排班引擎採**五階段確定性分配**，以日期 + 出勤人員清單為種子透過 LCG 偽隨機產生確定結果，重新產生相同條件永遠得到相同排班。

```
階段 1 → daily 區域（有性別限制）
階段 2 → daily 區域（無性別限制）
階段 3 → flexible 區域（a16 女更衣室優先處理）
階段 4 → optional 區域（需管理員手動啟用）
階段 5 → Overfill：剩餘人員強制分配至空間大的區域（優先 a9、a4）
```

**公平性機制**：
- 14 天內指派次數少的人優先選中
- 7 天內未做過同區域的人優先選中

**性別保護規則**：
- `female` 區域（廁所/廚房）：男生嚴禁進入
- `malePreferred` 區域（男廁）：不允許男女混掃

**分配人數邏輯（`_decideHeadcount`）**：
- 出勤總人數 ≥ 20：分配至 `maxPeople`
- 否則：分配至 `minPeople`
- `forceMax`（假日 boost）：直接分配至指定最大值

### 4.2 責任者輪值邏輯

由 `baseDate`（基準日）+ `baseIndex`（基準指標）+ `diffWeeks`（週差）自動計算：

```
actualIndex = (baseIndex + diffWeeks) % planners.length
```

若該週責任者當天未出勤，系統自動向後找下一位有出勤的代理人（`isDeputy: true`）。

### 4.3 資料初始化流程

每次管理頁面（`setup.html`）啟動時：
1. 強制 fetch `data/data.json?v=timestamp`（`no-store`，略過快取）
2. 清除所有 `localStorage` 中的系統資料
3. 從 JSON 重新寫入全部資料（staff, areas, departments, roles, plannerRotation, schedules）
4. 寫入版本號 `13.0`

> 目的：確保多台電腦（共用 file server）的排班設定始終對齊。

### 4.4 確認狀態輪詢（`viewer.html`）

`viewer.html` 每 **15 秒**對 GAS API 發出 `GET` 請求並比對資料 hash，有變動才重新渲染畫面，避免不必要的 DOM 操作。

---

## 5. 前端頁面結構

### `index.html` — 入口門戶
- 顯示今日責任者姓名（先本機計算，再嘗試從雲端更新）
- 兩個入口連結：`viewer.html`（一般人員）、`setup.html`（管理員）

### `frontend/viewer.html` — 確認頁（一般人員）
- 直接對 GAS API doGet 讀取今日排班
- 每張卡片顯示一個區域 + 已分配人員
- 每位人員有一個「確認按鈕」，點擊後 POST 至 GAS 寫入「已確認」
- 15 秒輪詢自動刷新

### `frontend/setup.html` — 管理後台（管理員）
分為 6 個 Tab（由 `app-core.js initTabEvents` 管理）：

| Tab | 模組 | 主要功能 |
|---|---|---|
| `schedule` | `tab-schedule.js` | 勾選出勤人員、產生排班、鎖定調整、雲端同步 |
| `staff` | `tab-staff.js` | 人員 CRUD、出勤/輪值設定 |
| `areas` | `tab-area.js` | 區域 CRUD、排序、限制設定 |
| `rotation` | `tab-schedule.js` 部分 | 責任者輪值順序管理 |
| `history` | `tab-others.js` | 歷史排班查詢、公平性指數 |
| `settings` | `tab-others.js` | 部門/角色管理、資料匯出入、GAS URL 設定 |

---

## 6. 檔案結構索引

```
📁 打掃區域分配/
│
├── index.html                    入口門戶
├── AGENTS.md                     AI 開發守則
│
├── frontend/
│   ├── viewer.html               一般人員確認頁
│   └── setup.html                管理員後台
│
├── program/                      所有 JS 原始碼
│   ├── models.js                 資料模型層 + localStorage CRUD
│   ├── scheduler.js              排班演算法（五階段＋LCG）
│   ├── app-core.js               應用核心：GAS 同步、Tab 控制、Toast
│   ├── data-io.js                資料備份匯出入（DataIO）
│   ├── planner.js                責任者相關服務（PlannerService）
│   ├── tab-schedule.js           排班 Tab UI 渲染
│   ├── tab-staff.js              人員 Tab UI 渲染
│   ├── tab-area.js               區域 Tab UI 渲染
│   ├── tab-others.js             歷史/設定 Tab UI 渲染
│   ├── default-data.js           預設資料 JS 版本（可能已由 JSON 取代）
│   └── code.gs                   Google Apps Script 雲端後端
│
├── config/
│   └── default_data.json         系統設定種子檔（共用全域資料）
│
├── data/
│   └── data.json                 執行期主要初始資料（由 default_data.json 複製）
│
├── assets/
│   └── index.css                 全域 CSS
│
└── openspec/
    ├── config.yaml
    ├── specs/                    ← 本文件所在
    └── changes/                  開發任務變更提案
```

---

## 7. 已知技術債 / 待釐清事項

| 項目 | 說明 |
|---|---|
| 欄位雙軌 | `staff.role`（舊字串）與 `staff.roleId`（v13 新參照）並存，需統一 |
| `data.json` 與 `default_data.json` 差異 | `config/default_data.json` 為種子，`data/data.json` 為執行期主檔，但程式碼統一讀 `data/data.json`；需確認同步機制 |
| `default-data.js` 的角色 | 與 JSON 是否重複？是否已廢棄？ |
| `setup.html` 的 `doGet ?type=admin` 同步用途 | `loadAttendanceFromGAS()` 的完整流程需確認（位於 `tab-schedule.js`，本次未完整讀取） |
| 確認狀態最多支援 4 人 | GAS Schema 固定 E–H 欄（status1~4），若區域需超過 4 人需改架構 |
