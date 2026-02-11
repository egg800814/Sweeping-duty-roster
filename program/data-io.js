// program/data-io.js — JSON 匯出/匯入功能

const DataIO = {
    exportAll() {
        const data = {
            version: 2,
            exportedAt: new Date().toISOString(),
            staff: StaffModel.getAll(),
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
                    if (data.staff) StaffModel.save(data.staff);
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
