/*
 * 【tab-others.js】
 * 「輪值設定」、「歷史紀錄」、「資料管理」頁籤的 UI 邏輯，以及應用程式啟動入口。
 * 包含：
 *   - renderRotation()：渲染每週負責人輪值列表，
 *     支援點擊切換本週人選、上下移動順序、設定自動輪值基準日
 *   - advanceWeekBtn：手動推進至下一週按鈕
 *   - renderHistory()：渲染最近 30 筆排班歷史紀錄
 *   - loadHistorySchedule(dateStr)：點擊歷史項目，切換至排班頁籤並還原當日資料
 *   - deleteHistory(dateStr)：刪除指定日期的排班紀錄
 *   - 資料管理：匯出 JSON（exportBtn）、匯入 JSON（importBtn/importFile）、
 *     清除全部資料（clearAllBtn）、重置為預設資料（resetDefaultBtn）
 *   - boot()：應用程式啟動函數，依序載入資料、初始化排班頁面與可選區域
 */

// ═══════════════════════════════════════
// TAB 4 & 5 & 6 (Rotation, History, Data)
// ═══════════════════════════════════════
// ─── TAB 4: 輪值設定 ───
function renderRotation() {
    const overview = PlannerService.getRotationOverview();
    const container = document.getElementById('rotationList');

    if (overview.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔄</div><p>尚未設定輪值順序</p></div>';
    return;
    }

    container.innerHTML = overview.map(item =>
    '<div class="rotation-item ' + (item.isCurrent ? 'current' : '') + '" style="display:flex; justify-content:space-between; align-items:center;">' +
    '<div style="cursor:pointer; flex: 1;" onclick="PlannerService.setCurrentIndex(' + item.index + ');renderRotation();updatePlannerBanner();showToast(\'已切換本週負責人為 ' + item.staffName + '\',\'success\');">' +
    '<span class="rotation-index">' + (item.index + 1) + '</span>' +
    '<span class="rotation-name">' + item.staffName + '</span>' +
    (item.isCurrent ? '<span class="badge badge-success">本週</span>' : '') +
    '<span class="rotation-deputy">代理人：' + item.deputyName + '</span>' +
    '</div>' +
    '<div style="display:flex; gap: 4px;">' +
    '<button class="btn-icon" style="padding: 4px;" onclick="event.stopPropagation(); PlannerService.movePlanner(' + item.index + ', -1); renderRotation(); updatePlannerBanner();" ' + (item.index === 0 ? 'disabled' : '') + ' title="往上移">🔼</button>' +
    '<button class="btn-icon" style="padding: 4px;" onclick="event.stopPropagation(); PlannerService.movePlanner(' + item.index + ', 1); renderRotation(); updatePlannerBanner();" ' + (item.index === overview.length - 1 ? 'disabled' : '') + ' title="往下移">🔽</button>' +
    '<button class="btn-icon warning" style="padding: 4px; border: 1px solid var(--warning);" onclick="event.stopPropagation(); if(confirm(\'是否將此人設為今日起算的自動輪值基準點？\\n(重整並不會洗白，需要重新匯出 data.json 或匯入才會真正生效)\')) { PlannerService.setBaseDateToToday(' + item.index + '); renderRotation(); updatePlannerBanner(); showToast(\'已更新自動輪值基準日！請記得匯出.\', \'success\'); }" title="設為自動輪值基準點">📅</button>' +
    '</div>' +
    '</div>'
    ).join('');
}

document.getElementById('advanceWeekBtn').addEventListener('click', () => {
    PlannerService.advanceToNextWeek();
    renderRotation();
    updatePlannerBanner();
    showToast('已手動推進至下一週', 'success');
});

function renderHistory() {
    const schedules = ScheduleModel.getRecent(30);
    const container = document.getElementById('historyList');
    const allStaff = StaffModel.getAll();
    const staffMap = {};
    allStaff.forEach(s => staffMap[s.id] = s);

    if (schedules.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><p>尚無排班紀錄</p></div>';
    return;
    }

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

    container.innerHTML = schedules.map(sched => {
    const areaCount = sched.assignments ? sched.assignments.length : 0;
    const staffCount = sched.presentStaff ? sched.presentStaff.length : 0;
    const plannerName = sched.planner && staffMap[sched.planner] ? staffMap[sched.planner].name : '-';
    const dateObj = new Date(sched.date + 'T00:00:00');

    return '<div class="history-item" onclick="loadHistorySchedule(\'' + sched.date + '\')">' +
        '<div>' +
        '<div class="history-date">' + sched.date + '（週' + weekdays[dateObj.getDay()] + '）</div>' +
        '<div class="history-summary">出勤 ' + staffCount + ' 人 · 排定 ' + areaCount + ' 區域 · 負責人：' + plannerName + '</div>' +
        '</div>' +
        '<button class="btn-icon danger" onclick="event.stopPropagation();deleteHistory(\'' + sched.date + '\')" title="刪除">🗑️</button>' +
        '</div>';
    }).join('');
}

window.loadHistorySchedule = function (dateStr) {
    const sched = ScheduleModel.getByDate(dateStr);
    if (!sched) return;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="schedule"]').classList.add('active');
    document.getElementById('panel-schedule').classList.add('active');

    dateInput.value = dateStr;
    renderStaffCheckboxes();

    setTimeout(() => {
    document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
        const id = item.dataset.id;
        if (sched.presentStaff.includes(id)) {
        item.classList.add('checked');
        item.querySelector('input').checked = true;
        } else {
        item.classList.remove('checked');
        item.querySelector('input').checked = false;
        }
    });
    updatePresentCount();
    updatePlannerBanner();
    renderScheduleResult(sched.assignments, sched.skippedAreas || [], []);
    }, 50);
};

window.deleteHistory = function (dateStr) {
    if (!confirm('確定刪除 ' + dateStr + ' 的排班紀錄嗎？')) return;
    ScheduleModel.remove(dateStr);
    renderHistory();
    showToast('已刪除 ' + dateStr + ' 的紀錄', 'info');
};

// ─── TAB 6: 資料管理 ───
document.getElementById('exportBtn').addEventListener('click', () => {
    DataIO.exportAll();
    showToast('資料已匯出', 'success');
});

document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
    const result = await DataIO.importAll(file);
    showToast('匯入成功：' + result.staffCount + ' 人、' + result.areaCount + ' 區域、' + result.scheduleCount + ' 筆紀錄', 'success');
    refreshSchedulePanel();
    renderOptionalToggles();
    } catch (err) {
    showToast(err.message, 'error');
    }
    e.target.value = '';
});

document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    if (!confirm('⚠️ 確定清除全部資料嗎？此操作無法復原！')) return;
    if (!confirm('再次確認：所有人員、區域、排班紀錄都將被刪除？')) return;
    DataIO.clearAll();
    showToast('所有資料已清除', 'info');
    refreshSchedulePanel();
    renderOptionalToggles();
});

document.getElementById('resetDefaultBtn')?.addEventListener('click', async () => {
    if (!confirm('確定重置為預設資料嗎？現有資料將被覆蓋。')) return;
    DataIO.clearAll();
    localStorage.removeItem('cleaning_data_version');
    initializeInlineData();
    refreshSchedulePanel();
    renderOptionalToggles();
    showToast('已重置為預設資料', 'success');
});

document.getElementById('holidayLabel').addEventListener('click', (e) => {
    e.preventDefault();
    const item = document.getElementById('holidayLabel');
    const cb = document.getElementById('holidayToggle');
    cb.checked = !cb.checked;
    item.classList.toggle('checked', cb.checked);
});

// ─── 應用程式啟動入口 ───
async function boot() {
  await initializeDefaultData();
  refreshSchedulePanel();
  renderOptionalToggles();

  // ▼▼▼ 新增這一段：自動執行載入雲端出勤 ▼▼▼
  if (typeof loadAttendanceFromGAS === 'function') {
    // 稍微延遲 0.5 秒，確保 Google Sheets 網址等所有設定都讀取完畢後再觸發
    setTimeout(() => {
      loadAttendanceFromGAS();
    }, 500);
  }
  // ▲▲▲ 新增結束 ▲▲▲
}

boot();