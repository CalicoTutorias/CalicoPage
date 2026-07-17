/**
 * News Repository
 * Prisma wrappers for NewsPost (noticias/anuncios de admins).
 *
 * Selects are explicit on purpose:
 *  - PUBLIC_SELECT: what the unauthenticated landing feed may see. Never
 *    includes drafts (callers must filter isPublished in the where) nor
 *    author identity.
 *  - ADMIN_SELECT: full editorial view, author reduced to id/name.
 */

import prisma from '../prisma';

const PUBLIC_SELECT = {
  id: true,
  title: true,
  content: true,
  imageUrl: true,
  isPinned: true,
  publishedAt: true,
};

const ADMIN_SELECT = {
  ...PUBLIC_SELECT,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
};

const ORDER = [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }];

export async function findPublished({ limit = 6, offset = 0 } = {}) {
  return prisma.newsPost.findMany({
    where: { isPublished: true },
    orderBy: ORDER,
    take: limit,
    skip: offset,
    select: PUBLIC_SELECT,
  });
}

export async function findAllForAdmin({ limit = 50, offset = 0 } = {}) {
  const [items, total] = await prisma.$transaction([
    prisma.newsPost.findMany({
      orderBy: ORDER,
      take: limit,
      skip: offset,
      select: ADMIN_SELECT,
    }),
    prisma.newsPost.count(),
  ]);
  return { items, total };
}

export async function findById(id) {
  return prisma.newsPost.findUnique({ where: { id }, select: ADMIN_SELECT });
}

export async function create(data) {
  return prisma.newsPost.create({ data, select: ADMIN_SELECT });
}

export async function update(id, data) {
  return prisma.newsPost.update({ where: { id }, data, select: ADMIN_SELECT });
}

export async function remove(id) {
  return prisma.newsPost.delete({ where: { id }, select: ADMIN_SELECT });
}
