const fees = require('@/lib/payments/fees');

it('eventCalicoNet = gross − Wompi fee (tutors are paid outside the split)', () => {
  expect(fees.eventCalicoNet(20000)).toBeCloseTo(20000 - fees.wompiFee(20000), 5);
});

it('eventPaymentTotals keeps only non-refunded money and charges fees on every payment', () => {
  const payments = [
    { amount: '18000', refundStatus: 'None' },
    { amount: '20000', refundStatus: 'Pending' },
    { amount: '20000', refundStatus: 'Refunded' },
  ];
  const totals = fees.eventPaymentTotals(payments, [{ amount: '50000' }]);
  expect(totals.gross).toBe(18000);
  expect(totals.refundsPending).toBe(20000);
  expect(totals.refunded).toBe(20000);
  expect(totals.tutorPayouts).toBe(50000);
  expect(totals.wompiFees).toBe(Math.round(fees.wompiFee(18000) + fees.wompiFee(20000) * 2));
  expect(totals.net).toBe(totals.gross - totals.wompiFees - totals.tutorPayouts);
});
