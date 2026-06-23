import React, { useState, useEffect } from 'react';
import { nhost } from '../nhostClient';
import { CheckCircle2, XCircle, Search, ExternalLink, Download, ShieldCheck } from 'lucide-react';

const VERIFY_CERTIFICATE_QUERY = `
  query VerifyCertificate($cert_id: String!) {
    certificates(where: {cert_id: {_eq: $cert_id}}) {
      id
      cert_id
      name
      facilitator
      project_code
      status
      pdf_url
      language
      created_at
    }
  }
`;

export default function Verification() {
  const [certId, setCertId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 'verified', 'not_found', or null
  const [certData, setCertData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

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

      if (!nhost) {
        setErrorMsg('Nhost is not connected.');
        return;
      }

      const { data, error } = await nhost.graphql.request(VERIFY_CERTIFICATE_QUERY, {
        cert_id: idToVerify.trim()
      });

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }

      const list = data?.certificates || [];
      if (list.length === 0) {
        setResult('not_found');
      } else {
        setCertData(list[0]);
        setResult('verified');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('An error occurred during verification: ' + e.message);
    } finally {
      setLoading(false);
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

            {certData.pdf_url ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                <a 
                  href={certData.pdf_url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  <ExternalLink size={16} />
                  View Original Certificate PDF
                </a>
                <a 
                  href={certData.pdf_url} 
                  download 
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  <Download size={16} />
                  Download PDF
                </a>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                Note: PDF file is being generated or was deleted. Please contact administration.
              </div>
            )}
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
