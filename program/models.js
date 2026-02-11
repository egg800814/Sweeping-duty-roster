// program/models.js — 資料模型與 localStorage 存取層

const DATA_VERSION = 9; // v9: 更正黃珮珊部門、張東華排序調整

const STORAGE_KEYS = {
  STAFF: 'cleaning_staff',
  AREAS: 'cleaning_areas',
  PLANNER: 'cleaning_planner_rotation',
  SCHEDULES: 'cleaning_schedules',
  DATA_VER: 'cleaning_data_version',
};

// ─── UUID 產生器 ───
function generateId() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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
      id: generateId(),
      name: staff.name,
      gender: staff.gender || 'male',
      active: staff.active !== undefined ? staff.active : true,
      isDefault: staff.isDefault !== undefined ? staff.isDefault : true,
      role: staff.role || 'regular',
      floorRestriction: staff.floorRestriction || null,
      excludeAreas: staff.excludeAreas || [],
      department: staff.department || '未分類',
    };
    list.push(newStaff);
    saveData(STORAGE_KEYS.STAFF, list);
    return newStaff;
  },

  update(id, updates) {
    const list = this.getAll();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    saveData(STORAGE_KEYS.STAFF, list);
    return list[idx];
  },

  remove(id) {
    const list = this.getAll().filter(s => s.id !== id);
    saveData(STORAGE_KEYS.STAFF, list);
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
      id: generateId(),
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
    if (rot.planners.length === 0) return null;
    const idx = rot.currentIndex % rot.planners.length;
    const plannerId = rot.planners[idx];

    if (presentStaffIds && !presentStaffIds.includes(plannerId)) {
      for (let i = 1; i < rot.planners.length; i++) {
        const nextIdx = (idx + i) % rot.planners.length;
        const nextId = rot.planners[nextIdx];
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

// ─── 初始化預設資料（含版本檢查） ───
async function initializeDefaultData() {
  const savedVer = parseInt(localStorage.getItem(STORAGE_KEYS.DATA_VER) || '0');

  // 若版本已經符合，直接結束
  if (savedVer >= DATA_VERSION) {
    return;
  }

  // 版本不同 → 嘗試從伺服器取得預設資料
  try {
    const resp = await fetch('./config/default_data.json?v=' + Date.now());
    if (resp.ok) {
      const data = await resp.json();

      // 成功取得預設資料，這才清空舊資料並覆蓋
      console.log('資料版本升級 v' + savedVer + ' → v' + DATA_VERSION + '，已從伺服器載入預設資料。');
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

      if (data.staff) StaffModel.save(data.staff);
      if (data.areas) AreaModel.save(data.areas);
      if (data.plannerRotation) PlannerModel.save(data.plannerRotation);

      localStorage.setItem(STORAGE_KEYS.DATA_VER, String(DATA_VERSION));
    } else {
      throw new Error('伺服器回傳狀態異常');
    }
  } catch (e) {
    // 取得失敗 (例如在 file:// 下)
    console.warn('無法連線至伺服器載入預設資料:', e.message);

    // 如果目前已經有手動匯入的人員資料，我們就直接把版本號升上去，不要再嘗試重置
    if (StaffModel.getAll().length > 0) {
      console.log('偵測到已有本地資料，停止重置邏輯並更新版本號至 v' + DATA_VERSION);
      localStorage.setItem(STORAGE_KEYS.DATA_VER, String(DATA_VERSION));
    }
  }
}
