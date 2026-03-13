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
  var today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd",
  );
  var result = [];

  // 讀取 StaffData 工作表（人員名冊，含性別）
  var staffGenderMap = {};
  var staffSheet = ss.getSheetByName("StaffData");
  if (staffSheet) {
    var staffData = staffSheet.getDataRange().getValues();
    for (var s = 1; s < staffData.length; s++) {
      var sName = String(staffData[s][0] || "").trim();
      var sGender = String(staffData[s][1] || "").trim();
      if (sName) staffGenderMap[sName] = sGender;
    }
  }

  // 讀取今日責任者 (I1 欄)
  var todayPlanner = String(sheet.getRange("I1").getValue() || "").trim();

  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][0];
    var formattedRowDate = "";
    if (rowDate instanceof Date) {
      formattedRowDate = Utilities.formatDate(
        rowDate,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      );
    } else {
      formattedRowDate = String(rowDate).trim().replace(/\//g, "-");
    }

    if (formattedRowDate === today) {
      var persons = String(data[i][3] || "");
      var names = persons.split(/[,、，]/).map(function(n){ return n.trim(); }).filter(Boolean);

      result.push({
        areaCode: String(data[i][1] || ""),   // B 欄
        areaName: String(data[i][2] || ""),   // C 欄
        persons: persons,                      // D 欄（原始）
        status1: String(data[i][4] || ""),    // E 欄
        status2: String(data[i][5] || ""),    // F 欄
        status3: String(data[i][6] || ""),    // G 欄
        status4: String(data[i][7] || ""),    // H 欄
        gender1: staffGenderMap[names[0]] || "",
        gender2: staffGenderMap[names[1]] || "",
        gender3: staffGenderMap[names[2]] || "",
        gender4: staffGenderMap[names[3]] || "",
        todayPlanner: todayPlanner,
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Schedule") || ss.getSheets()[0];
  var logSheet = ss.getSheetByName("Logs");

  try {
    var params = JSON.parse(e.postData.contents);

    // --- 模式 A：由管理頁面傳來的「大量排班更新」(原 old.gs 邏輯) ---
    if (params.assignments) {
      // 1. 【新增】先備份現有的確認狀態 (比對：區域代碼_負責人名字)
      var existingData = sheet.getRange("A2:H").getValues();
      var statusBackup = {};
      for (var k = 0; k < existingData.length; k++) {
        var area = String(existingData[k][1]);
        if (!area) continue;

        // 將負責人名字用逗號或頓號拆分
        var names = String(existingData[k][3])
          .split(/[,、]/)
          .map(function (n) {
            return n.trim();
          });
        for (var n = 0; n < names.length; n++) {
          if (names[n] && existingData[k][4 + n]) {
            // 如果名字存在且該欄位有狀態
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
      var maxCols = 8; // 預設寫入範圍至少到 H 欄 (8欄)

      // 3. 準備寫入的新資料，並把剛剛備份的確認狀態補回去
      for (var i = 0; i < assignments.length; i++) {
        var a = assignments[i];
        var currentNamesStr = a.staffNames || "";
        var currentNames = currentNamesStr.split(/[,、]/).map(function (n) {
          return n.trim();
        });

        var row = [dateStr, a.areaId || "", a.areaName || "", currentNamesStr];

        // 依序檢查這個區域的這個人，剛才有沒有按過確認
        for (var n = 0; n < currentNames.length; n++) {
          var savedStatus =
            statusBackup[(a.areaId || "") + "_" + currentNames[n]] || "";
          row.push(savedStatus);
        }

        // 記錄最長的那一列有多少欄位
        if (row.length > maxCols) {
          maxCols = row.length;
        }

        rowsToInsert.push(row);
      }

      // 4. 【新增】將每一列長度補齊 (Google 試算表規定 setValues 每一列長度必須相同)
      for (var i = 0; i < rowsToInsert.length; i++) {
        while (rowsToInsert[i].length < maxCols) {
          rowsToInsert[i].push("");
        }
      }

      // 5. 寫入資料
      if (rowsToInsert.length > 0) {
        sheet
          .getRange(2, 1, rowsToInsert.length, maxCols)
          .setValues(rowsToInsert);
      }

      // 6. 更新 StaffData 工作表（人員名冊含性別）
      if (params.staffMeta && Array.isArray(params.staffMeta)) {
        var staffSheet = ss.getSheetByName("StaffData");
        if (!staffSheet) {
          staffSheet = ss.insertSheet("StaffData");
          staffSheet.hideSheet();
          staffSheet.getRange(1, 1, 1, 2).setValues([["姓名", "性別"]]);
        }
        staffSheet.getRange("A2:B").clearContent();
        var staffRows = params.staffMeta.map(function(s) { return [s.name || "", s.gender || ""]; });
        if (staffRows.length > 0) {
          staffSheet.getRange(2, 1, staffRows.length, 2).setValues(staffRows);
        }
      }

      // 7. 寫入今日責任者至 I1 欄
      if (params.plannerName !== undefined) {
        sheet.getRange("I1").setValue(params.plannerName);
      }

      if (logSheet) {
        logSheet.appendRow([
          new Date(),
          "排班表更新",
          "更新了 " + rowsToInsert.length + " 筆資料",
        ]);
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "排班資料已成功更新",
          count: rowsToInsert.length,
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
            var names = String(data[j][3]).split(/[,、，]/).map(function(n){ return n.trim(); }).filter(Boolean);
            var delIdx = parseInt(params.personIndex, 10);
            if (delIdx < 0 || delIdx >= names.length) {
              return ContentService.createTextOutput(JSON.stringify({ success: false, message: "人員索引超出範圍" })).setMimeType(ContentService.MimeType.JSON);
            }
            names.splice(delIdx, 1);
            sheet.getRange(rowNum, 4).setValue(names.join(", ")); // D 欄
            // 清空並重整確認欄 E-H（依刪除後的新順序）
            sheet.getRange(rowNum, 5, 1, 4).clearContent();
            return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
          }

          // ── move：將人員從本區域移到另一區域 ──
          if (action === "move") {
            var targetAreaCode = String(params.targetAreaCode || "");
            var moveIdx = parseInt(params.personIndex, 10);
            var srcNames = String(data[j][3]).split(/[,、，]/).map(function(n){ return n.trim(); }).filter(Boolean);
            if (moveIdx < 0 || moveIdx >= srcNames.length) {
              return ContentService.createTextOutput(JSON.stringify({ success: false, message: "人員索引超出範圍" })).setMimeType(ContentService.MimeType.JSON);
            }
            var movedName = srcNames.splice(moveIdx, 1)[0];
            sheet.getRange(rowNum, 4).setValue(srcNames.join(", "));
            sheet.getRange(rowNum, 5, 1, 4).clearContent();

            // 寫入目標行
            for (var k = 1; k < data.length; k++) {
              var kDate = data[k][0];
              var kDateStr = kDate instanceof Date ? Utilities.formatDate(kDate, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(kDate).trim();
              if (kDateStr === today && String(data[k][1]) === targetAreaCode) {
                var dstNames = String(data[k][3]).split(/[,、，]/).map(function(n){ return n.trim(); }).filter(Boolean);
                dstNames.push(movedName);
                sheet.getRange(k + 1, 4).setValue(dstNames.join(", "));
                // 目標確認欄不動（新加入的人算未確認，保留舊人確認狀態）
                break;
              }
            }
            return ContentService.createTextOutput(JSON.stringify({ success: true, movedName: movedName })).setMimeType(ContentService.MimeType.JSON);
          }

          return ContentService.createTextOutput(
            JSON.stringify({ success: false, message: "未知的 action: " + action }),
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
