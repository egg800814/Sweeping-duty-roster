/*
 * 【default-data.js】
 * 系統內建的預設資料，包含完整的人員名單（含部門、性別、角色、樓層限制）、
 * 清掃區域設定（含樓層、優先級、性別限制、人數上下限）、
 * 以及輪值排班人員順序。
 * 當外部 data.json 無法讀取時作為備用初始資料。
 * 注意：目前 initializeInlineData() 已停用，改由 models.js 的
 * initializeDefaultData() 強制從外部 data.json 同步。
 */

const INLINE_DEFAULT_DATA = {
    "staff": [
    {
        "id": "s01",
        "name": "張書友123",
        "gender": "male",
        "active": true,
        "isDefault": false,
        "role": "manager",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s02",
        "name": "莊達富",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s03",
        "name": "許惠英",
        "gender": "female",
        "active": true,
        "isDefault": false,
        "role": "manager",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "管理部"
    },
    {
        "id": "s04",
        "name": "顏宏光",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s05",
        "name": "邱振威",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s06",
        "name": "譚文男",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s07",
        "name": "楊麗玉",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "管理部"
    },
    {
        "id": "s08",
        "name": "江辰平",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "管理部"
    },
    {
        "id": "s09",
        "name": "陳逸人",
        "gender": "male",
        "active": true,
        "isDefault": false,
        "role": "manager",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "營業部"
    },
    {
        "id": "s10",
        "name": "黃聖文",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "營業部"
    },
    {
        "id": "s11",
        "name": "黃珮珊",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "管理部"
    },
    {
        "id": "s12",
        "name": "黃智傑",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s13",
        "name": "陳瑞雯",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "營業部"
    },
    {
        "id": "s14",
        "name": "范孝慈",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "管理部"
    },
    {
        "id": "s15",
        "name": "李承哲",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s16",
        "name": "許漢德",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s17",
        "name": "李哲旭",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s18",
        "name": "陳妍淇",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "管理部"
    },
    {
        "id": "s19",
        "name": "洪立恩",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "營業部"
    },
    {
        "id": "s20",
        "name": "簡鴻彬",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s21",
        "name": "蔡沛容",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "營業部"
    },
    {
        "id": "s22",
        "name": "張芮溱",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": 2,
        "excludeAreas": [
        "a4"
        ],
        "department": "管理部"
    },
    {
        "id": "s23",
        "name": "林聖家",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "新事業部"
    },
    {
        "id": "s24",
        "name": "徐明億",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s25",
        "name": "薛育政",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s26",
        "name": "林邗潁",
        "gender": "male",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "技術部"
    },
    {
        "id": "s27",
        "name": "張東華",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "新事業部"
    },
    {
        "id": "s28",
        "name": "姚香均",
        "gender": "female",
        "active": true,
        "isDefault": true,
        "role": "regular",
        "floorRestriction": null,
        "excludeAreas": [],
        "department": "新事業部"
    }
    ],
    "areas": [
    {
        "id": "a1",
        "name": "2樓_廚房",
        "floor": 2,
        "priority": "daily",
        "genderRestriction": "female",
        "minPeople": 1,
        "maxPeople": 2,
        "order": 1,
        "holidayBoost": false
    },
    {
        "id": "a2",
        "name": "2樓_女廁",
        "floor": 2,
        "priority": "daily",
        "genderRestriction": "female",
        "minPeople": 1,
        "maxPeople": 2,
        "order": 2,
        "holidayBoost": false
    },
    {
        "id": "a3",
        "name": "2樓_男廁",
        "floor": 2,
        "priority": "daily",
        "genderRestriction": "malePreferred",
        "minPeople": 1,
        "maxPeople": 2,
        "order": 3,
        "holidayBoost": false
    },
    {
        "id": "a4",
        "name": "2樓_陽台",
        "floor": 2,
        "priority": "daily",
        "genderRestriction": "malePreferred",
        "minPeople": 1,
        "maxPeople": 4,
        "order": 4,
        "holidayBoost": true
    },
    {
        "id": "a5",
        "name": "1樓_食堂",
        "floor": 1,
        "priority": "daily",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 5,
        "holidayBoost": false
    },
    {
        "id": "a6",
        "name": "1樓_男廁",
        "floor": 1,
        "priority": "daily",
        "genderRestriction": "malePreferred",
        "minPeople": 1,
        "maxPeople": 2,
        "order": 6,
        "holidayBoost": false
    },
    {
        "id": "a7",
        "name": "1樓_女廁",
        "floor": 1,
        "priority": "daily",
        "genderRestriction": "female",
        "minPeople": 1,
        "maxPeople": 2,
        "order": 7,
        "holidayBoost": false
    },
    {
        "id": "a8",
        "name": "2樓_走廊、玄關、應接室",
        "floor": 2,
        "priority": "flexible",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 8,
        "holidayBoost": false
    },
    {
        "id": "a9",
        "name": "2樓_事務所全區",
        "floor": 2,
        "priority": "flexible",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 6,
        "order": 9,
        "holidayBoost": false
    },
    {
        "id": "a10",
        "name": "2樓_多目的室",
        "floor": 2,
        "priority": "optional",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 10,
        "holidayBoost": false
    },
    {
        "id": "a11",
        "name": "1樓_陽台",
        "floor": 1,
        "priority": "flexible",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 11,
        "holidayBoost": false
    },
    {
        "id": "a12",
        "name": "1樓_會議室1",
        "floor": 1,
        "priority": "optional",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 12,
        "holidayBoost": false
    },
    {
        "id": "a13",
        "name": "1樓_走廊",
        "floor": 1,
        "priority": "flexible",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 13,
        "holidayBoost": false
    },
    {
        "id": "a14",
        "name": "1~2樓_樓梯",
        "floor": 0,
        "priority": "flexible",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 14,
        "holidayBoost": false
    },
    {
        "id": "a15",
        "name": "1樓_無塵室更衣室",
        "floor": 1,
        "priority": "flexible",
        "genderRestriction": "none",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 15,
        "holidayBoost": false
    },
    {
        "id": "a16",
        "name": "1樓_女子更衣室",
        "floor": 1,
        "priority": "flexible",
        "genderRestriction": "female",
        "minPeople": 1,
        "maxPeople": 1,
        "order": 16,
        "holidayBoost": false
    }
    ],
    "plannerRotation": {
    "planners": [
        "s11",
        "s07",
        "s08",
        "s14",
        "s18",
        "s22",
        "s10",
        "s13",
        "s19",
        "s21",
        "s23",
        "s27",
        "s28",
        "s06",
        "s05",
        "s02",
        "s04",
        "s12",
        "s15",
        "s16",
        "s17",
        "s20",
        "s24",
        "s25",
        "s26"
    ],
    "currentIndex": 0
    }
};
function initializeInlineData() {
    // 修正：已改由 initializeDefaultData 強制讀取 data/data.json，此處僅保留空函數以維持相容性。
    console.log('跳過內嵌資料初始化，改用強制外部資料同步。');
}