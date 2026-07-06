'use client';

/**
 * SessionDetailView — Full session detail page (or modal) for tutors and students.
 *
 * Can be used as:
 * - Full page: /sessions/[id]/detail
 * - Modal: triggered from notifications or "View Details"
 *
 * Conditional rendering based on session status + user role:
 *   Pending              → full info + topics + attachments + Accept/Reject buttons (tutor)
 *   Accepted             → full info + topics + attachments + Cancel button (student/tutor)
 *   Completed             → full info + attachments
 *   Rejected / Canceled  → empty state: status message
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  Clock,
  User,
  GraduationCap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Paperclip,
  Star,
} from 'lucide-react';
import { useAuth } from '../../context/SecureAuthContext';
import { TutoringSessionService } from '../../services/core/TutoringSessionService';
import { authFetch } from '../../services/authFetch';
import AttachmentList from '../AttachmentList/AttachmentList';
import CancellationModal from '../CancellationModal/CancellationModal';
import StudentReviewModal from '../StudentReviewModal/StudentReviewModal';

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  Accepted: { label: 'Aceptada', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  Rejected: { label: 'Rechazada', color: 'bg-red-100 text-red-800', icon: XCircle },
  Canceled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-600', icon: XCircle },
  Completed: { label: 'Completada', color: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

function formatSessionDate(dateStr) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function formatSessionTime(startStr, endStr) {
  const opts = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' };
  const start = new Intl.DateTimeFormat('es-CO', opts).format(new Date(startStr));
  const end = new Intl.DateTimeFormat('es-CO', opts).format(new Date(endStr));
  return `${start} — ${end}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SessionDetailView({ sessionId, session: initialSession, isModal = false, onClose }) {
  const { user } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState(initialSession || null);
  const [loading, setLoading] = useState(!initialSession);
  const [error, setError] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState(null);

  const [actionLoading, setActionLoading] = useState(null); // 'accept' | 'reject' | 'cancel' | null
  const [actionError, setActionError] = useState(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [showStudentReviewModal, setShowStudentReviewModal] = useState(false);
  const currentSessionId = sessionId || initialSession?.id || session?.id || null;

  // ─── Fetch session ─────────────────────────────────────────────────────────

  const loadSession = useCallback(async (force = false) => {
    if (initialSession && !force) {
      setSession(initialSession);
      setLoading(false);
      return;
    }
    if (!currentSessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await TutoringSessionService.getSessionById(currentSessionId);
      if (!data) {
        setError('Sesión no encontrada.');
      } else {
        setSession(data);
      }
    } catch {
      setError('Error al cargar la sesión.');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, initialSession]);

  // ─── Fetch attachments ─────────────────────────────────────────────────────

  const loadAttachments = useCallback(async () => {
    if (!currentSessionId) return;
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const { ok, data } = await authFetch(`/api/sessions/${currentSessionId}/attachments`);
      if (ok && data?.success) {
        setAttachments(data.attachments || []);
      } else if (data?.code === 'FORBIDDEN') {
        // Graceful degradation — hide attachments silently
        setAttachmentsError('forbidden');
      } else {
        setAttachmentsError('Error al cargar adjuntos.');
      }
    } catch {
      setAttachmentsError('Error al cargar adjuntos.');
    } finally {
      setAttachmentsLoading(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Load attachments only after session is loaded and user can potentially see them
  useEffect(() => {
    if (!session || !user) return;
    const isTutor = session.tutorId === user.uid;
    const isStudent = session.participants?.some((p) => p.studentId === user.uid);
    const canSeeAttachments =
      isStudent ||
      (isTutor && (session.status === 'Pending' || session.status === 'Accepted'));

    if (canSeeAttachments) {
      loadAttachments();
    }
  }, [session, user, loadAttachments]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleAccept = async () => {
    setActionLoading('accept');
    setActionError(null);
    const { success, error: err } = await TutoringSessionService.acceptSession(currentSessionId);
    setActionLoading(null);
    if (success) {
      await loadSession(true); // Refresh to show new status
    } else {
      setActionError(err || 'Error al aceptar la sesión.');
    }
  };

  const handleReject = async () => {
    setActionLoading('reject');
    setActionError(null);
    const { success, error: err } = await TutoringSessionService.rejectSession(currentSessionId);
    setActionLoading(null);
    if (success) {
      await loadSession(true);
    } else {
      setActionError(err || 'Error al rechazar la sesión.');
    }
  };

  const handleCancelClick = () => {
    setShowCancellationModal(true);
  };

  const handleCancellationSuccess = async () => {
    setShowCancellationModal(false);
    if (isModal) {
      // In modal usage, re-fetching would flip showFullDetail to false and
      // replace the modal with the "Solicitud no disponible" empty state.
      // Just close instead — the parent list (if any) is responsible for
      // dropping the now-canceled session from its own view.
      onClose?.();
    } else {
      await loadSession(true);
    }
  };

  const canCancel = () => {
    if (session.status === 'Canceled' || session.status === 'Completed') return false;
    const now = new Date();
    const sessionDate = new Date(session.startTimestamp);
    if (sessionDate <= now) return false;
    const hoursUntilSession = (sessionDate - now) / (1000 * 60 * 60);
    return hoursUntilSession >= 6;
  };

  // ─── Derived state ─────────────────────────────────────────────────────────

  const isTutor = session?.tutorId === user?.uid;
  const isStudent = session?.participants?.some((p) => p.studentId === user?.uid);

  // Context-aware navigation
  const backUrl = isTutor ? '/tutor/mis-tutorias' : '/home/history';
  const backLabel = isTutor ? 'Volver a mis tutorías' : 'Volver a mi historial';

  // Determine what to show
  const showFullDetail =
    session?.status === 'Pending' ||
    (session?.status === 'Accepted' && isTutor) ||
    (session?.status === 'Accepted' && isStudent) ||
    (session?.status === 'Completed' && (isTutor || isStudent));

  const showActions = session?.status === 'Pending' && isTutor;

  // Reciprocal review state (tutor → student, only present on tutor payloads).
  // Content-free: only { studentId, status } — never the stored rating/comment.
  // With no rows yet (sessions completed before the feature) the tutor can
  // still rate — the server creates the row on submit.
  const studentReviewStatus = session?.studentReviewStatus || [];
  const hasRatedAllStudents =
    studentReviewStatus.length > 0 &&
    studentReviewStatus.length >= (session?.participants?.length || 0) &&
    studentReviewStatus.every((r) => r.status === 'done');
  const canRateStudents = isTutor && session?.status === 'Completed';

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    const loadingContent = (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF8C00]" />
          <p className="text-sm text-gray-500">Cargando detalles de la sesión...</p>
        </div>
      </div>
    );
    if (isModal) {
      return (
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-4">
          {loadingContent}
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEF9F6]">
        {loadingContent}
      </div>
    );
  }

  if (error || !session) {
    const errorContent = (
      <div className="text-center max-w-md px-6 py-8">
        <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Sesión no encontrada</h2>
        <p className="text-sm text-gray-500 mb-6">{error || 'No se pudo cargar la información de esta sesión.'}</p>
        <button
          onClick={() => router.push(backUrl)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF8C00] text-white text-sm font-medium hover:bg-[#e07d00] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>
      </div>
    );
    if (isModal) {
      return (
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-4">
          {errorContent}
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEF9F6]">
        {errorContent}
      </div>
    );
  }

  // ─── Empty state for inaccessible sessions ──────────────────────────────

  if (!showFullDetail) {
    let message = 'No tienes acceso a esta solicitud.';
    if (session.status === 'Accepted' && !isTutor && !isStudent) {
      message = 'Esta solicitud ya fue tomada por otro tutor.';
    } else if (session.status === 'Rejected') {
      message = isStudent
        ? 'Tu solicitud de tutoría fue rechazada. Puedes buscar otro tutor.'
        : 'Esta solicitud fue rechazada.';
    } else if (session.status === 'Canceled') {
      message = 'Esta sesión fue cancelada.';
    }

    const emptyContent = (
      <div className="text-center max-w-md px-6 py-8">
        <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Solicitud no disponible</h2>
        <p className="text-sm text-gray-500 mb-2">{message}</p>
        <StatusBadge status={session.status} />
        <div className="mt-6">
          <button
            onClick={() => router.push(backUrl)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF8C00] text-white text-sm font-medium hover:bg-[#e07d00] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </button>
        </div>
      </div>
    );
    if (isModal) {
      return (
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-4">
          {emptyContent}
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEF9F6]">
        {emptyContent}
      </div>
    );
  }

  // ─── Full detail view ──────────────────────────────────────────────────────

  const modalContent = (
    <div className="bg-[#FEF9F6]">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
        {/* Back link / Close button */}
        {isModal ? (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors ml-auto"
          >
            Cerrar
            <XCircle className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              {isStudent ? 'Detalle de tu tutoría' : 'Detalle de la solicitud'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isStudent ? 'Tutoría' : 'Solicitud de tutoría'} #{(sessionId || session?.id || '').slice(0, 8)}
            </p>
          </div>
          <StatusBadge status={session.status} />
        </div>

        {/* Contextual banners */}
        {session.status === 'Accepted' && isTutor && (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 p-4 mb-6">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              Aceptaste esta tutoría. Revisa el material adjunto para preparar la clase.
            </p>
          </div>
        )}
        {session.status === 'Pending' && isStudent && (
          <div className="flex items-center gap-3 rounded-xl bg-yellow-50 border border-yellow-200 p-4 mb-6">
            <Clock className="w-5 h-5 text-yellow-600 shrink-0" />
            <p className="text-sm text-yellow-800 font-medium">
              Esperando confirmación del tutor. Te notificaremos cuando responda.
            </p>
          </div>
        )}
        {session.status === 'Accepted' && isStudent && (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 p-4 mb-6">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              ¡Tutoría confirmada! Tu tutor aceptó la sesión.
            </p>
          </div>
        )}
        {session.status === 'Completed' && isStudent && (
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4 mb-6">
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800 font-medium">
              Tutoría completada. ¡Esperamos que haya sido de gran ayuda!
            </p>
          </div>
        )}
        {canRateStudents && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl bg-blue-50 border border-blue-200 p-4 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <Star className="w-5 h-5 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-800 font-medium">
                {hasRatedAllStudents
                  ? 'Ya calificaste esta tutoría. Puedes editar tu calificación.'
                  : '¿Cómo te fue? Califica a tu estudiante — la calificación es privada.'}
              </p>
            </div>
            <button
              onClick={() => setShowStudentReviewModal(true)}
              className="px-4 py-2 bg-[#006bb3] text-white text-sm font-semibold rounded-lg hover:bg-[#005694] transition-colors shrink-0"
            >
              {hasRatedAllStudents
                ? 'Editar calificación'
                : (session.participants?.length || 0) > 1
                ? 'Calificar estudiantes'
                : 'Calificar estudiante'}
            </button>
          </div>
        )}

        {/* Content cards */}
        <div className="space-y-4">
          {/* Person info — tutors see student, students see tutor */}
          {isTutor && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {(session.participants?.length || 0) > 1 ? 'Estudiantes' : 'Estudiante'}
              </h3>
              <div className="space-y-3">
                {(session.participants || []).map((p) => (
                  <div key={p.studentId} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-[#FF8C00]">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{p.student?.name || 'Estudiante'}</p>
                      <p className="text-sm text-gray-500 truncate">{p.student?.email}</p>
                      {/* Private student rating (estilo Uber) — tutors see ONLY the
                          star average, never the count nor the comments. null = "Nuevo". */}
                      {typeof p.student?.studentRating === 'number' ? (
                        <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                          <span className="font-semibold">{p.student.studentRating.toFixed(1)}</span>
                        </p>
                      ) : p.student?.studentRating === null ? (
                        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 mt-0.5">
                          Nuevo
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isStudent && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Tutor</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-[#FF8C00]">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{session.tutor?.name || 'Tutor'}</p>
                  <p className="text-sm text-gray-500 truncate">{session.tutor?.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Course + Schedule */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sesión</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-[#FF8C00]">
                  <BookOpen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{session.course?.name}</p>
                  {session.course?.code && <p className="text-xs text-gray-400">{session.course.code}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-[#FF8C00]">
                  <Calendar className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 capitalize">
                    {formatSessionDate(session.startTimestamp)}
                  </p>
                  <p className="text-sm text-[#FF8C00]">
                    {formatSessionTime(session.startTimestamp, session.endTimestamp)}
                  </p>
                </div>
              </div>

              {session.googleMeetLink && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <GraduationCap className="w-4.5 h-4.5" />
                  </div>
                  <a
                    href={session.googleMeetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Unirse a Google Meet
                  </a>
                </div>
              )}

              {/* Cost */}
              {session.price && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">${session.price.toLocaleString('es-CO')}</p>
                    <p className="text-xs text-gray-400">Costo de la sesión</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cancellation Policy */}
          {session.status !== 'Canceled' && session.status !== 'Completed' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-900 mb-1">
                Política de cancelación
              </p>
              <p className="text-xs text-yellow-800">
                Puedes cancelar hasta 6 horas antes de la sesión. Después de ese tiempo no es posible cancelar.
              </p>
            </div>
          )}

          {/* Topics to review */}
          {session.topicsToReview && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {isStudent ? 'Lo que solicitaste repasar' : 'Temas a repasar'}
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                {session.topicsToReview}
              </p>
            </div>
          )}

          {/* Attachments */}
          {attachmentsError !== 'forbidden' && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Material adjunto
              </h3>
              <AttachmentList
                attachments={attachments}
                loading={attachmentsLoading}
                error={attachmentsError}
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        {showActions && (
          <div className="mt-8 space-y-3">
            {actionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
                <p className="text-sm text-red-600">{actionError}</p>
              </div>
            )}

            <button
              onClick={handleAccept}
              disabled={!!actionLoading}
              className="w-full py-3.5 bg-[#FF8C00] text-white font-semibold rounded-xl hover:bg-[#e07d00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-sm"
            >
              {actionLoading === 'accept' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Aceptando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Aceptar tutoría
                </>
              )}
            </button>

            <button
              onClick={handleReject}
              disabled={!!actionLoading}
              className="w-full py-3.5 bg-white text-red-600 font-semibold rounded-xl border-2 border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {actionLoading === 'reject' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Rechazando...
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5" />
                  Rechazar tutoría
                </>
              )}
            </button>
          </div>
        )}

        {/* Cancel button for students/tutors with accepted sessions */}
        {(isStudent || isTutor) && session.status === 'Accepted' && (
          <div className="mt-6">
            {canCancel() ? (
              <button
                onClick={handleCancelClick}
                className="w-full py-3.5 bg-white text-red-600 font-semibold rounded-xl border-2 border-red-200 hover:bg-red-50 transition-colors flex justify-center items-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Cancelar tutoría
              </button>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                <p className="text-sm text-yellow-800">
                  No puedes cancelar esta sesión (menos de 6 horas restantes)
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cancellation Modal */}
      {showCancellationModal && (
        <CancellationModal
          isOpen={showCancellationModal}
          onClose={() => setShowCancellationModal(false)}
          session={session}
          onCancellationSuccess={handleCancellationSuccess}
          currentUser={user}
        />
      )}

      {/* Rate-students Modal (tutor → student, private) */}
      {showStudentReviewModal && (
        <StudentReviewModal
          session={session}
          onClose={() => setShowStudentReviewModal(false)}
          onSubmitted={() => loadSession(true)}
        />
      )}
    </div>
  );

  if (isModal) {
    const modalElement = (
      <div 
        className="fixed inset-0 flex items-center justify-center z-50 p-4"
        style={{ 
          backgroundColor: 'rgba(17, 24, 39, 0.4)', 
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)' 
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        }}
      >
        <div 
          className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {modalContent}
        </div>
      </div>
    );

    if (typeof document !== 'undefined') {
      return createPortal(modalElement, document.body);
    }
    return modalElement;
  }

  return modalContent;
}
