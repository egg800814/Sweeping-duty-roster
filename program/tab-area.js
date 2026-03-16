/*
 * 【tab-area.js】
 * 「區域管理」頁籤的所有 UI 邏輯。
 * 包含：
 *   - renderAreaTable()：渲染所有清掃區域的資料表格，
 *     顯示名稱、樓層、優先級、性別限定、人數範圍與操作按鈕
 *   - 新增區域按鈕（addAreaBtn）：開啟 Modal 表單並呼叫 saveNewArea()
 *   - editArea(id)：開啟編輯 Modal，帶入現有資料，呼叫 updateArea(id) 儲存
 *   - deleteArea(id)：確認後刪除區域，並同步更新可選區域勾選清單
 */

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
