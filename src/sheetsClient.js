/**
 * Google Sheets API Client for Certificates Generation App
 * Communicates with the deployed Google Apps Script Web App
 */

const API_URL = import.meta.env.VITE_GOOGLE_SHEETS_API_URL || 'https://script.google.com/macros/s/AKfycbz2PZMWSNfCs5R_CM3i3CEKf_YKTMhDISbMfIIRYyLSQ9AbCVS1nXeMviqXG694JaLE/exec';

export const isConfigured = Boolean(API_URL && !API_URL.includes('YOUR_DEPLOYMENT_ID'));

/**
 * Sends a GET request to the Google Apps Script Web App
 */
async function get(params = {}) {
  const url = new URL(API_URL);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  const res = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`Google Sheets API error: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Sends a POST request to the Google Apps Script Web App.
 * Uses 'text/plain;charset=utf-8' to avoid CORS preflight OPTIONS rejection in Google Apps Script.
 */
async function post(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`Google Sheets API POST failed: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

export const sheetsClient = {
  isConfigured,

  /**
   * Fetch all certificates and layout settings
   */
  async fetchData() {
    return await get({ action: 'getData' });
  },

  /**
   * Verify certificate by cert_id
   */
  async verifyCertificate(certId) {
    return await get({ action: 'verify', cert_id: certId });
  },

  /**
   * Get settings
   */
  async getSettings() {
    const res = await get({ action: 'getSettings' });
    return res.settings;
  },

  /**
   * Save layout settings & prefix
   */
  async saveSettings(settings) {
    return await post({ action: 'saveSettings', settings });
  },

  /**
   * Insert a single recipient
   */
  async insertRecipient(recipient) {
    return await post({ action: 'insertRecipient', recipient });
  },

  /**
   * Batch insert recipients (e.g. from Excel/CSV import)
   */
  async batchInsertRecipients(recipients) {
    return await post({ action: 'batchInsertRecipients', recipients });
  },

  /**
   * Update recipient fields
   */
  async updateRecipient(id, updates) {
    return await post({ action: 'updateRecipient', id, updates });
  },

  /**
   * Update recipient status & PDF URL
   */
  async updateStatus(id, status, pdf_url = '') {
    return await post({ action: 'updateStatus', id, status, pdf_url });
  },

  /**
   * Reset statuses of multiple recipients to pending
   */
  async resetStatuses(ids) {
    return await post({ action: 'resetStatuses', ids });
  },

  /**
   * Delete recipients by list of IDs
   */
  async deleteRecipients(ids) {
    return await post({ action: 'deleteRecipients', ids });
  },

  /**
   * Delete all recipients
   */
  async deleteAllRecipients() {
    return await post({ action: 'deleteAllRecipients' });
  },

  /**
   * Save certificate PDF to Google Drive and update pdf_url in Google Sheets
   */
  async saveCertificatePdf(payload) {
    return await post({ action: 'saveCertificatePdf', ...payload });
  }
};

export default sheetsClient;
