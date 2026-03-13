/**
 * 整合版 Google Apps Script
 * 支援功能：
 * 1. doGet: 讀取今日排班資料 (前端確認系統使用)
 * 2. doPost:
 *    - 模式 A (assignments): 接收排班管理網頁傳入的新排班資料 (由 old.gs 整合而來)
 *    - 模式 B (areaCode): 接收個別人員的「已確認」狀態更新
 * 3. doOptions: 處理 CORS
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Schedule") || ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var timezone = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");

  var isAdmin = e && e.parameter && e.parameter.type === "admin";

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

  // 2. 讀取 Schedule (今日排班區域)
  var assignments = [];
  var plannerName = String(sheet.getRange("I1").getValue() || "").trim();

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
      areaItem.genders = names.map(function(n) { return staffGenderMap[n] || ""; });

      assignments.push(areaItem);
    }
  }

  // 3. 回傳格式判定 (admin vs 一般確認頁)
  if (isAdmin) {
    var adminResult = {
      date: today,
      todayPlanner: plannerName,
      staffMeta: staffMeta,
      assignments: assignments
    };
    return ContentService.createTextOutput(JSON.stringify(adminResult)).setMimeType(ContentService.MimeType.JSON);
  } else {
    // 預設舊版相容：回傳陣列 (不包裝在 assignments 屬性內)
    return ContentService.createTextOutput(JSON.stringify(assignments)).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Schedule") || ss.getSheets()[0];
  var logSheet = ss.getSheetByName("Logs");

  try {
    var params = JSON.parse(e.postData.contents);

    // --- 模式 A：由管理頁面傳來的更新 (支援「全量更新」或「僅更新出勤名單」) ---
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

    // --- 模式 B：由確認/移動/刪除 觸發的「單一區域操作」 ---
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
