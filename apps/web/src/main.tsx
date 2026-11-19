import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError } from './api';
import { App } from './App';
import { SESSION_EXPIRED_EVENT } from './session';
import './styles.css';

// 401 en cualquier petición (p. ej. el agente ya no existe tras regenerar los datos): volver al selector
const onError = (error: Error) => {
  if (error instanceof ApiError && error.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      // Los errores 4xx no se arreglan reintentando; los de red o 5xx, sí (hasta 2 veces)
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
