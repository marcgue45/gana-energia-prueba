import { useCallback, useState } from 'react';
import { LeadPanel } from './components/LeadPanel';
import { LeadsPage } from './components/LeadsPage';
import { ErrorBox, Spinner } from './components/ui';
import { WeightsPage } from './components/WeightsPage';
import { SessionProvider, useSession, type LoginProps } from './session';
import { useUrlState } from './url-state';

export function App() {
  return (
    <SessionProvider login={(props) => <Login {...props} />}>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const { agent, agents, switchAgent } = useSession();
  const [url, setUrl] = useUrlState();
  const [creating, setCreating] = useState(false);
  const closePanel = useCallback(() => {
    setCreating(false);
    setUrl({ lead: null });
  }, [setUrl]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            CRM <span aria-hidden="true">/</span> Leads comerciales
          </span>
          <nav aria-label="Secciones">
            <button type="button" className={url.view === 'leads' ? 'active' : ''} aria-current={url.view === 'leads' ? 'page' : undefined} onClick={() => setUrl({ view: 'leads' }, { push: true })}>
              Leads
            </button>
            <button type="button" className={url.view === 'weights' ? 'active' : ''} aria-current={url.view === 'weights' ? 'page' : undefined} onClick={() => setUrl({ view: 'weights', lead: null }, { push: true })}>
              Pesos
            </button>
          </nav>
          <label className="session">
            <span className="visually-hidden">Sesión simulada: usuario actual</span>
            <select id="session-agent" value={agent.id} onChange={(e) => switchAgent(Number(e.target.value))}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.role === 'admin' ? ' (administrador)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="main">
        {url.view === 'weights' ? <WeightsPage /> : <LeadsPage url={url} setUrl={setUrl} onCreate={() => setCreating(true)} />}
      </main>

      {(creating || url.lead !== null) && url.view === 'leads' && (
        <LeadPanel
          key={creating ? 'new' : url.lead}
          leadId={creating ? 'new' : url.lead!}
          onClose={closePanel}
          onCreated={(id) => {
            setCreating(false);
            setUrl({ lead: id }, { push: true });
          }}
        />
      )}
    </div>
  );
}

function Login({ agents, loading, error, retry, onSelect }: LoginProps) {
  return (
    <main className="login">
      <div className="login-card">
        <h1>CRM / Leads comerciales</h1>
        <p className="hint">
          Autenticación simulada: elige con qué usuario entrar. La API identifica al usuario y su rol en cada petición.
        </p>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox error={error} onRetry={retry} />
        ) : agents.length === 0 ? (
          <p>No hay usuarios. Ejecuta <code>npm run db:seed</code> para crear los datos de ejemplo.</p>
        ) : (
          <ul className="login-list">
            {agents.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onSelect(a.id)}>
                  <span>{a.name}</span>
                  <span className="muted">{a.role === 'admin' ? 'Administrador' : 'Agente'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
