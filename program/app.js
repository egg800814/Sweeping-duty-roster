// program/app.js — UI 控制器

// ─── 排班狀態管理 ───
let currentScheduleState = null;
let sessionPresentStaffIds = null;  // 暫存目前的勾選人員
let sessionOptionalAreaIds = null;  // 暫存目前的區域勾選

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

// ═══════════════════════════════════════
// TAB 1: 每日排班
// ═══════════════════════════════════════

function refreshSchedulePanel() {
  renderStaffCheckboxes();
  renderOptionalToggles();
  updatePlannerBanner();
  updatePresentCount();
}

const dateInput = document.getElementById('scheduleDate');
dateInput.value = new Date().toISOString().slice(0, 10);

document.getElementById('todayBtn').addEventListener('click', () => {
  dateInput.value = new Date().toISOString().slice(0, 10);
  currentScheduleState = null;
  checkExistingSchedule();
});

dateInput.addEventListener('change', () => {
  currentScheduleState = null;
  sessionPresentStaffIds = null;  // 重置，讓 refresh 時重新偵測該日期的紀錄或預設值
  sessionOptionalAreaIds = null;
  refreshSchedulePanel();
  checkExistingSchedule();
});

function checkExistingSchedule() {
  const existing = ScheduleModel.getByDate(dateInput.value);
  if (existing) {
    // 優先更新 Session 狀態
    sessionPresentStaffIds = existing.presentStaff || [];
    sessionOptionalAreaIds = existing.enabledOptionalAreas || []; // 假設舊資料無此欄位則為空

    renderStaffCheckboxes();
    renderOptionalToggles();
    updatePresentCount();
    renderScheduleResult(existing.assignments, existing.skippedAreas || [], []);

    // 更新結果快取
    currentScheduleState = {
      assignments: existing.assignments,
      skippedAreas: existing.skippedAreas,
      presentIds: [...sessionPresentStaffIds],
      plannerId: existing.planner,
      enabledOptionalAreas: [...sessionOptionalAreaIds],
      isHolidayTomorrow: false // 無法從歷史還原此項，預設 false
    };

    document.getElementById('saveScheduleBtn').style.display = '';
    document.getElementById('printBtn').style.display = '';
    document.getElementById('addLateBtn').style.display = '';

    showToast('已載入 ' + dateInput.value + ' 的排班紀錄', 'info');
  } else {
    // 若無紀錄，則交由 refreshSchedulePanel (因 date 變動會觸發 refresh) 處理初始化
    renderScheduleResult([], [], []);
    document.getElementById('saveScheduleBtn').style.display = 'none';
    document.getElementById('printBtn').style.display = 'none';
    document.getElementById('addLateBtn').style.display = 'none';
  }
}

// 人員勾選清單 (依部門分組)
function renderStaffCheckboxes() {
  const container = document.getElementById('staffCheckboxes');
  const staff = StaffModel.getActive();

  const departments = {};
  // 這裡不再需要內部的 sortOrder，改用下方的全域定義

  staff.forEach(s => {
    const dept = s.department || '未分類';
    if (!departments[dept]) departments[dept] = [];
    departments[dept].push(s);
  });

  // 處理初始化
  if (sessionPresentStaffIds === null) {
    const existing = ScheduleModel.getByDate(dateInput.value);
    if (existing) {
      sessionPresentStaffIds = existing.presentStaff || [];
    } else {
      sessionPresentStaffIds = staff.filter(s => s.isDefault).map(s => s.id);
    }
  }

  let html = '';
  // 調整部門順序：管理部 -> 營業部 -> 新事業部 -> 技術部
  const sortOrder = ['管理部', '營業部', '新事業部', '技術部', '其他', '未分類'];

  // 自定義人員順序 (部長除外)
  const USER_SEQUENCE = ["s11", "s07", "s08", "s14", "s18", "s22", "s10", "s13", "s19", "s21", "s27", "s23", "s28", "s06", "s05", "s02", "s04", "s12", "s15", "s16", "s17", "s20", "s24", "s25", "s26"];

  const getStaffRank = (s) => {
    if (s.role === 'manager') return -1; // 部長永遠最前
    const idx = USER_SEQUENCE.indexOf(s.id);
    return idx === -1 ? 999 : idx;
  };

  const deptKeys = Object.keys(departments).sort((a, b) => {
    const idxA = sortOrder.indexOf(a);
    const idxB = sortOrder.indexOf(b);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  deptKeys.forEach(dept => {
    // 部門內人員依自定義 Rank 排序
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

      // 同步至 Session
      sessionPresentStaffIds = getSelectedStaffIds();

      updatePresentCount();
      updatePlannerBanner();
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

document.getElementById('selectAllStaff').addEventListener('click', () => {
  document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
    item.classList.add('checked');
    item.querySelector('input').checked = true;
  });
  sessionPresentStaffIds = getSelectedStaffIds();
  updatePresentCount();
  updatePlannerBanner();
});

document.getElementById('deselectAllStaff').addEventListener('click', () => {
  document.querySelectorAll('#staffCheckboxes .checkbox-item').forEach(item => {
    item.classList.remove('checked');
    item.querySelector('input').checked = false;
  });
  sessionPresentStaffIds = [];
  updatePresentCount();
  updatePlannerBanner();
});

document.getElementById('selectDefaultStaff').addEventListener('click', () => {
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

document.getElementById('generateBtn').addEventListener('click', () => {
  const presentIds = getSelectedStaffIds();
  if (presentIds.length === 0) {
    showToast('請先勾選今日出勤人員', 'error');
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

  showToast('排班完成！已分配 ' + result.assignments.length + ' 個區域', 'success');
});

document.getElementById('addLateBtn').addEventListener('click', () => {
  if (!currentScheduleState) {
    showToast('請先進行自動排班', 'error');
    return;
  }

  const nowSelectedIds = getSelectedStaffIds();
  const prevIds = currentScheduleState.presentIds;
  const newIds = nowSelectedIds.filter(id => !prevIds.includes(id) && id !== currentScheduleState.plannerId);

  if (newIds.length === 0) {
    showToast('沒有新增人員', 'info');
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
  showToast('已追加人員並更新分配', 'success');
});

function renderScheduleResult(assignments, skippedAreas, warnings) {
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
    html += warnings.map(w => '<div class="warning-item">' + w + '</div>').join('');
  }

  if (assignments.length > 0) {
    html += assignments.map(a => {
      const area = areaMap[a.areaId];
      if (!area) return '';
      const staffChips = a.staffIds.map(sid => {
        const s = staffMap[sid];
        if (!s) return '';
        return '<span class="staff-chip ' + s.gender + '">' + s.name + '</span>';
      }).join('');

      const priorityClass = area.priority;
      const genderTag = area.genderRestriction !== 'none'
        ? '<span class="gender-badge ' + (area.genderRestriction === 'female' ? 'female' : 'male') + '" style="font-size:0.65rem;margin-left:4px;">' + (area.genderRestriction === 'female' ? '♀' : '♂優先') + '</span>'
        : '';

      const isOverflow = a.staffIds.length > area.maxPeople;
      const overflowTag = isOverflow ? '<span style="font-size:0.7rem;color:var(--info);margin-left:6px;">(增援)</span>' : '';

      return '<div class="assignment-card">' +
        '<div class="assignment-area">' +
        '<span class="priority-dot ' + priorityClass + '"></span>' +
        area.name + genderTag + overflowTag +
        '</div>' +
        '<div class="assignment-staff">' + staffChips + '</div>' +
        '</div>';
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
      html += '<div style="margin-top:16px;"><h4 style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px;">⏭️ 今日跳過（人數不足）</h4></div>';
      html += relevantSkipped.map(aId => {
        const area = areaMap[aId];
        return '<div class="skipped-area">⏭️ ' + (area ? area.name : aId) + '</div>';
      }).join('');
    }

    if (optionalSkipped.length > 0) {
      html += '<div style="margin-top:12px;"><h4 style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px;">🔘 未啟用的可選區域</h4></div>';
      html += optionalSkipped.map(aId => {
        const area = areaMap[aId];
        return '<div class="skipped-area" style="border-color:rgba(96,165,250,0.15);background:var(--info-bg);color:var(--info);">🔘 ' + (area ? area.name : aId) + '</div>';
      }).join('');
    }
  }

  container.innerHTML = html;
}

document.getElementById('saveScheduleBtn').addEventListener('click', () => {
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
    enabledOptionalAreas: enabledOptionalAreas, // 新增：保存已啟用的可選區域
    assignments: assignments,
    skippedAreas: currentScheduleState ? currentScheduleState.skippedAreas : [],
  });
  showToast(dateStr + ' 排班已儲存', 'success');
});

document.getElementById('printBtn').addEventListener('click', () => window.print());

const DEFAULT_CHECKED_AREAS = ['a10', 'a12'];

function renderOptionalToggles() {
  const areas = AreaModel.getAll().filter(a => a.priority === 'optional');
  const container = document.getElementById('optionalToggles');

  // 初始化可選區域勾選狀態
  if (sessionOptionalAreaIds === null) {
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

      // 同步至 Session
      sessionOptionalAreaIds = [...document.querySelectorAll('.optional-area-toggle:checked')].map(el => el.dataset.areaId);
    });
  });
}

// ═══════════════════════════════════════
// TAB 2: 人員管理
// ═══════════════════════════════════════

function renderStaffTable() {
  const staff = StaffModel.getAll();
  const tbody = document.getElementById('staffTableBody');
  if (staff.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">👥</div><p>尚無人員</p></td></tr>';
    return;
  }

  // 依部門與職稱排序
  const sortOrder = ['管理部', '營業部', '新事業部', '技術部', '其他', '未分類'];
  const USER_SEQUENCE = ["s11", "s07", "s08", "s14", "s18", "s22", "s10", "s13", "s19", "s21", "s27", "s23", "s28", "s06", "s05", "s02", "s04", "s12", "s15", "s16", "s17", "s20", "s24", "s25", "s26"];

  const getRank = (s) => {
    const dIdx = sortOrder.indexOf(s.department || '未分類');
    const deptScore = (dIdx === -1 ? 99 : dIdx) * 1000;
    const roleScore = s.role === 'manager' ? -100 : 0;
    const seqIdx = USER_SEQUENCE.indexOf(s.id);
    const seqScore = seqIdx === -1 ? 900 : seqIdx;
    return deptScore + roleScore + seqScore;
  };

  const sortedStaff = [...staff].sort((a, b) => getRank(a) - getRank(b));

  tbody.innerHTML = sortedStaff.map(s => {
    const restrict = [];
    if (s.floorRestriction) restrict.push('限' + s.floorRestriction + 'F');
    if (s.excludeAreas && s.excludeAreas.length > 0) {
      const areaNames = s.excludeAreas.map(aid => {
        const a = AreaModel.getById(aid);
        return a ? a.name : aid;
      });
      restrict.push('排除:' + areaNames.join(','));
    }

    return '<tr>' +
      '<td>' + (s.department || '未分類') + '</td>' +
      '<td><strong>' + s.name + '</strong>' + (restrict.length ? '<br><small style="color:var(--warning)">' + restrict.join(',') + '</small>' : '') + '</td>' +
      '<td><span class="gender-badge ' + s.gender + '">' + (s.gender === 'male' ? '♂' : '♀') + '</span></td>' +
      '<td>' + (s.role === 'manager' ? '<span class="badge badge-warning">部長</span>' : '一般') + '</td>' +
      '<td>' + (s.active ? '在職' : '停用') + '</td>' +
      '<td>' + (s.isDefault ? '是' : '否') + '</td>' +
      '<td class="actions">' +
      '<button class="btn-icon" onclick="editStaff(\'' + s.id + '\')">✏️</button>' +
      '<button class="btn-icon danger" onclick="deleteStaff(\'' + s.id + '\')">🗑️</button>' +
      '</td></tr>';
  }).join('');
}

document.getElementById('addStaffBtn').addEventListener('click', () => {
  const areasForExclude = AreaModel.getAll().map(a =>
    '<option value="' + a.id + '">' + a.name + '</option>'
  ).join('');

  openModal(
    '<div class="modal-header"><h3 class="modal-title">新增人員</h3><button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="form-group"><label>部門</label><select class="form-select" id="modalStaffDept"><option value="管理部">管理部</option><option value="營業部">營業部</option><option value="新事業部">新事業部</option><option value="技術部" selected>技術部</option></select></div>' +
    '<div class="form-group"><label>姓名</label><input class="form-input" id="modalStaffName" placeholder="請輸入姓名" autofocus></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>性別</label><select class="form-select" id="modalStaffGender"><option value="male">♂ 男</option><option value="female">♀ 女</option></select></div>' +
    '<div class="form-group"><label>角色</label><select class="form-select" id="modalStaffRole"><option value="regular">一般</option><option value="manager">部長</option></select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>預設每日出勤</label><select class="form-select" id="modalStaffDefault"><option value="true">是</option><option value="false">否</option></select></div>' +
    '<div class="form-group"><label>樓層限制</label><select class="form-select" id="modalStaffFloor"><option value="">無限制</option><option value="1">僅 1 樓</option><option value="2">僅 2 樓</option></select></div>' +
    '</div>' +
    '<div class="form-group"><label>排除區域（可多選，按住 Ctrl）</label><select class="form-select" id="modalStaffExclude" multiple style="height:100px;">' + areasForExclude + '</select></div>' +
    '<div class="modal-footer"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="saveNewStaff()">新增</button></div>'
  );
});

window.saveNewStaff = function () {
  const name = document.getElementById('modalStaffName').value.trim();
  if (!name) { showToast('請輸入姓名', 'error'); return; }

  const floorVal = document.getElementById('modalStaffFloor').value;
  const excludeSel = document.getElementById('modalStaffExclude');
  const excludeAreas = [...excludeSel.selectedOptions].map(o => o.value);

  StaffModel.add({
    name,
    department: document.getElementById('modalStaffDept').value,
    gender: document.getElementById('modalStaffGender').value,
    role: document.getElementById('modalStaffRole').value,
    isDefault: document.getElementById('modalStaffDefault').value === 'true',
    floorRestriction: floorVal ? parseInt(floorVal) : null,
    excludeAreas,
  });

  closeModal();
  renderStaffTable();
  showToast('已新增人員：' + name, 'success');
};

window.editStaff = function (id) {
  const s = StaffModel.getById(id);
  if (!s) return;

  const areasForExclude = AreaModel.getAll().map(a =>
    '<option value="' + a.id + '" ' + ((s.excludeAreas || []).includes(a.id) ? 'selected' : '') + '>' + a.name + '</option>'
  ).join('');

  const depts = ['管理部', '營業部', '新事業部', '技術部'];
  const deptOptions = depts.map(d => '<option value="' + d + '" ' + (s.department === d ? 'selected' : '') + '>' + d + '</option>').join('');

  openModal(
    '<div class="modal-header"><h3 class="modal-title">編輯人員</h3><button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="form-group"><label>部門</label><select class="form-select" id="modalStaffDept">' + deptOptions + '</select></div>' +
    '<div class="form-group"><label>姓名</label><input class="form-input" id="modalStaffName" value="' + s.name + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>性別</label><select class="form-select" id="modalStaffGender"><option value="male" ' + (s.gender === 'male' ? 'selected' : '') + '>♂ 男</option><option value="female" ' + (s.gender === 'female' ? 'selected' : '') + '>♀ 女</option></select></div>' +
    '<div class="form-group"><label>角色</label><select class="form-select" id="modalStaffRole"><option value="regular" ' + (s.role !== 'manager' ? 'selected' : '') + '>一般</option><option value="manager" ' + (s.role === 'manager' ? 'selected' : '') + '>部長</option></select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>狀態</label><select class="form-select" id="modalStaffActive"><option value="true" ' + (s.active ? 'selected' : '') + '>在職</option><option value="false" ' + (!s.active ? 'selected' : '') + '>停用</option></select></div>' +
    '<div class="form-group"><label>預設每日出勤</label><select class="form-select" id="modalStaffDefault"><option value="true" ' + (s.isDefault ? 'selected' : '') + '>是</option><option value="false" ' + (!s.isDefault ? 'selected' : '') + '>否</option></select></div>' +
    '</div>' +
    '<div class="form-group"><label>樓層限制</label><select class="form-select" id="modalStaffFloor"><option value="">無限制</option><option value="1" ' + (s.floorRestriction === 1 ? 'selected' : '') + '>僅 1 樓</option><option value="2" ' + (s.floorRestriction === 2 ? 'selected' : '') + '>僅 2 樓</option></select></div>' +
    '<div class="form-group"><label>排除區域（可多選，按住 Ctrl）</label><select class="form-select" id="modalStaffExclude" multiple style="height:100px;">' + areasForExclude + '</select></div>' +
    '<div class="modal-footer"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="updateStaff(\'' + id + '\')">儲存</button></div>'
  );
};

window.updateStaff = function (id) {
  const floorVal = document.getElementById('modalStaffFloor').value;
  const excludeSel = document.getElementById('modalStaffExclude');
  const excludeAreas = [...excludeSel.selectedOptions].map(o => o.value);

  StaffModel.update(id, {
    name: document.getElementById('modalStaffName').value.trim(),
    department: document.getElementById('modalStaffDept').value,
    gender: document.getElementById('modalStaffGender').value,
    role: document.getElementById('modalStaffRole').value,
    active: document.getElementById('modalStaffActive').value === 'true',
    isDefault: document.getElementById('modalStaffDefault').value === 'true',
    floorRestriction: floorVal ? parseInt(floorVal) : null,
    excludeAreas,
  });
  closeModal();
  renderStaffTable();
  if (document.querySelector('.tab-btn[data-tab="schedule"]').classList.contains('active')) {
    renderStaffCheckboxes(); // 更新排班頁面的人員分組
  }
  showToast('人員已更新', 'success');
};

window.deleteStaff = function (id) {
  const s = StaffModel.getById(id);
  if (!s) return;
  if (!confirm('確定刪除「' + s.name + '」嗎？')) return;
  StaffModel.remove(id);
  renderStaffTable();
  showToast('已刪除：' + s.name, 'info');
};

// ═══════════════════════════════════════
// TAB 3: 區域管理
// ═══════════════════════════════════════

function renderAreaTable() {
  const areas = AreaModel.getAll();
  const tbody = document.getElementById('areaTableBody');

  if (areas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">🏢</div><p>尚無區域</p></td></tr>';
    return;
  }

  const priorityLabels = { daily: '🔴 每日必掃', flexible: '🟡 彈性', optional: '🔵 可選' };
  const genderLabels = { none: '不限', female: '♀ 限女', malePreferred: '♂ 優先男', male: '♂ 限男' };

  tbody.innerHTML = areas.map(a => {
    return '<tr>' +
      '<td><strong>' + a.name + '</strong></td>' +
      '<td>' + (a.floor === 0 ? '全' : a.floor + 'F') + '</td>' +
      '<td>' + (priorityLabels[a.priority] || a.priority) + '</td>' +
      '<td>' + (genderLabels[a.genderRestriction] || a.genderRestriction) + '</td>' +
      '<td>' + a.minPeople + '~' + a.maxPeople + ' 人' + (a.holidayBoost ? ' <span class="badge badge-info" style="font-size:0.6rem;">假日+1</span>' : '') + '</td>' +
      '<td class="actions">' +
      '<button class="btn-icon" onclick="editArea(\'' + a.id + '\')" title="編輯">✏️</button>' +
      '<button class="btn-icon danger" onclick="deleteArea(\'' + a.id + '\')" title="刪除">🗑️</button>' +
      '</td></tr>';
  }).join('');
}

document.getElementById('addAreaBtn').addEventListener('click', () => {
  openModal(
    '<div class="modal-header"><h3 class="modal-title">新增清掃區域</h3><button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="form-group"><label>區域名稱</label><input class="form-input" id="modalAreaName" placeholder="例：2樓_會議室" autofocus></div>' +
    '<div class="form-row-3">' +
    '<div class="form-group"><label>樓層</label><select class="form-select" id="modalAreaFloor"><option value="0">全樓層</option><option value="1">1 樓</option><option value="2">2 樓</option></select></div>' +
    '<div class="form-group"><label>優先級</label><select class="form-select" id="modalAreaPriority"><option value="daily">每日必掃</option><option value="flexible">彈性</option><option value="optional">可選</option></select></div>' +
    '<div class="form-group"><label>性別限定</label><select class="form-select" id="modalAreaGender"><option value="none">不限</option><option value="malePreferred">♂ 優先男</option><option value="female">♀ 僅限女性</option></select></div>' +
    '</div>' +
    '<div class="form-row-3">' +
    '<div class="form-group"><label>最少人數</label><input class="form-input" id="modalAreaMin" type="number" min="1" max="10" value="1"></div>' +
    '<div class="form-group"><label>最多人數</label><input class="form-input" id="modalAreaMax" type="number" min="1" max="10" value="1"></div>' +
    '<div class="form-group"><label>假日前加人</label><select class="form-select" id="modalAreaHoliday"><option value="false">否</option><option value="true">是</option></select></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="saveNewArea()">新增</button></div>'
  );
});

window.saveNewArea = function () {
  const name = document.getElementById('modalAreaName').value.trim();
  if (!name) { showToast('請輸入區域名稱', 'error'); return; }

  AreaModel.add({
    name,
    floor: parseInt(document.getElementById('modalAreaFloor').value),
    priority: document.getElementById('modalAreaPriority').value,
    genderRestriction: document.getElementById('modalAreaGender').value,
    minPeople: parseInt(document.getElementById('modalAreaMin').value) || 1,
    maxPeople: parseInt(document.getElementById('modalAreaMax').value) || 1,
    holidayBoost: document.getElementById('modalAreaHoliday').value === 'true',
  });

  closeModal();
  renderAreaTable();
  renderOptionalToggles();
  showToast('已新增區域：' + name, 'success');
};

window.editArea = function (id) {
  const a = AreaModel.getById(id);
  if (!a) return;

  openModal(
    '<div class="modal-header"><h3 class="modal-title">編輯區域</h3><button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="form-group"><label>區域名稱</label><input class="form-input" id="modalAreaName" value="' + a.name + '"></div>' +
    '<div class="form-row-3">' +
    '<div class="form-group"><label>樓層</label><select class="form-select" id="modalAreaFloor"><option value="0" ' + (a.floor === 0 ? 'selected' : '') + '>全樓層</option><option value="1" ' + (a.floor === 1 ? 'selected' : '') + '>1 樓</option><option value="2" ' + (a.floor === 2 ? 'selected' : '') + '>2 樓</option></select></div>' +
    '<div class="form-group"><label>優先級</label><select class="form-select" id="modalAreaPriority"><option value="daily" ' + (a.priority === 'daily' ? 'selected' : '') + '>每日必掃</option><option value="flexible" ' + (a.priority === 'flexible' ? 'selected' : '') + '>彈性</option><option value="optional" ' + (a.priority === 'optional' ? 'selected' : '') + '>可選</option></select></div>' +
    '<div class="form-group"><label>性別限定</label><select class="form-select" id="modalAreaGender"><option value="none" ' + (a.genderRestriction === 'none' ? 'selected' : '') + '>不限</option><option value="malePreferred" ' + (a.genderRestriction === 'malePreferred' ? 'selected' : '') + '>♂ 優先男</option><option value="female" ' + (a.genderRestriction === 'female' ? 'selected' : '') + '>♀ 僅限女性</option></select></div>' +
    '</div>' +
    '<div class="form-row-3">' +
    '<div class="form-group"><label>最少人數</label><input class="form-input" id="modalAreaMin" type="number" min="1" max="10" value="' + a.minPeople + '"></div>' +
    '<div class="form-group"><label>最多人數</label><input class="form-input" id="modalAreaMax" type="number" min="1" max="10" value="' + a.maxPeople + '"></div>' +
    '<div class="form-group"><label>假日前加人</label><select class="form-select" id="modalAreaHoliday"><option value="false" ' + (!a.holidayBoost ? 'selected' : '') + '>否</option><option value="true" ' + (a.holidayBoost ? 'selected' : '') + '>是</option></select></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn btn-outline btn-sm" onclick="closeModal()">取消</button><button class="btn btn-primary btn-sm" onclick="updateArea(\'' + id + '\')">儲存</button></div>'
  );
};

window.updateArea = function (id) {
  AreaModel.update(id, {
    name: document.getElementById('modalAreaName').value.trim(),
    floor: parseInt(document.getElementById('modalAreaFloor').value),
    priority: document.getElementById('modalAreaPriority').value,
    genderRestriction: document.getElementById('modalAreaGender').value,
    minPeople: parseInt(document.getElementById('modalAreaMin').value) || 1,
    maxPeople: parseInt(document.getElementById('modalAreaMax').value) || 1,
    holidayBoost: document.getElementById('modalAreaHoliday').value === 'true',
  });
  closeModal();
  renderAreaTable();
  renderOptionalToggles();
  showToast('區域已更新', 'success');
};

window.deleteArea = function (id) {
  const a = AreaModel.getById(id);
  if (!a) return;
  if (!confirm('確定刪除「' + a.name + '」嗎？')) return;
  AreaModel.remove(id);
  renderAreaTable();
  renderOptionalToggles();
  showToast('已刪除：' + a.name, 'info');
};

// ═══════════════════════════════════════
// TAB 4 & 5 & 6 (Rotation, History, Data)
// ═══════════════════════════════════════

function renderRotation() {
  const overview = PlannerService.getRotationOverview();
  const container = document.getElementById('rotationList');

  if (overview.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔄</div><p>尚未設定輪值順序</p></div>';
    return;
  }

  container.innerHTML = overview.map(item =>
    '<div class="rotation-item ' + (item.isCurrent ? 'current' : '') + '" onclick="PlannerService.setCurrentIndex(' + item.index + ');renderRotation();updatePlannerBanner();showToast(\'已切換本週負責人為 ' + item.staffName + '\',\'success\');">' +
    '<span class="rotation-index">' + (item.index + 1) + '</span>' +
    '<span class="rotation-name">' + item.staffName + '</span>' +
    (item.isCurrent ? '<span class="badge badge-success">本週</span>' : '') +
    '<span class="rotation-deputy">代理人：' + item.deputyName + '</span>' +
    '</div>'
  ).join('');
}

document.getElementById('advanceWeekBtn').addEventListener('click', () => {
  PlannerService.advanceToNextWeek();
  renderRotation();
  updatePlannerBanner();
  showToast('已推進至下一週', 'success');
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

document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (!confirm('⚠️ 確定清除全部資料嗎？此操作無法復原！')) return;
  if (!confirm('再次確認：所有人員、區域、排班紀錄都將被刪除？')) return;
  DataIO.clearAll();
  showToast('所有資料已清除', 'info');
  refreshSchedulePanel();
  renderOptionalToggles();
});

document.getElementById('resetDefaultBtn').addEventListener('click', async () => {
  if (!confirm('確定重置為預設資料嗎？現有資料將被覆蓋。')) return;
  DataIO.clearAll();
  localStorage.removeItem('cleaning_data_version');
  await initializeDefaultData();
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

async function boot() {
  await initializeDefaultData();
  refreshSchedulePanel();
  renderOptionalToggles();
}

boot();
