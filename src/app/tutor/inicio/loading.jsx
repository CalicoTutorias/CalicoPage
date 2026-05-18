export default function TutorHomeLoading() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Welcome banner skeleton */}
      <div style={{ height: '80px', background: '#e5e7eb', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem' }} />
      {/* Stats grid skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: '100px', background: '#e5e7eb', borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
      {/* Content skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div style={{ height: '250px', background: '#e5e7eb', borderRadius: 'var(--radius-lg)' }} />
        <div style={{ height: '250px', background: '#e5e7eb', borderRadius: 'var(--radius-lg)' }} />
      </div>
    </div>
  );
}
