// program/planner.js — 負責人輪值與代理機制

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

    getRotationOverview() {
        const rot = PlannerModel.get();
        return rot.planners.map((pid, idx) => {
            const staff = StaffModel.getById(pid);
            // 代理人 = 下一位
            const nextIdx = (idx + 1) % rot.planners.length;
            const deputy = StaffModel.getById(rot.planners[nextIdx]);

            return {
                index: idx,
                isCurrent: idx === rot.currentIndex % rot.planners.length,
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
