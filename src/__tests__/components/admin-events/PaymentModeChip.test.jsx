/**
 * Admin events — how an event is paid: manual (approval, transfer), Wompi
 * (paid online like a tutoring session) or nothing for a free event.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PaymentModeChip from '@/app/home/admin/eventos/_components/PaymentModeChip';

const en = require('@/lib/i18n/locales/en.json');

it('an approval event is shown as manual (approval)', () => {
  render(<PaymentModeChip event={{ requiresApproval: true, price: 40000 }} />);
  expect(screen.getByText(en.admin.events.detail.approvalChip)).toBeInTheDocument();
  expect(screen.queryByText(en.admin.events.detail.wompiChip)).toBeNull();
});

it('a paid event without approval is charged through Wompi', () => {
  render(<PaymentModeChip event={{ requiresApproval: false, price: 40000 }} />);
  expect(screen.getByText(en.admin.events.detail.wompiChip)).toBeInTheDocument();
  expect(screen.getByText(en.admin.events.detail.wompiChip).closest('span')).toHaveAttribute('title', en.admin.events.detail.wompiHint);
});

it('a free event shows nothing', () => {
  const { container } = render(<PaymentModeChip event={{ requiresApproval: false, price: 0 }} />);
  expect(container).toBeEmptyDOMElement();
});
