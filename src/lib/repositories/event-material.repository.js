/**
 * Event Material Repository
 * Prisma wrappers for EventMaterial (study material files in S3). Business
 * rules — who may upload, who may download — live in event-material.service.js.
 *
 * Models: EventMaterial
 */

import prisma from '../prisma';

/** Upload order: the order the admin added them. */
const ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];

export async function create(data) {
  return prisma.eventMaterial.create({ data });
}

export async function findByEvent(eventId) {
  return prisma.eventMaterial.findMany({ where: { eventId }, orderBy: ORDER });
}

/** A material scoped to its event (null when it belongs to another event). */
export async function findForEvent(eventId, materialId) {
  return prisma.eventMaterial.findFirst({ where: { id: materialId, eventId } });
}

export async function countByEvent(eventId) {
  return prisma.eventMaterial.count({ where: { eventId } });
}

export async function deleteById(id) {
  return prisma.eventMaterial.delete({ where: { id } });
}
