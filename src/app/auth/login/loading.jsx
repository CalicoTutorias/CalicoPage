export default function LoginLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <div style={{ height: '48px', width: '200px', background: '#e5e7eb', borderRadius: 'var(--radius-sm)', margin: '0 auto 2rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ height: '40px', background: '#e5e7eb', borderRadius: 'var(--radius-sm)' }} />
          <div style={{ height: '40px', background: '#e5e7eb', borderRadius: 'var(--radius-sm)' }} />
          <div style={{ height: '44px', background: '#e5e7eb', borderRadius: 'var(--radius-sm)', marginTop: '0.5rem' }} />
        </div>
      </div>
    </div>
  );
}
