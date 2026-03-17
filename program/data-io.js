/*
 * 【data-io.js】
 * 資料備份與還原功能（DataIO）。
 * 提供三項操作：
 *   - exportAll()：將所有人員、區域、輪值、排班紀錄與 GAS URL
 *     打包成 JSON 檔案下載至本機。
 *   - importAll(file)：讀取使用者上傳的 JSON 備份檔，
 *     還原所有資料至 localStorage，並同步更新 GAS URL 欄位。
 *   - clearAll()：清除 localStorage 中所有系統資料（不可復原）。
 */

const DataIO = {
    exportAll() {
    const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        gasApiUrl: typeof GAS_API_URL !== 'undefined' ? GAS_API_URL : '',
        staff: StaffModel.getAll(),
        departments: DepartmentModel.getAll(),
        roles: RoleModel.getAll(),
        areas: AreaModel.getAll(),
        plannerRotation: PlannerModel.get(),
        schedules: ScheduleModel.getAll(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cleaning_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    },

    importAll(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.staff || !data.areas) {
            reject(new Error('檔案格式不正確'));
            return;
            }
            if (data.gasApiUrl) {
            localStorage.setItem('gas_api_url', data.gasApiUrl);
            if (typeof GAS_API_URL !== 'undefined') GAS_API_URL = data.gasApiUrl;
            const gasInput = document.getElementById('gasApiUrlInput');
            if (gasInput) {
                gasInput.value = data.gasApiUrl;
                const statusEl = document.getElementById('gasUrlStatus');
                if (statusEl) {
                statusEl.textContent = '✅ 已從匯入檔載入 URL';
                statusEl.style.color = 'var(--success)';
                }
            }
            }
            if (data.staff) StaffModel.save(data.staff);
            if (data.departments) DepartmentModel.save(data.departments);
            if (data.roles) RoleModel.save(data.roles);
            if (data.areas) AreaModel.save(data.areas);
            if (data.plannerRotation) PlannerModel.save(data.plannerRotation);
            if (data.schedules) saveData(STORAGE_KEYS.SCHEDULES, data.schedules);

            // 匯入後自動更新版本號，防止 initializeDefaultData 誤刪
            localStorage.setItem(STORAGE_KEYS.DATA_VER, String(DATA_VERSION));

            resolve({
            staffCount: data.staff?.length || 0,
            areaCount: data.areas?.length || 0,
            scheduleCount: data.schedules?.length || 0,
            });
        } catch (err) {
            reject(new Error('JSON 解析失敗: ' + err.message));
        }
        };
        reader.onerror = () => reject(new Error('檔案讀取失敗'));
        reader.readAsText(file);
    });
    },

    clearAll() {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    },
};
