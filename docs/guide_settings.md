# ⚙️ 系統設定說明

> **適用對象**：系統管理員 / 排班負責人  
> **入口路徑**：`frontend/setup.html` → 點擊頂部「⚙️ 資料管理」分頁

---

## 目錄

1. [Google Sheets API 設定](#1-google-sheets-api-設定)
2. [資料備份與還原](#2-資料備份與還原)
3. [資料儲存機制說明](#3-資料儲存機制說明)
4. [系統檔案結構](#4-系統檔案結構)

---

## 1. Google Sheets API 設定

### 1.1 設定 GAS API URL

系統透過 Google Apps Script (GAS) 與 Google Sheets 試算表進行雲端同步。

**操作步驟：**

1. 進入「⚙️ 資料管理」分頁。
2. 在「🔗 Google Sheets API 設定」區塊中，將你的 GAS 部署網址貼入輸入框。
   - 格式範例：`https://script.google.com/macros/s/AKfycb.../exec`
3. 點擊 **💾 儲存**。
4. 出現「✅ 已儲存並即時生效」表示設定成功。

### 1.2 重設為預設 URL

- 點擊 **↩ 重設** 按鈕，會清除自訂 URL，改用 `data/data.json` 中的預設網址。

### 1.3 URL 來源優先順序

系統讀取 GAS API URL 的優先順序為：

```
1. localStorage 中的自訂 URL（透過「資料管理」設定頁面儲存的）
2. data/data.json 中的 gasApiUrl 欄位
```

> **💡 提示**：更新 GAS 部署版本後，只需在此更新網址即可，不需修改程式碼。

---

## 2. 資料備份與還原

### 2.1 匯出 JSON

1. 點擊 **📤 匯出 JSON**。
2. 瀏覽器會自動下載一份 `cleaning_backup_YYYY-MM-DD.json` 檔案。
3. 檔案包含：
   - 所有人員資料
   - 所有區域設定
   - 輪值排序與基準日設定
   - 歷史排班紀錄
   - 目前使用的 GAS API URL

> **⚠️ 重要**：建議定期匯出備份，尤其是在修改人員名單或輪值設定後。

### 2.2 匯入 JSON

1. 點擊 **📥 匯入 JSON**。
2. 選擇先前匯出的 `.json` 備份檔案。
3. 系統會自動還原所有資料，包含：
   - 人員資料
   - 區域設定
   - 輪值設定
   - 排班紀錄
   - GAS API URL

匯入完成後會顯示還原的人數、區域數與紀錄數。

> **⚠️ 注意**：匯入會覆蓋目前所有資料，請確認備份檔案是最新的版本。

---

## 3. 資料儲存機制說明

### 3.1 本地端（瀏覽器 localStorage）

系統使用瀏覽器的 `localStorage` 儲存以下資料：

| Key | 內容 |
|-----|------|
| `cleaning_staff` | 人員名單 |
| `cleaning_areas` | 區域設定 |
| `cleaning_planner_rotation` | 輪值排序與基準日 |
| `cleaning_schedules` | 排班歷史紀錄 |
| `cleaning_data_version` | 資料版本號 |
| `gas_api_url` | 自訂 GAS API URL |

### 3.2 啟動時的資料同步

系統每次啟動（重新整理頁面）時，會 **強制** 從 `data/data.json` 重新載入最新設定到 localStorage。

**這代表：**
- 若你在管理介面上修改了人員或區域，但沒有匯出 JSON 更新 `data/data.json`，重新整理後修改會被覆蓋。
- 要讓修改持久化，必須：
  1. 匯出 JSON 備份。
  2. 將匯出的 JSON 內容更新到 `data/data.json`。

### 3.3 雲端（Google Sheets）

以下資料會自動同步至 Google Sheets：
- 今日排班分配結果
- 今日出勤人員名單（含性別）
- 今日排班負責人姓名
- 打掃確認狀態

---

## 4. 系統檔案結構

```
Sweeping-duty-roster/
├── index.html              ← 入口門戶頁面
├── frontend/
│   ├── setup.html          ← 排班管理系統（管理員）
│   └── viewer.html         ← 打掃確認系統（打掃人員）
├── program/
│   ├── app-core.js         ← 核心控制器（GAS 同步、Toast、Modal）
│   ├── models.js           ← 資料模型（localStorage CRUD）
│   ├── scheduler.js        ← 自動排班演算法
│   ├── planner.js          ← 負責人輪值服務
│   ├── data-io.js          ← 資料匯出/匯入/清除
│   ├── default-data.js     ← 預設人員與區域資料
│   ├── tab-schedule.js     ← 每日排班分頁 UI
│   ├── tab-staff.js        ← 人員管理分頁 UI
│   ├── tab-area.js         ← 區域管理分頁 UI
│   ├── tab-others.js       ← 輪值/歷史/資料管理 + 啟動入口
│   └── code.gs             ← Google Apps Script 後端程式碼
├── assets/
│   └── index.css           ← 全站樣式
├── config/
│   └── default_data.json   ← 預設資料備份
└── data/
    └── data.json           ← 系統啟動時讀取的共用設定檔
```

---

*最後更新：2026-03-16*
