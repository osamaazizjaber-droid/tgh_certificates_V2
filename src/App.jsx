import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Designer from './components/Designer';
import Verification from './components/Verification';
import Login from './components/Login';
import { LayoutDashboard, Award, ShieldCheck, GraduationCap, LogOut } from 'lucide-react';

export default function App() {
  const [route, setRoute] = useState('admin'); // 'admin' or 'verify'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'designer'
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('tgh_authenticated') === 'true';
  });

  const handleLoginSuccess = () => {
    localStorage.setItem('tgh_authenticated', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('tgh_authenticated');
    setIsAuthenticated(false);
  };

  // Listen to path changes or query params for public verification route
  useEffect(() => {
    const handleUrlRouting = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      
      if (path === '/verify' || searchParams.has('id') || searchParams.has('certId')) {
        setRoute('verify');
      } else {
        setRoute('admin');
      }
    };

    handleUrlRouting();
    window.addEventListener('popstate', handleUrlRouting);
    return () => window.removeEventListener('popstate', handleUrlRouting);
  }, []);

  // Navigation handlers
  const navigateToHome = (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/');
    setRoute('admin');
    setActiveTab('dashboard');
  };

  // If public verification route is matched, display it directly without admin shell
  if (route === 'verify') {
    return <Verification />;
  }

  // If not authenticated, force login for admin shell access
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <a href="/" onClick={navigateToHome} className="nav-logo">
          <GraduationCap size={32} style={{ color: 'var(--accent-gold)' }} />
          <span>
            TGH <span className="text-gold">Certs</span>
          </span>
        </a>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
          <ul className="nav-links">
            <li>
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`btn-secondary nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                style={{ width: '100%', border: 'none' }}
              >
                <LayoutDashboard size={18} />
                Recipients Grid
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('completed')} 
                className={`btn-secondary nav-item ${activeTab === 'completed' ? 'active' : ''}`}
                style={{ width: '100%', border: 'none' }}
              >
                <Award size={18} style={{ color: 'var(--accent-gold)' }} />
                Completed Certificates
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('designer')} 
                className={`btn-secondary nav-item ${activeTab === 'designer' ? 'active' : ''}`}
                style={{ width: '100%', border: 'none' }}
              >
                <GraduationCap size={18} />
                Layout Designer
              </button>
            </li>
          </ul>
        </nav>

        <div className="nav-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            onClick={handleLogout} 
            className="btn btn-secondary nav-item" 
            style={{ 
              width: '100%', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              color: 'var(--accent-rose)',
              background: 'rgba(239, 68, 68, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem'
            }}
          >
            <LogOut size={16} />
            Sign Out
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
              <ShieldCheck size={14} style={{ color: 'var(--accent-emerald)' }} />
              <span>Secure Registry</span>
            </div>
            <span>v2.1.0 &copy; 2026</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        {activeTab === 'dashboard' && <Dashboard showOnlyCompleted={false} />}
        {activeTab === 'completed' && <Dashboard showOnlyCompleted={true} />}
        {activeTab === 'designer' && <Designer />}
      </main>
    </div>
  );
}
