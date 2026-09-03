// ── Dhara Contact Form → Google Sheets ─────────────────────────────────────
// Setup in 5 steps:
// 1. Create a new Google Sheet
// 2. Extensions → Apps Script → paste this code
// 3. Save → Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the Web App URL
// 5. Add to .env: NEXT_PUBLIC_GOOGLE_SHEET_URL=<your URL>
//
// Column headers it creates:
// Timestamp | Name | Email | Subject | Message | Source

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    // Add headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp","Name","Email","Subject","Message","Source"]);
    }
    const d = e.parameter;
    sheet.appendRow([
      d.timestamp || new Date().toISOString(),
      d.name || "",
      d.email || "",
      d.subject || "",
      d.message || "",
      d.source || "dhara.news",
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("Dhara contact endpoint is active.");
}
