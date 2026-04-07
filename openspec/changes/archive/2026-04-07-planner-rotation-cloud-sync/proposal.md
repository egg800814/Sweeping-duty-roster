# Proposal: Planner Rotation Cloud Sync

## Summary
目前輪值設定（誰當週值班、輪值順序、基準日）僅儲存於各電腦的 `localStorage`，重新整理後會被 `data.json` 覆蓋，導致多台電腦間的輪值結果不一致。

本變更將：
1. 在 Google Sheets 新增 `[PlannerRotation]` 工作表作為輪值設定的雲端儲存。
2. 在 `index.html`（全員必經入口）觸發：從雲端讀取輪值設定 → 本地計算今日值班者 → 比對後選擇性寫入 `[Schedule].I1`。
3. 讓所有人開啟頁面時都能看到最新且一致的今日責任者。

## New Capabilities
- `index.html` 啟動時自動從雲端載入最新輪值順序並計算今日責任者。
- `index.html` 比對今日已計算的責任者與 I1 現存值，僅在不同時才寫入（避免重複 POST）。
- `setup.html` 的「輪值設定」頁籤任何操作（移動順序、切換週次、推進、設基準點）後，自動同步至 `[PlannerRotation]` 工作表。

## Modified Capabilities
- `code.gs` 新增 `doGet?type=rotation` 分支：回傳 `[PlannerRotation]` 資料。
- `code.gs` 新增 `doPost` 分支 `type=saveRotation`：寫入輪值設定。
- `index.html`：原本從 `data.json` 本地推算負責人，改為從雲端讀取後推算，並回寫 I1。

## Impact
- `program/code.gs`：新增兩個 API 分支，不修改現有分支。
- `index.html`：擴充 Script 區塊邏輯。
- `program/tab-others.js`：在輪值操作後新增呼叫 `syncRotationToGAS()`。
- `program/app-core.js`：新增 `syncRotationToGAS()` 函式。
