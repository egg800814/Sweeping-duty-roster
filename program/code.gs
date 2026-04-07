/**
 * 【code.gs】 — Google Apps Script 雲端 API
 * 版本： V14.1
 *
 * 變更履歷：
 *   V14.1  2026-04-07
 *          - 修正 saveRotation 分支：強制鎖定 "Schedule" 工作表來更新 I1，
 *            避免將名字寫入錯誤頁籤的問題
 *          - saveRotation 回傳值新增 planner 欄位以利除錯
 *   V14.0  2026-03-26
 *          - 新增 doGet  `?type=rotation`：讀取 [PlannerRotation] 輪值設定
 *          - 新增 doPost `type=saveRotation`：寫入 [PlannerRotation] 輪值順序
 *          - 新增 doPost `type=updateI1`：更新 [Schedule].I1 今日責任者
 *
 * 本腳本為「打掃區域分配系統」的雲端後端，負責與 Google Sheets 試算表雙向同步資料。
 *
 * 依賴工作表：
 * 1. [Schedule]: 存放每日排班結果 (A-H 欄) 與今日負責人 (I1 儲存格)。
 * 2. [StaffData]: 存放目前最新的出勤人員名冊 (姓名、性別)，供確認系統查詢性別用。
 * 3. [PlannerRotation]: (V14.0 新增) 存放輪值設定（順序、基準日等），實現跨裝置同步。
 * 4. [Logs]: (選用) 紀錄系統同步紀錄。
 *
 * 核心進入點：
 * - doGet(e): 讀取排班資料。支援 ?type=admin / ?type=rotation。
 * - doPost(e): 寫入資料。新增 type=saveRotation / type=updateI1 分支。
 * - doOptions(e): 處理預檢請求 (CORS PREFLIGHT)。
 */

function doGet(e) {
  // --- 1. 基本連結與參數初始化 ---
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Schedule") || ss.getSheets()[0];
  var timezone = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");

  var reqType = e && e.parameter && e.parameter.type ? e.parameter.type : "";
  var isAdmin = reqType === "admin";

  // =========================================================================
  // [V14.0 新增] type=rotation：讀取 [PlannerRotation] 工作表
  // =========================================================================
  if (reqType === "rotation") {
    try {
      var rotSheet = ss.getSheetByName("PlannerRotation");
      if (!rotSheet || rotSheet.getLastRow() < 2) {
        return ContentService.createTextOutput(
          JSON.stringify({ error: "no_rotation_data" }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var rotData = rotSheet.getDataRange().getValues();
      var planners = [];
      var staffNames = {};
      var baseDate = "";
      var baseIndex = 0;
      for (var r = 1; r < rotData.length; r++) {
        var staffId = String(rotData[r][1] || "").trim();
        var staffName = String(rotData[r][2] || "").trim();
        var isRotate = rotData[r][3];
        if (
          staffId &&
          (isRotate === true || String(isRotate).toUpperCase() === "TRUE")
        ) {
          planners.push(staffId);
          if (staffName) staffNames[staffId] = staffName;
        }
        if (r === 1) {
          baseDate = String(rotData[r][4] || "").trim();
          baseIndex = parseInt(rotData[r][5] || "0", 10) || 0;
        }
      }
      var currentI1 = String(sheet.getRange("I1").getValue() || "").trim();
      return ContentService.createTextOutput(
        JSON.stringify({
          planners: planners,
          staffNames: staffNames,
          baseDate: baseDate,
          baseIndex: baseIndex,
          currentI1: currentI1,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: err.message }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  var data = sheet.getDataRange().getValues();

  // 1. 讀取 StaffData (人員名冊)
  var staffGenderMap = {};
  var staffMeta = [];
  try {
    var staffSheet = ss.getSheetByName("StaffData");
    if (staffSheet) {
      var staffData = staffSheet.getDataRange().getValues();
      for (var s = 1; s < staffData.length; s++) {
        var sName = String(staffData[s][0] || "").trim();
        var sGender = String(staffData[s][1] || "").trim();
        if (sName) {
          staffGenderMap[sName] = sGender;
          staffMeta.push({ name: sName, gender: sGender || "male" });
        }
      }
    }
  } catch (err) {
    // 若無此工作表則略過，不報錯
  }

  // --- 3. 讀取 Schedule (過濾出今日的排班區域與狀態) ---
  var assignments = [];
  var plannerName = String(sheet.getRange("I1").getValue() || "").trim(); // 從 I1 讀取今日負責人姓名

  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][0];
    var formattedRowDate = "";
    if (rowDate instanceof Date) {
      formattedRowDate = Utilities.formatDate(rowDate, timezone, "yyyy-MM-dd");
    } else {
      formattedRowDate = String(rowDate).trim().replace(/\//g, "-");
    }

    if (formattedRowDate === today) {
      var persons = String(data[i][3] || "");
      var names = persons
        .split(/[,、，]/)
        .map(function (n) {
          return n.trim();
        })
        .filter(Boolean);

      var areaItem = {
        areaCode: String(data[i][1] || ""),
        areaName: String(data[i][2] || ""),
        persons: persons,
        staffNames: persons, // 兼容新版
        status1: String(data[i][4] || ""),
        status2: String(data[i][5] || ""),
        status3: String(data[i][6] || ""),
        status4: String(data[i][7] || ""),
      };

      // 兼容舊版 gender1 ~ gender4
      for (var k = 0; k < 4; k++) {
        var g = "";
        if (k < names.length) {
          g = staffGenderMap[names[k]] || "";
        }
        areaItem["gender" + (k + 1)] = g;
      }

      // 兼容新版 genders 陣列
      areaItem.genders = names.map(function (n) {
        return staffGenderMap[n] || "";
      });

      assignments.push(areaItem);
    }
  }

  // 3. 回傳格式判定 (admin vs 一般確認頁)
  if (isAdmin) {
    var adminResult = {
      date: today,
      todayPlanner: plannerName,
      staffMeta: staffMeta,
      assignments: assignments,
    };
    return ContentService.createTextOutput(
      JSON.stringify(adminResult),
    ).setMimeType(ContentService.MimeType.JSON);
  } else {
    // 預設舊版相容：回傳陣列 (不包裝在 assignments 屬性內)
    return ContentService.createTextOutput(
      JSON.stringify(assignments),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Schedule") || ss.getSheets()[0];
  var logSheet = ss.getSheetByName("Logs");

  try {
    var params = JSON.parse(e.postData.contents);

    // =========================================================================
    // [V14.0 新增] type=saveRotation：寫入輪值設定至 [PlannerRotation] 工作表
    // =========================================================================
    if (params.type === "saveRotation") {
      var rotSheet = ss.getSheetByName("PlannerRotation");
      if (!rotSheet) {
        rotSheet = ss.insertSheet("PlannerRotation");
        rotSheet
          .getRange(1, 1, 1, 6)
          .setValues([
            [
              "seq",
              "staffId",
              "staffName",
              "isRotate",
              "baseDate",
              "baseIndex",
            ],
          ]);
      }
      // 清空舊資料
      if (rotSheet.getLastRow() > 1) {
        rotSheet.getRange(2, 1, rotSheet.getLastRow() - 1, 6).clearContent();
      }
      // 寫入新資料
      var planners = params.planners || [];
      var staffNames = params.staffNames || {};
      var rotRows = planners.map(function (id, idx) {
        return [
          idx + 1,
          id,
          staffNames[id] || "",
          true,
          idx === 0 ? params.baseDate || "" : "",
          idx === 0
            ? params.baseIndex !== undefined
              ? params.baseIndex
              : 0
            : "",
        ];
      });
      if (rotRows.length > 0) {
        rotSheet.getRange(2, 1, rotRows.length, 6).setValues(rotRows);
      }
      
      // [V14.0] 強制鎖定名為 "Schedule" 的工作表更新 I1，避免寫錯地方
      var targetScheduleSheet = ss.getSheetByName("Schedule");
      var todayPlannerName = String(params.todayPlannerName || "").trim();
      
      if (targetScheduleSheet && todayPlannerName) {
        targetScheduleSheet.getRange("I1").setValue(todayPlannerName);
      } else if (todayPlannerName) {
        // 備案：如果找不到 Schedule，寫入 doPost 開頭定義的預設 sheet
        sheet.getRange("I1").setValue(todayPlannerName);
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "輪值設定已更新", 
        i1Updated: !!todayPlannerName,
        planner: todayPlannerName 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // [V14.0 新增] type=updateI1：更新今日值班者至 [Schedule].I1（比對後選擇性寫入）
    // =========================================================================
    if (params.type === "updateI1") {
      var newName = String(params.plannerName || "").trim();
      if (newName) {
        sheet.getRange("I1").setValue(newName);
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // 模式 A：由管理頁面傳來的「大規模全量同步」 (由 setup.html 觸發)
    // 支援：1. 寫入全新排班、2. 更新人員名冊、3. 紀錄今日負責人
    // =========================================================================
    if (
      params.assignments ||
      params.staffMeta ||
      params.plannerName !== undefined
    ) {
      // 只有在明確傳入 assignments 時，才去動 A2:H 欄位 (排班區域)
      if (params.assignments) {
        // 1. 先備份現有的確認狀態 (比對：區域代碼_負責人名字)
        var existingData = sheet.getRange("A2:H").getValues();
        var statusBackup = {};
        for (var k = 0; k < existingData.length; k++) {
          var area = String(existingData[k][1]);
          if (!area) continue;
          var names = String(existingData[k][3])
            .split(/[,、]/)
            .map(function (n) {
              return n.trim();
            });
          for (var n = 0; n < names.length; n++) {
            if (names[n] && existingData[k][4 + n]) {
              statusBackup[area + "_" + names[n]] = existingData[k][4 + n];
            }
          }
        }

        // 2. 清空舊資料
        sheet.getRange("A2:Z").clearContent();

        var dateStr =
          params.date ||
          Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          );
        var assignments = params.assignments || [];
        var rowsToInsert = [];
        var maxCols = 8;

        // 3. 準備寫入的新資料
        for (var i = 0; i < assignments.length; i++) {
          var a = assignments[i];
          var currentNamesStr = a.staffNames || "";
          var currentNames = currentNamesStr.split(/[,、]/).map(function (n) {
            return n.trim();
          });
          var row = [
            dateStr,
            a.areaId || "",
            a.areaName || "",
            currentNamesStr,
          ];
          for (var n = 0; n < currentNames.length; n++) {
            var savedStatus =
              statusBackup[(a.areaId || "") + "_" + currentNames[n]] || "";
            row.push(savedStatus);
          }
          if (row.length > maxCols) maxCols = row.length;
          rowsToInsert.push(row);
        }

        for (var i = 0; i < rowsToInsert.length; i++) {
          while (rowsToInsert[i].length < maxCols) rowsToInsert[i].push("");
        }

        // 5. 寫入資料
        if (rowsToInsert.length > 0) {
          sheet
            .getRange(2, 1, rowsToInsert.length, maxCols)
            .setValues(rowsToInsert);
        }
      }

      // 以下邏輯不論是否有 assignments 都會執行 (單獨同步時也會更新)

      // 6. 更新 StaffData 工作表 (今日出勤名冊)
      if (params.staffMeta && Array.isArray(params.staffMeta)) {
        var staffSheet = ss.getSheetByName("StaffData");
        if (!staffSheet) {
          staffSheet = ss.insertSheet("StaffData");
          staffSheet.getRange(1, 1, 1, 2).setValues([["姓名", "性別"]]);
          // staffSheet.hideSheet(); // 測試期間建議先不要隱藏，方便您檢查
        }

        // 清空 A2 以下的所有舊內容
        if (staffSheet.getLastRow() > 1) {
          staffSheet
            .getRange(2, 1, staffSheet.getLastRow() - 1, 2)
            .clearContent();
        }

        var staffRows = params.staffMeta.map(function (s) {
          return [s.name || "", s.gender || ""];
        });
        if (staffRows.length > 0) {
          staffSheet.getRange(2, 1, staffRows.length, 2).setValues(staffRows);
        }
      }

      // 7. 更新今日責任者至 I1 欄
      if (params.plannerName !== undefined) {
        sheet.getRange("I1").setValue(params.plannerName);
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: params.assignments
            ? "排班資料與名冊已更新"
            : "出勤名冊與負責人已更新",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // 模式 B：由單一操作觸發的「局部狀態更新」 (由 viewer.html 或手動調整觸發)
    // 支援：confirm (回報完成)、delete (移除人員)、move (移動人員)
    // =========================================================================
    if (params.areaCode) {
      var data = sheet.getDataRange().getValues();
      var today = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      );
      var action = params.action || "confirm";

      for (var j = 1; j < data.length; j++) {
        var rowDate = data[j][0];
        var formattedRowDate =
          rowDate instanceof Date
            ? Utilities.formatDate(
                rowDate,
                Session.getScriptTimeZone(),
                "yyyy-MM-dd",
              )
            : String(rowDate).trim();

        if (
          formattedRowDate === today &&
          String(data[j][1]) === String(params.areaCode)
        ) {
          var rowNum = j + 1; // 1-based row number

          // ── confirm：寫入 E-H 欄「已確認」 ──
          if (action === "confirm") {
            var personIndex = parseInt(params.personIndex, 10);
            var targetColumn = 5 + personIndex; // E=5, F=6, G=7, H=8
            sheet.getRange(rowNum, targetColumn).setValue("已確認");
            return ContentService.createTextOutput(
              JSON.stringify({ success: true }),
            ).setMimeType(ContentService.MimeType.JSON);
          }

          // ── delete：從 D 欄移除指定人員，並清空其確認欄位 ──
          if (action === "delete") {
            var names = String(data[j][3])
              .split(/[,、，]/)
              .map(function (n) {
                return n.trim();
              })
              .filter(Boolean);
            var delIdx = parseInt(params.personIndex, 10);
            if (delIdx < 0 || delIdx >= names.length) {
              return ContentService.createTextOutput(
                JSON.stringify({ success: false, message: "人員索引超出範圍" }),
              ).setMimeType(ContentService.MimeType.JSON);
            }
            names.splice(delIdx, 1);
            sheet.getRange(rowNum, 4).setValue(names.join(", ")); // D 欄
            // 清空並重整確認欄 E-H（依刪除後的新順序）
            sheet.getRange(rowNum, 5, 1, 4).clearContent();
            return ContentService.createTextOutput(
              JSON.stringify({ success: true }),
            ).setMimeType(ContentService.MimeType.JSON);
          }

          // ── move：將人員從本區域移到另一區域 ──
          if (action === "move") {
            var targetAreaCode = String(params.targetAreaCode || "");
            var moveIdx = parseInt(params.personIndex, 10);
            var srcNames = String(data[j][3])
              .split(/[,、，]/)
              .map(function (n) {
                return n.trim();
              })
              .filter(Boolean);
            if (moveIdx < 0 || moveIdx >= srcNames.length) {
              return ContentService.createTextOutput(
                JSON.stringify({ success: false, message: "人員索引超出範圍" }),
              ).setMimeType(ContentService.MimeType.JSON);
            }
            var movedName = srcNames.splice(moveIdx, 1)[0];
            sheet.getRange(rowNum, 4).setValue(srcNames.join(", "));
            sheet.getRange(rowNum, 5, 1, 4).clearContent();

            // 寫入目標行
            for (var k = 1; k < data.length; k++) {
              var kDate = data[k][0];
              var kDateStr =
                kDate instanceof Date
                  ? Utilities.formatDate(
                      kDate,
                      Session.getScriptTimeZone(),
                      "yyyy-MM-dd",
                    )
                  : String(kDate).trim();
              if (kDateStr === today && String(data[k][1]) === targetAreaCode) {
                var dstNames = String(data[k][3])
                  .split(/[,、，]/)
                  .map(function (n) {
                    return n.trim();
                  })
                  .filter(Boolean);
                dstNames.push(movedName);
                sheet.getRange(k + 1, 4).setValue(dstNames.join(", "));
                // 目標確認欄不動（新加入的人算未確認，保留舊人確認狀態）
                break;
              }
            }
            return ContentService.createTextOutput(
              JSON.stringify({ success: true, movedName: movedName }),
            ).setMimeType(ContentService.MimeType.JSON);
          }

          return ContentService.createTextOutput(
            JSON.stringify({
              success: false,
              message: "未知的 action: " + action,
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, message: "找不到今日符合的區域代號" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(
    ContentService.MimeType.JSON,
  );
}
