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
 */

// ─── 排班狀態管理 ───
let currentScheduleState = null;
let sessionPresentStaffIds = null;  // 暫存目前的勾選人員
let sessionOptionalAreaIds = null;  // 暫存目前的區域勾選

// ─── Google Sheets 同步 ───
let GAS_DEFAULT_URL = 'YOUR_GAS_API_URL_HERE';
let GAS_API_URL = '';

// 定義 Debounce 同步函數，避免連續勾選造成大量請求
let isSyncingFromCloud = false; // 新增此標記
let syncDebounceTimer = null;
function debouncedSyncToGAS() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
    // 修正：當 currentScheduleState 為空時（尚未排班），仍應同步人員名單
    const assignments = currentScheduleState ? currentScheduleState.assignments : null;
    const skippedAreas = currentScheduleState ? currentScheduleState.skippedAreas : null;
    syncScheduleToGAS(assignments, skippedAreas, dateInput.value, assignments !== null);
    }, 1000); // 延遲 1 秒執行
}

// ─── GAS URL 設定介面 ───
async function initGasUrlSettings() {
    const input = document.getElementById('gasApiUrlInput');
    const statusEl = document.getElementById('gasUrlStatus');

    try {
    // 先從 data.json 取得 GAS_API_URL
    const dataRes = await fetch('../data/data.json?v=' + Date.now(), { cache: 'no-store' });
    const localData = await dataRes.json();
    GAS_DEFAULT_URL = localData.gasApiUrl || 'YOUR_GAS_API_URL_HERE';
    } catch (err) {
    console.warn('無法從 data.json 讀取預設 URL', err);
    }

    GAS_API_URL = localStorage.getItem('gas_api_url') || GAS_DEFAULT_URL;

    if (!input) return;

    // 初始化顯示目前的 URL
    input.value = GAS_API_URL;
    statusEl.textContent = GAS_API_URL === GAS_DEFAULT_URL ? '目前使用預設 URL' : '✅ 已使用自訂 URL';

    document.getElementById('saveGasUrlBtn').addEventListener('click', () => {
    const newUrl = input.value.trim();
    if (!newUrl.startsWith('https://script.google.com/')) {
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = '⚠️ 格式錯誤，請輸入正確的 GAS 網址';
        return;
    }
    localStorage.setItem('gas_api_url', newUrl);
    GAS_API_URL = newUrl;
    statusEl.style.color = 'var(--success)';
    statusEl.textContent = '✅ 已儲存並即時生效';
    showToast('GAS API URL 已更新', 'success');
    });

    document.getElementById('resetGasUrlBtn').addEventListener('click', () => {
    localStorage.removeItem('gas_api_url');
    GAS_API_URL = GAS_DEFAULT_URL;
    input.value = GAS_DEFAULT_URL;
    statusEl.style.color = '';
    statusEl.textContent = '已重設為預設 URL';
    showToast('已重設為預設 URL', 'info');
    });
}

// 在這裡呼叫初始化非同步函數
initGasUrlSettings();

// ─── 功能 1：載入今日雲端出勤人員 ───
document.getElementById('loadCloudBtn').addEventListener('click', loadAttendanceFromGAS);

function syncScheduleToGAS(assignments, skippedAreas, dateStr, isFullSync = false) {
    showToast('正在同步資料至雲端...', 'info');

    const allStaff = StaffModel.getAll();
    const staffMap = {};
    allStaff.forEach(s => staffMap[s.id] = s);

    const allAreas = AreaModel.getAll();
    const areaMap = {};
    allAreas.forEach(a => areaMap[a.id] = a);

    const presentIds = getSelectedStaffIds();
    const plannerObj = PlannerService.getTodayPlanner(presentIds);

    const payload = {
    date: dateStr,
    plannerName: plannerObj ? plannerObj.name : '',
    // 傳送當前勾選的所有人員名單與性別
    staffMeta: presentIds.map(id => staffMap[id]).filter(Boolean).map(s => ({ name: s.name, gender: s.gender })),
    };

    // 只有在 isFullSync 為 true 時才傳送 assignments
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
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ─── Modal ───
function openModal(html) {
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalContent').innerHTML = html;
    overlay.classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// ─── Tab 切換 ───
document.getElementById('tabNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');

    if (tab === 'staff') renderStaffTable();
    if (tab === 'areas') renderAreaTable();
    if (tab === 'rotation') renderRotation();
    if (tab === 'history') renderHistory();
    if (tab === 'schedule') refreshSchedulePanel();
});