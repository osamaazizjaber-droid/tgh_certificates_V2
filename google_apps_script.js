/**
 * CERTIFICATE MANAGEMENT BACKEND API FOR REACT APP
 * Place this code into Extensions -> Apps Script in your Google Sheet
 */

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (action === 'getData') {
      return jsonResponse({
        certificates: getCertificates_(ss),
        settings: getSettings_(ss)
      });
    }

    if (action === 'verify') {
      const certId = e.parameter.cert_id;
      const certs = getCertificates_(ss);
      const found = certs.find(c => String(c.cert_id).trim().toLowerCase() === String(certId).trim().toLowerCase());
      return jsonResponse({ certificate: found || null });
    }

    if (action === 'getSettings') {
      return jsonResponse({ settings: getSettings_(ss) });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    // Save generated certificate PDF directly to Google Drive & update sheet
    if (action === 'saveCertificatePdf') {
      const folderId = payload.folderId || '1-gRG2ZkIWSmq6PwMquC4MLPCs63QhWSP';
      const folder = DriveApp.getFolderById(folderId);
      const decodedBytes = Utilities.base64Decode(payload.pdfBase64);
      const blob = Utilities.newBlob(decodedBytes, 'application/pdf', payload.fileName);
      
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const pdfUrl = file.getUrl(); // Permanent Google Drive link

      // Update the sheet row with status and pdf_url
      updateStatus_(ss, payload.id, 'saved', pdfUrl);
      return jsonResponse({ success: true, pdf_url: pdfUrl });
    }

    if (action === 'insertRecipient') {
      insertRecipient_(ss, payload.recipient);
      return jsonResponse({ success: true });
    }

    if (action === 'batchInsertRecipients') {
      batchInsertRecipients_(ss, payload.recipients);
      return jsonResponse({ success: true });
    }

    if (action === 'updateRecipient') {
      updateRecipient_(ss, payload.id, payload.updates);
      return jsonResponse({ success: true });
    }

    if (action === 'updateStatus') {
      updateStatus_(ss, payload.id, payload.status, payload.pdf_url);
      return jsonResponse({ success: true });
    }

    if (action === 'resetStatuses') {
      resetStatuses_(ss, payload.ids);
      return jsonResponse({ success: true });
    }

    if (action === 'deleteRecipients') {
      deleteRecipients_(ss, payload.ids);
      return jsonResponse({ success: true });
    }

    if (action === 'deleteAllRecipients') {
      deleteAllRecipients_(ss);
      return jsonResponse({ success: true });
    }

    if (action === 'saveSettings') {
      saveSettings_(ss, payload.settings);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ---------------- HELPERS ----------------

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getCertificates_(ss) {
  const sheet = ss.getSheetByName('Certificates');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headers = rows[0];
  return rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

function getSettings_(ss) {
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return null;

  const headers = rows[0];
  const row = rows[1];
  let obj = {};
  headers.forEach((h, i) => {
    if (h === 'layouts') {
      try { obj[h] = JSON.parse(row[i]); } catch (_) { obj[h] = row[i]; }
    } else {
      obj[h] = row[i];
    }
  });
  return obj;
}

function insertRecipient_(ss, rec) {
  const sheet = ss.getSheetByName('Certificates');
  sheet.appendRow([
    rec.id || Utilities.getUuid(),
    rec.cert_id,
    rec.name,
    rec.facilitator || '',
    rec.project_code || '',
    rec.batch || '',
    rec.status || 'pending',
    rec.pdf_url || '',
    rec.language || 'EN',
    JSON.stringify(rec.metadata || {}),
    new Date().toISOString()
  ]);
}

function batchInsertRecipients_(ss, list) {
  const sheet = ss.getSheetByName('Certificates');
  const rows = list.map(rec => [
    rec.id || Utilities.getUuid(),
    rec.cert_id,
    rec.name,
    rec.facilitator || '',
    rec.project_code || '',
    rec.batch || '',
    rec.status || 'pending',
    rec.pdf_url || '',
    rec.language || 'EN',
    JSON.stringify(rec.metadata || {}),
    new Date().toISOString()
  ]);
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function updateRecipient_(ss, id, updates) {
  const sheet = ss.getSheetByName('Certificates');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(id)) {
      Object.keys(updates).forEach(k => {
        const colIdx = headers.indexOf(k);
        if (colIdx !== -1) {
          sheet.getRange(r + 1, colIdx + 1).setValue(updates[k]);
        }
      });
      break;
    }
  }
}

function updateStatus_(ss, id, status, pdf_url) {
  const sheet = ss.getSheetByName('Certificates');
  const data = sheet.getDataRange().getValues();
  const statusIdx = data[0].indexOf('status');
  const pdfIdx = data[0].indexOf('pdf_url');

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(id)) {
      if (statusIdx !== -1) sheet.getRange(r + 1, statusIdx + 1).setValue(status);
      if (pdf_url !== undefined && pdfIdx !== -1) sheet.getRange(r + 1, pdfIdx + 1).setValue(pdf_url);
      break;
    }
  }
}

function resetStatuses_(ss, ids) {
  const sheet = ss.getSheetByName('Certificates');
  const data = sheet.getDataRange().getValues();
  const statusIdx = data[0].indexOf('status');
  const pdfIdx = data[0].indexOf('pdf_url');
  const idSet = new Set(ids.map(String));

  for (let r = 1; r < data.length; r++) {
    if (idSet.has(String(data[r][0]))) {
      sheet.getRange(r + 1, statusIdx + 1).setValue('pending');
      sheet.getRange(r + 1, pdfIdx + 1).setValue('');
    }
  }
}

function deleteRecipients_(ss, ids) {
  const sheet = ss.getSheetByName('Certificates');
  const data = sheet.getDataRange().getValues();
  const idSet = new Set(ids.map(String));
  for (let r = data.length - 1; r >= 1; r--) {
    if (idSet.has(String(data[r][0]))) {
      sheet.deleteRow(r + 1);
    }
  }
}

function deleteAllRecipients_(ss) {
  const sheet = ss.getSheetByName('Certificates');
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
}

function saveSettings_(ss, s) {
  let sheet = ss.getSheetByName('Settings');
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  sheet.appendRow([
    s.id || 'default',
    s.cert_prefix || 'TGH-KU50-',
    s.bg_image_en || '',
    s.bg_image_ar || '',
    typeof s.layouts === 'string' ? s.layouts : JSON.stringify(s.layouts)
  ]);
}

/**
 * Run this function ONCE in the Apps Script editor (select 'authorizeDrive' and click 'Run')
 * to grant Google Drive authorization permissions.
 */
function authorizeDrive() {
  const folder = DriveApp.getFolderById('1-gRG2ZkIWSmq6PwMquC4MLPCs63QhWSP');
  Logger.log('Success! Google Drive access is authorized for folder: ' + folder.getName());
}
