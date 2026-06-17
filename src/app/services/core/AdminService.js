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

  // ─── Users directory ──────────────────────────────────────────────────

  async listUsers({ role = 'all', search, sort = 'recent', limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ role, sort, limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    const { ok, status, data } = await authFetch(`${BASE}/users?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async getUserProfile(userId) {
    const { ok, status, data } = await authFetch(`${BASE}/users/${userId}`);
    return { ok, status, ...(data || {}) };
  }

  /**
   * Moderation list of tutor→student reviews received by a user, optionally
   * filtered by materia (resolved server-side through the session→course
   * relation). Admin-only; this is the only path that exposes the comment text.
   */
  async getUserStudentReviews(userId, { courseId } = {}) {
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', courseId);
    const qs = params.toString();
    const { ok, status, data } = await authFetch(
      `${BASE}/users/${userId}/student-reviews${qs ? `?${qs}` : ''}`,
    );
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

  // ─── Growth (retention + profitability) ───────────────────────────────

  async metricsRetention({ days = 90, careerId } = {}) {
    const params = new URLSearchParams({ days: String(days) });
    if (careerId) params.set('careerId', careerId);
    const { ok, status, data } = await authFetch(`${BASE}/metrics/retention?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async metricsRetentionCohorts({ months = 12, careerId } = {}) {
    const params = new URLSearchParams({ months: String(months) });
    if (careerId) params.set('careerId', careerId);
    const { ok, status, data } = await authFetch(`${BASE}/metrics/retention/cohorts?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async metricsProfitability({ days = 90 } = {}) {
    const params = new URLSearchParams({ days: String(days) });
    const { ok, status, data } = await authFetch(`${BASE}/metrics/profitability?${params}`);
    return { ok, status, ...(data || {}) };
  }

  // ─── Tutor payouts ────────────────────────────────────────────────────

  async listPayouts({ view = 'byTutor' } = {}) {
    const { ok, status, data } = await authFetch(`${BASE}/payouts?view=${view}`);
    return { ok, status, ...(data || {}) };
  }

  async markPayoutPaid(paymentId, note) {
    const { ok, status, data } = await authFetch(`${BASE}/payouts/${paymentId}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    });
    return { ok, status, ...(data || {}) };
  }

  async bulkMarkPayoutsPaid(paymentIds, note) {
    const { ok, status, data } = await authFetch(`${BASE}/payouts/bulk-mark-paid`, {
      method: 'POST',
      body: JSON.stringify(note ? { paymentIds, note } : { paymentIds }),
    });
    return { ok, status, ...(data || {}) };
  }

  // ─── Manual sessions ─────────────────────────────────────────────────

  async createManualSession(payload) {
    const { ok, status, data } = await authFetch(`${BASE}/manual-sessions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ok, status, ...(data || {}) };
  }

  async confirmManualSessionPayment(sessionId) {
    const { ok, status, data } = await authFetch(
      `${BASE}/manual-sessions/${sessionId}/confirm-payment`,
      { method: 'POST' },
    );
    return { ok, status, ...(data || {}) };
  }

  // ─── Courses management ──────────────────────────────────────────────

  async createCourse(payload) {
    const { ok, status, data } = await authFetch(`${BASE}/courses`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ok, status, ...(data || {}) };
  }

  async listCourseSuggestions({ status: suggestionStatus = 'Pending' } = {}) {
    const params = new URLSearchParams({ status: suggestionStatus });
    const { ok, status, data } = await authFetch(`${BASE}/course-suggestions?${params}`);
    return { ok, status, ...(data || {}) };
  }

  async approveCourseSuggestion(suggestionId, payload) {
    const { ok, status, data } = await authFetch(
      `${BASE}/course-suggestions/${suggestionId}/approve`,
      { method: 'POST', body: JSON.stringify(payload || {}) },
    );
    return { ok, status, ...(data || {}) };
  }

  async rejectCourseSuggestion(suggestionId) {
    const { ok, status, data } = await authFetch(
      `${BASE}/course-suggestions/${suggestionId}/reject`,
      { method: 'POST' },
    );
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
