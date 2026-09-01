import React, { useState, useEffect, useRef } from 'react';
import sheetsClient from '../sheetsClient';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { 
  Users, CheckCircle, Clock, AlertCircle, Play, Plus, Trash2, 
  Upload, Download, Search, Filter, Database, RefreshCw, Settings, ShieldAlert,
  ExternalLink, RotateCcw, Edit2
} from 'lucide-react';

export default function Dashboard({ showOnlyCompleted = false }) {
  const [recipients, setRecipients] = useState(() => {
    try {
      const cached = localStorage.getItem('tgh_recipients');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem('tgh_settings');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cachedRecipients = localStorage.getItem('tgh_recipients');
      const cachedSettings = localStorage.getItem('tgh_settings');
      return !(cachedRecipients && cachedSettings);
    } catch {
      return true;
    }
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  
  const [newRecipient, setNewRecipient] = useState({
    name: '',
    facilitator: '',
    project_code: '',
    batch: '',
    language: 'EN',
    cert_id: ''
  });

  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [parsedPreview, setParsedPreview] = useState([]);
  const [headerMapping, setHeaderMapping] = useState({ name: -1, facilitator: -1, projectCode: -1, batch: -1, language: -1, certId: -1 });
  
  const [processingRows, setProcessingRows] = useState({});
  const [editingRecipient, setEditingRecipient] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const cancelGenerationRef = useRef(false);
  const pauseGenerationRef = useRef(false);

  const generateNextCertId = (projectCode, countOffset = 0, excludeIds = []) => {
    const pCode = (projectCode || '').trim();
    let baseCount = recipients.length + 1 + countOffset;
    const activePrefix = (settings?.cert_prefix) || 'TGH-KU50-';
    
    while (true) {
      let candidateId;
      if (pCode) {
        candidateId = `TGH-${pCode}-${String(baseCount).padStart(3, '0')}`;
      } else {
        candidateId = `${activePrefix}${String(baseCount).padStart(3, '0')}`;
      }
      
      const existsInRecipients = recipients.some(r => r.cert_id === candidateId);
      const existsInExclude = excludeIds.includes(candidateId);
      
      if (!existsInRecipients && !existsInExclude) {
        return candidateId;
      }
      
      baseCount++;
    }
  };

  useEffect(() => {
    if (sheetsClient.isConfigured) {
      fetchData();
    }
  }, []);

  useEffect(() => {
    if (recipients.length > 0) {
      localStorage.setItem('tgh_recipients', JSON.stringify(recipients));
    }
  }, [recipients]);

  useEffect(() => {
    if (settings) {
      localStorage.setItem('tgh_settings', JSON.stringify(settings));
    }
  }, [settings]);

  useEffect(() => {
    if (!csvText.trim()) {
      setParsedPreview([]);
      setHeaderMapping({ name: -1, facilitator: -1, projectCode: -1, batch: -1, language: -1, certId: -1 });
      return;
    }

    const lines = csvText.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setParsedPreview([]);
      setHeaderMapping({ name: -1, facilitator: -1, projectCode: -1, batch: -1, language: -1, certId: -1 });
      return;
    }

    // Robust CSV cell parser handling quotes and commas
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result.map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
    };

    const rawHeaders = parseCSVLine(lines[0]);
    const cleanHeaders = rawHeaders.map(h => h.toLowerCase());

    const NAME_ALIASES = ['name', 'recipient name', 'recipient_name', 'student name', 'الاسم', 'اسم المستلم', 'full name', 'fullname', 'full_name'];
    const FACILITATOR_ALIASES = ['facilitator', 'trainer', 'instructor', 'teacher', 'المدرب', 'الميسر', 'الاستاذ', 'الأستاذ'];
    const PROJECT_ALIASES = ['project_code', 'project', 'project code', 'projectcode', 'رمز المشروع', 'المشروع'];
    const BATCH_ALIASES = ['batch', 'batch_id', 'batch id', 'الدفعة', 'الدفعه', 'مجموعة'];
    const LANG_ALIASES = ['language', 'lang', 'اللغة', 'اللغه'];
    const CERT_ID_ALIASES = ['cert_id', 'certificate id', 'certificate_id', 'certid', 'رقم الشهادة', 'رمز الشهادة'];

    const nameIdx = cleanHeaders.findIndex(h => NAME_ALIASES.includes(h));
    const facilitatorIdx = cleanHeaders.findIndex(h => FACILITATOR_ALIASES.includes(h));
    const projectCodeIdx = cleanHeaders.findIndex(h => PROJECT_ALIASES.includes(h));
    const batchIdx = cleanHeaders.findIndex(h => BATCH_ALIASES.includes(h));
    const langIdx = cleanHeaders.findIndex(h => LANG_ALIASES.includes(h));
    const certIdIdx = cleanHeaders.findIndex(h => CERT_ID_ALIASES.includes(h));

    const mapping = {
      name: nameIdx,
      facilitator: facilitatorIdx,
      projectCode: projectCodeIdx,
      batch: batchIdx,
      language: langIdx,
      certId: certIdIdx
    };

    setHeaderMapping(mapping);

    const previews = [];
    const generatedBatchIds = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = parseCSVLine(line);
      if (values.length === 1 && values[0] === '') continue; // Skip empty rows

      const name = nameIdx !== -1 ? (values[nameIdx] || '') : '';
      const facilitator = facilitatorIdx !== -1 ? (values[facilitatorIdx] || '') : '';
      const projectCode = projectCodeIdx !== -1 ? (values[projectCodeIdx] || '') : '';
      const batch = batchIdx !== -1 ? (values[batchIdx] || '') : '';
      
      let rawLang = langIdx !== -1 ? (values[langIdx] || 'EN') : 'EN';
      const language = rawLang.toUpperCase() === 'AR' ? 'AR' : 'EN';
      
      let certId = '';
      if (certIdIdx !== -1 && values[certIdIdx]) {
        certId = values[certIdIdx].trim();
      } else {
        certId = generateNextCertId(projectCode, 0, generatedBatchIds);
        generatedBatchIds.push(certId);
      }

      previews.push({
        name,
        facilitator,
        project_code: projectCode,
        batch,
        language,
        cert_id: certId,
        rawRowIndex: i
      });
    }

    setParsedPreview(previews);
  }, [csvText, settings, recipients.length]);

  const fetchData = async () => {
    try {
      const hasCache = localStorage.getItem('tgh_recipients') && localStorage.getItem('tgh_settings');
      if (!hasCache) {
        setLoading(true);
      }
      
      const res = await sheetsClient.fetchData();
      
      const fetchedSettings = res.settings || null;
      const fetchedRecipients = res.certificates || [];

      setSettings(fetchedSettings);
      setRecipients(fetchedRecipients);

      localStorage.setItem('tgh_settings', JSON.stringify(fetchedSettings));
      localStorage.setItem('tgh_recipients', JSON.stringify(fetchedRecipients));
    } catch (e) {
      console.error("fetchData error:", e);
      const hasCache = localStorage.getItem('tgh_recipients') && localStorage.getItem('tgh_settings');
      if (!hasCache) {
        alert('Error fetching data from Google Sheets: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipient = async (e) => {
    e.preventDefault();
    try {
      const finalCertId = newRecipient.cert_id.trim() || generateNextCertId();
      
      const recipientObj = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('rec_' + Date.now()),
        name: newRecipient.name.trim(),
        facilitator: newRecipient.facilitator.trim(),
        project_code: newRecipient.project_code.trim(),
        batch: newRecipient.batch.trim(),
        language: newRecipient.language,
        cert_id: finalCertId,
        status: 'pending',
        pdf_url: '',
        metadata: {},
        created_at: new Date().toISOString()
      };

      await sheetsClient.insertRecipient(recipientObj);

      setRecipients(prev => [recipientObj, ...prev]);
      setShowAddModal(false);
      setNewRecipient({ name: '', facilitator: '', project_code: '', batch: '', language: 'EN', cert_id: '' });
    } catch (e) {
      console.error(e);
      alert('Error inserting recipient: ' + e.message);
    }
  };

  const handleUpdateRecipient = async (e) => {
    e.preventDefault();
    try {
      const original = recipients.find(r => r.id === editingRecipient.id);
      let resetRequired = false;
      
      if (original) {
        const criticalFieldsChanged = 
          original.name !== editingRecipient.name.trim() ||
          original.facilitator !== editingRecipient.facilitator.trim() ||
          original.project_code !== editingRecipient.project_code.trim() ||
          original.batch !== editingRecipient.batch.trim() ||
          original.language !== editingRecipient.language ||
          original.cert_id !== editingRecipient.cert_id.trim();
          
        if (criticalFieldsChanged && original.status !== 'pending') {
          resetRequired = true;
        }
      }

      let resetStatus = editingRecipient.status;
      let resetPdfUrl = editingRecipient.pdf_url;
      
      if (resetRequired) {
        if (confirm("You modified certificate details on an already generated certificate. Saving will reset the status to 'Pending' so a new one can be generated. Do you want to proceed?")) {
          resetStatus = 'pending';
          resetPdfUrl = '';
        } else {
          return;
        }
      }

      await sheetsClient.updateRecipient(editingRecipient.id, {
        name: editingRecipient.name.trim(),
        facilitator: editingRecipient.facilitator.trim(),
        project_code: editingRecipient.project_code.trim(),
        batch: editingRecipient.batch.trim(),
        language: editingRecipient.language,
        cert_id: editingRecipient.cert_id.trim(),
        status: resetStatus,
        pdf_url: resetPdfUrl || ''
      });

      const updatedRecipient = {
        ...editingRecipient,
        name: editingRecipient.name.trim(),
        facilitator: editingRecipient.facilitator.trim(),
        project_code: editingRecipient.project_code.trim(),
        batch: editingRecipient.batch.trim(),
        language: editingRecipient.language,
        cert_id: editingRecipient.cert_id.trim(),
        status: resetStatus,
        pdf_url: resetPdfUrl || ''
      };

      setRecipients(prev => prev.map(r => r.id === updatedRecipient.id ? updatedRecipient : r));
      setEditingRecipient(null);
    } catch (e) {
      console.error(e);
      alert('Error updating recipient: ' + e.message);
    }
  };

  const handleDownloadTemplate = () => {
    const data = [
      {
        Name: "Osama Al-Sagheer",
        Facilitator: "Dr. Ahmad",
        Project_Code: "KU50",
        Batch: "Batch 1",
        Language: "EN",
        Cert_ID: ""
      },
      {
        Name: "سليم علي",
        Facilitator: "أحمد صالح",
        Project_Code: "KU50",
        Batch: "Batch 1",
        Language: "AR",
        Cert_ID: ""
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Recipients Template");
    XLSX.writeFile(workbook, "tgh_recipients_template.xlsx");
  };

  const handleCSVFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          setCsvText(csv);
        } catch (err) {
          console.error("Excel parse error:", err);
          alert("Failed to parse Excel file. Please ensure it's a valid Excel spreadsheet.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvText(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleCSVImport = async (e) => {
    e.preventDefault();
    if (headerMapping.name === -1) {
      alert('Required header "Name" not found in CSV. Please map a name column.');
      return;
    }

    const validRows = parsedPreview.filter(r => r.name.trim() !== '');
    if (validRows.length === 0) {
      alert('No valid recipient rows with names found. Ingestion aborted.');
      return;
    }

    try {
      setImporting(true);

      const objects = validRows.map(r => ({
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('rec_' + Math.random().toString(36).substring(2, 9)),
        name: r.name.trim(),
        facilitator: r.facilitator.trim(),
        project_code: r.project_code.trim(),
        batch: r.batch.trim(),
        language: r.language,
        cert_id: r.cert_id.trim(),
        status: 'pending',
        pdf_url: '',
        metadata: {},
        created_at: new Date().toISOString()
      }));

      await sheetsClient.batchInsertRecipients(objects);
      
      setRecipients(prev => [...objects, ...prev]);
      setShowCSVModal(false);
      setCsvText('');
      alert(`Imported ${objects.length} records successfully to Google Sheets!`);
    } catch (e) {
      console.error(e);
      alert('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} recipient(s)?`)) return;

    try {
      await sheetsClient.deleteRecipients(selectedIds);
      setRecipients(prev => prev.filter(r => !selectedIds.includes(r.id)));
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      alert('Delete failed: ' + e.message);
    }
  };

  const deletePdfFromStorage = async (pdfUrl) => {
    // No-op for Google Sheets
  };

  const handleResetStatus = async (row) => {
    if (!confirm(`Are you sure you want to undo generation for ${row.name}? This will reset the status to pending.`)) return;
    
    try {
      setProcessingRows(prev => ({ ...prev, [row.id]: 'generating' }));
      
      await sheetsClient.updateStatus(row.id, 'pending', '');

      setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'pending', pdf_url: '' } : r));
    } catch (e) {
      console.error(e);
      alert('Failed to reset status: ' + e.message);
    } finally {
      setProcessingRows(prev => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
    }
  };

  const handleResetSelected = async () => {
    const targetRows = recipients.filter(r => selectedIds.includes(r.id) && r.status !== 'pending');
    if (targetRows.length === 0) return;
    
    if (!confirm(`Are you sure you want to undo generation for the ${targetRows.length} selected recipient(s)? This will reset their statuses back to pending.`)) return;

    try {
      setImporting(true);
      
      const idsToReset = targetRows.map(r => r.id);
      
      await sheetsClient.resetStatuses(idsToReset);

      setRecipients(prev => 
        prev.map(r => idsToReset.includes(r.id) ? { ...r, status: 'pending', pdf_url: '' } : r)
      );
      
      setSelectedIds([]);
      alert(`Successfully reset ${targetRows.length} recipient(s) to pending!`);
    } catch (e) {
      console.error(e);
      alert('Failed to reset selected recipients: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (recipients.length === 0) return;
    if (!confirm(`WARNING: Are you sure you want to delete ALL ${recipients.length} recipient records? This will permanently delete them from the Google Sheet.`)) return;
    
    const confirmPhrase = prompt('To confirm deletion of all records, please type DELETE below:');
    if (confirmPhrase !== 'DELETE') {
      alert('Deletion cancelled. Confirmation phrase did not match.');
      return;
    }

    try {
      setLoading(true);
      await sheetsClient.deleteAllRecipients();

      setRecipients([]);
      setSelectedIds([]);
      alert('All recipient records have been deleted successfully from Google Sheets!');
    } catch (e) {
      console.error(e);
      alert('Delete All failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderCertificatePdf = async (row, preloadedBgEn = null, preloadedBgAr = null) => {
    const layout = settings?.layouts?.[row.language.toLowerCase()] || settings?.layouts?.en;
    if (!layout) {
      throw new Error(`Layout configuration missing for language: ${row.language}`);
    }

    let bgImg = row.language.toLowerCase() === 'en' ? preloadedBgEn : preloadedBgAr;
    if (!bgImg) {
      const getTemplateUrl = (url, fallback) => {
        if (!url || url.includes('nhost.run')) return fallback;
        return url;
      };
      const fallbackUrl = row.language.toLowerCase() === 'ar' ? '/templates/certificate_ar.png' : '/templates/certificate_en.png';
      const customUrl = row.language.toLowerCase() === 'ar' ? settings?.bg_image_ar : settings?.bg_image_en;
      try {
        bgImg = await loadImage(getTemplateUrl(customUrl, fallbackUrl));
      } catch {
        bgImg = await loadImage(fallbackUrl);
      }
    }

    const scale = 3.0;
    const canvas = document.createElement('canvas');
    canvas.width = 800 * scale;
    canvas.height = 565 * scale;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(bgImg, 0, 0, 800 * scale, 565 * scale);

    // Recipient Name (Centered)
    ctx.fillStyle = layout.name.color || '#1a1d24';
    const fontSizeScaled = parseFloat(layout.name.fontSize || 32) * scale;
    ctx.font = `${layout.name.fontWeight || 'bold'} ${fontSizeScaled}px ${layout.name.fontFamily || 'Outfit'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.name, layout.name.x * scale, layout.name.y * scale);

    // Verification URL QR Code
    const verifyUrl = `${window.location.protocol}//${window.location.host}/verify?id=${encodeURIComponent(row.cert_id)}`;
    const qrSizeScaled = parseFloat(layout.qrCode.size || 100) * scale;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: qrSizeScaled });
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, layout.qrCode.x * scale, layout.qrCode.y * scale, qrSizeScaled, qrSizeScaled);

    // Draw Verification Label Text (below QR Code)
    ctx.fillStyle = layout.name.color || '#1a1d24';
    const labelFontSize = 10 * scale;
    const labelFontFamily = row.language.toLowerCase() === 'ar' ? 'Cairo' : 'Outfit';
    ctx.font = `600 ${labelFontSize}px ${labelFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelText = row.language.toLowerCase() === 'ar' ? 'امسح هنا للتحقق' : 'Scan here to verify';
    const labelX = (parseFloat(layout.qrCode.x) + parseFloat(layout.qrCode.size || 100) / 2) * scale;
    const labelY = (parseFloat(layout.qrCode.y) + parseFloat(layout.qrCode.size || 100) + 8) * scale;
    ctx.fillText(labelText, labelX, labelY);

    // Convert to PDF
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [800, 565]
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 800, 565);
    return pdf;
  };

  const handleDownloadSingle = async (row) => {
    try {
      setProcessingRows(prev => ({ ...prev, [row.id]: 'generating' }));
      const safeName = (row.name || 'Recipient').replace(/[/\\?%*:|"<>]/g, '-').trim();
      const filename = `${row.cert_id}_${safeName}.pdf`;

      if (row.pdf_url && !row.pdf_url.includes('nhost.run')) {
        const link = document.createElement("a");
        link.href = row.pdf_url;
        link.target = "_blank";
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const pdf = await renderCertificatePdf(row);
      pdf.save(filename);
    } catch (err) {
      console.error("Failed to download single PDF:", err);
      alert("Failed to download PDF: " + err.message);
    } finally {
      setProcessingRows(prev => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
    }
  };

  const downloadAsZip = async (rowsToDownload) => {
    const targetRows = Array.isArray(rowsToDownload)
      ? rowsToDownload
      : recipients.filter(r => selectedIds.includes(r.id) && (r.status === 'saved' || r.pdf_url));

    if (targetRows.length === 0) {
      alert("No generated certificates found among selected rows to download.");
      return;
    }

    try {
      setImporting(true);
      const zip = new JSZip();

      let bgImgEn = null;
      let bgImgAr = null;
      try {
        if (targetRows.some(r => r.language.toUpperCase() === 'EN')) {
          bgImgEn = await loadImage('/templates/certificate_en.png');
        }
        if (targetRows.some(r => r.language.toUpperCase() === 'AR')) {
          bgImgAr = await loadImage('/templates/certificate_ar.png');
        }
      } catch (bgErr) {
        console.warn("Background preload error for zip:", bgErr);
      }
      
      for (const row of targetRows) {
        const safeName = (row.name || 'Recipient').replace(/[/\\?%*:|"<>]/g, '-').trim();
        const filename = `${row.cert_id}_${safeName}.pdf`;

        if (row.pdf_url && !row.pdf_url.includes('nhost.run')) {
          try {
            const response = await fetch(row.pdf_url);
            if (response.ok) {
              const blob = await response.blob();
              zip.file(filename, blob);
              continue;
            }
          } catch (_) {}
        }

        const pdf = await renderCertificatePdf(row, bgImgEn, bgImgAr);
        const blob = pdf.output('blob');
        zip.file(filename, blob);
      }
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `certificates_batch_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ZIP packaging failed:", err);
      alert("Failed to download and zip certificates: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadIndividually = async (rowsToDownload) => {
    const targetRows = Array.isArray(rowsToDownload)
      ? rowsToDownload
      : recipients.filter(r => selectedIds.includes(r.id) && (r.status === 'saved' || r.pdf_url));

    if (targetRows.length === 0) {
      alert("No generated certificates found to download.");
      return;
    }
    
    for (const row of targetRows) {
      await handleDownloadSingle(row);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  };

  const generateCertificates = async () => {
    if (selectedIds.length === 0) return;
    if (!settings) {
      alert('Certificate layout settings are missing! Configure templates in the Designer tab.');
      return;
    }

    const selectedRows = recipients.filter(r => selectedIds.includes(r.id));

    setIsGenerating(true);
    setIsPaused(false);
    setProgressIndex(0);
    setProgressTotal(selectedRows.length);
    cancelGenerationRef.current = false;
    pauseGenerationRef.current = false;

    // Pre-load background template images once before entering the loop
    let bgImgEn = null;
    let bgImgAr = null;
    const hasEn = selectedRows.some(r => r.language.toUpperCase() === 'EN');
    const hasAr = selectedRows.some(r => r.language.toUpperCase() === 'AR');

    const getTemplateUrl = (url, fallback) => {
      if (!url || url.includes('nhost.run')) return fallback;
      return url;
    };

    try {
      if (hasEn) {
        const enUrl = getTemplateUrl(settings?.bg_image_en, '/templates/certificate_en.png');
        try {
          bgImgEn = await loadImage(enUrl);
        } catch (errEn) {
          console.warn("Primary EN template failed, using local fallback:", errEn);
          bgImgEn = await loadImage('/templates/certificate_en.png');
        }
      }
      if (hasAr) {
        const arUrl = getTemplateUrl(settings?.bg_image_ar, '/templates/certificate_ar.png');
        try {
          bgImgAr = await loadImage(arUrl);
        } catch (errAr) {
          console.warn("Primary AR template failed, using local fallback:", errAr);
          bgImgAr = await loadImage('/templates/certificate_ar.png');
        }
      }
    } catch (preloadErr) {
      console.error("Failed to pre-load background template images:", preloadErr);
      alert("Failed to pre-load template background images. Please check the template settings in the Designer.");
      setIsGenerating(false);
      return;
    }
    
    const generatedFiles = [];

    for (let i = 0; i < selectedRows.length; i++) {
      const row = selectedRows[i];

      // Check cancellation and pause states
      if (cancelGenerationRef.current) {
        break;
      }
      while (pauseGenerationRef.current) {
        if (cancelGenerationRef.current) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (cancelGenerationRef.current) {
        break;
      }

      setProgressIndex(i + 1);
      setProcessingRows(prev => ({ ...prev, [row.id]: 'generating' }));
      
      await sheetsClient.updateStatus(row.id, 'generating', row.pdf_url || '');
      setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'generating' } : r));

      try {
        const pdf = await renderCertificatePdf(row, bgImgEn, bgImgAr);
        const safeName = (row.name || 'Recipient').replace(/[/\\?%*:|"<>]/g, '-').trim();
        const filename = `${row.cert_id}_${safeName}.pdf`;
        generatedFiles.push({ filename, blob: pdf.output('blob'), pdf });

        let pdfUrl = row.pdf_url || '';
        try {
          const dataUri = pdf.output('datauristring');
          const base64Content = dataUri.split(',')[1];
          const uploadRes = await sheetsClient.saveCertificatePdf({
            id: row.id,
            fileName: filename,
            pdfBase64: base64Content,
            folderId: '1-gRG2ZkIWSmq6PwMquC4MLPCs63QhWSP'
          });
          if (uploadRes && uploadRes.pdf_url) {
            pdfUrl = uploadRes.pdf_url;
          } else if (uploadRes && uploadRes.error) {
            console.error("Apps Script error saving PDF to Drive:", uploadRes.error);
            if (uploadRes.error.includes("DriveApp") || uploadRes.error.includes("إذن") || uploadRes.error.includes("permission")) {
              alert("Google Drive authorization needed! In Google Apps Script, select 'authorizeDrive' and click 'Run' once to grant permission.");
            }
          }
        } catch (uploadErr) {
          console.warn("Upload to Drive encountered an issue, saving status directly:", uploadErr);
          await sheetsClient.updateStatus(row.id, 'saved', row.pdf_url || '');
        }

        setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'saved', pdf_url: pdfUrl } : r));
        setProcessingRows(prev => ({ ...prev, [row.id]: 'success' }));
      } catch (err) {
        console.error("Failed to generate for: " + row.name, err);
        await sheetsClient.updateStatus(row.id, 'failed', row.pdf_url || '');
        setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'failed' } : r));
        setProcessingRows(prev => ({ ...prev, [row.id]: 'error' }));
      }
    }
    
    setIsGenerating(false);
    setIsPaused(false);

    // Automatically trigger download of newly generated certificates
    if (generatedFiles.length > 1) {
      try {
        const zip = new JSZip();
        generatedFiles.forEach(f => zip.file(f.filename, f.blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `certificates_generated_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (zErr) {
        console.error("Auto-download zip failed:", zErr);
      }
    } else if (generatedFiles.length === 1) {
      generatedFiles[0].pdf.save(generatedFiles[0].filename);
    }

    setSelectedIds([]);
  };

  const handlePauseToggle = () => {
    setIsPaused(prev => {
      const next = !prev;
      pauseGenerationRef.current = next;
      return next;
    });
  };

  const handleCancelGeneration = () => {
    if (confirm("Are you sure you want to stop the certificate generation? Any certificates already generated will remain saved.")) {
      cancelGenerationRef.current = true;
      setIsGenerating(false);
      setIsPaused(false);
    }
  };

  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load: ' + src));
      img.src = src;
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredRecipients.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectBatch = (batchName) => {
    if (!batchName || batchName === 'all') return;
    const idsToSelect = filteredRecipients.filter(r => r.batch === batchName).map(r => r.id);
    setSelectedIds(prev => {
      const newSelection = [...prev];
      idsToSelect.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
        }
      });
      return newSelection;
    });
  };

  const uniqueProjects = ['all', ...new Set(recipients.map(r => r.project_code).filter(Boolean))];
  const uniqueBatches = ['all', ...new Set(recipients.map(r => r.batch).filter(Boolean))];

  const filteredRecipients = recipients.filter(r => {
    const matchesSearch = 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.facilitator && r.facilitator.toLowerCase().includes(searchTerm.toLowerCase())) ||
      r.cert_id.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = showOnlyCompleted ? (r.status === 'saved') : (statusFilter === 'all' || r.status === statusFilter);
    const matchesProject = projectFilter === 'all' || r.project_code === projectFilter;
    const matchesBatch = batchFilter === 'all' || r.batch === batchFilter;
    const matchesLang = langFilter === 'all' || r.language === langFilter;

    return matchesSearch && matchesStatus && matchesProject && matchesBatch && matchesLang;
  });

  const totalCount = recipients.length;
  const pendingCount = recipients.filter(r => r.status === 'pending').length;
  const generatingCount = recipients.filter(r => r.status === 'generating').length;
  const savedCount = recipients.filter(r => r.status === 'saved').length;
  const failedCount = recipients.filter(r => r.status === 'failed').length;

  const handleExportFiltered = () => {
    if (filteredRecipients.length === 0) {
      alert("No recipients to export.");
      return;
    }

    const data = filteredRecipients.map((r, index) => ({
      "No.": index + 1,
      "Certificate ID": r.cert_id,
      "Name": r.name,
      "Facilitator": r.facilitator || "",
      "Project Code": r.project_code || "",
      "Batch": r.batch || "",
      "Language": r.language === 'AR' ? 'Arabic' : 'English',
      "Status": r.status === 'saved' ? 'Generated' : r.status.toUpperCase(),
      "PDF URL": r.pdf_url || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Recipients Export");
    XLSX.writeFile(workbook, "tgh_recipients_export.xlsx");
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
            {showOnlyCompleted ? 'Completed Certificates Archive' : 'Recipients Dashboard'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {showOnlyCompleted 
              ? 'Browse, search, and batch download successfully generated PDF certificates.' 
              : 'Manage student records, import CSV coordinates, and trigger high-speed PDF generations.'}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {showOnlyCompleted ? (
            <>
              <button 
                className="btn btn-secondary" 
                onClick={handleExportFiltered} 
                disabled={filteredRecipients.length === 0}
              >
                <Download size={16} />
                Export Excel
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  const completedRows = recipients.filter(r => r.status === 'saved');
                  downloadAsZip(completedRows);
                }}
                disabled={recipients.filter(r => r.status === 'saved').length === 0 || importing}
                style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
              >
                <Download size={16} />
                Download All ZIP
              </button>
            </>
          ) : (
            <>
              <button 
                className="btn btn-secondary" 
                onClick={handleExportFiltered} 
                disabled={filteredRecipients.length === 0}
              >
                <Download size={16} />
                Export Excel
              </button>
              {recipients.length > 0 && (
                <button className="btn btn-danger" onClick={handleDeleteAll}>
                  <Trash2 size={16} />
                  Delete All
                </button>
              )}

              <button className="btn btn-secondary" onClick={() => setShowCSVModal(true)}>
                <Upload size={16} />
                Import CSV / Excel
              </button>
              
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} />
                Add Recipient
              </button>
            </>
          )}
        </div>
      </div>

      {isGenerating && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '4px solid var(--accent-indigo)', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <RefreshCw size={20} className={isPaused ? "" : "badge-generating"} style={{ color: 'var(--accent-indigo)', animation: isPaused ? 'none' : 'spin 2s linear infinite' }} />
              <span style={{ fontWeight: 600 }}>
                {isPaused ? 'Generation Paused' : 'Generating Certificates...'} ({progressIndex} of {progressTotal})
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={handlePauseToggle}
                style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.05)' }}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleCancelGeneration}
                style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              >
                Stop / Cancel
              </button>
            </div>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${(progressIndex / progressTotal) * 100}%`, 
              height: '100%', 
              background: 'var(--accent-indigo)', 
              transition: 'width 0.3s ease' 
            }} />
          </div>
        </div>
      )}

      {!sheetsClient.isConfigured && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-rose)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <ShieldAlert size={32} style={{ color: 'var(--accent-rose)' }} />
          <div>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Google Sheets API Connection Required</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              The application requires an active Google Sheets API connection. Please ensure the VITE_GOOGLE_SHEETS_API_URL variable is configured in the .env file.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
        {showOnlyCompleted ? (
          <>
            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '3px solid var(--accent-emerald)' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                <CheckCircle size={24} style={{ color: 'var(--accent-emerald)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Completed Certificates</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-emerald)' }}>{savedCount}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                <Users size={24} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Registered</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{totalCount}</div>
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                  <Clock size={24} style={{ color: 'var(--accent-amber)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pending Generation</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-amber)' }}>{pendingCount}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                <Users size={24} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Registered</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{totalCount}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                <Clock size={24} style={{ color: 'var(--accent-amber)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pending</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-amber)' }}>{pendingCount}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                <RefreshCw size={24} className={generatingCount > 0 ? "badge-generating" : ""} style={{ color: 'var(--accent-indigo)', animation: generatingCount > 0 ? 'spin 2s linear infinite' : 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Generating</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-indigo)' }}>{generatingCount}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                <CheckCircle size={24} style={{ color: 'var(--accent-emerald)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PDFs Generated</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-emerald)' }}>{savedCount}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>
                <AlertCircle size={24} style={{ color: 'var(--accent-rose)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Failed</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-rose)' }}>{failedCount}</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div className="dashboard-controls">
          
          <div className="search-wrapper">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              className="form-input search-input" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, facilitator, or cert ID..."
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!showOnlyCompleted && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                <select 
                  className="form-input" 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ padding: '0.5rem 2rem 0.5rem 0.75rem' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="generating">Generating</option>
                  <option value="saved">Generated</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            )}

            <select 
              className="form-input" 
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={{ padding: '0.5rem 2rem 0.5rem 0.75rem' }}
            >
              <option value="all">All Project Codes</option>
              {uniqueProjects.filter(p => p !== 'all').map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select 
              className="form-input" 
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              style={{ padding: '0.5rem 2rem 0.5rem 0.75rem' }}
            >
              <option value="all">All Batches</option>
              {uniqueBatches.filter(b => b !== 'all').map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            <select 
              className="form-input" 
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              style={{ padding: '0.5rem 2rem 0.5rem 0.75rem' }}
            >
              <option value="all">All Languages</option>
              <option value="EN">English</option>
              <option value="AR">Arabic</option>
            </select>

            {uniqueBatches.length > 1 && (
              <select 
                className="form-input" 
                value=""
                onChange={(e) => {
                  handleSelectBatch(e.target.value);
                  e.target.value = "";
                }}
                style={{ padding: '0.5rem 2rem 0.5rem 0.75rem', borderColor: 'var(--accent-indigo)' }}
              >
                <option value="" disabled>Select Batch Group...</option>
                {uniqueBatches.filter(b => b !== 'all').map(b => (
                  <option key={b} value={b}>Select all in: {b}</option>
                ))}
              </select>
            )}

          </div>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99,102,241,0.2)', padding: '0.75rem 1.25rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              Selected <strong style={{ color: 'var(--accent-indigo)' }}>{selectedIds.length}</strong> row(s)
            </span>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-danger" onClick={handleDeleteSelected} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                <Trash2 size={14} />
                Delete Selected
              </button>

              {recipients.some(r => selectedIds.includes(r.id) && r.status !== 'pending') && (
                <button 
                  className="btn btn-secondary" 
                  onClick={handleResetSelected} 
                  style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }}
                >
                  <RotateCcw size={14} />
                  Undo Generation
                </button>
              )}

              {recipients.some(r => selectedIds.includes(r.id) && (r.status === 'saved' || r.pdf_url)) && (
                <>
                  <button className="btn btn-secondary" onClick={() => downloadIndividually()} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }}>
                    <Download size={14} />
                    Download Single
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadAsZip()} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                    <Download size={14} />
                    Download ZIP
                  </button>
                </>
              )}
              
              {!showOnlyCompleted && (
                <button className="btn btn-accent" onClick={generateCertificates} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                  <Play size={14} />
                  Generate PDFs
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="badge-generating" style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem' }} />
            <p>Loading database records...</p>
          </div>
        ) : filteredRecipients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            No recipients match your search filters. Add some or import a CSV list.
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll}
                      checked={selectedIds.length === filteredRecipients.length && filteredRecipients.length > 0} 
                    />
                  </th>
                  <th>Certificate ID</th>
                  <th>Name</th>
                  <th>Facilitator</th>
                  <th>Project Code</th>
                  <th>Batch</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipients.map(r => {
                  const isChecked = selectedIds.includes(r.id);
                  return (
                    <tr key={r.id} style={{ background: isChecked ? 'rgba(99, 102, 241, 0.03)' : 'none' }}>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => handleSelectRow(r.id)}
                        />
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.cert_id}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>{r.facilitator || '—'}</td>
                      <td>
                        <span style={{ background: 'rgba(255,255,255,0.04)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {r.project_code || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--accent-gold)' }}>
                          {r.batch || '—'}
                        </span>
                      </td>
                      <td>{r.language === 'AR' ? 'Arabic (AR)' : 'English (EN)'}</td>
                      <td>
                        <span className={`badge badge-${r.status}`}>
                          {r.status === 'saved' ? 'Generated' : r.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                          <button 
                            type="button"
                            onClick={() => setEditingRecipient({ ...r })}
                            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' }}
                            title="Edit Participant Details"
                          >
                            <Edit2 size={16} />
                          </button>
                          {r.status === 'saved' && (
                            <button 
                              type="button"
                              onClick={() => handleDownloadSingle(r)}
                              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-gold)', display: 'inline-flex', alignItems: 'center' }}
                              title="Download Certificate PDF"
                            >
                              <Download size={16} />
                            </button>
                          )}
                          {r.pdf_url && (
                            <a href={r.pdf_url} target="_blank" rel="noreferrer" title="Open Cloud PDF">
                              <ExternalLink size={16} style={{ color: 'var(--accent-emerald)' }} />
                            </a>
                          )}
                          <a href={`/verify?id=${r.cert_id}`} target="_blank" rel="noreferrer" title="Verify Route">
                            <CheckCircle size={16} style={{ color: 'var(--accent-indigo)' }} />
                          </a>
                          {r.status !== 'pending' && (
                            <button 
                              onClick={() => handleResetStatus(r)}
                              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-amber)', display: 'inline-flex', alignItems: 'center' }}
                              title="Undo Generation (Reset to Pending)"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Recipient Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Register New Recipient</h3>
            
            <form onSubmit={handleAddRecipient}>
              <div className="form-group">
                <label className="form-label">Recipient Full Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newRecipient.name}
                  onChange={(e) => setNewRecipient(prev => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g. Osama Al-Sagheer"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Facilitator / Instructor</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newRecipient.facilitator}
                  onChange={(e) => setNewRecipient(prev => ({ ...prev, facilitator: e.target.value }))}
                  placeholder="e.g. Dr. Ahmad Salih"
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Project Code</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newRecipient.project_code}
                    onChange={(e) => setNewRecipient(prev => ({ ...prev, project_code: e.target.value }))}
                    placeholder="e.g. PRJ-2026-TGH"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Batch</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newRecipient.batch}
                    onChange={(e) => setNewRecipient(prev => ({ ...prev, batch: e.target.value }))}
                    placeholder="e.g. Batch 1"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Language</label>
                  <select 
                    className="form-input"
                    value={newRecipient.language}
                    onChange={(e) => setNewRecipient(prev => ({ ...prev, language: e.target.value }))}
                  >
                    <option value="EN">English</option>
                    <option value="AR">Arabic</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Custom Certificate ID (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newRecipient.cert_id}
                    onChange={(e) => setNewRecipient(prev => ({ ...prev, cert_id: e.target.value }))}
                    placeholder="Leave empty to auto-generate"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Recipient Modal */}
      {editingRecipient && (
        <div className="modal-overlay" onClick={() => setEditingRecipient(null)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '550px' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Edit Participant Information</h3>
            
            <form onSubmit={handleUpdateRecipient}>
              <div className="form-group">
                <label className="form-label">Recipient Full Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editingRecipient.name}
                  onChange={(e) => setEditingRecipient(prev => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g. Osama Al-Sagheer"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Facilitator / Instructor</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editingRecipient.facilitator || ''}
                  onChange={(e) => setEditingRecipient(prev => ({ ...prev, facilitator: e.target.value }))}
                  placeholder="e.g. Dr. Ahmad Salih"
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Project Code</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingRecipient.project_code || ''}
                    onChange={(e) => setEditingRecipient(prev => ({ ...prev, project_code: e.target.value }))}
                    placeholder="e.g. PRJ-2026-TGH"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Batch</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingRecipient.batch || ''}
                    onChange={(e) => setEditingRecipient(prev => ({ ...prev, batch: e.target.value }))}
                    placeholder="e.g. Batch 1"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Language</label>
                  <select 
                    className="form-input"
                    value={editingRecipient.language}
                    onChange={(e) => setEditingRecipient(prev => ({ ...prev, language: e.target.value }))}
                  >
                    <option value="EN">English</option>
                    <option value="AR">Arabic</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Certificate ID *</span>
                    <button 
                      type="button" 
                      onClick={() => setEditingRecipient(prev => ({ ...prev, cert_id: generateNextCertId(prev.project_code) }))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-gold)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      title="Regenerate Certificate ID"
                    >
                      <RotateCcw size={12} /> Regenerate
                    </button>
                  </label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingRecipient.cert_id}
                    onChange={(e) => setEditingRecipient(prev => ({ ...prev, cert_id: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingRecipient(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV/Excel Import Modal */}
      {showCSVModal && (
        <div className="modal-overlay" onClick={() => { setShowCSVModal(false); setCsvText(''); }}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.25rem' }}>Import Recipients from CSV / Excel</h3>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleDownloadTemplate}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
              >
                <Download size={12} />
                Download Excel Template
              </button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              Upload your CSV or Excel file directly, or paste your comma-separated rows below. Required header: <strong style={{ color: 'var(--text-primary)' }}>Name</strong>. Optional: <strong style={{ color: 'var(--text-primary)' }}>Facilitator, Project_Code, Language, Cert_ID</strong>.
            </p>
            
            <form onSubmit={handleCSVImport}>
              {/* File Upload Selection */}
              <div className="form-group" style={{ marginBottom: '1rem', border: '1px dashed var(--border-color)', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload size={24} style={{ color: 'var(--accent-gold)' }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Click to Upload recipient list (.csv, .xlsx, .xls)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Excel sheets (.xlsx, .xls) and CSV files are parsed automatically</span>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    onChange={handleCSVFileSelect} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>

              {/* CSV Text Editor Fallback */}
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Or paste CSV raw content here:</span>
                  {csvText.trim() && (
                    <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                      File Loaded ({csvText.replace(/\r/g, '').split('\n').filter(l => l.trim()).length - 1} row(s) detected)
                    </span>
                  )}
                </label>
                <textarea 
                  className="form-input" 
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  style={{ height: '120px', fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' }}
                  placeholder={`Name,Facilitator,Project_Code,Language,Cert_ID\nOsama Al-Sagheer,Dr. Ahmad,PRJ-2026-TGH,EN,\nسليم علي,أحمد صالح,PRJ-2026-TGH,AR,\n`}
                  required
                ></textarea>
              </div>

              {/* Live Mapping Preview */}
              {csvText.trim() && (
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Header Column Mapping Preview:</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className={`badge ${headerMapping.name !== -1 ? 'badge-saved' : 'badge-failed'}`}>
                      Name: {headerMapping.name !== -1 ? `Col ${headerMapping.name + 1} (✓ Mapped)` : 'Missing (✗ Required)'}
                    </span>
                    <span className={`badge ${headerMapping.facilitator !== -1 ? 'badge-saved' : 'badge-pending'}`} style={{ opacity: headerMapping.facilitator !== -1 ? 1 : 0.7 }}>
                      Facilitator: {headerMapping.facilitator !== -1 ? `Col ${headerMapping.facilitator + 1} (✓ Mapped)` : 'Not Found (Using empty)'}
                    </span>
                    <span className={`badge ${headerMapping.projectCode !== -1 ? 'badge-saved' : 'badge-pending'}`} style={{ opacity: headerMapping.projectCode !== -1 ? 1 : 0.7 }}>
                      Project: {headerMapping.projectCode !== -1 ? `Col ${headerMapping.projectCode + 1} (✓ Mapped)` : 'Not Found (Using empty)'}
                    </span>
                    <span className={`badge ${headerMapping.batch !== -1 ? 'badge-saved' : 'badge-pending'}`} style={{ opacity: headerMapping.batch !== -1 ? 1 : 0.7 }}>
                      Batch: {headerMapping.batch !== -1 ? `Col ${headerMapping.batch + 1} (✓ Mapped)` : 'Not Found (Using empty)'}
                    </span>
                    <span className={`badge ${headerMapping.language !== -1 ? 'badge-saved' : 'badge-pending'}`} style={{ opacity: headerMapping.language !== -1 ? 1 : 0.7 }}>
                      Language: {headerMapping.language !== -1 ? `Col ${headerMapping.language + 1} (✓ Mapped)` : 'Not Found (Default to EN)'}
                    </span>
                    <span className={`badge ${headerMapping.certId !== -1 ? 'badge-saved' : 'badge-pending'}`} style={{ opacity: headerMapping.certId !== -1 ? 1 : 0.7 }}>
                      Cert ID: {headerMapping.certId !== -1 ? `Col ${headerMapping.certId + 1} (✓ Mapped)` : 'Not Found (Auto-Gen)'}
                    </span>
                  </div>

                  {parsedPreview.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>Parsed Records Preview (Showing first 5 rows):</span>
                        <strong style={{ color: 'var(--accent-gold)' }}>Total Rows: {parsedPreview.length}</strong>
                      </div>
                      <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.75rem' }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '0.5rem', width: '40px' }}>Row</th>
                              <th style={{ padding: '0.5rem' }}>Cert ID</th>
                              <th style={{ padding: '0.5rem' }}>Name</th>
                              <th style={{ padding: '0.5rem' }}>Facilitator</th>
                              <th style={{ padding: '0.5rem' }}>Project Code</th>
                              <th style={{ padding: '0.5rem' }}>Batch</th>
                              <th style={{ padding: '0.5rem', width: '60px' }}>Lang</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedPreview.slice(0, 5).map((row, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: headerMapping.certId === -1 ? 'var(--accent-amber)' : 'inherit' }}>
                                  {row.cert_id} {headerMapping.certId === -1 && <span style={{ fontSize: '0.65rem', fontStyle: 'italic' }}>(auto)</span>}
                                </td>
                                <td style={{ padding: '0.5rem', fontWeight: 600, color: !row.name ? 'var(--accent-rose)' : 'inherit' }}>
                                  {row.name || <span style={{ fontStyle: 'italic' }}>(empty - skipped)</span>}
                                </td>
                                <td style={{ padding: '0.5rem' }}>{row.facilitator || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{row.project_code || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                <td style={{ padding: '0.5rem', color: 'var(--accent-gold)' }}>{row.batch || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                <td style={{ padding: '0.5rem' }}>{row.language}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowCSVModal(false); setCsvText(''); }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={importing || !csvText.trim() || headerMapping.name === -1 || parsedPreview.filter(p => p.name.trim()).length === 0}
                >
                  {importing ? 'Importing...' : `Parse & Ingest (${parsedPreview.filter(p => p.name.trim()).length} Rows)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
