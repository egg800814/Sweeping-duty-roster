/*
 * 【scheduler.js】
 * 核心排班演算法。
 * 包含確定性隨機產生器 SeededRandom（以日期＋出勤人員清單為種子），
 * 以及主要的 Scheduler 物件，負責依照以下五個階段分配清掃人員：
 *   1. 每日必掃區域（有性別限制）
 *   2. 每日必掃區域（無性別限制）
 *   3. 彈性區域（a16 女更衣室優先）
 *   4. 可選區域（依使用者勾選啟用）
 *   5. Overfill 強制分配剩餘人員至空間較大的區域
 * 分配時兼顧公平性（14 天指派次數）、近期輪替（7 天避免重複）
 * 與性別相容性（廁所嚴格保護）。
 */

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
            skippedAreas.push(area.id);
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
            skippedAreas.push(area.id);
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
          const scoredRemaining = remainingStaff.map(id => ({ id, score: rng.next() }));
          scoredRemaining.sort((a, b) => a.score - b.score);

          // 定義優先增援區域 (事務所 a9, 2F陽台 a4)
          const priorityOverflowIds = ['a9', 'a4'];

          const getExpandableTargets = (ignoreMax = false) => {
            return assignments.filter(a => {
              const area = allAreas.find(ar => ar.id === a.areaId);
              if (!area) return false;
              // 男女廁所嚴格限制不得超過 maxPeople (2人)
              if (area.name.includes('廁')) {
                return a.staffIds.length < area.maxPeople;
              }
              return ignoreMax || a.staffIds.length < area.maxPeople;
            }).sort((a, b) => {
              const aPri = priorityOverflowIds.includes(a.areaId) ? 0 : 1;
              const bPri = priorityOverflowIds.includes(b.areaId) ? 0 : 1;
              if (aPri !== bPri) return aPri - bPri;
              const arA = allAreas.find(ar => ar.id === a.areaId);
              const arB = allAreas.find(ar => ar.id === b.areaId);
              return (arA?.order || 99) - (arB?.order || 99);
            });
          };

          let assignIdx = 0;
          for (const item of scoredRemaining) {
            const staffId = item.id;
            let validTargets = getExpandableTargets(false);

            if (validTargets.length === 0) {
              validTargets = getExpandableTargets(true);
            }

            if (validTargets.length === 0 && allAreas.length > 0) {
              assignments.push({ areaId: allAreas[0].id, staffIds: [] });
              validTargets = getExpandableTargets(true);
            }

            if (validTargets.length === 0) continue;

            const s = staffMap[staffId];
            let foundTarget = null;

            // 性別相容性檢查
            const checkCompatibility = (targetAssignment, staffGender) => {
              const area = allAreas.find(ar => ar.id === targetAssignment.areaId);
              if (!area) return false;

              // 1. 女廁：嚴格禁止男生進入
              if (area.genderRestriction === 'female' && staffGender === 'male') {
                return false;
              }

              // 2. 男廁：不允許男女混掃
              if (area.genderRestriction === 'malePreferred') {
                const hasMale = targetAssignment.staffIds.some(id => staffMap[id].gender === 'male');
                const hasFemale = targetAssignment.staffIds.some(id => staffMap[id].gender === 'female');

                if (staffGender === 'female' && hasMale) return false;
                if (staffGender === 'male' && hasFemale) return false;
              }

              return true;
            };

            // 優先尋找符合性別相容性的區域
            for (let i = 0; i < validTargets.length; i++) {
              const t = validTargets[(assignIdx + i) % validTargets.length];
              if (checkCompatibility(t, s.gender)) {
                foundTarget = t;
                assignIdx = assignIdx + i + 1;
                break;
              }
            }

            // 絕對防呆：若目前 validTargets 皆不符合性別規則，則尋找無性別限制的區域強制放入
            if (!foundTarget) {
              const safeArea = allAreas.find(ar => ar.genderRestriction === 'none') || allAreas[0];
              let safeAssignment = assignments.find(a => a.areaId === safeArea.id);
              if (!safeAssignment) {
                safeAssignment = { areaId: safeArea.id, staffIds: [] };
                assignments.push(safeAssignment);
              }
              foundTarget = safeAssignment;
            }

            foundTarget.staffIds.push(staffId);
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