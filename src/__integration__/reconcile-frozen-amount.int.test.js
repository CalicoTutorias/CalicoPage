/**
 * Spec §10.3 case 8 (task 0): a course price change between the intent and
 * the approval does not change the expected charge — it is the amount frozen
 * in the PaymentIntent, not the current catalog price.
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { expectedAmountCents } from '@/lib/payments/checkout';
import { resetEventData, storedIntent } from './helpers/factory';

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('reconciliation against the frozen amount (real Postgres)', () => {
  it('a course price change after checkout keeps the expected amount at the price paid', async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const career = await prisma.career.create({ data: { code: `I${tag}`, name: 'Integración' } });
    const course = await prisma.course.create({
      data: { name: 'Int course', code: `I${tag}0001`, basePrice: 40000, complexity: 'Foundational', careerId: career.id },
    });
    const startTimestamp = new Date('2026-11-02T15:00:00.000Z').toISOString();
    const endTimestamp = new Date('2026-11-02T16:00:00.000Z').toISOString();
    const slot = { courseId: course.id, startTimestamp, endTimestamp };
    const frozenRef = `INT-${randomUUID()}`;
    const legacyRef = `INT-${randomUUID()}`;
    await prisma.paymentIntent.create({
      data: { reference: frozenRef, metadata: { ...slot, originalAmount: '40000', discountAmount: '0' } },
    });
    await prisma.paymentIntent.create({ data: { reference: legacyRef, metadata: slot } }); // pre-snapshot intent

    await prisma.course.update({ where: { id: course.id }, data: { basePrice: 45000 } });

    const stored = await storedIntent(frozenRef);
    expect(await expectedAmountCents({ stored, metadata: stored.metadata })).toBe(4_000_000);

    // Control: without the snapshot the catalog is re-read, so the new price is live in the DB.
    const legacy = await storedIntent(legacyRef);
    expect(await expectedAmountCents({ stored: legacy, metadata: legacy.metadata })).toBe(4_500_000);
  });
});
