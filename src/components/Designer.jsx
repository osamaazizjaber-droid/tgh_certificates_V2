import React, { useState, useEffect, useRef } from 'react';
import { nhost } from '../nhostClient';
import { Save, RefreshCw, Upload, Image as ImageIcon, Settings, Languages, Maximize2 } from 'lucide-react';

const GET_SETTINGS_QUERY = `
  query GetSettings {
    settings_by_pk(id: "default") {
      id
      cert_prefix
      layouts
      bg_image_en
      bg_image_ar
    }
  }
`;

const UPSERT_SETTINGS_MUTATION = `
  mutation UpsertSettings($id: String!, $cert_prefix: String!, $bg_image_en: String, $bg_image_ar: String, $layouts: jsonb!) {
    insert_settings_one(
      object: {
        id: $id,
        cert_prefix: $cert_prefix,
        bg_image_en: $bg_image_en,
        bg_image_ar: $bg_image_ar,
        layouts: $layouts
      },
      on_conflict: {
        constraint: settings_pkey,
        update_columns: [cert_prefix, bg_image_en, bg_image_ar, layouts]
      }
    ) {
      id
    }
  }
`;

export default function Designer() {
  const [config, setConfig] = useState(() => {
    try {
      const cached = localStorage.getItem('tgh_settings');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [lang, setLang] = useState('en'); // 'en' or 'ar'
  const [selectedNode, setSelectedNode] = useState(null); // 'name' or 'qrCode'
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('tgh_settings');
      return !cached;
    } catch {
      return true;
    }
  });
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  const canvasRef = useRef(null);
  const canvasAreaRef = useRef(null);
  const [designerScale, setDesignerScale] = useState(1);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const nodeStartPos = useRef({ x: 0, y: 0 });

  const defaultLayouts = {
    en: {
      name: { x: 400, y: 260, fontSize: 32, color: '#1a1d24', fontWeight: 'bold', fontFamily: 'Outfit' },
      qrCode: { x: 650, y: 440, size: 90 }
    },
    ar: {
      name: { x: 400, y: 260, fontSize: 32, color: '#1a1d24', fontWeight: 'bold', fontFamily: 'Cairo' },
      qrCode: { x: 80, y: 440, size: 90 }
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!canvasAreaRef.current) return;
    
    const updateScale = () => {
      const rect = canvasAreaRef.current.getBoundingClientRect();
      const availWidth = rect.width - 48; // 24px padding on each side
      const availHeight = rect.height - 48;
      
      const scaleW = availWidth / 800;
      const scaleH = availHeight / 565;
      const newScale = Math.min(scaleW, scaleH, 1); // Don't scale up past 100%
      setDesignerScale(newScale);
    };

    updateScale();
    
    const observer = new ResizeObserver(updateScale);
    observer.observe(canvasAreaRef.current);
    
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [loading]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedNode || !config) return;
      
      // Don't nudge elements if the user is typing inside an input field
      if (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'SELECT' || 
        document.activeElement.tagName === 'TEXTAREA'
      ) {
        return;
      }

      let step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowUp') {
        dy = -step;
      } else if (e.key === 'ArrowDown') {
        dy = step;
      } else if (e.key === 'ArrowLeft') {
        dx = -step;
      } else if (e.key === 'ArrowRight') {
        dx = step;
      } else {
        return; // Ignore non-arrow keys
      }

      e.preventDefault();

      const currentLayout = config.layouts[lang][selectedNode];
      const newX = currentLayout.x + dx;
      const newY = currentLayout.y + dy;

      updateLayoutValue(selectedNode, 'x', newX);
      updateLayoutValue(selectedNode, 'y', newY);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNode, config, lang]);

  const fetchSettings = async () => {
    try {
      const hasCache = localStorage.getItem('tgh_settings');
      if (!hasCache) {
        setLoading(true);
      }
      if (!nhost) {
        setStatusMsg('Nhost is not connected. Check environment variables in .env file.');
        setLoading(false);
        return;
      }

      const { data, error } = await nhost.graphql.request(GET_SETTINGS_QUERY);

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }

      const settingsData = data?.settings_by_pk;
      let finalConfig = null;
      if (settingsData) {
        const mergedLayouts = {
          en: { ...defaultLayouts.en, ...(settingsData.layouts?.en || {}) },
          ar: { ...defaultLayouts.ar, ...(settingsData.layouts?.ar || {}) }
        };
        finalConfig = {
          ...settingsData,
          bg_image_en: settingsData.bg_image_en || '',
          bg_image_ar: settingsData.bg_image_ar || '',
          layouts: mergedLayouts
        };
      } else {
        finalConfig = {
          id: 'default',
          cert_prefix: 'TGH-KU50-',
          bg_image_en: '',
          bg_image_ar: '',
          layouts: defaultLayouts
        };
      }

      setConfig(finalConfig);
      localStorage.setItem('tgh_settings', JSON.stringify(finalConfig));
    } catch (e) {
      console.error(e);
      const hasCache = localStorage.getItem('tgh_settings');
      if (!hasCache) {
        setStatusMsg('Failed to load settings: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setStatusMsg('');
      if (!nhost) {
        alert('Nhost client is not connected!');
        setSaving(false);
        return;
      }

      const { error } = await nhost.graphql.request(UPSERT_SETTINGS_MUTATION, {
        id: config.id,
        cert_prefix: config.cert_prefix,
        bg_image_en: config.bg_image_en || '',
        bg_image_ar: config.bg_image_ar || '',
        layouts: config.layouts
      });

      if (error) {
        const errMsg = Array.isArray(error) ? error.map(e => e.message).join(', ') : error.message;
        throw new Error(errMsg);
      }
      setStatusMsg('Settings saved successfully! ✅');
      localStorage.setItem('tgh_settings', JSON.stringify(config));
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (e) {
      console.error(e);
      setStatusMsg('Failed to save settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateLayoutValue = (node, key, value) => {
    setConfig(prev => {
      const updatedLayouts = { ...prev.layouts };
      updatedLayouts[lang] = {
        ...updatedLayouts[lang],
        [node]: {
          ...updatedLayouts[lang][node],
          [key]: value
        }
      };
      return { ...prev, layouts: updatedLayouts };
    });
  };

  const handleImageUpload = async (langType, e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      setStatusMsg('Uploading template image to storage...');
      const uploadRes = await nhost.storage.upload({
        file: file,
        bucketId: 'default'
      });
      
      if (uploadRes.error) {
        throw uploadRes.error;
      }
      
      const fileId = uploadRes.fileMetadata.id;
      const publicUrl = nhost.storage.getPublicUrl({ fileId });
      
      setConfig(prev => ({
        ...prev,
        [langType === 'en' ? 'bg_image_en' : 'bg_image_ar']: publicUrl
      }));
      setStatusMsg('Template background updated! ✅');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      console.error("Failed to upload background template:", err);
      setStatusMsg('Upload failed: ' + err.message);
    }
  };

  const handleMouseDown = (node, e) => {
    setSelectedNode(node);
    const canvasBounds = canvasRef.current.getBoundingClientRect();
    
    const scaleX = 800 / canvasBounds.width;
    const scaleY = 565 / canvasBounds.height;
    
    dragStartPos.current = {
      x: e.clientX * scaleX,
      y: e.clientY * scaleY
    };
    
    const currentLayout = config.layouts[lang][node];
    nodeStartPos.current = {
      x: currentLayout.x,
      y: currentLayout.y
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (!selectedNode || !canvasRef.current) return;
    
    const canvasBounds = canvasRef.current.getBoundingClientRect();
    const scaleX = 800 / canvasBounds.width;
    const scaleY = 565 / canvasBounds.height;
    
    const currentMouseX = e.clientX * scaleX;
    const currentMouseY = e.clientY * scaleY;
    
    const deltaX = currentMouseX - dragStartPos.current.x;
    const deltaY = currentMouseY - dragStartPos.current.y;
    
    let newX = Math.round(nodeStartPos.current.x + deltaX);
    let newY = Math.round(nodeStartPos.current.y + deltaY);
    
    newX = Math.max(0, Math.min(800, newX));
    newY = Math.max(0, Math.min(565, newY));
    
    setConfig(prev => {
      const updatedLayouts = { ...prev.layouts };
      updatedLayouts[lang] = {
        ...updatedLayouts[lang],
        [selectedNode]: {
          ...updatedLayouts[lang][selectedNode],
          x: newX,
          y: newY
        }
      };
      return { ...prev, layouts: updatedLayouts };
    });
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <RefreshCw size={36} className="badge-generating" style={{ animation: 'spin 2s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading designer settings...</p>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent-rose)' }}>{statusMsg || 'Error: Settings config is unavailable.'}</p>
      </div>
    );
  }

  const currentLayout = config.layouts[lang];
  const bgImage = lang === 'en' ? config.bg_image_en : config.bg_image_ar;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Certificate Designer</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Position items visually on the template canvas or tweak metrics in the sidebar.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {statusMsg && (
            <span style={{ fontSize: '0.875rem', color: statusMsg.includes('successfully') ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
              {statusMsg}
            </span>
          )}
          
          <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Layout'}
          </button>
        </div>
      </div>

      <div className="designer-grid">
        <div className="canvas-area" ref={canvasAreaRef}>
          <div style={{ position: 'absolute', top: '1rem', left: '1rem', display: 'flex', gap: '0.5rem', zIndex: 10 }}>
            <button 
              className={`btn btn-secondary ${lang === 'en' ? 'active' : ''}`} 
              onClick={() => { setLang('en'); setSelectedNode(null); }}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Languages size={12} />
              English Version
            </button>
            <button 
              className={`btn btn-secondary ${lang === 'ar' ? 'active' : ''}`} 
              onClick={() => { setLang('ar'); setSelectedNode(null); }}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Languages size={12} />
              Arabic Version
            </button>
          </div>

          <div style={{
            width: `${800 * designerScale}px`,
            height: `${565 * designerScale}px`,
            position: 'relative',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            backgroundColor: '#fff'
          }}>
            <div 
              ref={canvasRef}
              className="certificate-canvas-container"
              style={{ 
                width: '800px', 
                height: '565px',
                backgroundImage: bgImage ? `url(${bgImage})` : 'none',
                backgroundSize: '100% 100%',
                backgroundColor: '#fff',
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${designerScale})`,
                transformOrigin: 'top left',
                maxWidth: 'none',
                boxShadow: 'none'
              }}
            >
            {!bgImage && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', gap: '1rem' }}>
                <ImageIcon size={48} strokeWidth={1} />
                <span style={{ fontSize: '0.875rem' }}>No background template uploaded. Use sidebar to upload.</span>
              </div>
            )}

            {/* Recipient Name Node */}
            <div 
              className={`editor-node ${selectedNode === 'name' ? 'selected' : ''}`}
              onMouseDown={(e) => handleMouseDown('name', e)}
              style={{
                left: `${currentLayout.name.x}px`,
                top: `${currentLayout.name.y}px`,
                fontSize: `${currentLayout.name.fontSize}px`,
                color: currentLayout.name.color || '#1a1d24',
                fontWeight: currentLayout.name.fontWeight || 'bold',
                fontFamily: currentLayout.name.fontFamily || 'Outfit',
                transform: 'translate(-50%, -50%)',
              }}
            >
              [Recipient Full Name]
            </div>

            {/* QR Code Placeholder Box */}
            <div 
              className={`editor-node ${selectedNode === 'qrCode' ? 'selected' : ''}`}
              onMouseDown={(e) => handleMouseDown('qrCode', e)}
              style={{
                left: `${currentLayout.qrCode.x}px`,
                top: `${currentLayout.qrCode.y}px`,
                width: `${currentLayout.qrCode.size}px`,
                height: `${currentLayout.qrCode.size}px`,
                border: '2px dashed var(--accent-gold)',
                background: 'rgba(212, 175, 55, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              <Maximize2 size={24} style={{ color: 'var(--accent-gold)' }} />
              <span style={{ fontSize: '9px', color: 'var(--accent-gold)', fontWeight: 'bold', marginTop: '4px' }}>QR Code</span>
              
              {/* Text helper under the QR Code box */}
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '8px',
                fontSize: '10px',
                fontWeight: 600,
                color: currentLayout.name.color || '#1a1d24',
                fontFamily: lang === 'ar' ? 'Cairo' : 'Outfit',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}>
                {lang === 'ar' ? 'امسح هنا للتحقق' : 'Scan here to verify'}
              </div>
            </div>

          </div>
          </div>
        </div>

        <div className="designer-sidebar">
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Settings size={16} style={{ color: 'var(--accent-gold)' }} />
              General Config
            </h3>
            
            <div className="form-group">
              <label className="form-label">Certificate ID Prefix</label>
              <input 
                type="text" 
                className="form-input" 
                value={config.cert_prefix || ''} 
                onChange={(e) => setConfig(prev => ({ ...prev, cert_prefix: e.target.value }))}
                placeholder="e.g. TGH-KU50-"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Background Template ({lang.toUpperCase()})</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                  <Upload size={12} />
                  Choose File
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => handleImageUpload(lang, e)} 
                    style={{ display: 'none' }} 
                  />
                </label>
                {bgImage && (
                  <button 
                    className="btn btn-danger" 
                    onClick={() => setConfig(prev => ({ ...prev, [lang === 'en' ? 'bg_image_en' : 'bg_image_ar']: '' }))}
                    style={{ padding: '0.5rem' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem', flexGrow: 1 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Element Tweaker</h3>
            
            {!selectedNode ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Click on any item on the canvas to edit its properties.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', textTransform: 'capitalize', fontSize: '0.875rem', color: 'var(--accent-gold)' }}>
                    Selected: {selectedNode}
                  </span>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setSelectedNode(null)} 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7' }}
                  >
                    Deselect
                  </button>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="form-label">X Coordinate</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{currentLayout[selectedNode].x}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="800" 
                    value={currentLayout[selectedNode].x}
                    onChange={(e) => updateLayoutValue(selectedNode, 'x', Number(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="form-label">Y Coordinate</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{currentLayout[selectedNode].y}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="565" 
                    value={currentLayout[selectedNode].y}
                    onChange={(e) => updateLayoutValue(selectedNode, 'y', Number(e.target.value))}
                  />
                </div>

                {selectedNode === 'name' && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label className="form-label">Font Size</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{currentLayout[selectedNode].fontSize}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="8" 
                      max="72" 
                      value={currentLayout[selectedNode].fontSize}
                      onChange={(e) => updateLayoutValue(selectedNode, 'fontSize', Number(e.target.value))}
                    />
                  </div>
                )}

                {selectedNode === 'qrCode' && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label className="form-label">QR Box Size</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{currentLayout.qrCode.size}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="40" 
                      max="200" 
                      value={currentLayout.qrCode.size}
                      onChange={(e) => updateLayoutValue(selectedNode, 'size', Number(e.target.value))}
                    />
                  </div>
                )}

                {selectedNode === 'name' && (
                  <div className="form-group">
                    <label className="form-label">Hex Color</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="color" 
                        value={currentLayout[selectedNode].color || '#000000'}
                        onChange={(e) => updateLayoutValue(selectedNode, 'color', e.target.value)}
                        style={{ border: 'none', background: 'none', width: '32px', height: '32px', padding: 0, cursor: 'pointer' }}
                      />
                      <input 
                        type="text" 
                        className="form-input" 
                        value={currentLayout[selectedNode].color || ''}
                        onChange={(e) => updateLayoutValue(selectedNode, 'color', e.target.value)}
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                )}

                {selectedNode === 'name' && (
                  <div className="form-group">
                    <label className="form-label">Font Family</label>
                    <select 
                      className="form-input" 
                      value={currentLayout[selectedNode].fontFamily || 'Outfit'}
                      onChange={(e) => updateLayoutValue(selectedNode, 'fontFamily', e.target.value)}
                    >
                      <optgroup label="English Fonts">
                        <option value="Outfit">Outfit (Clean Sans)</option>
                        <option value="Inter">Inter (Neutral Sans)</option>
                        <option value="Montserrat">Montserrat (Geometric Sans)</option>
                        <option value="Playfair Display">Playfair Display (Elegant Serif)</option>
                        <option value="Cormorant Garamond">Cormorant Garamond (Refined Garamond)</option>
                        <option value="Lora">Lora (Modern Serif)</option>
                        <option value="Cinzel">Cinzel (Roman Display)</option>
                        <option value="Cinzel Decorative">Cinzel Decorative (Roman Swashes)</option>
                        <option value="Bodoni Moda">Bodoni Moda (High Contrast Serif)</option>
                        <option value="Prata">Prata (Elegant Didone Serif)</option>
                        <option value="Italiana">Italiana (Graceful Minimalist)</option>
                        <option value="Great Vibes">Great Vibes (Calligraphy Cursive)</option>
                        <option value="Alex Brush">Alex Brush (Calligraphy Brush)</option>
                        <option value="Pinyon Script">Pinyon Script (Formal Signature)</option>
                      </optgroup>
                      <optgroup label="Arabic Fonts">
                        <option value="Cairo">Cairo (Modern Sans)</option>
                        <option value="Amiri">Amiri (Traditional Naskh)</option>
                        <option value="Tajawal">Tajawal (Geometric Arabic)</option>
                        <option value="Almarai">Almarai (Corporate Clean)</option>
                        <option value="Reem Kufi">Reem Kufi (Kufic Calligraphy)</option>
                        <option value="El Messiri">El Messiri (Artistic Naskh-Kufi)</option>
                        <option value="Aref Ruqaa">Aref Ruqaa (Classical Ruq'ah)</option>
                        <option value="Kufam">Kufam (Modern Kufic)</option>
                        <option value="Lemonada">Lemonada (Rounded Artistic)</option>
                        <option value="Changa">Changa (Bold Display)</option>
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
