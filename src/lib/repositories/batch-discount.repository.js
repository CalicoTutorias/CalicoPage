/**
 * Batch-discount config repository (BatchDiscountConfig, a single row with
 * id = "default"). See src/lib/payments/batch-discount.js for the math.
 */

import prisma from '../prisma';

export const CONFIG_ID = 'default';

export async function findConfig() {
  return prisma.batchDiscountConfig.findUnique({ where: { id: CONFIG_ID } });
}

export async function upsertConfig(data, updatedById) {
  const fields = {
    isActive: data.isActive,
    tiers: data.tiers,
    absorber: data.absorber,
    stacksWithCoupons: data.stacksWithCoupons,
    appliesToManual: data.appliesToManual,
    updatedById: updatedById ?? null,
  };
  return prisma.batchDiscountConfig.upsert({
    where: { id: CONFIG_ID },
    update: fields,
    create: { id: CONFIG_ID, ...fields },
  });
}
