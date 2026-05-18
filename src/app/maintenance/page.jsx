import Image from 'next/image';
import Logo from '../../../public/CalicoLogo.png';

export const metadata = {
  title: 'Calico — En mantenimiento',
  description: 'Estamos realizando mejoras. Volvemos pronto.',
};

export default function MaintenancePage() {
  return (
    <div style={styles.root}>
      <div style={styles.blob1} aria-hidden="true" />
      <div style={styles.blob2} aria-hidden="true" />

      <div style={styles.card}>
        <Image
          src={Logo}
          alt="Calico Tutorías"
          style={styles.logo}
          priority
        />

        <Image
          src="/happy-calico.png"
          alt="Calico descansando"
          width={180}
          height={180}
          priority
          style={styles.mascot}
        />

        <div style={styles.badge}>Mantenimiento programado</div>

        <h1 style={styles.title}>Estamos mejorando Calico</h1>

        <p style={styles.subtitle}>
          Nuestro equipo está trabajando para ofrecerte una mejor experiencia.
          <br />
          Volvemos muy pronto — gracias por tu paciencia.
        </p>

        <div style={styles.divider} />

        <p style={styles.contact}>
          ¿Tienes una urgencia?{' '}
          <a href="mailto:calico.tutorias@gmail.com" style={styles.link}>
            calico.tutorias@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#f9f7f4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"DM Sans", "Poppins", system-ui, sans-serif',
    padding: '1.5rem',
    position: 'relative',
    overflow: 'hidden',
  },
  blob1: {
    position: 'absolute',
    top: '-10%',
    left: '-8%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(40,150,86,0.10) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  blob2: {
    position: 'absolute',
    bottom: '-12%',
    right: '-6%',
    width: '420px',
    height: '420px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,149,5,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    background: '#ffffff',
    borderRadius: '1.25rem',
    boxShadow: '0 4px 12px rgba(15,45,31,0.08), 0 24px 60px -16px rgba(15,45,31,0.12)',
    padding: '2.5rem 2rem',
    maxWidth: '440px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    textAlign: 'center',
  },
  logo: {
    height: '2.5rem',
    width: 'auto',
    objectFit: 'contain',
    marginBottom: '1.5rem',
  },
  mascot: {
    marginBottom: '1.25rem',
    objectFit: 'contain',
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(40,150,86,0.10)',
    color: '#289656',
    fontSize: '0.8125rem',
    fontWeight: '600',
    letterSpacing: '0.03em',
    padding: '0.3rem 0.85rem',
    borderRadius: '9999px',
    marginBottom: '1rem',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 'clamp(1.35rem, 4vw, 1.75rem)',
    fontWeight: '700',
    color: '#15251f',
    lineHeight: '1.25',
    margin: '0 0 0.75rem 0',
  },
  subtitle: {
    fontSize: '0.9375rem',
    color: '#5c6f66',
    lineHeight: '1.6',
    margin: '0 0 1.5rem 0',
  },
  divider: {
    width: '100%',
    height: '1px',
    background: 'rgba(40,150,86,0.12)',
    marginBottom: '1.25rem',
  },
  contact: {
    fontSize: '0.875rem',
    color: '#5c6f66',
    margin: '0',
  },
  link: {
    color: '#289656',
    fontWeight: '600',
    textDecoration: 'none',
  },
};
