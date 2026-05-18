export default function SearchTutorsLoading() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Search bar skeleton */}
      <div style={{ height: '48px', background: '#e5e7eb', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem' }} />
      {/* Filters skeleton */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: '36px', width: '120px', background: '#e5e7eb', borderRadius: 'var(--radius-xl)' }} />
        ))}
      </div>
      {/* Tutor cards grid skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ height: '200px', background: '#e5e7eb', borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    </div>
  );
}
