/*
 * 【app-core.js】
 * 應用程式核心控制器。
 * 負責以下功能：
 *   - 全域排班狀態管理（currentScheduleState、sessionPresentStaffIds 等）
 *   - Google Apps Script (GAS) API URL 的初始化與儲存介面
 *   - syncScheduleToGAS()：將排班結果與出勤人員同步至 Google Sheets
 *   - debouncedSyncToGAS()：防抖版同步，避免連續操作造成大量請求
 *   - showToast()：顯示右下角浮動通知
 *   - openModal() / closeModal()：Modal 彈窗的開關控制
 *   - Tab 切換事件監聽（點擊頁籤時渲染對應內容）
 *
 * 變更履歷：
 *   V14.1  2026-04-07
 *          - 新增 APP_VERSION / APP_CODENAME 常數，自動將版本號注入所有
 *            帶有 .app-version / .app-codename 類別的 HTML 元素
 *          - 修正 syncRotationToGAS()：不再依賴可能傳回 null 的
 *            PlannerService.getTodayPlanner(null)，改為直接用公式計算今日値班者
 *          - syncRotationToGAS() 新增 成功診斷韟 記錄
 *   V14.0  2026-03-26
 *          - 新增 syncRotationToGAS()：將輪值設定同步至 GAS [PlannerRotation]
 *            並順便更新 [Schedule].I1 今日責任者
 */

// ─── 版本管理 (V14.1 自動化) ───
const APP_VERSION = "V14.1";
const APP_CODENAME = "Cloud Sync";

// 自動將版本號導向至 UI 中帶有 .app-version 類別的元素
document.addEventListener('DOMContentLoaded', () => {
    const versionElements = document.querySelectorAll('.app-version');
    versionElements.forEach(el => {
        el.textContent = APP_VERSION;
    });
    const codenameElements = document.querySelectorAll('.app-codename');
    codenameElements.forEach(el => {
        el.textContent = APP_CODENAME;
    });
});

// ─── 排班狀態管理 ───
let currentScheduleState = null;
let sessionPresentStaffIds = null;  // 暫存目前的勾選人員
let sessionOptionalAreaIds = null;  // 暫存目前的區域勾選

// ─── Google Sheets 同步 ───
let GAS_DEFAULT_URL = 'YOUR_GAS_API_URL_HERE';
let GAS_API_URL = localStorage.getItem('gas_api_url') || '';

// 定義 Debounce 同步函數，避免連續勾選造成大量請求
let isSyncingFromCloud = false;
let syncDebounceTimer = null;
function debouncedSyncToGAS() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        const dateEl = document.getElementById('scheduleDate');
        const dateValue = dateEl ? dateEl.value : new Date().toISOString().slice(0, 10);
        const assignments = currentScheduleState ? currentScheduleState.assignments : null;
        const skippedAreas = currentScheduleState ? currentScheduleState.skippedAreas : null;
        syncScheduleToGAS(assignments, skippedAreas, dateValue, assignments !== null);
    }, 1000);
}

// ─── DOMContentLoaded：延遲綁定事件，確保所有 script 已載入 ───
document.addEventListener('DOMContentLoaded', () => {
    initGasUrlSettings();
    initTabEvents();

    // loadCloudBtn — 需等 tab-schedule.js 的 loadAttendanceFromGAS 載入
    const loadCloudBtn = document.getElementById('loadCloudBtn');
    if (loadCloudBtn) {
        loadCloudBtn.addEventListener('click', () => {
            if (typeof loadAttendanceFromGAS === 'function') {
                loadAttendanceFromGAS();
            } else {
                console.error("loadAttendanceFromGAS 尚未載入");
            }
        });
    }

    // Modal 關閉
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });
    }
});

// ─── Tab 切換邏輯 ───
function initTabEvents() {
    const tabNav = document.getElementById('tabNav');
    if (!tabNav) return;

    tabNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const tab = btn.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const panel = document.getElementById('panel-' + tab);
        if (panel) panel.classList.add('active');

        // 安全地呼叫各模組的渲染函式
        switch (tab) {
            case 'staff':
                if (typeof renderStaffTable === 'function') renderStaffTable();
                break;
            case 'areas':
                if (typeof renderAreaTable === 'function') renderAreaTable();
                break;
            case 'rotation':
                if (typeof renderRotation === 'function') renderRotation();
                break;
            case 'history':
                if (typeof renderHistory === 'function') renderHistory();
                break;
            case 'schedule':
                if (typeof refreshSchedulePanel === 'function') refreshSchedulePanel();
                break;
            case 'settings':
                if (typeof renderSettingsTables === 'function') renderSettingsTables();
                break;
        }
    });
}

// ─── GAS URL 設定介面 ───
async function initGasUrlSettings() {
    const input = document.getElementById('gasApiUrlInput');
    const statusEl = document.getElementById('gasUrlStatus');

    try {
        const dataRes = await fetch('../data/data.json?v=' + Date.now(), { cache: 'no-store' });
        const localData = await dataRes.json();
        GAS_DEFAULT_URL = localData.gasApiUrl || 'YOUR_GAS_API_URL_HERE';
    } catch (err) {
        console.warn('無法從 data.json 讀取預設 URL', err);
    }

    // 修正：重新整理後一律強制以 data.json 為準，不使用舊的 localStorage 緩存
    GAS_API_URL = GAS_DEFAULT_URL;
    // 同步更新 localStorage，確保與 data.json 一致
    localStorage.setItem('gas_api_url', GAS_API_URL);

    if (!input) return;

    // 初始化顯示目前的 URL
    input.value = GAS_API_URL;
    if (statusEl) {
        statusEl.textContent = GAS_API_URL === GAS_DEFAULT_URL ? '目前使用預設 URL' : '✅ 已使用自訂 URL';
    }

    const saveBtn = document.getElementById('saveGasUrlBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const newUrl = input.value.trim();
            if (!newUrl.startsWith('https://script.google.com/')) {
                if (statusEl) {
                    statusEl.style.color = 'var(--danger)';
                    statusEl.textContent = '⚠️ 格式錯誤，請輸入正確的 GAS 網址';
                }
                return;
            }
            localStorage.setItem('gas_api_url', newUrl);
            GAS_API_URL = newUrl;
            if (statusEl) {
                statusEl.style.color = 'var(--success)';
                statusEl.textContent = '✅ 已儲存並即時生效';
            }
            showToast('GAS API URL 已更新', 'success');
        });
    }

    const resetBtn = document.getElementById('resetGasUrlBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            localStorage.removeItem('gas_api_url');
            GAS_API_URL = GAS_DEFAULT_URL;
            input.value = GAS_DEFAULT_URL;
            if (statusEl) {
                statusEl.style.color = '';
                statusEl.textContent = '已重設為預設 URL';
            }
            showToast('已重設為預設 URL', 'info');
        });
    }
}

// ─── GAS 同步邏輯 ───
function syncScheduleToGAS(assignments, skippedAreas, dateStr, isFullSync = false) {
    if (!GAS_API_URL || GAS_API_URL.includes('YOUR_GAS_API_URL')) {
        console.warn("GAS URL 未設定，跳過同步");
        return;
    }

    showToast('正在同步資料至雲端...', 'info');

    const allStaff = StaffModel.getAll();
    const staffMap = {};
    allStaff.forEach(s => staffMap[s.id] = s);

    const allAreas = AreaModel.getAll();
    const areaMap = {};
    allAreas.forEach(a => areaMap[a.id] = a);

    const presentIds = typeof getSelectedStaffIds === 'function' ? getSelectedStaffIds() : [];
    const plannerObj = (typeof PlannerService !== 'undefined') ? PlannerService.getTodayPlanner(presentIds) : null;

    const payload = {
        date: dateStr,
        plannerName: plannerObj ? plannerObj.name : '',
        staffMeta: presentIds.map(id => staffMap[id]).filter(Boolean).map(s => ({ name: s.name, gender: s.gender })),
    };

    if (isFullSync) {
        const combinedAssignments = assignments ? [...assignments] : [];
        if (skippedAreas && skippedAreas.length > 0) {
            skippedAreas.forEach(aId => {
                combinedAssignments.push({
                    areaId: aId,
                    staffIds: [],
                });
            });
        }

        payload.assignments = combinedAssignments.map(a => {
            const area = areaMap[a.areaId] || { name: '未知區域' };
            let staffNames = a.staffIds.map(sid => staffMap[sid] ? staffMap[sid].name : sid).join(', ');
            if (!staffNames || staffNames.trim() === '') {
                staffNames = '無人打掃';
            }
            return {
                areaId: a.areaId,
                areaName: area.name,
                staffIds: a.staffIds,
                staffNames: staffNames
            };
        });
    }

    fetch(GAS_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(result => {
        if (result.status === 'success') {
            showToast('雲端同步成功', 'success');
        } else {
            showToast('雲端同步失敗: ' + result.message, 'error');
            console.error(result);
        }
    })
    .catch(error => {
        showToast('雲端同步發生錯誤', 'error');
        console.error('GAS Sync Error:', error);
    });
}

// ─── Toast ───
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ─── Modal ───
function openModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    if (overlay && content) {
        content.innerHTML = html;
        overlay.classList.add('active');
    }
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ─── [V14.0 新增] 輪值設定同步至雲端 ───
/**
 * syncRotationToGAS()
 * 將目前的輪值設定（順序、基準日、基準序號）以 fire-and-forget 方式同步至 [PlannerRotation] 工作表。
 * 呼叫時機：輪值頁籤的任何修改操作（移動順序、切換週次、推進、設定基準點）之後。
 */
function syncRotationToGAS() {
    const gasUrl = GAS_API_URL || GAS_DEFAULT_URL;
    if (!gasUrl || gasUrl.includes('YOUR_GAS')) return;

    try {
        const rot = PlannerModel.get();
        if (!rot || !rot.planners || rot.planners.length === 0) return;

        const allStaff = StaffModel.getAll();
        const staffNames = {};
        allStaff.forEach(s => { staffNames[s.id] = s.name; });

        // [V14.0] 直接用公式計算今日值班者（與 index.html 一致），不依賴 PlannerService
        let todayPlannerName = '';
        try {
            let idx = rot.baseIndex !== undefined ? rot.baseIndex : (rot.currentIndex || 0);
            if (rot.baseDate) {
                const base = new Date(rot.baseDate);
                base.setHours(0, 0, 0, 0);
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const diffWeeks = Math.floor((now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 7));
                idx = ((idx + diffWeeks) % rot.planners.length + rot.planners.length) % rot.planners.length;
            } else {
                idx = ((rot.currentIndex || 0) % rot.planners.length + rot.planners.length) % rot.planners.length;
            }
            const plannerId = rot.planners[idx];
            const plannerStaff = allStaff.find(s => s.id === plannerId);
            if (plannerStaff) todayPlannerName = plannerStaff.name;
        } catch (e) {
            console.warn('[syncRotationToGAS] 計算今日值班者失敗:', e);
        }

        const payload = {
            type: 'saveRotation',
            planners: rot.planners,
            staffNames: staffNames,
            baseDate: rot.baseDate || '',
            baseIndex: rot.baseIndex !== undefined ? rot.baseIndex : rot.currentIndex || 0,
            todayPlannerName: todayPlannerName, // [V14.0] 同步時順便更新 I1
        };

        console.log('[syncRotationToGAS] 雲端同步中...', payload);

        fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
        }).then(res => res.json())
          .then(data => {
              console.log('[syncRotationToGAS] 同步成功:', data);
          })
          .catch(err => console.warn('[syncRotationToGAS] 失敗:', err));
    } catch (err) {
        console.warn('[syncRotationToGAS] 例外:', err);
    }
}
