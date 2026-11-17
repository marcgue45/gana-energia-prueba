import { useQuery } from '@tanstack/react-query';

export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },
  });

  return (
    <main>
      <h1>CRM / Leads comerciales</h1>
      <p>API: {health.isPending ? 'comprobando…' : health.isError ? 'sin conexión' : health.data.status}</p>
    </main>
  );
}
