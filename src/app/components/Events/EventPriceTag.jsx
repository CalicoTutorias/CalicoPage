"use client";

import { Sparkles } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import styles from './events.module.css';

/**
 * "Gratis", or the price. While early-bird spots remain, the discounted price
 * leads, the list price is struck through and a "N spots left with X% off"
 * badge follows. With no spots left the event simply shows its list price.
 */
export default function EventPriceTag({ price, earlyBird, size = 'md' }) {
  const { t, formatCurrency } = useI18n();
  const className = `${styles.priceTag} ${size === 'lg' ? styles.priceTagLg : ''}`.trim();
  const listPrice = Number(price) || 0;

  if (listPrice <= 0) {
    return (
      <div className={className}>
        <span className={styles.priceFree}>{t('events.common.free')}</span>
      </div>
    );
  }

  const discounted = earlyBird && earlyBird.remaining > 0 ? earlyBird : null;

  return (
    <div className={className}>
      <div className={styles.priceRow}>
        <span className={styles.price}>
          {formatCurrency(discounted ? discounted.discountedPrice : listPrice)}
        </span>
        {discounted && <s className={styles.priceOriginal}>{formatCurrency(listPrice)}</s>}
      </div>
      {discounted && (
        <span className={styles.earlyBadge}>
          <Sparkles aria-hidden="true" />
          {t('events.common.earlyBirdLeft', {
            count: discounted.remaining,
            percent: discounted.percent,
          })}
        </span>
      )}
    </div>
  );
}
