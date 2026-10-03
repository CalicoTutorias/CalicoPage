'use client';

import { useI18n } from '../../../../../lib/i18n';
import { CHIP, TONE } from './ui';

const STATUS_TONE = {
  draft: TONE.neutral,
  published: TONE.success,
  finished: TONE.info,
  canceled: TONE.danger,
};

/** Chip for an event's derivedStatus: 'draft' | 'published' | 'finished' | 'canceled'. */
export default function EventStatusBadge({ status }) {
  const { t } = useI18n();
  return (
    <span className={`${CHIP} ${STATUS_TONE[status] || TONE.neutral}`}>
      {t(`admin.events.status.${status}`)}
    </span>
  );
}
