"use client";

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import routes from '../../routes';
import LocaleSwitcher from '../components/LocaleSwitcher';
import Logo from '../../../public/CalicoLogo.png';
import styles from './eventos.module.css';

/** Minimal public top bar for /eventos pages (same pattern as /noticias). */
export default function EventsHeader({ backHref, backLabel }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={backHref} className={styles.back} aria-label={backLabel}>
          <ArrowLeft aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>
        <Link href={routes.LANDING} className={styles.brand} aria-label="Calico">
          <Image src={Logo} alt="Calico" width={104} height={34} priority />
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
