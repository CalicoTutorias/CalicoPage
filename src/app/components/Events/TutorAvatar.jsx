import styles from './events.module.css';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

/** Round tutor photo with an initials fallback. Decorative: the name sits next to it. */
export default function TutorAvatar({ tutor, size = 'md' }) {
  const className = `${styles.avatar} ${size === 'lg' ? styles.avatarLg : ''}`.trim();
  return (
    <span className={className} aria-hidden="true">
      {tutor?.profilePictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote S3 photo; no next/image remotePatterns configured
        <img src={tutor.profilePictureUrl} alt="" loading="lazy" />
      ) : (
        initials(tutor?.name)
      )}
    </span>
  );
}
