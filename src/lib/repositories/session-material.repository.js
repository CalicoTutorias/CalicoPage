/**
 * Session Material Repository
 * Prisma wrappers for SessionMaterial (files the tutor or an admin leave for the
 * student). Who may add or open them lives in session-material.service.js.
 *
 * Models: SessionMaterial
 */

import prisma from '../prisma';

/** Upload order: the order they were added. */
const ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];

export async function create(data) {
  return prisma.sessionMaterial.create({ data });
}

export async function findBySession(sessionId) {
  return prisma.sessionMaterial.findMany({ where: { sessionId }, orderBy: ORDER });
}

/** A material scoped to its session (null when it belongs to another session). */
export async function findForSession(sessionId, materialId) {
  return prisma.sessionMaterial.findFirst({ where: { id: materialId, sessionId } });
}

export async function countBySession(sessionId) {
  return prisma.sessionMaterial.count({ where: { sessionId } });
}

export async function deleteById(id) {
  return prisma.sessionMaterial.delete({ where: { id } });
}
