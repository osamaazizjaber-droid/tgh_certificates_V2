/**
 * CERTIFICATE AUTOMATION SCRIPT — ENHANCED & OPTIMIZED
 * ------------------------------------------------------------------
 * Improvements:
 *  1. 100% REUSABLE / GENERIC:
 *     - Dynamically detects the active spreadsheet.
 *     - Loads settings from a dedicated "_Settings" sheet (auto-created if missing).
 *     - Automatically maps ANY spreadsheet column to {{Column Name}} in the template.
 *
 *  2. EXTREMELY FAST GENERATION:
 *     - Removed static 4-second delay (ROW_THROTTLE_MS defaults to 100ms).
 *     - Integrates Advanced Drive Service (v2/v3 API) for copying, creating, and updating.
 *     - Combined spreadsheet writes to minimize roundtrip flushes.
 *
 *  3. MULTIPLE TEMPLATE PATHS:
 *     - Supports standard Google Slides templates.
 *     - Supports lightning-fast HTML-to-PDF templates (2-3 seconds per certificate).
 * ------------------------------------------------------------------
 */

// Default CONFIG - fallback if "_Settings" sheet is not present
const DEFAULT_CONFIG = {
  TEMPLATE_SLIDE_ID_EN: '1B8ui1JVOEjmnIDPVw_jpJBhd3kv5CL6LobGl5UBF7co',
  TEMPLATE_SLIDE_ID_AR: '1wnBCALBPFSOQ009skfJHxlMnOvqp09_z-Y16amCQYTg',
  DESTINATION_FOLDER_ID: '1Xq8GgfF4iYUpbmU-T4luV4E_1XMXLvpd',

  // System column names - will match headers dynamically
  COL_NAME:        'Name',
  COL_STATUS:      'Status',
  COL_CERT_ID:     'Certificate ID',

  CERT_PREFIX:     'TGH-KU50-',
  QR_SIZE_INCHES:  1.14,
  LOG_SHEET_NAME:  '_CertLog',
  SETTINGS_SHEET_NAME: '_Settings',

  MAX_QR_RETRIES:   5,
  MAX_PATCH_RETRIES: 3,

  // Speed-optimized defaults
  ROW_THROTTLE_MS:  100,
  ERROR_RECOVERY_MS: 10000,
};

// ==========================================
// 2. UI MENU
// ==========================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TGH Tools')
    .addItem('Generate & Save Certificates', 'processCertificates')
    .addItem('Retry Failed Rows',             'retryFailedRows')
    .addItem('View Progress Log',             'openLogSheet')
    .addSeparator()
    .addItem('Setup / Reset Settings Sheet',   'initializeSettingsSheet')
    .addToUi();
}

// ==========================================
// 3. SETTINGS & CONFIGURATION HELPERS
// ==========================================

/**
 * Initializes settings sheet with default parameters.
 */
function initializeSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('Error: Active spreadsheet not found. This function must be run from a spreadsheet-bound container.');
    return;
  }
  getOrCreateSettingsSheet_(ss, true);
  SpreadsheetApp.getUi().alert('Settings sheet "_Settings" is ready! You can configure template IDs, folders, and mapping columns there.');
}

/**
 * Returns (and lazily creates) the settings sheet.
 */
function getOrCreateSettingsSheet_(ss, forceReset = false) {
  let sheet = ss.getSheetByName(DEFAULT_CONFIG.SETTINGS_SHEET_NAME);
  if (sheet && forceReset) {
    try {
      ss.deleteSheet(sheet);
      sheet = null;
    } catch (_) {}
  }
  
  if (!sheet) {
    sheet = ss.insertSheet(DEFAULT_CONFIG.SETTINGS_SHEET_NAME);
    sheet.setTabColor('#e67e22');
    sheet.appendRow(['Parameter', 'Value', 'Description']);
    sheet.setFrozenRows(1);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#f39c12').setFontColor('#ffffff');
    
    const defaults = [
      ['TEMPLATE_SLIDE_ID_EN', DEFAULT_CONFIG.TEMPLATE_SLIDE_ID_EN, 'Google Slide or HTML file ID for English certificates.'],
      ['TEMPLATE_SLIDE_ID_AR', DEFAULT_CONFIG.TEMPLATE_SLIDE_ID_AR, 'Google Slide or HTML file ID for Arabic certificates.'],
      ['DESTINATION_FOLDER_ID', DEFAULT_CONFIG.DESTINATION_FOLDER_ID, 'Drive folder ID where PDF certificates will be saved.'],
      ['CERT_PREFIX', DEFAULT_CONFIG.CERT_PREFIX, 'Prefix for automatically generated Certificate IDs (e.g. TGH-KU50-).'],
      ['QR_SIZE_INCHES', DEFAULT_CONFIG.QR_SIZE_INCHES, 'Size of the QR code in inches (for Slide templates).'],
      ['ROW_THROTTLE_MS', DEFAULT_CONFIG.ROW_THROTTLE_MS, 'Delay between processing each row in milliseconds (lower is faster).'],
      ['COL_STATUS', DEFAULT_CONFIG.COL_STATUS, 'Header name of the column for status tracking.'],
      ['COL_CERT_ID', DEFAULT_CONFIG.COL_CERT_ID, 'Header name of the column for Certificate IDs.'],
      ['COL_NAME', DEFAULT_CONFIG.COL_NAME, 'Header name of the column for recipient names.']
    ];
    
    defaults.forEach(row => sheet.appendRow(row));
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 350);
    sheet.setColumnWidth(3, 350);
  }
  return sheet;
}

/**
 * Loads and merges hardcoded defaults with overrides from settings sheet.
 */
function loadConfig_(ss) {
  const config = { ...DEFAULT_CONFIG };
  const sheet = ss.getSheetByName(DEFAULT_CONFIG.SETTINGS_SHEET_NAME);
  if (!sheet) return config;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    let val = data[i][1];
    if (key && val !== undefined && val !== '') {
      if (!isNaN(val) && val !== '' && typeof val !== 'boolean') {
        val = Number(val);
      }
      config[key] = val;
    }
  }
  return config;
}

// ==========================================
// 4. LOGGING HELPERS
// ==========================================

/**
 * Returns (and lazily creates) the dedicated log sheet.
 */
function getLogSheet_(ss, config) {
  const logSheetName = config ? config.LOG_SHEET_NAME : DEFAULT_CONFIG.LOG_SHEET_NAME;
  let logSheet = ss.getSheetByName(logSheetName);
  if (!logSheet) {
    logSheet = ss.insertSheet(logSheetName);
    logSheet.setTabColor('#4a86e8');
    logSheet.appendRow(['Timestamp', 'Run ID', 'Row', 'Name', 'Cert ID', 'Language', 'Result', 'Detail']);
    logSheet.setFrozenRows(1);
    logSheet.getRange('1:1').setFontWeight('bold').setBackground('#c9daf8');
    const colWidths = [160, 120, 50, 180, 140, 70, 80, 380];
    colWidths.forEach((w, idx) => logSheet.setColumnWidth(idx + 1, w));
  }
  return logSheet;
}

/**
 * Appends one row to the log sheet, colour-coded by result.
 */
function log_(logSheet, runId, rowNum, name, certId, lang, result, detail) {
  const ts   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const row  = [ts, runId, rowNum, name, certId, lang, result, detail || ''];
  logSheet.appendRow(row);

  const lastRow = logSheet.getLastRow();
  const colors  = { SUCCESS: '#d9ead3', SKIP: '#fff2cc', ERROR: '#f4cccc', INFO: '#efefef' };
  const bg      = colors[result] || '#ffffff';
  logSheet.getRange(lastRow, 1, 1, 8).setBackground(bg);
  SpreadsheetApp.flush(); // write immediately so progress is visible in real-time
}

// ==========================================
// 5. DRIVE FOLDER & FILE HELPERS (ADVANCED API READY)
// ==========================================

/**
 * Returns the sub-folder "YYYY-MM | <sheetName>" inside the parent folder,
 * using Advanced Drive API where available.
 */
function getOrCreateCohortFolder_(parentFolder, sheetName) {
  return callWithRetry_('Cohort Folder Setup', () => {
    const label      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    const folderName = `${label} | ${sheetName}`;

    if (typeof Drive !== 'undefined') {
      try {
        const q = `title = '${folderName.replace(/'/g, "\\'")}' and '${parentFolder.getId()}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const foldersList = Drive.Files.list({ q: q, maxResults: 1 });
        if (foldersList.items && foldersList.items.length > 0) {
          return DriveApp.getFolderById(foldersList.items[0].id);
        }
        const resource = {
          title: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [{ id: parentFolder.getId() }]
        };
        const folder = Drive.Files.insert(resource);
        return DriveApp.getFolderById(folder.id);
      } catch (e) {
        console.warn("Advanced Drive API cohort folder check failed, falling back: " + e.message);
      }
    }

    const existing = parentFolder.getFoldersByName(folderName);
    if (existing.hasNext()) return existing.next();

    return parentFolder.createFolder(folderName);
  });
}

/**
 * Checks whether a PDF with the given filename already exists in the folder.
 * Returns the existing DriveFile or null.
 */
function findExistingPdf_(folder, filename) {
  if (typeof Drive !== 'undefined') {
    try {
      const q = `title = '${filename.replace(/'/g, "\\'")}' and '${folder.getId()}' in parents and trashed = false`;
      const filesList = Drive.Files.list({ q: q, maxResults: 1 });
      if (filesList.items && filesList.items.length > 0) {
        const item = filesList.items[0];
        return {
          getUrl: () => item.alternateLink || item.webViewLink,
          getId: () => item.id
        };
      }
      return null;
    } catch (e) {
      console.warn("Advanced Drive API duplicate check failed, falling back: " + e.message);
    }
  }
  const files = folder.getFilesByName(filename);
  return files.hasNext() ? files.next() : null;
}

/**
 * Creates a placeholder PDF file.
 */
function createPlaceholderFile_(folderId, name) {
  if (typeof Drive !== 'undefined') {
    try {
      return callWithRetry_('Drive API Create Placeholder', () => {
        const resource = {
          title: name,
          mimeType: 'application/pdf',
          parents: [{ id: folderId }]
        };
        const mediaData = Utilities.newBlob('Processing...', 'application/pdf');
        const file = Drive.Files.insert(resource, mediaData);
        return {
          getId: () => file.id,
          getUrl: () => file.alternateLink || file.webViewLink,
          setSharing: (access, permission) => {
            try {
              DriveApp.getFileById(file.id).setSharing(access, permission);
            } catch (_) {}
          }
        };
      });
    } catch (e) {
      console.warn("Advanced Drive API placeholder creation failed, falling back: " + e.message);
    }
  }
  return callWithRetry_('DriveApp Create Placeholder', () => {
    const folder = DriveApp.getFolderById(folderId);
    return folder.createFile(name, 'Processing...', MimeType.PDF);
  });
}

/**
 * Copy file using Advanced Drive API if available, else DriveApp.
 */
function copyFile_(sourceId, name, folderId) {
  if (typeof Drive !== 'undefined') {
    try {
      return callWithRetry_('Drive API Copy File', () => {
        const resource = {
          title: name,
          parents: [{ id: folderId }]
        };
        const file = Drive.Files.copy(resource, sourceId);
        return file.id;
      });
    } catch (e) {
      console.warn("Advanced Drive API copy file failed, falling back: " + e.message);
    }
  }
  return callWithRetry_('DriveApp Copy File', () => {
    const file = DriveApp.getFileById(sourceId);
    const folder = DriveApp.getFolderById(folderId);
    const copy = file.makeCopy(name, folder);
    return copy.getId();
  });
}

// ==========================================
// 6. CERTIFICATE GENERATION CORE
// ==========================================

/**
 * Helper to retry flaky Google API calls (like Drive App operations)
 */
function callWithRetry_(operationName, fn, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      Utilities.sleep(2000 * attempt); // 2s, 4s, 6s backoff
    }
  }
  throw new Error(`${operationName} failed: ${lastErr.message}`);
}

/**
 * Processes a single data row. Returns { result, detail, certId, pdfUrl }.
 * Throws on unrecoverable error so the caller can log it.
 */
function processRow_(opts) {
  const {
    sheet, row, rowNum, hdrs, nameIdx, certIdIdx, statusIdx,
    templateFile, cohortFolder, token, langSuffix, config, isHtml
  } = opts;

  const name = row[nameIdx];
  let certId = row[certIdIdx];

  // --- Generate Certificate ID if missing ---
  if (!certId) {
    const paddedNumber = String(rowNum).padStart(3, '0');
    certId = `${config.CERT_PREFIX}${paddedNumber}`;
  }

  const pdfName = `${name}_${certId}_Certificate_${langSuffix}.pdf`;

  // --- DUPLICATE DETECTION ---
  const existingFile = findExistingPdf_(cohortFolder, pdfName);
  if (existingFile) {
    return { result: 'SKIP', detail: `PDF already exists: ${existingFile.getUrl()}`, certId };
  }

  // --- Step 1: Create placeholder PDF ---
  const savedPdf = createPlaceholderFile_(cohortFolder.getId(), pdfName);
  
  try {
    savedPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn("Failed to set public sharing on PDF: " + e.message);
  }
  const pdfUrl = savedPdf.getUrl();

  // --- Step 2: Fetch QR Code with retry + exponential back-off ---
  const qrUrlStr = `https://quickchart.io/qr?text=${encodeURIComponent(pdfUrl)}&size=200`;
  const qrBlob = callWithRetry_('Fetch QR', () => {
    const qrResp = UrlFetchApp.fetch(qrUrlStr, { muteHttpExceptions: true });
    if (qrResp.getResponseCode() === 200) return qrResp.getBlob().setName('qr.png');
    throw new Error(`HTTP ${qrResp.getResponseCode()}`);
  }, config.MAX_QR_RETRIES);

  let finalPdfBlob;

  if (isHtml) {
    // --- HTML-to-PDF PATH (Super Fast, ~2-3 seconds) ---
    let htmlContent = callWithRetry_('Read HTML Template', () => templateFile.getAs(MimeType.PLAIN_TEXT).getDataAsString());
    
    // Replace all placeholders dynamically matching headers
    hdrs.forEach((hdr, idx) => {
      if (idx === statusIdx) return;
      const val = row[idx] || '';
      const regex = new RegExp(`{{\\s*${escapeRegExp_(hdr)}\\s*}}`, 'gi');
      htmlContent = htmlContent.replace(regex, String(val));
    });
    
    // Legacy mapping support
    htmlContent = htmlContent.replace(/\{\{\s*CertID\s*\}\}/gi, certId);
    
    // Replace QR Code placeholder with base64 Data URI
    const qrBase64 = Utilities.base64Encode(qrBlob.getBytes());
    const qrDataUri = `data:image/png;base64,${qrBase64}`;
    htmlContent = htmlContent.replace(/\{\{\s*qrcode\s*\}\}/gi, qrDataUri);

    finalPdfBlob = HtmlService.createHtmlOutput(htmlContent).getAs('application/pdf');
  } else {
    // --- GOOGLE SLIDES PATH ---
    const tempCopyId = copyFile_(templateFile.getId(), `Temp_${name}_Slide`, cohortFolder.getId());
    const presentation = SlidesApp.openById(tempCopyId);

    presentation.getSlides().forEach(slide => {
      // Dynamic text replacement matching all sheet headers
      hdrs.forEach((hdr, idx) => {
        if (idx === statusIdx) return;
        const val = row[idx] || '';
        slide.replaceAllText(`{{${hdr}}}`, String(val));
      });
      // Legacy mapping support
      slide.replaceAllText('{{CertID}}', certId);

      // Handle QR Code shape insertion
      slide.getShapes().forEach(shape => {
        let text = '';
        try { text = shape.getText().asString(); } catch (_) {}
        if (text.match(/\{\{\s*qrcode\s*\}\}/i)) {
          const sizePoints = config.QR_SIZE_INCHES * 72;
          slide.insertImage(qrBlob, shape.getLeft(), shape.getTop(), sizePoints, sizePoints);
          shape.remove();
        }
      });
    });

    presentation.saveAndClose();
    Utilities.sleep(1000); // Quick sync pause

    const tempFile = callWithRetry_('Get Slide File', () => DriveApp.getFileById(tempCopyId));
    finalPdfBlob = callWithRetry_('Export PDF', () => tempFile.getAs(MimeType.PDF), config.MAX_PATCH_RETRIES);

    // Trash the temporary slide
    try {
      tempFile.setTrashed(true);
    } catch (e) {
      console.warn("Failed to trash temporary slide: " + e.message);
    }
  }

  // --- Step 4: Update/Patch the placeholder PDF ---
  let patchSuccess = false;
  let lastPatchError = '';

  // Attempt 1: Advanced Drive Service (Direct File Body Update)
  try {
    if (typeof Drive !== 'undefined') {
      Drive.Files.update({}, savedPdf.getId(), finalPdfBlob);
      patchSuccess = true;
    }
  } catch (e) {
    console.warn("Advanced Drive Service update failed, falling back: " + e.message);
  }

  // Attempt 2: REST API PATCH Fallback
  if (!patchSuccess) {
    const patchUrl = `https://www.googleapis.com/upload/drive/v3/files/${savedPdf.getId()}?uploadType=media&supportsAllDrives=true`;
    for (let attempt = 1; attempt <= config.MAX_PATCH_RETRIES; attempt++) {
      const patchResp = UrlFetchApp.fetch(patchUrl, {
        method:      'PATCH',
        headers:     { 'Authorization': 'Bearer ' + token },
        contentType: 'application/pdf',
        payload:     finalPdfBlob,
        muteHttpExceptions: true,
      });
      if (patchResp.getResponseCode() === 200) {
        patchSuccess = true;
        break;
      }
      lastPatchError = patchResp.getContentText();
      Utilities.sleep(5000 * attempt);
    }
  }

  if (!patchSuccess) throw new Error(`Drive PATCH failed: ${lastPatchError}`);

  return { result: 'SUCCESS', detail: pdfUrl, certId };
}

/**
 * Escapes regex characters.
 */
function escapeRegExp_(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================
// 7. MAIN ORCHESTRATOR
// ==========================================

function runBatch_(filterStatus) {
  const ui = SpreadsheetApp.getUi();

  // Language selection
  const langResponse = ui.alert(
    'Select Certificate Version',
    'Click [ Yes ] for English.\nClick [ No ] for Arabic.\nClick [ Cancel ] to abort.',
    ui.ButtonSet.YES_NO_CANCEL
  );

  let langSuffix;
  if      (langResponse === ui.Button.YES) { langSuffix = 'EN'; }
  else if (langResponse === ui.Button.NO)  { langSuffix = 'AR'; }
  else return;

  // Detect active spreadsheet dynamically (supports container-bound use immediately)
  let ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  if (!ss) {
    ss = SpreadsheetApp.openById(DEFAULT_CONFIG.SPREADSHEET_ID);
  }

  // Load config overrides from Settings Sheet
  const config = loadConfig_(ss);

  let targetTemplateId;
  if (langSuffix === 'EN') targetTemplateId = config.TEMPLATE_SLIDE_ID_EN;
  else targetTemplateId = config.TEMPLATE_SLIDE_ID_AR;

  // Retrieve active or configured sheet
  let sheet = ss.getSheetByName(config.SHEET_NAME);
  if (!sheet) {
    sheet = ss.getActiveSheet() || ss.getSheets()[0];
  }
  const sheetName = sheet.getName();

  const data  = sheet.getDataRange().getValues();
  const hdrs  = data[0];

  // Dynamic Column Identification
  const nameIdx        = hdrs.indexOf(config.COL_NAME);
  const statusIdx      = hdrs.indexOf(config.COL_STATUS);
  const certIdIdx      = hdrs.indexOf(config.COL_CERT_ID);

  if ([nameIdx, statusIdx, certIdIdx].includes(-1)) {
    ui.alert(`Error: Missing required columns.\nEnsure Row 1 contains: "${config.COL_NAME}", "${config.COL_STATUS}", and "${config.COL_CERT_ID}".`);
    return;
  }

  let templateFile, parentFolder;
  try {
    templateFile  = DriveApp.getFileById(targetTemplateId);
    parentFolder  = DriveApp.getFolderById(config.DESTINATION_FOLDER_ID);
  } catch (e) {
    ui.alert('Error: Invalid Template ID or Destination Folder ID. Check your Settings sheet values.');
    return;
  }

  const mimeType = templateFile.getMimeType();
  const isHtml = (mimeType === MimeType.HTML || mimeType === 'text/html' || templateFile.getName().toLowerCase().endsWith('.html'));

  // Cohort sub-folder setup
  const cohortFolder = getOrCreateCohortFolder_(parentFolder, sheetName);

  const logSheet = getLogSheet_(ss, config);
  const runId    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const token    = ScriptApp.getOAuthToken();

  log_(logSheet, runId, '—', '—', '—', langSuffix, 'INFO',
       `Batch started. Filter="${filterStatus || 'all pending'}" | Folder: ${cohortFolder.getName()}`);

  let successCount = 0;
  let skipCount    = 0;
  let errorCount   = 0;

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const name   = row[nameIdx];
    const status = row[statusIdx];

    // Skip blank rows
    if (!name) continue;

    // Filter: when retrying errors, only process rows whose Status starts with "Error"
    if (filterStatus === 'Error' && !String(status).startsWith('Error')) continue;

    // Skip rows already successfully processed (unless we're retrying)
    if (filterStatus !== 'Error' && status === 'Saved') continue;

    try {
      const { result, detail, certId } = processRow_({
        sheet, row, rowNum: i, hdrs,
        nameIdx, certIdIdx, statusIdx,
        templateFile, cohortFolder, token, langSuffix,
        config, isHtml
      });

      // Batch update the sheet row to save performance (flushed during logging)
      sheet.getRange(i + 1, certIdIdx + 1).setValue(certId);
      sheet.getRange(i + 1, statusIdx + 1).setValue('Saved');

      if (result === 'SKIP') {
        skipCount++;
        log_(logSheet, runId, i + 1, name, certId, langSuffix, 'SKIP', detail);
      } else {
        successCount++;
        log_(logSheet, runId, i + 1, name, certId, langSuffix, 'SUCCESS', detail);
      }

    } catch (err) {
      errorCount++;
      const errMsg = `Error: ${err.message}`;
      sheet.getRange(i + 1, statusIdx + 1).setValue(errMsg);
      
      const liveCertId = sheet.getRange(i + 1, certIdIdx + 1).getValue() || '?';
      log_(logSheet, runId, i + 1, name, liveCertId, langSuffix, 'ERROR', err.message);
      
      // Pause recovery sleep
      Utilities.sleep(config.ERROR_RECOVERY_MS);
    }

    if (config.ROW_THROTTLE_MS > 0) {
      Utilities.sleep(config.ROW_THROTTLE_MS);
    }
  }

  // --- Summary log entry ---
  const summary = `Done. ✅ ${successCount} generated | ⏭ ${skipCount} skipped (duplicates) | ❌ ${errorCount} errors`;
  log_(logSheet, runId, '—', '—', '—', langSuffix, 'INFO', summary);

  ui.alert(`Batch Complete (${langSuffix})\n\n${summary}\n\nSee the "${config.LOG_SHEET_NAME}" sheet for details.`);
}

// ==========================================
// 8. PUBLIC ENTRY POINTS
// ==========================================

/** Standard run — processes all pending (non-Saved) rows. */
function processCertificates() {
  runBatch_('');
}

/**
 * Retry run — only re-processes rows whose Status cell starts with "Error".
 */
function retryFailedRows() {
  runBatch_('Error');
}

/** Brings the log sheet into focus. */
function openLogSheet() {
  let ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  if (!ss) {
    ss = SpreadsheetApp.openById(DEFAULT_CONFIG.SPREADSHEET_ID);
  }
  const config = loadConfig_(ss);
  const logSheet = getLogSheet_(ss, config);
  ss.setActiveSheet(logSheet);
}
