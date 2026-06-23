import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Key } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    // Simulate small network delay for premium feel & transition
    setTimeout(() => {
      if (email.trim() === 'ku.dat1@trianglegh.cloud' && password === 'tgh26+') {
        onLoginSuccess();
      } else {
        setErrorMsg('Invalid email or password. Please try again.');
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="login-container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at center, var(--bg-tertiary) 0%, var(--bg-primary) 100%)',
      padding: '1.5rem'
    }}>
      <div className="glass-panel login-card" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        {/* Decorative Golden Ambient Glow */}
        <div style={{
          position: 'absolute',
          top: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '4px',
          background: 'linear-gradient(90deg, transparent, var(--accent-gold), transparent)',
          filter: 'blur(4px)',
          borderRadius: '50%'
        }} />

        {/* Official Logo Banner */}
        <img 
          src="/logo.jpg" 
          alt="Triangle Generation Humanitaire Logo" 
          style={{
            width: '120px',
            height: '120px',
            objectFit: 'contain',
            borderRadius: '12px',
            marginBottom: '1rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.05)'
          }}
        />

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            TGH <span className="text-gold" style={{ display: 'inline-block' }}>Certs Portal</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Secure Registry Management
          </p>
        </div>

        {errorMsg && (
          <div className="glass-panel" style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            width: '100%',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'var(--accent-rose)',
            fontSize: '0.85rem'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
              <Mail size={12} style={{ color: 'var(--accent-gold)' }} />
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type="email" 
                className="form-input" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="ku.dat1@trianglegh.cloud"
                style={{
                  width: '100%',
                  paddingLeft: '1rem',
                  fontSize: '0.875rem'
                }}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
              <Lock size={12} style={{ color: 'var(--accent-gold)' }} />
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? 'text' : 'password'} 
                className="form-input" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  paddingLeft: '1rem',
                  paddingRight: '2.5rem',
                  fontSize: '0.875rem'
                }}
                disabled={loading}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                tabIndex="-1"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '0.8rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              borderRadius: 'var(--radius-sm)'
            }}
            disabled={loading}
          >
            <Key size={16} />
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '2.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          <span>v2.1.0 &copy; Triangle Generation Humanitaire</span>
        </div>
      </div>
    </div>
  );
}
