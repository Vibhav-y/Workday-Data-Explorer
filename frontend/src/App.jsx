import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import QueryBuilder from './components/QueryBuilder';
import DataViewer from './components/DataViewer';
import { executeWqlQuery, getHealth } from './api';

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [health, setHealth] = useState({ ok: false, tenant: '' });
  const [qbCollapsed, setQbCollapsed] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function checkHealth() {
      try {
        const result = await getHealth();
        if (!ignore) setHealth({ ok: true, tenant: result.tenant || 'acme-corp' });
      } catch {
        if (!ignore) setHealth({ ok: false, tenant: 'acme-corp' });
      }
    }
    checkHealth();
    return () => { ignore = true; };
  }, []);

  const handleExecute = async (query) => {
    setIsLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await executeWqlQuery(query);
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-icon">
            <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
              <rect width="30" height="30" rx="7" fill="#f97316" />
              <rect x="6" y="6" width="8" height="8" rx="1.5" fill="white" />
              <rect x="16" y="6" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.65)" />
              <rect x="6" y="16" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.65)" />
              <rect x="16" y="16" width="8" height="8" rx="1.5" fill="white" />
            </svg>
          </div>
          <span className="brand-name">Workday Explorer</span>
          <div className="topbar-divider" />
          <div className="tenant-chip">
            <Building2 size={13} />
            {health.tenant}
          </div>
        </div>
        <div className="topbar-right">
          <span className={`connected-pill ${health.ok ? 'online' : 'offline'}`}>
            <span className="conn-dot" />
            {health.ok ? 'connected' : 'disconnected'}
          </span>
        </div>
      </header>

      <main className={`workspace${qbCollapsed ? ' qb-collapsed' : ''}`}>
        <div className="build-query-col">
          <QueryBuilder
            onExecute={handleExecute}
            isLoading={isLoading}
            onCollapse={() => setQbCollapsed(true)}
            onExpand={() => setQbCollapsed(false)}
            collapsed={qbCollapsed}
          />
        </div>
        <div className="results-col">
          <DataViewer data={data} error={error} />
        </div>
      </main>
    </div>
  );
}

export default App;
