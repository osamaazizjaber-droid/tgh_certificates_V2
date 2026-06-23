import React, { useState, useEffect } from 'react';
import { nhost } from '../nhostClient';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { 
  Users, CheckCircle, Clock, AlertCircle, Play, Plus, Trash2, 
  Upload, Download, Search, Filter, Database, RefreshCw, Settings, ShieldAlert,
  ExternalLink
} from 'lucide-react';

const FETCH_DATA_QUERY = `
  query FetchData {
    settings_by_pk(id: "default") {
      id
      cert_prefix
      layouts
      bg_image_en
      bg_image_ar
    }
    certificates(order_by: {created_at: desc}) {
      id
      cert_id
      name
      facilitator
      project_code
      batch
      status
      pdf_url
      language
      created_at
    }
  }
`;

const FETCH_BG_IMAGES_QUERY = `
  query FetchBgImages {
    settings_by_pk(id: "default") {
      bg_image_en
      bg_image_ar
    }
  }
`;

const INSERT_RECIPIENT_MUTATION = `
  mutation InsertRecipient($name: String!, $facilitator: String!, $project_code: String!, $batch: String!, $language: String!, $cert_id: String!) {
    insert_certificates_one(object: {
      name: $name,
      facilitator: $facilitator,
      project_code: $project_code,
      batch: $batch,
      language: $language,
      cert_id: $cert_id,
      status: "pending"
    }) {
      id
      cert_id
      name
      facilitator
      project_code
      batch
      status
      pdf_url
      language
      created_at
    }
  }
`;

const INSERT_RECIPIENTS_MUTATION = `
  mutation InsertRecipients($objects: [certificates_insert_input!]!) {
    insert_certificates(objects: $objects) {
      returning {
        id
        cert_id
        name
        facilitator
        project_code
        batch
        status
        pdf_url
        language
        created_at
      }
    }
  }
`;

const DELETE_RECIPIENTS_MUTATION = `
  mutation DeleteRecipients($ids: [uuid!]!) {
    delete_certificates(where: {id: {_in: $ids}}) {
      returning {
        id
        pdf_url
      }
    }
  }
`;

const DELETE_ALL_RECIPIENTS_MUTATION = `
  mutation DeleteAllRecipients {
    delete_certificates(where: {}) {
      returning {
        id
        pdf_url
      }
    }
  }
`;

const UPDATE_STATUS_MUTATION = `
  mutation UpdateStatus($id: uuid!, $status: String!, $pdf_url: String) {
    update_certificates_by_pk(
      pk_columns: {id: $id},
      _set: {status: $status, pdf_url: $pdf_url}
    ) {
      id
      status
      pdf_url
    }
  }
`;

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

  useEffect(() => {
    if (nhost) {
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

    const activePrefix = settings?.cert_prefix || 'TGH-KU50-';
    let nextIndex = recipients.length + 1;

    const previews = [];
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
      
      const certId = certIdIdx !== -1 && values[certIdIdx] 
        ? values[certIdIdx] 
        : `${activePrefix}${String(nextIndex++).padStart(3, '0')}`;

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
      
      const { data, error } = await nhost.graphql.request(FETCH_DATA_QUERY);
      
      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }
      
      const fetchedSettings = data?.settings_by_pk || null;
      const fetchedRecipients = data?.certificates || [];

      setSettings(fetchedSettings);
      setRecipients(fetchedRecipients);

      localStorage.setItem('tgh_settings', JSON.stringify(fetchedSettings));
      localStorage.setItem('tgh_recipients', JSON.stringify(fetchedRecipients));
    } catch (e) {
      console.error("fetchData error:", e);
      const hasCache = localStorage.getItem('tgh_recipients') && localStorage.getItem('tgh_settings');
      if (!hasCache) {
        alert('Error fetching data from Nhost: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateNextCertId = (prefix) => {
    const activePrefix = prefix || (settings?.cert_prefix) || 'TGH-KU50-';
    const count = recipients.length + 1;
    return `${activePrefix}${String(count).padStart(3, '0')}`;
  };

  const handleAddRecipient = async (e) => {
    e.preventDefault();
    try {
      const finalCertId = newRecipient.cert_id.trim() || generateNextCertId();
      
      const { data, error } = await nhost.graphql.request(INSERT_RECIPIENT_MUTATION, {
        name: newRecipient.name.trim(),
        facilitator: newRecipient.facilitator.trim(),
        project_code: newRecipient.project_code.trim(),
        batch: newRecipient.batch.trim(),
        language: newRecipient.language,
        cert_id: finalCertId
      });

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }
      
      const inserted = data?.insert_certificates_one;
      if (inserted) {
        setRecipients(prev => [inserted, ...prev]);
      }
      setShowAddModal(false);
      setNewRecipient({ name: '', facilitator: '', project_code: '', batch: '', language: 'EN', cert_id: '' });
    } catch (e) {
      console.error(e);
      alert('Error inserting recipient: ' + e.message);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "Name,Facilitator,Project_Code,Batch,Language,Cert_ID\nOsama Al-Sagheer,Dr. Ahmad,PRJ-2026-TGH,Batch 1,EN,\nسليم علي,أحمد صالح,PRJ-2026-TGH,Batch 1,AR,\n";
    // Adding UTF-8 BOM (\ufeff) to make Arabic open correctly in Excel
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "tgh_recipients_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCSVFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result);
    };
    reader.readAsText(file);
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
        name: r.name.trim(),
        facilitator: r.facilitator.trim(),
        project_code: r.project_code.trim(),
        batch: r.batch.trim(),
        language: r.language,
        cert_id: r.cert_id.trim(),
        status: 'pending'
      }));

      const { data, error } = await nhost.graphql.request(INSERT_RECIPIENTS_MUTATION, {
        objects
      });

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }
      
      const insertedList = data?.insert_certificates?.returning || [];
      setRecipients(prev => [...insertedList, ...prev]);
      setShowCSVModal(false);
      setCsvText('');
      alert(`Imported ${insertedList.length} records successfully!`);
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
      const { data, error } = await nhost.graphql.request(DELETE_RECIPIENTS_MUTATION, {
        ids: selectedIds
      });

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }

      const deletedRows = data?.delete_certificates?.returning || [];
      setRecipients(prev => prev.filter(r => !selectedIds.includes(r.id)));
      setSelectedIds([]);
      
      for (const row of deletedRows) {
        if (row.pdf_url) {
          const parts = row.pdf_url.split('/v1/files/');
          const fileId = parts.length > 1 ? parts[1] : null;
          if (fileId) {
            await nhost.storage.delete({ fileId });
          }
        }
      }
    } catch (e) {
      console.error(e);
      alert('Delete failed: ' + e.message);
    }
  };

  const handleDeleteAll = async () => {
    if (recipients.length === 0) return;
    if (!confirm(`WARNING: Are you sure you want to delete ALL ${recipients.length} recipient records? This will permanently delete them from the database and remove all associated PDF certificates from storage.`)) return;
    
    const confirmPhrase = prompt('To confirm deletion of all records, please type DELETE below:');
    if (confirmPhrase !== 'DELETE') {
      alert('Deletion cancelled. Confirmation phrase did not match.');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await nhost.graphql.request(DELETE_ALL_RECIPIENTS_MUTATION);

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }

      const deletedRows = data?.delete_certificates?.returning || [];
      setRecipients([]);
      setSelectedIds([]);
      
      // Delete all generated PDFs in storage
      for (const row of deletedRows) {
        if (row.pdf_url) {
          const parts = row.pdf_url.split('/v1/files/');
          const fileId = parts.length > 1 ? parts[1] : null;
          if (fileId) {
            try {
              await nhost.storage.delete({ fileId });
            } catch (storageErr) {
              console.error(`Failed to delete storage file ${fileId}:`, storageErr);
            }
          }
        }
      }
      alert('All recipient records and storage files have been deleted successfully!');
    } catch (e) {
      console.error(e);
      alert('Delete All failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadAsZip = async (rowsToDownload) => {
    const targetRows = Array.isArray(rowsToDownload)
      ? rowsToDownload
      : recipients.filter(r => selectedIds.includes(r.id) && r.pdf_url);

    if (targetRows.length === 0) {
      alert("No generated PDFs found to download.");
      return;
    }

    try {
      setImporting(true);
      const zip = new JSZip();
      
      for (const row of targetRows) {
        // Fetch binary data from the S3/Nhost storage URL
        const response = await fetch(row.pdf_url);
        if (!response.ok) throw new Error(`Failed to download certificate for: ${row.name}`);
        const blob = await response.blob();
        
        // Clean filename (remove characters invalid in Windows/macOS filenames)
        const safeName = row.name.replace(/[/\\?%*:|"<>]/g, '-').trim();
        const filename = `${row.cert_id}_${safeName}.pdf`;
        
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
      : recipients.filter(r => selectedIds.includes(r.id) && r.pdf_url);

    if (targetRows.length === 0) {
      alert("No generated PDFs found to download.");
      return;
    }
    
    for (const row of targetRows) {
      const link = document.createElement("a");
      link.href = row.pdf_url;
      link.target = "_blank";
      link.download = `${row.cert_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Delay slightly between downloads so browser doesn't block them as popup spam
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };



  const generateCertificates = async () => {
    console.log("generateCertificates: function triggered.");
    console.log("generateCertificates: selectedIds =", selectedIds);
    console.log("generateCertificates: recipients count =", recipients.length);

    if (selectedIds.length === 0) {
      console.warn("generateCertificates: selectedIds is empty, returning.");
      return;
    }
    if (!settings) {
      console.error("generateCertificates: settings is null/undefined.");
      alert('Certificate layout settings are missing! Configure templates in the Designer tab.');
      return;
    }

    if (!settings.bg_image_en && !settings.bg_image_ar) {
      console.error("generateCertificates: background images are missing from settings config.");
      alert("Template background images are missing! Please upload and save them in the Designer tab.");
      return;
    }

    const selectedRows = recipients.filter(r => selectedIds.includes(r.id));
    console.log("generateCertificates: filtered selectedRows =", selectedRows);
    
    for (const row of selectedRows) {
      console.log(`generateCertificates: starting generation for ${row.name} (id: ${row.id}, cert_id: ${row.cert_id})`);
      setProcessingRows(prev => ({ ...prev, [row.id]: 'generating' }));
      
      await nhost.graphql.request(UPDATE_STATUS_MUTATION, {
        id: row.id,
        status: 'generating',
        pdf_url: row.pdf_url
      });
        
      setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'generating' } : r));

      try {
        const layout = settings.layouts[row.language.toLowerCase()];
        const bgImage = row.language.toLowerCase() === 'en' ? settings.bg_image_en : settings.bg_image_ar;

        if (!bgImage) {
          throw new Error('Template background image is missing for ' + row.language);
        }

        const scale = 3.0;
        const canvas = document.createElement('canvas');
        canvas.width = 800 * scale;
        canvas.height = 565 * scale;
        const ctx = canvas.getContext('2d');

        console.log(`generateCertificates: loading template background image for ${row.name}`);
        // Append cache-busting query parameter to bypass browser CORS cache wildcard bug
        const corsBgUrl = bgImage + (bgImage.includes('?') ? '&' : '?') + 'nocache=' + Date.now();
        const bgImg = await loadImage(corsBgUrl);
        ctx.drawImage(bgImg, 0, 0, 800 * scale, 565 * scale);

        // Recipient Name (Centered)
        console.log(`generateCertificates: drawing recipient name: ${row.name}`);
        ctx.fillStyle = layout.name.color || '#1a1d24';
        const fontSizeScaled = parseFloat(layout.name.fontSize || 32) * scale;
        ctx.font = `${layout.name.fontWeight || 'bold'} ${fontSizeScaled}px ${layout.name.fontFamily || 'Outfit'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(row.name, layout.name.x * scale, layout.name.y * scale);

        // Verification URL QR Code
        const verifyUrl = `${window.location.protocol}//${window.location.host}/verify?id=${encodeURIComponent(row.cert_id)}`;
        console.log(`generateCertificates: creating QR Code for URL: ${verifyUrl}`);
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
        console.log(`generateCertificates: converting canvas to PDF blob for ${row.name}`);
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [800, 565]
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 800, 565);
        const pdfBlob = pdf.output('blob');

        // Prepare file upload to Nhost Storage
        const fileObj = new File([pdfBlob], `${row.cert_id}.pdf`, { type: 'application/pdf' });
        console.log(`generateCertificates: uploading PDF to Nhost Storage for ${row.name}`);
        const uploadRes = await nhost.storage.upload({
          file: fileObj,
          bucketId: 'default'
        });

        if (uploadRes.error) throw uploadRes.error;
        
        const fileId = uploadRes.fileMetadata.id;
        const publicUrl = nhost.storage.getPublicUrl({ fileId });
        console.log(`generateCertificates: PDF uploaded successfully, url: ${publicUrl}`);

        // Update database row status and link
        const { error: dbUpdateError } = await nhost.graphql.request(UPDATE_STATUS_MUTATION, {
          id: row.id,
          status: 'saved',
          pdf_url: publicUrl
        });

        if (dbUpdateError) {
          const errMsg = Array.isArray(dbUpdateError) ? dbUpdateError.map(e => e.message).join(', ') : dbUpdateError.message;
          throw new Error(errMsg);
        }

        setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'saved', pdf_url: publicUrl } : r));
        setProcessingRows(prev => ({ ...prev, [row.id]: 'success' }));
      } catch (err) {
        console.error("Failed to generate for: " + row.name, err);
        
        await nhost.graphql.request(UPDATE_STATUS_MUTATION, {
          id: row.id,
          status: 'failed',
          pdf_url: row.pdf_url
        });
          
        setRecipients(prev => prev.map(r => r.id === row.id ? { ...r, status: 'failed' } : r));
        setProcessingRows(prev => ({ ...prev, [row.id]: 'error' }));
      }
    }
    
    setSelectedIds([]);
  };

  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
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
          ) : (
            <>
              {recipients.length > 0 && (
                <button className="btn btn-danger" onClick={handleDeleteAll}>
                  <Trash2 size={16} />
                  Delete All
                </button>
              )}

              <button className="btn btn-secondary" onClick={() => setShowCSVModal(true)}>
                <Upload size={16} />
                Import CSV
              </button>
              
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} />
                Add Recipient
              </button>
            </>
          )}
        </div>
      </div>

      {!nhost && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-rose)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <ShieldAlert size={32} style={{ color: 'var(--accent-rose)' }} />
          <div>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Nhost Connection Required</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              The application requires an active Nhost backend connection. Please ensure the VITE_NHOST_SUBDOMAIN and VITE_NHOST_REGION variables are configured in the .env file.
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

              {recipients.some(r => selectedIds.includes(r.id) && r.pdf_url) && (
                <>
                  <button className="btn btn-secondary" onClick={downloadIndividually} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }}>
                    <Download size={14} />
                    Download Single
                  </button>
                  <button className="btn btn-secondary" onClick={downloadAsZip} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
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
                  <th>Link</th>
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
                        {r.pdf_url ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <a href={r.pdf_url} target="_blank" rel="noreferrer" title="Open PDF">
                              <ExternalLink size={16} style={{ color: 'var(--accent-gold)' }} />
                            </a>
                            <a href={`/verify?id=${r.cert_id}`} target="_blank" rel="noreferrer" title="Verify Route">
                              <CheckCircle size={16} style={{ color: 'var(--accent-indigo)' }} />
                            </a>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
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

      {/* CSV Import Modal */}
      {showCSVModal && (
        <div className="modal-overlay" onClick={() => { setShowCSVModal(false); setCsvText(''); }}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.25rem' }}>Import Recipients from CSV</h3>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleDownloadTemplate}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
              >
                <Download size={12} />
                Download CSV Template
              </button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              Upload your CSV file directly, or paste your comma-separated rows below. Required header: <strong style={{ color: 'var(--text-primary)' }}>Name</strong>. Optional: <strong style={{ color: 'var(--text-primary)' }}>Facilitator, Project_Code, Language, Cert_ID</strong>.
            </p>
            
            <form onSubmit={handleCSVImport}>
              {/* File Upload Selection */}
              <div className="form-group" style={{ marginBottom: '1rem', border: '1px dashed var(--border-color)', padding: '1rem', borderRadius: '6px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload size={24} style={{ color: 'var(--accent-gold)' }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Click to Upload recipient list (.csv)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Excel sheets can be exported as comma-separated CSV files</span>
                  <input 
                    type="file" 
                    accept=".csv" 
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
