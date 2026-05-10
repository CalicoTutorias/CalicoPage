/**
 * AdminService
 * Client-side wrapper for /api/admin/** endpoints. All calls go through
 * authFetch so the JWT is attached automatically.
 *
 * Surface mirrors src/lib/services/admin.service.js but exposes a thin
 * `{ ok, status, ...data }` shape that the UI maps to render states.
 */

import { authFetch } from '../authFetch';

const BASE = '/api/admin';

class AdminServiceClass {
  // ─── Listing ──────────────────────────────────────────────────────────

  async listPendingApplications({ limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const { ok, status, data } = await authFetch(`${BASE}/tutors/pending?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async listApprovedTutors({ status: statusFilter = 'active', search, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({
      status: statusFilter,
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set('search', search);
    const { ok, status, data } = await authFetch(`${BASE}/tutors?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async getTutorDetail(userId) {
    const { ok, status, data } = await authFetch(`${BASE}/tutors/${userId}`);
    return { ok, status, ...(data || {}) };
  }

  // ─── Mutations ────────────────────────────────────────────────────────

  async approveTutor(userId, courseIds) {
    const { ok, status, data } = await authFetch(`${BASE}/tutors/${userId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ courseIds }),
    });
    return { ok, status, ...(data || {}) };
  }

  async rejectTutor(userId, reason) {
    const { ok, status, data } = await authFetch(`${BASE}/tutors/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return { ok, status, ...(data || {}) };
  }

  async suspendTutor(userId, reason) {
    const { ok, status, data } = await authFetch(`${BASE}/tutors/${userId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return { ok, status, ...(data || {}) };
  }

  async reinstateTutor(userId) {
    const { ok, status, data } = await authFetch(`${BASE}/tutors/${userId}/reinstate`, {
      method: 'POST',
    });
    return { ok, status, ...(data || {}) };
  }

  // ─── Per-course management for an already-approved tutor ──────────────

  async assignCoursesToTutor(userId, courseIds, status = 'Approved') {
    const { ok, status: httpStatus, data } = await authFetch(
      `${BASE}/tutors/${userId}/courses`,
      { method: 'POST', body: JSON.stringify({ courseIds, status }) },
    );
    return { ok, status: httpStatus, ...(data || {}) };
  }

  async setTutorCourseStatus(userId, courseId, newStatus) {
    const { ok, status: httpStatus, data } = await authFetch(
      `${BASE}/tutors/${userId}/courses/${courseId}`,
      { method: 'PUT', body: JSON.stringify({ status: newStatus }) },
    );
    return { ok, status: httpStatus, ...(data || {}) };
  }

  // ─── Metrics (dashboard) ──────────────────────────────────────────────

  async metricsOverview() {
    const { ok, status, data } = await authFetch(`${BASE}/metrics/overview`);
    return { ok, status, ...(data || {}) };
  }

  async metricsSessions({ weeks = 12 } = {}) {
    const { ok, status, data } = await authFetch(`${BASE}/metrics/sessions?weeks=${weeks}`);
    return { ok, status, ...(data || {}) };
  }

  async metricsRevenue({ months = 12 } = {}) {
    const { ok, status, data } = await authFetch(`${BASE}/metrics/revenue?months=${months}`);
    return { ok, status, ...(data || {}) };
  }

  async metricsTopCourses({ days = 30, limit = 10 } = {}) {
    const params = new URLSearchParams({ days: String(days), limit: String(limit) });
    const { ok, status, data } = await authFetch(`${BASE}/metrics/top-courses?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async metricsActiveTutors({ days = 30, limit = 10 } = {}) {
    const params = new URLSearchParams({ days: String(days), limit: String(limit) });
    const { ok, status, data } = await authFetch(`${BASE}/metrics/active-tutors?${params}`);
    return { ok, status, ...(data || {}) };
  }

  // ─── Audit log ────────────────────────────────────────────────────────

  async listAuditLog({ action, adminId, targetType, from, to, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action)     params.set('action', action);
    if (adminId)    params.set('adminId', adminId);
    if (targetType) params.set('targetType', targetType);
    if (from)       params.set('from', from);
    if (to)         params.set('to', to);
    const { ok, status, data } = await authFetch(`${BASE}/audit?${params}`);
    return { ok, status, ...(data || {}) };
  }
}

export const AdminService = new AdminServiceClass();
export default AdminService;
