import Link from 'next/link';

export const metadata = {
  title: 'Calico - Error conectando calendario',
  description: 'No pudimos completar la conexion con Google Calendar.',
};

export default async function CalendarErrorPage({ searchParams }) {
  const params = await searchParams;
  const error =
    typeof params?.error === 'string'
      ? params.error
      : 'No pudimos completar la conexion con Google Calendar.';

  return (
    <main style={styles.root}>
      <section style={styles.panel}>
        <p style={styles.kicker}>Google Calendar</p>
        <h1 style={styles.title}>No pudimos conectar tu calendario</h1>
        <p style={styles.message}>{error}</p>
        <Link href="/tutor/disponibilidad" style={styles.action}>
          Volver a disponibilidad
        </Link>
      </section>
    </main>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  panel: {
    width: '100%',
    maxWidth: '460px',
    background: '#ffffff',
    border: '1px solid rgba(40, 150, 86, 0.16)',
    borderRadius: '8px',
    boxShadow: '0 18px 50px rgba(21, 37, 31, 0.10)',
    padding: '28px',
  },
  kicker: {
    color: '#289656',
    fontSize: '13px',
    fontWeight: 700,
    margin: '0 0 10px',
    textTransform: 'uppercase',
  },
  title: {
    color: '#15251f',
    fontSize: '24px',
    lineHeight: 1.2,
    margin: '0 0 12px',
  },
  message: {
    color: '#5c6f66',
    fontSize: '15px',
    lineHeight: 1.55,
    margin: '0 0 22px',
  },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '42px',
    padding: '0 16px',
    borderRadius: '8px',
    background: '#289656',
    color: '#ffffff',
    fontWeight: 700,
    textDecoration: 'none',
  },
};
