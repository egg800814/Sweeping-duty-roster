/*
 * 【models.js】
 * 資料模型與 localStorage 存取層。
 * 定義系統版本號、儲存鍵值常數、UUID 產生器，
 * 以及所有 CRUD 模型物件：
 *   - StaffModel：人員的新增、查詢、更新、刪除
 *   - AreaModel：清掃區域的管理
 *   - PlannerModel：每週負責人輪值資料的讀寫與自動日期推算
 *   - ScheduleModel：每日排班紀錄的儲存與查詢
 *   - HistoryModel：歷史指派次數與近期區域的統計
 * 最後提供 initializeDefaultData()，在啟動時強制從
 * ../data/data.json 同步最新共用設定至 localStorage。
 */

// program/models.js — 資料模型與 localStorage 存取層

const DATA_VERSION = 12.0; // v12.0: 加入自動輪值與順序調整機制

const STORAGE_KEYS = {
  STAFF: 'cleaning_staff',
  DEPARTMENTS: 'cleaning_departments',
  ROLES: 'cleaning_roles',
  AREAS: 'cleaning_areas',
  PLANNER: 'cleaning_planner_rotation',
  SCHEDULES: 'cleaning_schedules',
  DATA_VER: 'cleaning_data_version',
};

// ─── 遞增 ID 產生器 ───
function getNextIncrementalId(list, prefix) {
  let maxNum = 0;
  list.forEach(item => {
    if (typeof item.id === 'string' && item.id.startsWith(prefix)) {
      const num = parseInt(item.id.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return prefix + (maxNum + 1);
}

// ─── 通用 localStorage 操作 ───
function loadData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Department CRUD ───
const DepartmentModel = {
  getAll() {
    return loadData(STORAGE_KEYS.DEPARTMENTS, []).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  getById(id) {
    return this.getAll().find(d => d.id === id) || null;
  },

  add(dept) {
    const list = this.getAll();
    const newDept = {
      id: getNextIncrementalId(list, 'd'),
      name: dept.name,
      sortOrder: dept.sortOrder || list.length + 1,
    };
    list.push(newDept);
    saveData(STORAGE_KEYS.DEPARTMENTS, list);
    return newDept;
  },

  update(id, updates) {
    const list = this.getAll();
    const idx = list.findIndex(d => d.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    saveData(STORAGE_KEYS.DEPARTMENTS, list);
    return list[idx];
  },

  remove(id) {
    const list = this.getAll().filter(d => d.id !== id);
    saveData(STORAGE_KEYS.DEPARTMENTS, list);
  },

  save(list) {
    saveData(STORAGE_KEYS.DEPARTMENTS, list);
  },
};

// ─── Role CRUD ───
const RoleModel = {
  getAll() {
    return loadData(STORAGE_KEYS.ROLES, []).sort((a, b) => a.weight - b.weight);
  },

  getById(id) {
    return this.getAll().find(r => r.id === id) || null;
  },

  add(role) {
    const list = this.getAll();
    const newRole = {
      id: getNextIncrementalId(list, 'r'),
      name: role.name,
      weight: role.weight || 99,
    };
    list.push(newRole);
    saveData(STORAGE_KEYS.ROLES, list);
    return newRole;
  },

  update(id, updates) {
    const list = this.getAll();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    saveData(STORAGE_KEYS.ROLES, list);
    return list[idx];
  },

  remove(id) {
    const list = this.getAll().filter(r => r.id !== id);
    saveData(STORAGE_KEYS.ROLES, list);
  },

  save(list) {
    saveData(STORAGE_KEYS.ROLES, list);
  },
};

// ─── Staff CRUD ───
const StaffModel = {
  getAll() {
    return loadData(STORAGE_KEYS.STAFF, []);
  },

  getActive() {
    return this.getAll().filter(s => s.active);
  },

  getById(id) {
    return this.getAll().find(s => s.id === id) || null;
  },

  add(staff) {
    const list = this.getAll();
    const newStaff = {
      id: getNextIncrementalId(list, 's'),
      name: staff.name,
      gender: staff.gender || 'male',
      active: staff.active !== undefined ? staff.active : true,
      isDefault: staff.isDefault !== undefined ? staff.isDefault : true,
      isRotate: staff.isRotate !== undefined ? staff.isRotate : true,
      roleId: staff.roleId || null,
      departmentId: staff.departmentId || null,
      floorRestriction: staff.floorRestriction || null,
      excludeAreas: staff.excludeAreas || [],
    };
    list.push(newStaff);
    saveData(STORAGE_KEYS.STAFF, list);

    // 同步新增至輪值清單
    const rot = PlannerModel.get();
    if (newStaff.isRotate && !rot.planners.includes(newStaff.id)) {
      rot.planners.push(newStaff.id);
      PlannerModel.save(rot);
    }

    return newStaff;
  },

  update(id, updates) {
    const list = this.getAll();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return null;

    const oldRotate = list[idx].isRotate !== false; // 若未定義視為 true
    list[idx] = { ...list[idx], ...updates };
    const newRotate = list[idx].isRotate !== false;
    
    saveData(STORAGE_KEYS.STAFF, list);

    // 處理 isRotate 變更造成的輪值清單影響
    if (oldRotate !== newRotate) {
      const rot = PlannerModel.get();
      if (newRotate && !rot.planners.includes(id)) {
        rot.planners.push(id);
      } else if (!newRotate && rot.planners.includes(id)) {
        rot.planners = rot.planners.filter(pid => pid !== id);
        if (rot.currentIndex >= rot.planners.length) rot.currentIndex = 0;
      }
      PlannerModel.save(rot);
    }

    return list[idx];
  },

  remove(id) {
    const list = this.getAll().filter(s => s.id !== id);
    saveData(STORAGE_KEYS.STAFF, list);

    // 同步從輪值清單移除
    const rot = PlannerModel.get();
    rot.planners = rot.planners.filter(pid => pid !== id);
    if (rot.currentIndex >= rot.planners.length) rot.currentIndex = 0;
    PlannerModel.save(rot);
  },

  save(list) {
    saveData(STORAGE_KEYS.STAFF, list);
  },
};

// ─── Area CRUD ───
const AreaModel = {
  getAll() {
    return loadData(STORAGE_KEYS.AREAS, []).sort((a, b) => a.order - b.order);
  },

  getById(id) {
    return this.getAll().find(a => a.id === id) || null;
  },

  add(area) {
    const list = this.getAll();
    const newArea = {
      id: getNextIncrementalId(list, 'a'),
      name: area.name,
      priority: area.priority || 'daily',
      genderRestriction: area.genderRestriction || 'none',
      minPeople: area.minPeople || 1,
      maxPeople: area.maxPeople || 1,
      order: area.order || list.length + 1,
      floor: area.floor !== undefined ? area.floor : 0,
      holidayBoost: area.holidayBoost || false,
    };
    list.push(newArea);
    saveData(STORAGE_KEYS.AREAS, list);
    return newArea;
  },

  update(id, updates) {
    const list = this.getAll();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    saveData(STORAGE_KEYS.AREAS, list);
    return list[idx];
  },

  remove(id) {
    const list = this.getAll().filter(a => a.id !== id);
    saveData(STORAGE_KEYS.AREAS, list);
  },

  save(list) {
    saveData(STORAGE_KEYS.AREAS, list);
  },
};

// ─── Planner Rotation ───
const PlannerModel = {
  get() {
    return loadData(STORAGE_KEYS.PLANNER, {
      planners: [],
      currentIndex: 0,
    });
  },

  save(data) {
    saveData(STORAGE_KEYS.PLANNER, data);
  },

  getCurrentPlanner(presentStaffIds = null) {
    const rot = this.get();
    
    // 確保輪值名單當下僅採用 `isRotate !== false` 且 active 的員工
    const activePlanners = rot.planners.filter(pid => {
        const s = StaffModel.getById(pid);
        return s && s.active && s.isRotate !== false;
    });

    if (activePlanners.length === 0) return null;

    let idx = rot.currentIndex % activePlanners.length;

    // 若有啟用自動基準日推算
    if (rot.baseDate) {
      const base = new Date(rot.baseDate);
      base.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffWeeks = Math.floor((today.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 7));
      let actualIndex = (rot.baseIndex !== undefined ? rot.baseIndex : rot.currentIndex) + diffWeeks;
      while (actualIndex < 0) actualIndex += activePlanners.length;

      idx = actualIndex % activePlanners.length;
      if (rot.currentIndex !== idx) {
        rot.currentIndex = idx;
      }
    }

    const plannerId = activePlanners[idx];

    if (presentStaffIds && !presentStaffIds.includes(plannerId)) {
      for (let i = 1; i < activePlanners.length; i++) {
        const nextIdx = (idx + i) % activePlanners.length;
        const nextId = activePlanners[nextIdx];
        if (presentStaffIds.includes(nextId)) {
          return { id: nextId, isDeputy: true, originalId: plannerId };
        }
      }
      return null;
    }

    return { id: plannerId, isDeputy: false, originalId: plannerId };
  },

  advanceWeek() {
    const rot = this.get();
    if (rot.planners.length === 0) return;
    rot.currentIndex = (rot.currentIndex + 1) % rot.planners.length;
    this.save(rot);
  },
};

// ─── Schedule Records ───
const ScheduleModel = {
  getAll() {
    return loadData(STORAGE_KEYS.SCHEDULES, []);
  },

  getByDate(dateStr) {
    return this.getAll().find(s => s.date === dateStr) || null;
  },

  save(schedule) {
    const list = this.getAll().filter(s => s.date !== schedule.date);
    list.push(schedule);
    list.sort((a, b) => b.date.localeCompare(a.date));
    saveData(STORAGE_KEYS.SCHEDULES, list);
  },

  remove(dateStr) {
    const list = this.getAll().filter(s => s.date !== dateStr);
    saveData(STORAGE_KEYS.SCHEDULES, list);
  },

  getRecent(n = 30) {
    return this.getAll().slice(0, n);
  },
};

// ─── 公平性 + 區域歷史 ───
const HistoryModel = {
  getAssignmentCounts(days = 14) {
    const schedules = ScheduleModel.getAll();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const counts = {};
    for (const sched of schedules) {
      if (sched.date < cutoffStr) continue;
      for (const assign of (sched.assignments || [])) {
        for (const sid of (assign.staffIds || [])) {
          counts[sid] = (counts[sid] || 0) + 1;
        }
      }
    }
    return counts;
  },

  getRecentAreasByStaff(days = 7) {
    const schedules = ScheduleModel.getAll();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const map = {};
    for (const sched of schedules) {
      if (sched.date < cutoffStr) continue;
      for (const assign of (sched.assignments || [])) {
        for (const sid of (assign.staffIds || [])) {
          if (!map[sid]) map[sid] = new Set();
          map[sid].add(assign.areaId);
        }
      }
    }
    return map;
  },
};

// ─── 初始化資料 (從外部 JSON 載入) ───
// 修正：系統啟動時強制讀取 data.json，確保與外部資料同步，不依賴本機舊緩存
async function initializeDefaultData() {
  try {
    const resp = await fetch('../data/data.json?v=' + Date.now(), { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();

      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(data.staff || []));
      localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(data.departments || []));
      localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(data.roles || []));
      localStorage.setItem(STORAGE_KEYS.AREAS, JSON.stringify(data.areas || []));
      localStorage.setItem(STORAGE_KEYS.PLANNER, JSON.stringify(data.plannerRotation || { planners: [], currentIndex: 0 }));
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(data.schedules || []));

      // 標記版本
      localStorage.setItem(STORAGE_KEYS.DATA_VER, String(DATA_VERSION));

      console.log('✅ 已成功從 data.json 載入預設初始資料！');
    } else {
      throw new Error('無法讀取 data.json (HTTP ' + resp.status + ')');
    }
  } catch (e) {
    console.error('❌ 初始化失敗，請檢查 data/data.json 是否存在:', e.message);
  }
}
