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
  // localStorage.setItem(key, JSON.stringify(data));
  console.log(`[Storage Disable] ${key} 的寫入已被禁止。`);
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

// ─── 初始化資料 (從外部 JSON 載入) ───
async function initializeDefaultData() {
  try {
    const resp = await fetch('data.json?v=' + Date.now());
    if (resp.ok) {
      const data = await resp.json();

      // 將資料寫入系統內的讀取快取 (若直接操作 localStorage 將失效)
      // 需要透過全域變數或重新設計 loadData, 這裡直接覆寫儲存行為(bypass我們剛剛的禁用)
      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(data.staff || []));
      localStorage.setItem(STORAGE_KEYS.AREAS, JSON.stringify(data.areas || []));
      localStorage.setItem(STORAGE_KEYS.PLANNER, JSON.stringify(data.plannerRotation || { planners: [], currentIndex: 0 }));
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(data.schedules || []));

      console.log('✅ 已成功從 data.json 載入全公司共用設定！');
    } else {
      throw new Error('伺服器回傳狀態異常');
    }
  } catch (e) {
    console.warn('無法連線至 data.json:', e.message);
  }
}
