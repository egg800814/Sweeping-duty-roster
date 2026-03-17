/*
 * 【planner.js】
 * 負責人輪值服務層（PlannerService）。
 * 封裝 PlannerModel 的業務邏輯，提供以下功能：
 *   - getTodayPlanner()：取得本週負責人（含代理人判斷）
 *   - advanceToNextWeek()：手動推進至下一週
 *   - movePlanner()：調整輪值順序（上移/下移）
 *   - setBaseDateToToday()：設定自動輪值基準日
 *   - getRotationOverview()：取得完整輪值列表供 UI 渲染
 *   - updateRotation()：更新輪值名單
 *   - setCurrentIndex()：直接設定本週負責人索引
 */

const PlannerService = {
    /**
     * 取得本週負責人（含代理判斷）
     */
    getTodayPlanner(presentStaffIds) {
    const result = PlannerModel.getCurrentPlanner(presentStaffIds);
    if (!result) return null;

    const planner = StaffModel.getById(result.id);
    const original = StaffModel.getById(result.originalId);

    return {
        id: result.id,
        name: planner ? planner.name : '未知',
        isDeputy: result.isDeputy,
        originalId: result.originalId,
        originalName: original ? original.name : '未知',
    };
    },

    advanceToNextWeek() {
    PlannerModel.advanceWeek();
    },

    movePlanner(index, direction) {
    const rot = PlannerModel.get();
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= rot.planners.length) return;

    const temp = rot.planners[index];
    rot.planners[index] = rot.planners[targetIndex];
    rot.planners[targetIndex] = temp;

    if (rot.currentIndex === index) {
        rot.currentIndex = targetIndex;
    } else if (rot.currentIndex === targetIndex) {
        rot.currentIndex = index;
    }

    PlannerModel.save(rot);
    },

    setBaseDateToToday(index) {
    const rot = PlannerModel.get();
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    rot.baseDate = dateStr;
    rot.baseIndex = index;
    rot.currentIndex = index;
    PlannerModel.save(rot);
    },

    getRotationOverview() {
    const rot = PlannerModel.get();
    
    // 確保名單中僅包含 isRotate !== false 的人員，過濾掉任何不該輪班的高階主管
    const activePlanners = rot.planners.filter(pid => {
        const s = StaffModel.getById(pid);
        return s && s.isRotate !== false;
    });

    return activePlanners.map((pid, idx) => {
        const staff = StaffModel.getById(pid);
        
        // 代理人 = 下一位有參與輪班的同仁
        const nextIdx = (idx + 1) % activePlanners.length;
        const deputy = StaffModel.getById(activePlanners[nextIdx]);

        return {
        index: idx,
        isCurrent: idx === rot.currentIndex % activePlanners.length,
        staffId: pid,
        staffName: staff ? staff.name : '未知',
        deputyName: deputy ? deputy.name : '無',
        };
    });
    },

    updateRotation(plannerIds) {
    const rot = PlannerModel.get();
    rot.planners = plannerIds;
    if (rot.currentIndex >= plannerIds.length) rot.currentIndex = 0;
    PlannerModel.save(rot);
    },

    setCurrentIndex(index) {
    const rot = PlannerModel.get();
    rot.currentIndex = index;
    PlannerModel.save(rot);
    },
};
