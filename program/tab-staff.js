/*
 * 【tab-staff.js】
 * 「人員管理」頁籤與排班拖曳互動邏輯。
 * 包含：
 *   - renderStaffTable()：依部門與自定義順序渲染人員清單表格
 *   - 新增人員按鈕（addStaffBtn）開啟 Modal 並呼叫 saveNewStaff()
 *   - editStaff(id)：開啟編輯 Modal 並呼叫 updateStaff(id)
 *   - deleteStaff(id)：確認後刪除人員並同步更新排班頁面與 GAS
 *   - 拖曳功能（Drag & Drop）：
 *       handleDragStart / handleDragEnd / handleDragOver
 *       handleDragEnter / handleDragLeave / handleDrop
 *     允許使用者在排班結果中手動將人員拖移至其他區域
 *   - handleRemoveStaff()：點擊人員標籤從排班中移除並同步雲端
 */

// ==========================================
// 人員管理 (TAB 2) 相關功能
// ==========================================
function renderStaffTable() {
    const staff = StaffModel.getAll();
    const tbody = document.getElementById('staffTableBody');
    if (staff.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">👥</div><p>尚無人員</p></td></tr>';
    return;
    }

    // 依部門與職稱排序
    const USER_SEQUENCE = ["s11", "s07", "s08", "s14", "s18", "s22", "s10", "s13", "s19", "s21", "s27", "s23", "s28", "s06", "s05", "s02", "s04", "s12", "s15", "s16", "s17", "s20", "s24", "s25", "s26"];

    const getRank = (s) => {
    // 依據 DepartmentModel.sortOrder
    const dept = DepartmentModel.getById(s.departmentId);
    const deptScore = (dept ? dept.sortOrder : 99) * 1000;
    
    // 依據 RoleModel.weight (越小越前面)
    const role = RoleModel.getById(s.roleId);
    const roleScore = role ? (role.weight * 10) : 990;
    
    // 自定義順序
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

    const deptName = DepartmentModel.getById(s.departmentId)?.name || '未分類';
    const roleName = RoleModel.getById(s.roleId)?.name || '一般';
    const rotateTag = s.isRotate === false ? '<span class="badge badge-warning" style="margin-left:4px;font-size:0.65rem;">不輪班</span>' : '';

    return '<tr>' +
        '<td>' + deptName + '</td>' +
        '<td><strong>' + s.name + '</strong>' + rotateTag + (restrict.length ? '<br><small style="color:var(--warning)">' + restrict.join(',') + '</small>' : '') + '</td>' +
        '<td><span class="gender-badge ' + s.gender + '">' + (s.gender === 'male' ? '♂' : '♀') + '</span></td>' +
        '<td>' + roleName + '</td>' +
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

    const depsHtml = DepartmentModel.getAll().map(d => '<option value="' + d.id + '">' + d.name + '</option>').join('');
    const rolesHtml = RoleModel.getAll().map(r => '<option value="' + r.id + '">' + r.name + '</option>').join('');

    openModal(
    '<div class="modal-header"><h3 class="modal-title">新增人員</h3><button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="form-group"><label>部門</label><select class="form-select" id="modalStaffDept">' + depsHtml + '</select></div>' +
    '<div class="form-group"><label>姓名</label><input class="form-input" id="modalStaffName" placeholder="請輸入姓名" autofocus></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>性別</label><select class="form-select" id="modalStaffGender"><option value="male">♂ 男</option><option value="female">♀ 女</option></select></div>' +
    '<div class="form-group"><label>角色</label><select class="form-select" id="modalStaffRole">' + rolesHtml + '</select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>預設每日出勤</label><select class="form-select" id="modalStaffDefault"><option value="true">是</option><option value="false">否</option></select></div>' +
    '<div class="form-group"><label>參與負責人輪值</label><select class="form-select" id="modalStaffRotate"><option value="true">是</option><option value="false">否 (例如高階主管)</option></select></div>' +
    '</div>' +
    '<div class="form-group"><label>樓層限制</label><select class="form-select" id="modalStaffFloor"><option value="">無限制</option><option value="1">僅 1 樓</option><option value="2">僅 2 樓</option></select></div>' +
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
    departmentId: document.getElementById('modalStaffDept').value,
    gender: document.getElementById('modalStaffGender').value,
    roleId: document.getElementById('modalStaffRole').value,
    isDefault: document.getElementById('modalStaffDefault').value === 'true',
    isRotate: document.getElementById('modalStaffRotate').value === 'true',
    floorRestriction: floorVal ? parseInt(floorVal) : null,
    excludeAreas,
    });

    closeModal();
    renderStaffTable();
    showToast('已新增人員：' + name, 'success');

    // 若在排班頁面且新增了預設出勤的人，觸發同步
    if (document.querySelector('.tab-btn[data-tab="schedule"]').classList.contains('active')) {
    renderStaffCheckboxes();
    debouncedSyncToGAS();
    }
};

window.editStaff = function (id) {
    const s = StaffModel.getById(id);
    if (!s) return;

    const areasForExclude = AreaModel.getAll().map(a =>
    '<option value="' + a.id + '" ' + ((s.excludeAreas || []).includes(a.id) ? 'selected' : '') + '>' + a.name + '</option>'
    ).join('');

    const depsHtml = DepartmentModel.getAll().map(d => '<option value="' + d.id + '" ' + (s.departmentId === d.id ? 'selected' : '') + '>' + d.name + '</option>').join('');
    const rolesHtml = RoleModel.getAll().map(r => '<option value="' + r.id + '" ' + (s.roleId === r.id ? 'selected' : '') + '>' + r.name + '</option>').join('');

    openModal(
    '<div class="modal-header"><h3 class="modal-title">編輯人員</h3><button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="form-group"><label>部門</label><select class="form-select" id="modalStaffDept">' + depsHtml + '</select></div>' +
    '<div class="form-group"><label>姓名</label><input class="form-input" id="modalStaffName" value="' + s.name + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>性別</label><select class="form-select" id="modalStaffGender"><option value="male" ' + (s.gender === 'male' ? 'selected' : '') + '>♂ 男</option><option value="female" ' + (s.gender === 'female' ? 'selected' : '') + '>♀ 女</option></select></div>' +
    '<div class="form-group"><label>角色</label><select class="form-select" id="modalStaffRole">' + rolesHtml + '</select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label>狀態</label><select class="form-select" id="modalStaffActive"><option value="true" ' + (s.active ? 'selected' : '') + '>在職</option><option value="false" ' + (!s.active ? 'selected' : '') + '>停用</option></select></div>' +
    '<div class="form-group"><label>參與負責人輪值</label><select class="form-select" id="modalStaffRotate"><option value="true" ' + (s.isRotate !== false ? 'selected' : '') + '>是</option><option value="false" ' + (s.isRotate === false ? 'selected' : '') + '>否 (例如高階主管)</option></select></div>' +
    '</div>' +
    '<div class="form-group"><label>預設每日出勤</label><select class="form-select" id="modalStaffDefault"><option value="true" ' + (s.isDefault ? 'selected' : '') + '>是</option><option value="false" ' + (!s.isDefault ? 'selected' : '') + '>否</option></select></div>' +
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
    departmentId: document.getElementById('modalStaffDept').value,
    gender: document.getElementById('modalStaffGender').value,
    roleId: document.getElementById('modalStaffRole').value,
    active: document.getElementById('modalStaffActive').value === 'true',
    isRotate: document.getElementById('modalStaffRotate').value === 'true',
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

    // 刪除人員後同步更新排班勾選與雲端
    if (document.querySelector('.tab-btn[data-tab="schedule"]').classList.contains('active')) {
    renderStaffCheckboxes();
    debouncedSyncToGAS();
    }
};
