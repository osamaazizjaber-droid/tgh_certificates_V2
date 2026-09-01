import React, { useState, useEffect } from 'react';
import sheetsClient from '../sheetsClient';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { CheckCircle2, XCircle, Search, ExternalLink, Download, ShieldCheck } from 'lucide-react';

export default function Verification() {
  const [certId, setCertId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 'verified', 'not_found', or null
  const [certData, setCertData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id') || params.get('certId');
    if (idParam) {
      setCertId(idParam);
      verifyCertificate(idParam);
    }
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (certId.trim()) {
      const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${encodeURIComponent(certId.trim())}`;
      window.history.pushState({ path: newUrl }, '', newUrl);
      verifyCertificate(certId.trim());
    }
  };

  const verifyCertificate = async (idToVerify) => {
    try {
      setLoading(true);
      setResult(null);
      setCertData(null);
      setErrorMsg('');

      if (!sheetsClient.isConfigured) {
        setErrorMsg('Google Sheets database is not configured.');
        return;
      }

      const res = await sheetsClient.verifyCertificate(idToVerify.trim());

      if (res.error) {
        throw new Error(res.error);
      }

      if (!res.certificate) {
        setResult('not_found');
      } else {
        setCertData(res.certificate);
        setResult('verified');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('An error occurred during verification: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!certData) return;
    try {
      setDownloadingPdf(true);
      if (certData.pdf_url && !certData.pdf_url.includes('nhost.run')) {
        window.open(certData.pdf_url, '_blank');
        return;
      }

      const settings = await sheetsClient.getSettings();
      const layout = settings?.layouts?.[certData.language?.toLowerCase()] || settings?.layouts?.en;
      const isAr = certData.language?.toUpperCase() === 'AR';
      const bgUrl = isAr ? (settings?.bg_image_ar || '/templates/certificate_ar.png') : (settings?.bg_image_en || '/templates/certificate_en.png');
      const safeBgUrl = (!bgUrl || bgUrl.includes('nhost.run')) ? (isAr ? '/templates/certificate_ar.png' : '/templates/certificate_en.png') : bgUrl;

      const img = new Image();
      if (safeBgUrl.startsWith('http://') || safeBgUrl.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => {
          img.onload = res;
          img.onerror = rej;
          img.src = isAr ? '/templates/certificate_ar.png' : '/templates/certificate_en.png';
        };
        img.src = safeBgUrl;
      });

      const scale = 3.0;
      const canvas = document.createElement('canvas');
      canvas.width = 800 * scale;
      canvas.height = 565 * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 800 * scale, 565 * scale);

      ctx.fillStyle = layout?.name?.color || '#1a1d24';
      const fontSizeScaled = parseFloat(layout?.name?.fontSize || 32) * scale;
      ctx.font = `${layout?.name?.fontWeight || 'bold'} ${fontSizeScaled}px ${layout?.name?.fontFamily || 'Outfit'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(certData.name, (layout?.name?.x || 400) * scale, (layout?.name?.y || 260) * scale);

      const verifyUrl = window.location.href;
      const qrSizeScaled = parseFloat(layout?.qrCode?.size || 100) * scale;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: qrSizeScaled });
      const qrImg = new Image();
      await new Promise(res => { qrImg.onload = res; qrImg.src = qrDataUrl; });
      ctx.drawImage(qrImg, (layout?.qrCode?.x || 650) * scale, (layout?.qrCode?.y || 450) * scale, qrSizeScaled, qrSizeScaled);

      ctx.fillStyle = layout?.name?.color || '#1a1d24';
      const labelFontSize = 10 * scale;
      const labelFontFamily = isAr ? 'Cairo' : 'Outfit';
      ctx.font = `600 ${labelFontSize}px ${labelFontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelText = isAr ? 'امسح هنا للتحقق' : 'Scan here to verify';
      const labelX = (parseFloat(layout?.qrCode?.x || 650) + parseFloat(layout?.qrCode?.size || 100) / 2) * scale;
      const labelY = (parseFloat(layout?.qrCode?.y || 450) + parseFloat(layout?.qrCode?.size || 100) + 8) * scale;
      ctx.fillText(labelText, labelX, labelY);

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [800, 565]
      });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 800, 565);
      const safeName = (certData.name || 'Certificate').replace(/[/\\?%*:|"<>]/g, '-').trim();
      pdf.save(`${certData.cert_id}_${safeName}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Error generating certificate PDF: " + e.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="verify-container">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', maxWidth: '500px' }}>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <ShieldCheck size={28} style={{ color: 'var(--accent-gold)' }} />
            <h1 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>
              TGH <span className="text-gold">Verify</span>
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            NGO Certificate Authenticity & Validation Registry
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div className="search-wrapper" style={{ margin: 0 }}>
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                className="form-input search-input" 
                value={certId} 
                onChange={(e) => setCertId(e.target.value)}
                placeholder="Enter Certificate ID"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              Verify
            </button>
          </div>
        </form>

        {loading && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
            <div className="badge-generating" style={{ display: 'inline-block', animation: 'pulse 1.5s infinite', fontSize: '1.125rem', fontWeight: 600 }}>
              Searching database...
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-rose)', color: 'var(--accent-rose)' }}>
            {errorMsg}
          </div>
        )}

        {result === 'verified' && certData && (
          <div className="glass-panel glass-panel-glow verify-card" style={{ borderTop: '4px solid var(--accent-emerald)' }}>
            <div className="verify-icon-badge verify-success-badge">
              <CheckCircle2 size={48} />
            </div>
            
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Certificate Verified</h2>
              <p style={{ color: 'var(--accent-emerald)', fontSize: '0.875rem', fontWeight: 600 }}>
                This is an authentic TGH certificate.
              </p>
            </div>

            <div className="verify-details">
              <div className="verify-row">
                <span className="verify-label">Recipient Name</span>
                <span className="verify-value" style={{ fontSize: '1rem', color: 'var(--accent-gold)' }}>{certData.name}</span>
              </div>
              
              <div className="verify-row">
                <span className="verify-label">Facilitator</span>
                <span className="verify-value">{certData.facilitator || '—'}</span>
              </div>

              {certData.project_code && (
                <div className="verify-row">
                  <span className="verify-label">Project Code</span>
                  <span className="verify-value" style={{ fontFamily: 'monospace' }}>{certData.project_code}</span>
                </div>
              )}

              <div className="verify-row">
                <span className="verify-label">Certificate ID</span>
                <span className="verify-value" style={{ fontFamily: 'monospace' }}>{certData.cert_id}</span>
              </div>

              <div className="verify-row">
                <span className="verify-label">Language</span>
                <span className="verify-value">{certData.language === 'AR' ? 'Arabic' : 'English'}</span>
              </div>

              <div className="verify-row">
                <span className="verify-label">Date Issued</span>
                <span className="verify-value">
                  {new Date(certData.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <button 
                type="button" 
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                <Download size={16} />
                {downloadingPdf ? 'Generating PDF...' : 'Download Official Certificate PDF'}
              </button>
              {certData.pdf_url && !certData.pdf_url.includes('nhost.run') && (
                <a 
                  href={certData.pdf_url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  <ExternalLink size={16} />
                  Open Cloud Link
                </a>
              )}
            </div>
          </div>
        )}

        {result === 'not_found' && (
          <div className="glass-panel verify-card" style={{ borderTop: '4px solid var(--accent-rose)' }}>
            <div className="verify-icon-badge verify-failed-badge">
              <XCircle size={48} />
            </div>

            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Verification Failed</h2>
              <p style={{ color: 'var(--accent-rose)', fontSize: '0.875rem', fontWeight: 600 }}>
                Certificate Not Found
              </p>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.5' }}>
              The certificate code <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>"{certId}"</strong> was not found in our database. 
              Please check the Certificate ID spelling and try again.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
