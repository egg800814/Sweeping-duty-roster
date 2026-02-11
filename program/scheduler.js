// program/scheduler.js — 核心排班演算法

// ─── 確定性隨機產生器 (LCG) ───
class SeededRandom {
    constructor(seed) {
        this.seed = seed || 12345;
    }
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

const Scheduler = {
    generate(presentStaffIds, dateStr, options = {}) {
        const {
            isHolidayTomorrow = false,
            enabledOptionalAreas = [],
            plannerId = null,
            lockedAssignments = [],
            lockedStaffIds = [],
        } = options;

        // ── 初始化種子 ──
        const sortedPresentIds = [...presentStaffIds].sort().join(',');
        const seedInput = dateStr + sortedPresentIds;
        let seed = 5381;
        for (let i = 0; i < seedInput.length; i++) {
            seed = ((seed << 5) + seed) + seedInput.charCodeAt(i);
        }
        const rng = new SeededRandom(Math.abs(seed));

        const allAreas = AreaModel.getAll();
        const allStaff = StaffModel.getAll();
        const staffMap = {};
        allStaff.forEach(s => (staffMap[s.id] = s));

        const cleaningStaffIds = presentStaffIds.filter(id => id !== plannerId);
        const assignCounts = HistoryModel.getAssignmentCounts(14);
        const recentAreas = HistoryModel.getRecentAreasByStaff(7);
        const availablePool = new Set(cleaningStaffIds.filter(id => !lockedStaffIds.includes(id)));

        let assignments = [...lockedAssignments.map(a => ({ ...a, staffIds: [...a.staffIds] }))];
        const lockedAreaIds = new Set(lockedAssignments.map(a => a.areaId));
        const skippedAreas = [];
        const warnings = [];

        const dailyAreas = allAreas.filter(a => a.priority === 'daily' && !lockedAreaIds.has(a.id));
        const flexibleAreas = allAreas.filter(a => a.priority === 'flexible' && !lockedAreaIds.has(a.id));
        const optionalAreas = allAreas.filter(a => a.priority === 'optional' && !lockedAreaIds.has(a.id));

        // ── 階段 1：必掃區域 (強性別限制) ──
        for (const area of dailyAreas.filter(a => a.genderRestriction !== 'none')) {
            const effectiveMax = (area.holidayBoost && isHolidayTomorrow) ? area.maxPeople : undefined;
            const result = this._assignArea(area, availablePool, staffMap, assignCounts, recentAreas, rng, effectiveMax);
            if (result.staffIds.length > 0) {
                assignments.push({ areaId: area.id, staffIds: result.staffIds });
                result.staffIds.forEach(id => availablePool.delete(id));
            } else {
                warnings.push('⚠️ ' + area.name + '：無法安排符合條件的人員');
            }
        }

        // ── 階段 2：必掃區域 (無性別限制) ──
        for (const area of dailyAreas.filter(a => a.genderRestriction === 'none')) {
            const result = this._assignArea(area, availablePool, staffMap, assignCounts, recentAreas, rng);
            if (result.staffIds.length > 0) {
                assignments.push({ areaId: area.id, staffIds: result.staffIds });
                result.staffIds.forEach(id => availablePool.delete(id));
            } else {
                warnings.push('⚠️ ' + area.name + '：人員不足，無法安排必掃區域');
            }
        }

        // ── 階段 3：彈性區域 (含 a16 優先點) ──
        const sortedFlexible = flexibleAreas.sort((a, b) => {
            if (a.id === 'a16') return -1;
            if (b.id === 'a16') return 1;
            return (a.order || 0) - (b.order || 0);
        });

        for (const area of sortedFlexible) {
            if (availablePool.size === 0) { skippedAreas.push(area.id); continue; }
            const result = this._assignArea(area, availablePool, staffMap, assignCounts, recentAreas, rng);
            if (result.staffIds.length > 0) {
                assignments.push({ areaId: area.id, staffIds: result.staffIds });
                result.staffIds.forEach(id => availablePool.delete(id));
            } else {
                skippedAreas.push(area.id);
            }
        }

        // ── 階段 4：可選區域 ──
        for (const area of optionalAreas) {
            if (!enabledOptionalAreas.includes(area.id) || availablePool.size === 0) {
                skippedAreas.push(area.id);
                continue;
            }
            // 優化：對於勾選的可選區域，即便總人數不多，也要嘗試分配（在 _decideHeadcount 會給予 minPeople）
            const result = this._assignArea(area, availablePool, staffMap, assignCounts, recentAreas, rng);
            if (result.staffIds.length > 0) {
                assignments.push({ areaId: area.id, staffIds: result.staffIds });
                result.staffIds.forEach(id => availablePool.delete(id));
            } else {
                skippedAreas.push(area.id);
            }
        }

        // ── 階段 5：Overfill 強制分配 (依空間大小優先增援) ──
        if (availablePool.size > 0) {
            const remainingStaff = [...availablePool];
            // 隨機打亂剩餘人員
            const scoredRemaining = remainingStaff.map(id => ({ id, score: rng.next() }));
            scoredRemaining.sort((a, b) => a.score - b.score);

            // 定義優先增援區域 (事務所 a9, 2F陽台 a4) 與 嚴格限制區域 (廁所廚房等)
            const priorityOverflowIds = ['a9', 'a4'];
            const strictMaxIds = ['a1', 'a2', 'a3', 'a6', 'a7'];

            for (const item of scoredRemaining) {
                const s = staffMap[item.id];

                // 取得目前所有已分配區域，並依適合度排序
                const targets = assignments.map(a => ({
                    assign: a,
                    area: allAreas.find(ar => ar.id === a.areaId)
                }))
                    .filter(t => t.area)
                    .sort((a, b) => {
                        // 1. 尚未達到 maxPeople 的優先
                        const aFull = a.assign.staffIds.length >= a.area.maxPeople ? 1 : 0;
                        const bFull = b.assign.staffIds.length >= b.area.maxPeople ? 1 : 0;
                        if (aFull !== bFull) return aFull - bFull;

                        // 2. 嚴格限制區域 (廁所等) 盡量排在後面
                        const aStrict = strictMaxIds.includes(a.area.id) ? 1 : 0;
                        const bStrict = strictMaxIds.includes(b.area.id) ? 1 : 0;
                        if (aStrict !== bStrict) return aStrict - bStrict;

                        // 3. 優先增援區域 (事務所、陽台) 排在前面
                        const aPri = priorityOverflowIds.includes(a.area.id) ? 0 : 1;
                        const bPri = priorityOverflowIds.includes(b.area.id) ? 0 : 1;
                        if (aPri !== bPri) return aPri - bPri;

                        return (a.area.order || 99) - (b.area.order || 99);
                    });

                let found = false;
                for (const target of targets) {
                    const area = target.area;
                    if (area.genderRestriction === 'female' && s.gender === 'male') continue;
                    if (s.floorRestriction && area.floor !== 0 && s.floorRestriction !== area.floor) continue;
                    if (s.excludeAreas && s.excludeAreas.includes(area.id)) continue;
                    if (strictMaxIds.includes(area.id) && target.assign.staffIds.length >= area.maxPeople) {
                        if (targets.some(t => !strictMaxIds.includes(t.area.id))) continue;
                    }
                    target.assign.staffIds.push(s.id);
                    found = true;
                    break;
                }

                if (!found) {
                    const lastResort = targets.find(t => t.area.genderRestriction !== 'female' || s.gender !== 'male');
                    if (lastResort) {
                        lastResort.assign.staffIds.push(s.id);
                        warnings.push('⚠️ ' + s.name + ' 無完全合適區域，已強行分配至 ' + lastResort.area.name);
                    } else {
                        warnings.push('⚠️ ' + s.name + ' 無合適區域 (性別或空間限制)');
                    }
                }
            }
        }

        const areaOrderMap = {};
        allAreas.forEach(a => areaOrderMap[a.id] = a.order);
        assignments.sort((a, b) => (areaOrderMap[a.areaId] || 99) - (areaOrderMap[b.areaId] || 99));

        return { assignments, skippedAreas, warnings };
    },

    _assignArea(area, availablePool, staffMap, assignCounts, recentAreas, rng, forceMax) {
        const poolArr = [...availablePool];
        let eligible = poolArr.filter(id => {
            const s = staffMap[id];
            if (!s) return false;
            if (s.floorRestriction && area.floor !== 0 && s.floorRestriction !== area.floor) return false;
            if (s.excludeAreas && s.excludeAreas.includes(area.id)) return false;
            return true;
        });

        if (area.genderRestriction === 'female') {
            eligible = eligible.filter(id => staffMap[id]?.gender === 'female');
        } else if (area.genderRestriction === 'malePreferred') {
            const males = eligible.filter(id => staffMap[id]?.gender === 'male');
            if (males.length > 0) eligible = males;
        }

        if (eligible.length === 0) return { staffIds: [] };

        // 確定性排序
        const scored = eligible.map(id => ({
            id,
            randomFactor: rng.next(),
            recent: recentAreas[id]?.has(area.id) ? 1 : 0,
            count: assignCounts[id] || 0
        }));

        scored.sort((a, b) => {
            if (a.recent !== b.recent) return a.recent - b.recent;
            if (a.count !== b.count) return a.count - b.count;
            return a.randomFactor - b.randomFactor;
        });

        const num = this._decideHeadcount(area, scored.length, availablePool.size, forceMax);
        return { staffIds: scored.slice(0, num).map(c => c.id) };
    },

    _decideHeadcount(area, candidateCount, totalAvailable, forceMax) {
        const { minPeople, maxPeople } = area;
        if (forceMax) return Math.min(forceMax, candidateCount);
        if (candidateCount <= minPeople) return Math.min(candidateCount, minPeople);

        // 依總人數調整分配量
        if (totalAvailable >= 20) return Math.min(maxPeople, candidateCount);

        // 如果是重要區域或可選區域已啟用，即便總人數不多也至少給予 minPeople
        return Math.min(minPeople, candidateCount);
    },
};
