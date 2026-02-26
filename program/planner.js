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

    movePlanner(index, direction) {
        const rot = PlannerModel.get();
        const targetIndex = index + direction;

        if (targetIndex < 0 || targetIndex >= rot.planners.length) return;

        // 交換陣列順序
        const temp = rot.planners[index];
        rot.planners[index] = rot.planners[targetIndex];
        rot.planners[targetIndex] = temp;

        // 如果移動的人剛好是目前負責人，讓 currentIndex 跟著跑
        if (rot.currentIndex === index) {
            rot.currentIndex = targetIndex;
        } else if (rot.currentIndex === targetIndex) {
            rot.currentIndex = index;
        }

        PlannerModel.save(rot);
    },

    setBaseDateToToday(index) {
        const rot = PlannerModel.get();
        // 抓取今天日期作為基準
        const today = new Date();
        // 如果想固定從週一算，這一步可以做更複雜的計算，但單純記錄「這天為基準」也可以
        const dateStr = today.toISOString().slice(0, 10);
        rot.baseDate = dateStr;
        rot.baseIndex = index;
        rot.currentIndex = index;
        PlannerModel.save(rot);
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
