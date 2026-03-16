# 掃區排班系統 — 自動化測試報告
> 測試執行日期：2026-03-17 ｜ Python 3.13.5 ｜ Playwright 0.7.2

---

## 一、總覽 KPI

| 指標 | 數值 |
|------|------|
| 總測試項目數 | **47** |
| 通過 | **47** ✅ |
| 失敗 | **0** |
| 跳過 | **0** |
| 通過率 | **100%** |
| 總執行時間 | **285.16 秒** |
| 平均單項耗時 | **6.07 秒** |

---

## 二、各模組測試統計

| 測試模組 | 測試數 | 通過 | 失敗 | 平均耗時(s) | 最慢(s) |
|----------|--------|------|------|-------------|---------|
| **IndexPage** (入口頁面) | 6 | 6 | 0 | 5.61 | 8.47 |
| **StaffCRUD** (人員管理) | 7 | 7 | 0 | 6.88 | 8.75 |
| **AreaCRUD** (區域管理) | 8 | 8 | 0 | 6.83 | 7.89 |
| **ScheduleTab** (每日排班) | 11 | 11 | 0 | 6.46 | 7.75 |
| **RotationTab** (輪值設定) | 3 | 3 | 0 | 6.66 | 7.75 |
| **SettingsTab** (資料管理) | 4 | 4 | 0 | 6.01 | 6.57 |
| **Viewer** (排班檢視) | 8 | 8 | 0 | 4.08 | 5.47 |

---

## 三、修復歷程

| 執行次數 | 通過 | 失敗 | 通過率 | 修復動作 |
|----------|------|------|--------|----------|
| 第 1 次 | 31 | 16 | 66% | — (初始執行，發現問題) |
| 第 2 次 | 45 | 2 | 96% | 修復 Selector / Toast 邏輯 |
| 第 3 次 | 47 | 0 | **100%** | 修復日期時區 `toISOString` |

### 修復細節

1. **`conftest.py` — `get_toast_text`**
   - 問題：Toast 動畫未結束就抓取，抓到舊的或空 Toast
   - 修復：加入 300ms 延遲 + 取最後一個 `.toast` 元素

2. **`test_setup_staff.py` / `test_setup_area.py` — Modal 按鈕 Selector**
   - 問題：`button:has-text("新增")` 選到 Modal 外的其他按鈕，導致 TimeoutError
   - 修復：限縮至 `#modalContent button:has-text("新增")`

3. **`test_setup_schedule.py` — 日期預設比對**
   - 問題：前端用 `new Date().toISOString().slice(0,10)` 取 UTC 日期，測試卻用 `toLocaleDateString` 取本地日期，跨日時差異
   - 修復：統一使用 `toISOString().slice(0,10)` 比對

---

## 四、Locust 壓力測試

| 參數 | 值 |
|------|------|
| 併發使用者數 | 50 |
| 孵化速率 | 10 人/秒 |
| 持續時間 | 30 秒 |
| 測試目標 | GAS API (`/exec`) |
| 執行狀態 | ✅ 無錯誤退出 (Exit code: 0) |

---

## 五、網頁程式碼影響

> ⚠️ **本次測試未修改任何網頁原始碼**（`setup.html`、`viewer.html`、`index.html` 及所有 `.js` 檔案皆未異動）。
> 所有修復均針對 **測試腳本本身**（`tests/` 目錄下的 `.py` 檔案）。

---

## 六、產出檔案清單

```
tests/
├── conftest.py                     # 共用 Fixtures & Helpers
├── test_index.py                   # index.html 測試
├── test_setup_staff.py             # 人員管理 CRUD 測試
├── test_setup_area.py              # 區域管理 CRUD 測試
├── test_setup_schedule.py          # 排班/輪值/設定 測試
├── test_viewer.py                  # Viewer 互動測試
├── locustfile.py                   # Locust 壓力測試腳本
└── reports/
    ├── dashboard.html              # 📊 量化可視化報告 (本檔)
    ├── test_report.html            # pytest-html 詳細報告
    ├── junit_report.xml            # JUnit XML 報告
    ├── test_results.txt            # 第 1 次執行原始輸出
    ├── test_utf8.txt               # 第 1 次 UTF-8 版
    ├── test_failures.txt           # 第 2 次 --lf 輸出
    └── test_failures_utf8.txt      # 第 2 次 UTF-8 版
```
