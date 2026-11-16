/**
 * @jest-environment node
 *
 * Where a tutor's money stands for one payment. That `owed` matches what the
 * admin list shows as pending is checked against a real Postgres in
 * src/__integration__/payouts.int.test.js.
 */

import { tutorPayoutStateOf } from '@/lib/payments/tutor-payout-state';

const NOW = new Date('2026-11-02T13:00:00.000Z');
const PAST = new Date('2026-11-01T13:00:00.000Z');
const FUTURE = new Date('2026-11-09T13:00:00.000Z');

function payment({ status = 'paid', tutorPayoutStatus = 'pending', session = {} } = {}) {
  return {
    status,
    tutorPayoutStatus,
    session: session === null ? null : {
      status: 'Accepted',
      endTimestamp: PAST,
      course: { code: 'ISIS1225' },
      ...session,
    },
  };
}

describe('tutorPayoutStateOf', () => {
  it('test_should_be_owed_when_the_student_paid_and_the_session_ended', () => {
    expect(tutorPayoutStateOf(payment(), NOW)).toBe('owed');
  });

  it('test_should_be_owed_on_a_completed_session_whatever_its_date', () => {
    expect(tutorPayoutStateOf(payment({ session: { status: 'Completed', endTimestamp: FUTURE } }), NOW)).toBe('owed');
  });

  it('test_should_be_upcoming_when_the_session_has_not_ended', () => {
    expect(tutorPayoutStateOf(payment({ session: { endTimestamp: FUTURE } }), NOW)).toBe('upcoming');
  });

  it('test_should_be_paid_once_it_was_transferred', () => {
    expect(tutorPayoutStateOf(payment({ tutorPayoutStatus: 'paid' }), NOW)).toBe('paid');
  });

  it('test_should_stay_paid_if_the_session_is_canceled_after_the_transfer', () => {
    expect(tutorPayoutStateOf(payment({ tutorPayoutStatus: 'paid', session: { status: 'Canceled' } }), NOW)).toBe('paid');
  });

  it('test_should_wait_for_the_student_on_an_unpaid_manual_session', () => {
    expect(tutorPayoutStateOf(payment({ status: 'pending' }), NOW)).toBe('awaiting_student');
  });

  it.each(['Canceled', 'Rejected'])('test_should_owe_nothing_on_a_%s_session', (status) => {
    expect(tutorPayoutStateOf(payment({ session: { status } }), NOW)).toBe('canceled');
  });

  it('test_should_owe_nothing_on_a_canceled_session_the_student_never_paid', () => {
    expect(tutorPayoutStateOf(payment({ status: 'pending', session: { status: 'Canceled' } }), NOW)).toBe('canceled');
  });

  it('test_should_report_a_failed_charge', () => {
    expect(tutorPayoutStateOf(payment({ status: 'failed' }), NOW)).toBe('failed');
  });

  it('test_should_not_apply_to_a_test_course', () => {
    expect(tutorPayoutStateOf(payment({ session: { course: { code: 'TEST123' } } }), NOW)).toBe('not_applicable');
  });

  it('test_should_treat_a_payment_without_session_as_owing_nothing', () => {
    expect(tutorPayoutStateOf(payment({ session: null }), NOW)).toBe('canceled');
  });
});
