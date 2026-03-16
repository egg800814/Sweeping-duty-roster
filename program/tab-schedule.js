/*
 * 【tab-schedule.js】
 * 「每日排班」頁籤的所有 UI 邏輯。
 * 包含：
 *   - 日期選擇器初始化與「今天」按鈕
 *   - checkExistingSchedule()：切換日期時自動載入已存在的排班紀錄
 *   - renderStaffCheckboxes()：依部門分組渲染出勤人員核取方塊
 *   - updatePresentCount()：即時更新出勤人數統計（總/男/女）
 *   - 全選/全不選/預設 按鈕事件
 *   - updatePlannerBanner()：更新本週負責人顯示
 *   - renderOptionalToggles()：渲染可選區域勾選清單
 *   - loadAttendanceFromGAS()：從 GAS 雲端載入今日出勤名單
 *   - 自動排班按鈕（generateBtn）與追加人員按鈕（addLateBtn）
 *   - renderScheduleResult()：渲染排班結果卡片（含拖曳接收區）
 *   - fetchConfirmStatuses()：每 10 秒輪詢 GAS 取得確認狀態並著色
 *   - 儲存排班（saveScheduleBtn）與列印（printBtn）按鈕
 *   - 隔天放假核取方塊（holidayLabel/holidayToggle）事件
 */

// ==========================================
// tab-schedule.js — 負責「每日排班」頁籤的所有互動功能
// ==========================================

function refreshSchedulePanel() {
  renderStaffCheckboxes();
  renderOptionalToggles();
  updatePlannerBanner();
  updatePresentCount();
}

const dateInput = document.getElementById('scheduleDate');
if (dateInput) {
  dateInput.value = new Date().toISOString().slice(0, 10);
}

document.getElementById('todayBtn')?.addEventListener('click', () => {
  dateInput.value = new Date().toISOString().slice(0, 10);
  currentScheduleState = null;
  checkExistingSchedule();
});

dateInput?.addEventListener('change', () => {
  currentScheduleState = null;
  sessionPresentStaffIds = null;
  sessionOptionalAreaIds = null;
  refreshSchedulePanel();
  checkExistingSchedule();
});

function checkExistingSchedule() {
  const existing = ScheduleModel.getByDate(dateInput.value);
  if (existing) {
    sessionPresentStaffIds = existing.presentStaff || [];
    sessionOptionalAreaIds = existing.enabledOptionalAreas || []; 

    renderStaffCheckboxes();
    renderOptionalToggles();
    updatePresentCount();
    renderScheduleResult(existing.assignments, existing.skippedAreas || [], []);

    currentScheduleState = {
      assignments: existing.assignments,
      skippedAreas: existing.skippedAreas,
      presentIds: [...sessionPresentStaffIds],
      plannerId: existing.planner,
      enabledOptionalAreas: [...sessionOptionalAreaIds],
      isHolidayTomorrow: false
    };

    document.getElementById('saveScheduleBtn').style.display = '';
    document.getElementById('printBtn').style.display = '';
    document.getElementById('addLateBtn').style.display = '';

    if (typeof showToast === 'function') showToast('已載入 ' + dateInput.value + ' 的排班紀錄', 'info');
  } else {
    renderScheduleResult([], [], []);
    document.getElementById('saveScheduleBtn').style.display = 'none';
    document.getElementById('printBtn').style.display = 'none';
    document.getElementById('addLateBtn').style.display = 'none';
  }
}

function renderStaffCheckboxes() {
  const container = document.getElementById('staffCheckboxes');
  const staff = StaffModel.getActive();
  const departments = {};

  staff.forEach(s => {
    const dept = s.department || '未分類';
    if (!departments[dept]) departments[dept] = [];
    departments[dept].push(s);
  });

  if (sessionPresentStaffIds === null) {
    const existing = ScheduleModel.getByDate(dateInput.value);
    if (existing) {
      sessionPresentStaffIds = existing.presentStaff || [];
    } else {
      sessionPresentStaffIds = staff.filter(s => s.isDefault).map(s => s.id);
    }
  }

  let html = '';
  const sortOrder = ['管理部', '營業部', '新事業部', '技術部', '其他', '未分類'];
  const USER_SEQUENCE = ["s11", "s07", "s08", "s14", "s18", "s22", "s10", "s13", "s19", "s21", "s27", "s23", "s28", "s06", "s05", "s02", "s04", "s12", "s15", "s16", "s17", "s20", "s24", "s25", "s26"];

  const getStaffRank = (s) => {
    if (s.role === 'manager') return -1;
    const idx = USER_SEQUENCE.indexOf(s.id);
    return idx === -1 ? 999 : idx;
  };

  const deptKeys = Object.keys(departments).sort((a, b) => {
    const idxA = sortOrder.indexOf(a);
    const idxB = sortOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  deptKeys.forEach(dept => {
    departments[dept].sort((a, b) => getStaffRank(a) - getStaffRank(b));
    html += '<div class="dept-group" style="width:100%; margin-bottom:12px;">';
    html += '<h4 style="font-size:0.85rem; color:var(--text-muted); border-bottom:1px solid var(--border); margin-bottom:8px; padding-bottom:4px;">' + dept + '</h4>';
    html += '<div class="checkbox-grid">';

    html += departments[dept].map(s => {
      const isSelected = sessionPresentStaffIds.includes(s.id);
      const roleTag = s.role === 'manager' ? '<span class="badge badge-warning" style="margin-left:4px;font-size:0.65rem;">部長</span>' : '';
      const restrictTag = s.floorRestriction ? '<span class="badge badge-info" style="margin-left:4px;font-size:0.65rem;">限' + s.floorRestriction + 'F</span>' : '';

      return '<label class="checkbox-item ' + (isSelected ? 'checked' : '') + '" data-id="' + s.id + '">' +
        '<input type="checkbox" ' + (isSelected ? 'checked' : '') + '>' +
        '<span class="checkbox-mark"></span>' +
        '<span class="checkbox-label">' + s.name + roleTag + restrictTag + '</span>' +
        '<span class="gender-badge ' + s.gender + '">' + (s.gender === 'male' ? '♂' : '♀') + '</span>' +
        '</label>';
    }).join('');

    html += '</div></div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('.checkbox-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      item.classList.toggle('checked');
      const cb = item.querySelector('input');
      cb.checked = !cb.checked;

      sessionPresentStaffIds = getSelectedStaffIds();
      updatePresentCount();
      updatePlannerBanner();

      if (typeof isSyncingFromCloud !== 'undefined' && !isSyncingFromCloud && typeof debouncedSyncToGAS === 'function') {
        debouncedSyncToGAS();
      }
    });
  });
}

function getSelectedStaffIds() {
  return [...document.querySelectorAll('#staffCheckboxes .checkbox-item.checked')].map(el => el.dataset.id);
}

function updatePresentCount() {
  const selected = getSelectedStaffIds();
  const allStaff = StaffModel.getAll();
  const staffMap = {};
  allStaff.forEach(s => staffMap[s.id] = s);

  const males = selected.filter(id => staffMap[id]?.gender === 'male');
  const females = selected.filter(id => staffMap[id]?.gender === 'female');

  document.getElementById('presentCount').textContent = selected.length;
  document.getElementById('maleCount').textContent = males.length;
  document.getElementById('femaleCount').textContent = females.length;
}

document.getElementById('selectAllStaff')?.addEventListener('click', () => {
  document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
    item.classList.add('checked');
    item.querySelector('input').checked = true;
  });
  sessionPresentStaffIds = getSelectedStaffIds();
  updatePresentCount();
  updatePlannerBanner();
  if (typeof isSyncingFromCloud !== 'undefined' && !isSyncingFromCloud && typeof debouncedSyncToGAS === 'function') {
    debouncedSyncToGAS();
  }
});

document.getElementById('deselectAllStaff')?.addEventListener('click', () => {
  document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
    item.classList.remove('checked');
    item.querySelector('input').checked = false;
  });
  sessionPresentStaffIds = [];
  updatePresentCount();
  updatePlannerBanner();
  if (typeof isSyncingFromCloud !== 'undefined' && !isSyncingFromCloud && typeof debouncedSyncToGAS === 'function') {
    debouncedSyncToGAS();
  }
});

document.getElementById('selectDefaultStaff')?.addEventListener('click', () => {
  const allStaff = StaffModel.getAll();
  const staffMap = {};
  allStaff.forEach(s => staffMap[s.id] = s);

  document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
    const id = item.dataset.id;
    const s = staffMap[id];
    if (s && s.isDefault) {
      item.classList.add('checked');
      item.querySelector('input').checked = true;
    } else {
      item.classList.remove('checked');
      item.querySelector('input').checked = false;
    }
  });
  sessionPresentStaffIds = getSelectedStaffIds();
  updatePresentCount();
  updatePlannerBanner();
  if (typeof isSyncingFromCloud !== 'undefined' && !isSyncingFromCloud && typeof debouncedSyncToGAS === 'function') {
    debouncedSyncToGAS();
  }
});

function updatePlannerBanner() {
  const presentIds = getSelectedStaffIds();
  const planner = PlannerService.getTodayPlanner(presentIds.length > 0 ? presentIds : null);

  const nameEl = document.getElementById('plannerName');
  const noteEl = document.getElementById('deputyNote');

  if (planner) {
    nameEl.textContent = planner.name;
    if (planner.isDeputy) {
      noteEl.style.display = 'block';
      noteEl.textContent = '（代理 ' + planner.originalName + '，負責人今日未出勤）';
    } else {
      noteEl.style.display = 'none';
    }
  } else {
    nameEl.textContent = '尚未設定';
    noteEl.style.display = 'none';
  }
}

async function loadAttendanceFromGAS() {
  if (typeof GAS_API_URL === 'undefined' || !GAS_API_URL || GAS_API_URL === 'YOUR_GAS_API_URL_HERE') {
    if (typeof showToast === 'function') showToast('請先設定有效的 GAS API URL', 'error');
    return;
  }

  if (typeof showToast === 'function') showToast('正在從雲端載入今日資料...', 'info');
  isSyncingFromCloud = true;

  try {
    const urlObj = new URL(GAS_API_URL);
    urlObj.searchParams.set("type", "admin");
    const res = await fetch(urlObj.toString());
    const result = await res.json();

    let cloudStaffNames = (result.staffMeta || []).map(s => s.name);
    const assignments = result.assignments || [];
    assignments.forEach(a => {
      if (a.staffNames) {
        const names = String(a.staffNames).split(/[,、，]/).map(n => n.trim()).filter(Boolean);
        cloudStaffNames.push(...names);
      }
    });

    if (result.todayPlanner) {
      cloudStaffNames.push(result.todayPlanner);
    }

    cloudStaffNames = [...new Set(cloudStaffNames)].filter(Boolean);

    if (cloudStaffNames.length === 0) {
      if (typeof showToast === 'function') showToast('雲端目前尚未有今日資料', 'info');
      isSyncingFromCloud = false;
      return;
    }

    const allStaff = StaffModel.getAll();
    const staffNameMap = {};
    allStaff.forEach(s => staffNameMap[s.name] = s);

    let matchedCount = 0;
    document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
      const id = item.dataset.id;
      const staffObj = StaffModel.getById(id);
      const name = staffObj ? staffObj.name : '';

      if (name && cloudStaffNames.includes(name)) {
        item.classList.add('checked');
        item.querySelector('input').checked = true;
        matchedCount++;
      } else {
        item.classList.remove('checked');
        item.querySelector('input').checked = false;
      }
    });

    sessionPresentStaffIds = getSelectedStaffIds();
    updatePresentCount();
    updatePlannerBanner();

    if (assignments.length > 0) {
      const restoredAssignments = assignments.map(a => {
        const names = a.staffNames ? String(a.staffNames).split(/[,、，]/).map(n => n.trim()).filter(Boolean) : [];
        const staffIds = names.map(n => staffNameMap[n] ? staffNameMap[n].id : null).filter(Boolean);
        return {
          areaId: a.areaCode,
          staffIds: staffIds
        };
      }).filter(a => a.areaId && a.staffIds.length > 0);

      if (restoredAssignments.length > 0) {
        currentScheduleState = {
          assignments: restoredAssignments,
          skippedAreas: [],
          presentIds: sessionPresentStaffIds,
          plannerId: PlannerService.getTodayPlanner(sessionPresentStaffIds)?.id
        };
        renderScheduleResult(restoredAssignments, [], []);
        document.getElementById('saveScheduleBtn').style.display = '';
        document.getElementById('printBtn').style.display = '';
        document.getElementById('addLateBtn').style.display = '';
      }
    }

    if (typeof showToast === 'function') showToast(`成功從雲端載入 ${matchedCount} 位人員勾選狀態。`, 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('雲端載入失敗', 'error');
    console.error('Load Error:', err);
  } finally {
    isSyncingFromCloud = false;
  }
}

document.getElementById('generateBtn')?.addEventListener('click', () => {
  const presentIds = getSelectedStaffIds();
  if (presentIds.length === 0) {
    if (typeof showToast === 'function') showToast('請先勾選今日出勤人員', 'error');
    return;
  }

  const isHolidayTomorrow = document.getElementById('holidayToggle').checked;
  const enabledOptionalAreas = [];
  document.querySelectorAll('.optional-area-toggle:checked').forEach(cb => {
    enabledOptionalAreas.push(cb.dataset.areaId);
  });

  const planner = PlannerService.getTodayPlanner(presentIds);
  const plannerId = planner ? planner.id : null;

  const result = Scheduler.generate(presentIds, dateInput.value, {
    isHolidayTomorrow,
    enabledOptionalAreas,
    plannerId,
  });

  currentScheduleState = {
    assignments: result.assignments,
    skippedAreas: result.skippedAreas,
    warnings: result.warnings,
    presentIds: [...presentIds],
    plannerId,
    isHolidayTomorrow,
    enabledOptionalAreas,
  };

  renderScheduleResult(result.assignments, result.skippedAreas, result.warnings);
  document.getElementById('saveScheduleBtn').style.display = '';
  document.getElementById('printBtn').style.display = '';
  document.getElementById('addLateBtn').style.display = '';

  if (typeof showToast === 'function') showToast('排班完成！已分配 ' + result.assignments.length + ' 個區域', 'success');
  if (typeof syncScheduleToGAS === 'function') syncScheduleToGAS(result.assignments, result.skippedAreas, dateInput.value, true);
});

document.getElementById('addLateBtn')?.addEventListener('click', () => {
  if (!currentScheduleState) {
    if (typeof showToast === 'function') showToast('請先進行自動排班', 'error');
    return;
  }

  const nowSelectedIds = getSelectedStaffIds();
  const prevIds = currentScheduleState.presentIds;
  const newIds = nowSelectedIds.filter(id => !prevIds.includes(id) && id !== currentScheduleState.plannerId);

  if (newIds.length === 0) {
    if (typeof showToast === 'function') showToast('沒有新增人員', 'info');
    return;
  }

  const lockedAssignments = [];
  const lockedStaffIds = [];
  for (const assign of currentScheduleState.assignments) {
    lockedAssignments.push(assign);
    lockedStaffIds.push(...assign.staffIds);
  }

  const allPresentIds = [...new Set([...prevIds, ...newIds])];
  const result = Scheduler.generate(allPresentIds, dateInput.value, {
    isHolidayTomorrow: currentScheduleState.isHolidayTomorrow,
    enabledOptionalAreas: currentScheduleState.enabledOptionalAreas,
    plannerId: currentScheduleState.plannerId,
    lockedAssignments,
    lockedStaffIds,
  });

  currentScheduleState.assignments = result.assignments;
  currentScheduleState.skippedAreas = result.skippedAreas;
  currentScheduleState.presentIds = allPresentIds;

  renderScheduleResult(result.assignments, result.skippedAreas, result.warnings);
  if (typeof showToast === 'function') showToast('已追加人員並更新分配', 'success');
  if (typeof syncScheduleToGAS === 'function') syncScheduleToGAS(result.assignments, result.skippedAreas, dateInput.value, true);
});

function renderScheduleResult(assignments, skippedAreas, warnings) {
  lastStatusCache = '';
  const container = document.getElementById('scheduleResult');
  const allStaff = StaffModel.getAll();
  const allAreas = AreaModel.getAll();
  const staffMap = {};
  allStaff.forEach(s => staffMap[s.id] = s);
  const areaMap = {};
  allAreas.forEach(a => areaMap[a.id] = a);

  const dateStr = dateInput.value;
  const dateObj = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const presentIds = getSelectedStaffIds();
  const planner = PlannerService.getTodayPlanner(presentIds);

  let html = '<div style="margin-bottom:16px;">' +
    '<h3 style="font-size:1.1rem;font-weight:700;">📅 ' + dateStr + '（週' + weekdays[dateObj.getDay()] + '）排班結果</h3>';

  if (planner) {
    html += '<p style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">排班負責人：<strong style="color:var(--accent);">' + planner.name + '</strong>（不參與掃地）';
    if (planner.isDeputy) html += ' <span style="color:var(--warning);">— 代理 ' + planner.originalName + '</span>';
    html += '</p>';
  }
  html += '</div>';

  if (warnings && warnings.length > 0) {
    const displayWarnings = warnings.filter(w => !w.includes('無法安排'));
    if (displayWarnings.length > 0) {
      html += displayWarnings.map(w => '<div class="warning-item">' + w + '</div>').join('');
    }
  }

  if (assignments.length > 0) {
    html += assignments.map(a => {
      const area = areaMap[a.areaId];
      if (!area) return '';
      const staffChips = a.staffIds.map((sid, idx) => {
        const s = staffMap[sid];
        if (!s) return '';
        return `<span class="staff-chip ${s.gender}" data-area-id="${a.areaId}" data-person-index="${idx}" draggable="true" ondragstart="handleDragStart(event, '${sid}', '${a.areaId}')" ondragend="handleDragEnd(event)" onclick="handleRemoveStaff(event, '${sid}', '${a.areaId}')" title="點擊移除該人員">${s.name}</span>`;
      }).join('');

      const priorityClass = area.priority;
      const genderTag = area.genderRestriction !== 'none'
        ? '<span class="gender-badge ' + (area.genderRestriction === 'female' ? 'female' : 'male') + '" style="font-size:0.65rem;margin-left:4px;">' + (area.genderRestriction === 'female' ? '♀' : '♂優先') + '</span>'
        : '';

      const isOverflow = a.staffIds.length > area.maxPeople;
      const overflowTag = isOverflow ? '<span style="font-size:0.7rem;color:var(--info);margin-left:6px;">(增援)</span>' : '';

      return `<div class="assignment-card" data-area-id="${a.areaId}" ondragover="handleDragOver(event)" ondragenter="handleDragEnter(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, '${a.areaId}')">` +
        `<div class="assignment-area">` +
        `<span class="priority-dot ${priorityClass}"></span>` +
        area.name + genderTag + overflowTag +
        `</div>` +
        `<div class="assignment-staff">${staffChips}</div>` +
        `</div>`;
    }).join('');
  } else {
    html += '<div class="empty-state">⚠️ 尚無任何分配結果</div>';
  }

  if (skippedAreas && skippedAreas.length > 0) {
    const relevantSkipped = skippedAreas.filter(aId => {
      const area = areaMap[aId];
      return area && area.priority !== 'optional';
    });
    const optionalSkipped = skippedAreas.filter(aId => {
      const area = areaMap[aId];
      return area && area.priority === 'optional';
    });

    if (relevantSkipped.length > 0) {
      const conditionFailedSkipped = [];
      const headcountSkipped = [];

      relevantSkipped.forEach(aId => {
        const area = areaMap[aId];
        if (warnings && warnings.some(w => w.includes(area.name) && w.includes('無法安排'))) {
          conditionFailedSkipped.push(aId);
        } else {
          headcountSkipped.push(aId);
        }
      });

      if (conditionFailedSkipped.length > 0) {
        html += '<div style="margin-top:16px;"><h4 style="font-size:0.9rem;color:var(--danger);margin-bottom:8px;">⚠️ 條件不符跳過（如性別限制）</h4></div>';
        html += conditionFailedSkipped.map(aId => {
          const area = areaMap[aId];
          return '<div class="skipped-area assignment-card" data-area-id="' + aId + '" ondragover="handleDragOver(event)" ondragenter="handleDragEnter(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, \'' + aId + '\')" style="border: 2px dashed rgba(239,68,68,0.5); background: rgba(239,68,68,0.05); color: var(--danger); border-radius:12px; min-height:40px; justify-content:space-between;" title="拖曳人員至此即可重新啟用本區">' +
            '<span>⚠️ ' + (area ? area.name : aId) + '</span>' +
            '<span style="font-size:0.75rem; color:var(--danger); opacity:0.8;">(拖曳人員至此啟用)</span>' +
            '</div>';
        }).join('');
      }

      if (headcountSkipped.length > 0) {
        html += '<div style="margin-top:16px;"><h4 style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px;">⏭️ 今日跳過（人數不足）</h4></div>';
        html += headcountSkipped.map(aId => {
          const area = areaMap[aId];
          return '<div class="skipped-area assignment-card" data-area-id="' + aId + '" ondragover="handleDragOver(event)" ondragenter="handleDragEnter(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, \'' + aId + '\')" style="border: 2px dashed rgba(200,200,200,0.5); border-radius:12px; min-height:40px; justify-content:space-between;" title="拖曳人員至此即可重新啟用本區">' +
            '<span>⏭️ ' + (area ? area.name : aId) + '</span>' +
            '<span style="font-size:0.75rem; color:var(--text-muted);">(拖曳人員至此啟用)</span>' +
            '</div>';
        }).join('');
      }
    }

    if (optionalSkipped.length > 0) {
      html += '<div style="margin-top:12px;"><h4 style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px;">🔘 未啟用的可選區域</h4></div>';
      html += optionalSkipped.map(aId => {
        const area = areaMap[aId];
        return '<div class="skipped-area assignment-card" data-area-id="' + aId + '" ondragover="handleDragOver(event)" ondragenter="handleDragEnter(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, \'' + aId + '\')" style="border: 2px dashed rgba(96,165,250,0.4); background:var(--info-bg); color:var(--info); border-radius:12px; min-height:40px; justify-content:space-between;" title="拖曳人員至此即可重新啟用本區">' +
          '<span>🔘 ' + (area ? area.name : aId) + '</span>' +
          '<span style="font-size:0.75rem; opacity:0.7;">(拖曳人員至此啟用)</span>' +
          '</div>';
      }).join('');
    }
  }

  container.innerHTML = html;
  fetchConfirmStatuses();
}

let lastStatusCache = '';
let statusPollingTimer = null;

async function fetchConfirmStatuses() {
  if (typeof GAS_API_URL === 'undefined' || !GAS_API_URL || GAS_API_URL === 'YOUR_GAS_API_URL_HERE') return;

  try {
    const res = await fetch(GAS_API_URL);
    const data = await res.json();
    if (!Array.isArray(data)) return;

    const currentStatusStr = JSON.stringify(data.map(r => ({ c: r.areaCode, s: [r.status1, r.status2, r.status3, r.status4] })));

    if (currentStatusStr === lastStatusCache) return;
    lastStatusCache = currentStatusStr;

    const statusMap = {};
    data.forEach(row => {
      statusMap[row.areaCode] = [row.status1, row.status2, row.status3, row.status4];
    });

    document.querySelectorAll('.staff-chip[data-area-id]').forEach(chip => {
      const areaId = chip.dataset.areaId;
      const idx = parseInt(chip.dataset.personIndex || '0', 10);
      const statuses = statusMap[areaId];
      const isConfirmed = statuses && statuses[idx] === '已確認';

      if (isConfirmed) {
        if (chip.dataset.confirmed !== 'true') {
          chip.classList.add('confirmed');
          chip.dataset.confirmed = 'true';
        }
      } else {
        if (chip.dataset.confirmed === 'true') {
          chip.classList.remove('confirmed');
          chip.dataset.confirmed = 'false';
        }
      }
    });
  } catch (err) {
    console.warn('fetchConfirmStatuses 失敗:', err);
  } finally {
    if (statusPollingTimer) clearTimeout(statusPollingTimer);
    statusPollingTimer = setTimeout(fetchConfirmStatuses, 10000);
  }
}

document.getElementById('saveScheduleBtn')?.addEventListener('click', () => {
  const dateStr = dateInput.value;
  const presentIds = getSelectedStaffIds();
  const isHolidayTomorrow = document.getElementById('holidayToggle').checked;
  const enabledOptionalAreas = [];
  document.querySelectorAll('.optional-area-toggle:checked').forEach(cb => enabledOptionalAreas.push(cb.dataset.areaId));
  const planner = PlannerService.getTodayPlanner(presentIds);
  const plannerId = planner ? planner.id : null;
  const assignments = currentScheduleState ? currentScheduleState.assignments : Scheduler.generate(presentIds, dateStr, { isHolidayTomorrow, enabledOptionalAreas, plannerId }).assignments;

  ScheduleModel.save({
    date: dateStr,
    planner: plannerId,
    presentStaff: presentIds,
    enabledOptionalAreas: enabledOptionalAreas,
    assignments: assignments,
    skippedAreas: currentScheduleState ? currentScheduleState.skippedAreas : [],
  });
  if (typeof showToast === 'function') showToast(dateStr + ' 排班已儲存', 'success');
});

document.getElementById('printBtn')?.addEventListener('click', () => window.print());

const DEFAULT_CHECKED_AREAS = ['a10', 'a12'];

function renderOptionalToggles() {
  const areas = AreaModel.getAll().filter(a => a.priority === 'optional');
  const container = document.getElementById('optionalToggles');

  if (typeof sessionOptionalAreaIds === 'undefined' || sessionOptionalAreaIds === null) {
    const existing = ScheduleModel.getByDate(dateInput.value);
    if (existing && existing.enabledOptionalAreas) {
      sessionOptionalAreaIds = existing.enabledOptionalAreas;
    } else {
      sessionOptionalAreaIds = [...DEFAULT_CHECKED_AREAS];
    }
  }

  if (areas.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = areas.map(a => {
    const isChecked = sessionOptionalAreaIds.includes(a.id);
    return '<label class="checkbox-item ' + (isChecked ? 'checked' : '') + '" style="max-width:220px;">' +
      '<input type="checkbox" class="optional-area-toggle" data-area-id="' + a.id + '" ' + (isChecked ? 'checked' : '') + '>' +
      '<span class="checkbox-mark"></span>' +
      '<span class="checkbox-label">' + a.name + '</span>' +
      '</label>';
  }).join('');

  container.querySelectorAll('.checkbox-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      item.classList.toggle('checked');
      const cb = item.querySelector('input');
      cb.checked = !cb.checked;
      sessionOptionalAreaIds = [...document.querySelectorAll('.optional-area-toggle:checked')].map(el => el.dataset.areaId);
    });
  });
}

// ─── Drag and Drop 邏輯 ───
let dragSrcStaffId = null;
let dragSrcAreaId = null;

window.handleDragStart = function (e, staffId, areaId) {
  dragSrcStaffId = staffId;
  dragSrcAreaId = areaId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', staffId);
};

window.handleDragEnd = function (e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.assignment-card.drag-over').forEach(el => el.classList.remove('drag-over'));
};

window.handleDragOver = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

window.handleDragEnter = function (e) {
  e.preventDefault();
  const card = e.target.closest('.assignment-card');
  if (card) card.classList.add('drag-over');
};

window.handleDragLeave = function (e) {
  const card = e.target.closest('.assignment-card');
  if (card && !card.contains(e.relatedTarget)) {
    card.classList.remove('drag-over');
  }
};

window.handleDrop = function (e, targetAreaId) {
  e.preventDefault();
  const card = e.target.closest('.assignment-card');
  if (card) card.classList.remove('drag-over');

  if (!dragSrcStaffId || !dragSrcAreaId) return;
  if (dragSrcAreaId === targetAreaId) return;

  if (typeof currentScheduleState === 'undefined' || !currentScheduleState || !currentScheduleState.assignments) {
    if (typeof showToast === 'function') showToast('找不到排班資料', 'error');
    return;
  }

  const assignments = currentScheduleState.assignments;
  let srcAssignment = assignments.find(a => a.areaId === dragSrcAreaId);
  let dstAssignment = assignments.find(a => a.areaId === targetAreaId);

  if (!srcAssignment) return;
  if (!dstAssignment) {
    dstAssignment = { areaId: targetAreaId, staffIds: [] };
    assignments.push(dstAssignment);
    if (currentScheduleState.skippedAreas) {
      currentScheduleState.skippedAreas = currentScheduleState.skippedAreas.filter(id => id !== targetAreaId);
    }
  }

  const staff = StaffModel.getById(dragSrcStaffId);
  const targetArea = AreaModel.getById(targetAreaId);

  if (targetArea && targetArea.genderRestriction === 'female' && staff.gender === 'male') {
    if (typeof showToast === 'function') showToast('⚠️ 錯誤：男同事不能掃女廁！', 'error');
    return;
  }

  if (targetArea && targetArea.name.includes('廁') && dstAssignment.staffIds.length >= targetArea.maxPeople) {
    if (!confirm('⚠️ 警告：該廁所已有 ' + dstAssignment.staffIds.length + ' 人 (上限 ' + targetArea.maxPeople + ' 人)，確定要放入嗎？')) return;
  }

  const allSrcChips = [...document.querySelectorAll(`.staff-chip[data-area-id="${dragSrcAreaId}"]`)];
  const draggedChipEl = allSrcChips.find(c => {
    const idx = parseInt(c.dataset.personIndex || '0', 10);
    return srcAssignment.staffIds[idx] === dragSrcStaffId;
  });
  if (draggedChipEl && draggedChipEl.dataset.confirmed === 'true') {
    if (!confirm(`⚠️ ${staff.name} 已確認打掃，確定要移動嗎？`)) {
      dragSrcStaffId = null;
      dragSrcAreaId = null;
      return;
    }
  }

  srcAssignment.staffIds = srcAssignment.staffIds.filter(id => id !== dragSrcStaffId);
  dstAssignment.staffIds.push(dragSrcStaffId);

  renderScheduleResult(currentScheduleState.assignments, currentScheduleState.skippedAreas, currentScheduleState.warnings);
  if (typeof showToast === 'function') showToast('已將 ' + staff.name + ' 移至 ' + targetArea.name, 'success');

  const saveBtn = document.getElementById('saveScheduleBtn');
  if (saveBtn) {
    saveBtn.classList.add('btn-primary');
    saveBtn.classList.remove('btn-success');
    saveBtn.innerHTML = '💾 記得儲存變更';
  }

  if (typeof syncScheduleToGAS === 'function') syncScheduleToGAS(currentScheduleState.assignments, currentScheduleState.skippedAreas, dateInput.value, true);

  dragSrcStaffId = null;
  dragSrcAreaId = null;
};

window.handleRemoveStaff = function (e, staffId, areaId) {
  e.preventDefault();
  e.stopPropagation();

  if (typeof currentScheduleState === 'undefined' || !currentScheduleState || !currentScheduleState.assignments) return;

  const chip = e.target.closest('.staff-chip');
  if (chip && chip.dataset.confirmed === 'true') {
    const staff = StaffModel.getById(staffId);
    const name = staff ? staff.name : staffId;
    if (!confirm(`⚠️ ${name} 已確認打掃，確定要從排班中移除嗎？`)) return;
  }

  const assignment = currentScheduleState.assignments.find(a => a.areaId === areaId);
  if (assignment) {
    assignment.staffIds = assignment.staffIds.filter(id => id !== staffId);

    const cbItem = document.querySelector('#staffCheckboxes .checkbox-item[data-id="' + staffId + '"]');
    if (cbItem) {
      cbItem.classList.remove('checked');
      const cbInput = cbItem.querySelector('input');
      if (cbInput) cbInput.checked = false;

      if (typeof getSelectedStaffIds === 'function') {
        sessionPresentStaffIds = getSelectedStaffIds();
      }
      if (typeof updatePresentCount === 'function') updatePresentCount();
      if (typeof updatePlannerBanner === 'function') updatePlannerBanner();
    }

    if (currentScheduleState && currentScheduleState.presentIds) {
      currentScheduleState.presentIds = currentScheduleState.presentIds.filter(id => id !== staffId);
    }

    const targetChip = e.target.closest('.staff-chip');
    if (targetChip) {
      targetChip.style.opacity = '0';
      targetChip.style.transform = 'scale(0.8)';
    }

    setTimeout(() => {
      renderScheduleResult(currentScheduleState.assignments, currentScheduleState.skippedAreas, currentScheduleState.warnings);
      if (typeof showToast === 'function') showToast('已移除排班人員，並取消其今日出勤', 'info');

      const saveBtn = document.getElementById('saveScheduleBtn');
      if (saveBtn) {
        saveBtn.classList.add('btn-primary');
        saveBtn.classList.remove('btn-success');
        saveBtn.innerHTML = '💾 記得儲存變更';
      }

      if (typeof syncScheduleToGAS === 'function') syncScheduleToGAS(currentScheduleState.assignments, currentScheduleState.skippedAreas, dateInput.value, true);
    }, 150);
  }
};