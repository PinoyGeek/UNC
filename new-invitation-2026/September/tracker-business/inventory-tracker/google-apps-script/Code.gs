/**
 * One workbook for every tracker tab.
 *
 * Paste this whole file into the spreadsheet:
 *   Extensions → Apps Script → replace Code.gs → Save.
 * Run setupWorkbook once (select it, press Run, then Allow).
 * That creates these tabs if they are missing:
 *   Dashboard, Items inventory, Rental Bookings, Booking Calendar,
 *   Booking Timeline, Returns, Payments, Setup
 *
 * Deploy → Manage deployments → edit the web app → New version.
 *   Execute as: Me
 *   Who has access: Anyone
 * Keep the same /exec URL that is saved in lib/site.ts.
 * If you create a brand-new deployment, copy the new /exec URL into lib/site.ts.
 *
 * Source tabs (the website reads these back):
 *   Items inventory, Rental Bookings, Payments, Setup
 * The other four tabs are rebuilt from those whenever the website saves,
 * and again when you edit a source tab in this spreadsheet.
 * Do not type over Dashboard, Booking Calendar, Booking Timeline, or Returns.
 * The next save replaces them.
 *
 * Logos and item photos upload to Google Drive on save. The sheet stores the
 * public view link in Setup (logoUrl) and Items inventory (Photo).
 * Run setupWorkbook once and approve Drive access when prompted.
 */

var SHEET_SPECS = [
  { name: "Dashboard", headers: ["Metric", "Value"] },
  { name: "Items inventory", headers: ["ID", "Code", "Name", "Category", "Variant", "Daily rate", "Deposit", "Quantity", "Condition", "Status override", "Notes", "Photo name", "Photo"] },
  { name: "Rental Bookings", headers: ["ID", "Code", "Invoice", "Customer", "Phone", "Start", "End", "Status", "Follow-up", "Discount", "Deposit", "Grand total", "Paid", "Balance", "Payment", "Notes", "Items", "Lines", "Refund date", "Refund amount", "Refund method", "Refund notes"] },
  { name: "Booking Calendar", headers: ["Date", "Code", "Customer", "Item", "Status", "Payment"] },
  { name: "Booking Timeline", headers: ["Start", "End", "Code", "Customer", "Item", "Status", "Payment"] },
  { name: "Returns", headers: ["Code", "Customer", "Phone", "Item", "Due", "Status", "Deposit", "Kind"] },
  { name: "Payments", headers: ["ID", "Booking ID", "Code", "Invoice", "Customer", "Amount", "Method", "Date", "Note", "Type"] },
  { name: "Setup", headers: ["Key", "Value"] },
];

var SOURCE_TABS = ["Items inventory", "Rental Bookings", "Payments", "Setup"];

function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEET_SPECS.forEach(function (spec) {
    var sheet = ss.getSheetByName(spec.name);
    if (!sheet || sheet.getLastRow() < 1 || String(sheet.getRange(1, 1).getValue() || "") === "") {
      writeTable_(ss, spec.name, [spec.headers]);
    }
  });
  placeSheets_();
  hideStarterSheet_();
  ss.toast("8 tabs are ready. Deploy the web app, then save from the website. Every save updates all of them.", "Rental tracker", 8);
}

function doGet(e) {
  return respond_(handle_(e && e.parameter ? e.parameter : {}, null));
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return respond_({ ok: false, error: "The tracker sent data this script could not read." });
  }
  return respond_(handle_(e && e.parameter ? e.parameter : {}, body));
}

function onEdit(e) {
  if (!e || !e.range || isSyncing_()) return;
  var name = e.range.getSheet().getName();
  if (SOURCE_TABS.indexOf(name) < 0) return;
  rebuildDerived_();
}

function respond_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(params, body) {
  var action = (body && body.action) || params.action || "ping";
  if (action === "ping" || action === "setup") return ping_();
  var auth = authorize_((body && body.key) || params.key, action === "save");
  if (!auth.ok) return auth;
  if (action === "save") return saveWorkbook_(body && body.state);
  if (action === "load") return loadWorkbook_();
  return { ok: false, error: "Unknown action." };
}

function authorize_(key, allowStore) {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty("TRACKER_KEY") || "";
  var given = key ? String(key) : "";
  if (!stored) {
    if (allowStore && given) props.setProperty("TRACKER_KEY", given);
    return { ok: true };
  }
  if (given !== stored) return { ok: false, error: "Access key does not match this spreadsheet." };
  return { ok: true };
}

function ping_() {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    title: ss.getName(),
    sheetUrl: ss.getUrl(),
    blank: workbookIsBlank_(),
    tabs: sheetNames_(),
  };
}

function saveWorkbook_(state) {
  if (!state || !state.settings) return { ok: false, error: "Missing tracker state." };
  setSyncing_(true);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var items = state.items || [];
    var bookings = state.bookings || [];
    var payments = state.payments || [];
    var settings = state.settings || {};
    var prepared = prepareAssets_(settings, items);
    writeAll_(ss, prepared.settings, prepared.items, bookings, payments);
    return {
      ok: true,
      sheetUrl: ss.getUrl(),
      blank: items.length + bookings.length + payments.length === 0,
      savedAt: new Date().toISOString(),
      tabs: sheetNames_(),
      counts: { items: items.length, bookings: bookings.length, payments: payments.length },
      assets: {
        logoUrl: prepared.settings.logoUrl || "",
        items: prepared.items.map(function (item) {
          return { id: item.id || "", photoDataUrl: item.photoDataUrl || "" };
        }),
      },
    };
  } finally {
    setSyncing_(false);
  }
}

function loadWorkbook_() {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var blank = workbookIsBlank_();
  return {
    ok: true,
    blank: blank,
    sheetUrl: ss.getUrl(),
    tabs: sheetNames_(),
    state: {
      settings: blank ? {} : readSetup_(),
      items: blank ? [] : readItems_(),
      bookings: blank ? [] : readBookings_(),
      payments: blank ? [] : readPayments_(),
    },
  };
}

function rebuildDerived_() {
  if (isSyncing_()) return;
  setSyncing_(true);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var items = readItems_();
    var bookings = readBookings_();
    var payments = readPayments_();
    var settings = readSetup_();
    var names = itemNames_(items);
    writeTable_(ss, "Dashboard", dashboardRows_(settings, items, bookings, payments));
    writeTable_(ss, "Booking Calendar", calendarRows_(bookings, payments, names));
    writeTable_(ss, "Booking Timeline", timelineRows_(bookings, payments, names));
    writeTable_(ss, "Returns", returnRows_(bookings, payments, names));
  } finally {
    setSyncing_(false);
  }
}

function writeAll_(ss, settings, items, bookings, payments) {
  var names = itemNames_(items);
  writeTable_(ss, "Dashboard", dashboardRows_(settings, items, bookings, payments));
  writeTable_(ss, "Items inventory", itemRows_(items));
  writeTable_(ss, "Rental Bookings", bookingRows_(bookings, payments, names));
  writeTable_(ss, "Booking Calendar", calendarRows_(bookings, payments, names));
  writeTable_(ss, "Booking Timeline", timelineRows_(bookings, payments, names));
  writeTable_(ss, "Returns", returnRows_(bookings, payments, names));
  writeTable_(ss, "Payments", paymentRows_(payments, bookings));
  writeTable_(ss, "Setup", setupRows_(settings));
  placeSheets_();
  hideStarterSheet_();
}

function ensureSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEET_SPECS.forEach(function (spec) {
    var sheet = ss.getSheetByName(spec.name);
    if (!sheet || sheet.getLastRow() < 1 || String(sheet.getRange(1, 1).getValue() || "") === "") {
      writeTable_(ss, spec.name, [spec.headers]);
    }
  });
  placeSheets_();
  hideStarterSheet_();
}

function workbookIsBlank_() {
  return dataRows_("Items inventory") + dataRows_("Rental Bookings") + dataRows_("Payments") === 0;
}

function dataRows_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().filter(function (row) {
    return String(row[0] || "").trim();
  }).length;
}

function sheetNames_() {
  return SHEET_SPECS.map(function (spec) { return spec.name; });
}

function itemNames_(items) {
  var names = {};
  items.forEach(function (item) { names[item.id] = item.name || ""; });
  return names;
}

function dashboardRows_(settings, items, bookings, payments) {
  var today = todayIso_();
  var counts = { rented: 0, upcoming: 0, available: 0, maintenance: 0 };
  items.forEach(function (item) {
    var status = inventoryStatus_(item, bookings, today);
    if (!counts.hasOwnProperty(status)) status = "available";
    counts[status] += 1;
  });
  var active = bookings.filter(function (booking) { return String(booking.status || "") !== "cancelled"; });
  var collected = 0;
  payments.forEach(function (payment) { collected += Number(payment.amount) || 0; });
  var outstanding = 0;
  var overdue = 0;
  var upcomingBookings = 0;
  active.forEach(function (booking) {
    var balance = Math.max(0, bookingGrand_(booking) - paidFor_(payments, booking.id));
    outstanding += balance;
    if (balance > 0.5 && dateText_(booking.endDate) && dateText_(booking.endDate) < today) overdue += 1;
    if (String(booking.status || "") === "upcoming" || String(booking.status || "") === "reserved") upcomingBookings += 1;
  });
  return [
    ["Metric", "Value"],
    ["Business", settings.businessName || ""],
    ["Brand", settings.brandName || ""],
    ["Phone", settings.phone || ""],
    ["Email", settings.email || ""],
    ["Address", settings.address || ""],
    ["Currency", settings.currencySymbol || ""],
    ["As of", today],
    ["Total items", items.length],
    ["Rented out", counts.rented],
    ["Upcoming items", counts.upcoming],
    ["Available", counts.available],
    ["Maintenance", counts.maintenance],
    ["Upcoming bookings", upcomingBookings],
    ["Bookings", active.length],
    ["Revenue collected", collected],
    ["Outstanding", outstanding],
    ["Overdue invoices", overdue],
    ["Payments", payments.length],
  ];
}

function itemRows_(items) {
  var rows = [SHEET_SPECS[1].headers];
  items.forEach(function (item) {
    var photo = item.photoDataUrl ? String(item.photoDataUrl) : "";
    rows.push([
      item.id || "",
      item.code || "",
      item.name || "",
      item.category || "",
      item.variant || "",
      item.dailyRate,
      item.deposit || 0,
      item.quantity,
      item.condition || "Excellent",
      item.statusOverride || "none",
      item.notes || "",
      item.photoName || "",
      photo,
    ]);
  });
  return rows;
}

function bookingLines_(booking) {
  var lines = booking.lines;
  if (typeof lines === "string" && lines.charAt(0) === "[") {
    try { lines = JSON.parse(lines); } catch (error) { lines = []; }
  }
  if (lines && typeof lines !== "string" && lines.length) return lines;
  if (booking.itemId) return [{ itemId: booking.itemId, quantity: booking.quantity || 1, rate: booking.dailyRate || 0 }];
  return [];
}

function bookingUsesItem_(booking, itemId) {
  return bookingLines_(booking).some(function (line) { return line && line.itemId === itemId; });
}

function bookingItemsLabel_(booking, names) {
  return bookingLines_(booking).map(function (line) {
    var name = names[line.itemId] || line.itemId || "";
    var qty = Number(line.quantity) || 1;
    return qty > 1 ? name + " x" + qty : name;
  }).filter(Boolean).join(", ");
}

function bookingGrand_(booking) {
  var subtotal = 0;
  bookingLines_(booking).forEach(function (line) {
    subtotal += (Number(line.quantity) || 0) * (Number(line.rate) || 0);
  });
  return Math.max(0, subtotal - (Number(booking.discount) || 0)) + (Number(booking.deposit) || 0);
}

function paidFor_(payments, bookingId) {
  var total = 0;
  payments.forEach(function (payment) {
    if (payment.bookingId === bookingId) total += Number(payment.amount) || 0;
  });
  return total;
}

function standing_(grand, paid) {
  if (paid <= 0) return "Unpaid";
  if (paid + 0.001 < grand) return "Partial";
  return "Paid";
}

function bookingRows_(bookings, payments, names) {
  var rows = [SHEET_SPECS[2].headers];
  bookings.forEach(function (booking) {
    var grand = bookingGrand_(booking);
    var paid = paidFor_(payments, booking.id);
    rows.push([
      booking.id || "",
      booking.code || "",
      booking.invoiceCode || "",
      booking.customer || "",
      booking.phone || "",
      dateText_(booking.startDate),
      dateText_(booking.endDate),
      booking.status || "",
      booking.followUp === true || booking.followUp === "Yes" || booking.followUp === "true" ? "Yes" : "",
      booking.discount || 0,
      booking.deposit || 0,
      grand,
      paid,
      grand - paid,
      standing_(grand, paid),
      booking.notes || "",
      bookingItemsLabel_(booking, names),
      JSON.stringify(bookingLines_(booking)),
      dateText_(booking.refundDate),
      booking.refundAmount || 0,
      booking.refundMethod || "",
      booking.refundNotes || "",
    ]);
  });
  return rows;
}

function calendarRows_(bookings, payments, names) {
  var rows = [SHEET_SPECS[3].headers];
  bookings.forEach(function (booking) {
    var standing = standing_(bookingGrand_(booking), paidFor_(payments, booking.id));
    listDates_(dateText_(booking.startDate), dateText_(booking.endDate)).forEach(function (date) {
      rows.push([date, booking.code, booking.customer, bookingItemsLabel_(booking, names), booking.status, standing]);
    });
  });
  return rows;
}

function timelineRows_(bookings, payments, names) {
  var rows = [SHEET_SPECS[4].headers];
  bookings.slice().sort(function (a, b) {
    return dateText_(a.startDate).localeCompare(dateText_(b.startDate));
  }).forEach(function (booking) {
    rows.push([
      dateText_(booking.startDate),
      dateText_(booking.endDate),
      booking.code,
      booking.customer,
      bookingItemsLabel_(booking, names),
      booking.status,
      standing_(bookingGrand_(booking), paidFor_(payments, booking.id)),
    ]);
  });
  return rows;
}

function returnRows_(bookings, payments, names) {
  var rows = [SHEET_SPECS[5].headers];
  bookings.forEach(function (booking) {
    var status = String(booking.status || "");
    if (status !== "upcoming" && status !== "reserved" && status !== "confirmed" && status !== "out" && status !== "returned") return;
    var kind = status === "returned" ? "Returned" : "Due";
    rows.push([
      booking.code,
      booking.customer,
      booking.phone,
      bookingItemsLabel_(booking, names),
      dateText_(booking.endDate),
      status,
      booking.deposit || 0,
      kind,
    ]);
  });
  return rows;
}

function paymentRows_(payments, bookings) {
  var info = {};
  bookings.forEach(function (booking) {
    info[booking.id] = { code: booking.code || "", invoice: booking.invoiceCode || "", customer: booking.customer || "" };
  });
  var rows = [SHEET_SPECS[6].headers];
  payments.forEach(function (payment) {
    var match = info[payment.bookingId] || { code: "", invoice: "", customer: "" };
    rows.push([
      payment.id,
      payment.bookingId,
      match.code,
      match.invoice,
      match.customer,
      payment.amount,
      payment.method,
      dateText_(payment.date),
      payment.note,
      payment.type || "",
    ]);
  });
  return rows;
}

function setupRows_(settings) {
  var rows = [SHEET_SPECS[7].headers];
  Object.keys(settings || {}).forEach(function (key) {
    if (key === "logoDataUrl") return;
    rows.push([key, encode_(settings[key])]);
  });
  return rows;
}

function inventoryStatus_(item, bookings, today) {
  var override = String(item.statusOverride || "none");
  if (override && override !== "none") return override;
  var related = bookings.filter(function (booking) {
    var status = String(booking.status || "");
    return bookingUsesItem_(booking, item.id) && status !== "cancelled" && status !== "returned";
  });
  var rented = related.some(function (booking) {
    var status = String(booking.status || "");
    return (status === "confirmed" || status === "out") && dateText_(booking.startDate) <= today && dateText_(booking.endDate) >= today;
  });
  if (rented) return "rented";
  if (related.some(function (booking) { return dateText_(booking.endDate) >= today; })) return "upcoming";
  return "available";
}

function readItems_() {
  return readMapped_("Items inventory", {
    "ID": "id",
    "Code": "code",
    "Name": "name",
    "Category": "category",
    "Variant": "variant",
    "Daily rate": "dailyRate",
    "Deposit": "deposit",
    "Quantity": "quantity",
    "Condition": "condition",
    "Status override": "statusOverride",
    "Notes": "notes",
    "Photo name": "photoName",
    "Photo": "photoDataUrl",
  }, "id");
}

function readBookings_() {
  return readMapped_("Rental Bookings", {
    "ID": "id",
    "Code": "code",
    "Invoice": "invoiceCode",
    "Customer": "customer",
    "Phone": "phone",
    "Item ID": "itemId",
    "Quantity": "quantity",
    "Start": "startDate",
    "End": "endDate",
    "Status": "status",
    "Daily rate": "dailyRate",
    "Follow-up": "followUp",
    "Discount": "discount",
    "Deposit": "deposit",
    "Notes": "notes",
    "Lines": "lines",
    "Refund date": "refundDate",
    "Refund amount": "refundAmount",
    "Refund method": "refundMethod",
    "Refund notes": "refundNotes",
  }, "id");
}

function readPayments_() {
  return readMapped_("Payments", {
    "ID": "id",
    "Booking ID": "bookingId",
    "Code": "bookingCode",
    "Invoice": "invoiceCode",
    "Customer": "customer",
    "Amount": "amount",
    "Method": "method",
    "Date": "date",
    "Note": "note",
    "Type": "type",
  }, "id");
}

function readSetup_() {
  var rows = readRecords_("Setup", ["key", "value"]);
  var settings = {};
  rows.forEach(function (row) {
    var key = String(row.key || "").trim();
    if (!key || key === "logoDataUrl") return;
    settings[key] = decode_(row.value);
  });
  return settings;
}

function readMapped_(name, headerMap, requiredField) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var width = Math.max(sheet.getLastColumn(), 1);
  var values = sheet.getRange(1, 1, sheet.getLastRow(), width).getValues();
  var headers = values[0].map(function (cell) { return String(cell || "").trim(); });
  var indexes = {};
  Object.keys(headerMap).forEach(function (header) {
    var index = headers.indexOf(header);
    if (index >= 0) indexes[headerMap[header]] = index;
  });
  var records = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var row = values[rowIndex];
    var record = {};
    Object.keys(headerMap).forEach(function (header) {
      var field = headerMap[header];
      var index = indexes[field];
      record[field] = index == null ? "" : cellValue_(row[index]);
    });
    if (requiredField && !String(record[requiredField] || "").trim()) continue;
    records.push(record);
  }
  return records;
}

function readRecords_(name, fields) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, fields.length).getValues()
    .filter(function (row) { return String(row[0] || "").trim(); })
    .map(function (row) {
      var record = {};
      fields.forEach(function (field, index) { record[field] = cellValue_(row[index]); });
      return record;
    });
}

function writeTable_(ss, name, rows) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var width = rows[0].length;
  var height = Math.max(rows.length, 1);
  sheet.clear();
  sheet.getRange(1, 1, height, width).setValues(rows);
  sheet.getRange(1, 1, 1, width).setFontWeight("bold").setBackground("#6f967a").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  if (rows.length > 1) sheet.getRange(2, 1, rows.length - 1, width).setNumberFormat("@");
  sheet.autoResizeColumns(1, Math.min(width, 8));
}

function placeSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEET_SPECS.forEach(function (spec, index) {
    var sheet = ss.getSheetByName(spec.name);
    if (!sheet) return;
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(index + 1);
  });
}

function hideStarterSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1");
  if (!sheet || ss.getSheets().length < 2 || sheet.getLastRow() > 1) return;
  sheet.hideSheet();
}

function listDates_(start, end) {
  var dates = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end))) return dates;
  var cursor = String(start);
  var guard = 0;
  while (cursor <= String(end) && guard < 400) {
    dates.push(cursor);
    cursor = addDay_(cursor);
    guard++;
  }
  return dates;
}

function addDay_(iso) {
  var parts = iso.split("-");
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function dateText_(value) {
  if (value == null || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var text = String(value).trim();
  var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function cellValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) return dateText_(value);
  return value == null ? "" : value;
}

function encode_(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function decode_(value) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean" || typeof value === "number") return value;
  var text = String(value);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text.charAt(0) === "[" || text.charAt(0) === "{") {
    try { return JSON.parse(text); } catch (error) { return text; }
  }
  return text;
}

var MEDIA_ROOT_NAME = "Rental Tracker media";

function prepareAssets_(settings, items) {
  var nextSettings = {};
  Object.keys(settings || {}).forEach(function (key) {
    nextSettings[key] = settings[key];
  });
  nextSettings.logoUrl = resolveBrandLogoUrl_(nextSettings);
  delete nextSettings.logoDataUrl;
  var nextItems = (items || []).map(function (item) {
    var copy = {};
    Object.keys(item || {}).forEach(function (key) {
      copy[key] = item[key];
    });
    copy.photoDataUrl = resolveItemPhotoUrl_(copy);
    return copy;
  });
  return { settings: nextSettings, items: nextItems };
}

function getMediaRoot_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("MEDIA_ROOT_ID");
  var folder = null;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (error) {
      folder = null;
    }
  }
  if (!folder) {
    folder = DriveApp.createFolder(MEDIA_ROOT_NAME + " - " + ss.getName());
    props.setProperty("MEDIA_ROOT_ID", folder.getId());
  }
  return folder;
}

function getOrCreateSubFolder_(parent, name) {
  var found = parent.getFoldersByName(name);
  if (found.hasNext()) return found.next();
  return parent.createFolder(name);
}

function parseDataUrl_(dataUrl) {
  var match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  var base64 = String(match[2]).replace(/\s/g, "");
  return { mime: match[1], bytes: Utilities.base64Decode(base64) };
}

function normalizeMime_(mime, fileName) {
  var type = String(mime || "").toLowerCase().split(";")[0].trim();
  if (!type || type === "application/octet-stream") {
    if (/\.png$/i.test(fileName)) return "image/png";
    if (/\.webp$/i.test(fileName)) return "image/webp";
    return "image/jpeg";
  }
  if (type === "image/jpg") return "image/jpeg";
  return type;
}

function driveViewUrl_(fileId) {
  return "https://drive.google.com/file/d/" + fileId + "/view";
}

function safeFileName_(name, fallback) {
  var base = String(name || fallback || "file").replace(/[^\w.-]+/g, "_");
  if (base.length > 80) base = base.slice(0, 80);
  return base;
}

function findFileInFolder_(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) return files.next();
  return null;
}

function uploadDataUrlToFolder_(folder, fileName, dataUrl) {
  var parsed = parseDataUrl_(dataUrl);
  if (!parsed) return "";
  var mime = normalizeMime_(parsed.mime, fileName);
  var blob = Utilities.newBlob(parsed.bytes, mime, fileName);
  var existing = findFileInFolder_(folder, fileName);
  var file;
  if (existing) {
    existing.setBlob(blob);
    file = existing;
  } else {
    file = folder.createFile(blob);
  }
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {}
  return driveViewUrl_(file.getId());
}

function resolveItemPhotoUrl_(item) {
  var value = item.photoDataUrl ? String(item.photoDataUrl).trim() : "";
  if (!value) return "";
  if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) return value;
  if (value.indexOf("data:") !== 0) return "";
  var folder = getOrCreateSubFolder_(getMediaRoot_(), "items");
  var name = safeFileName_(item.photoName, item.code || item.id || "photo");
  if (name.indexOf(".") < 0) {
    var ext = value.indexOf("image/png") >= 0 ? ".png" : value.indexOf("webp") >= 0 ? ".webp" : ".jpg";
    name += ext;
  }
  return uploadDataUrlToFolder_(folder, String(item.id || "item") + "-" + name, value);
}

function resolveBrandLogoUrl_(settings) {
  var value = settings.logoDataUrl ? String(settings.logoDataUrl).trim() : "";
  if (!value) return settings.logoUrl ? String(settings.logoUrl).trim() : "";
  if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) return value;
  if (value.indexOf("data:") !== 0) return settings.logoUrl ? String(settings.logoUrl).trim() : "";
  var folder = getOrCreateSubFolder_(getMediaRoot_(), "brand");
  var name = safeFileName_(settings.logoName, "logo.png");
  if (name.indexOf(".") < 0) name += ".png";
  return uploadDataUrlToFolder_(folder, "business-" + name, value);
}

function isSyncing_() {
  return PropertiesService.getScriptProperties().getProperty("SYNCING") === "1";
}

function setSyncing_(on) {
  var props = PropertiesService.getScriptProperties();
  if (on) props.setProperty("SYNCING", "1");
  else props.deleteProperty("SYNCING");
}
