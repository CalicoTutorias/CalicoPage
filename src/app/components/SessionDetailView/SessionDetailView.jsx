'use client';

/**
 * SessionDetailView — Full session detail page for tutors.
 *
 * Fetched from the email link: /sessions/[id]/detail
 *
 * Conditional rendering based on session status + user role:
 *   Pending              → full info + topics + attachments + Accept/Reject buttons
 *   Accepted (this tutor)→ full info + topics + attachments + "Accepted" badge (no actions)
 *   Accepted (other)     → empty state: "Taken by another tutor"
 *   Rejected / Canceled  → empty state: status message
 */

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/SecureAuthContext';
import { TutoringSessionService } from '../../services/core/TutoringSessionService';
import { authFetch } from '../../services/authFetch';
import AttachmentList from '../AttachmentList/AttachmentList';

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

export default function SessionDetailView({ sessionId }) {
  const { user } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState(null);

  const [actionLoading, setActionLoading] = useState(null); // 'accept' | 'reject' | null
  const [actionError, setActionError] = useState(null);

  // ─── Fetch session ─────────────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await TutoringSessionService.getSessionById(sessionId);
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
  }, [sessionId]);

  // ─── Fetch attachments ─────────────────────────────────────────────────────

  const loadAttachments = useCallback(async () => {
    if (!sessionId) return;
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const { ok, data } = await authFetch(`/api/sessions/${sessionId}/attachments`);
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
  }, [sessionId]);

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
    const { success, error: err } = await TutoringSessionService.acceptSession(sessionId);
    setActionLoading(null);
    if (success) {
      await loadSession(); // Refresh to show new status
    } else {
      setActionError(err || 'Error al aceptar la sesión.');
    }
  };

  const handleReject = async () => {
    setActionLoading('reject');
    setActionError(null);
    const { success, error: err } = await TutoringSessionService.rejectSession(sessionId);
    setActionLoading(null);
    if (success) {
      await loadSession();
    } else {
      setActionError(err || 'Error al rechazar la sesión.');
    }
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

  // Student info (first participant)
  const student = session?.participants?.[0]?.student;

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEF9F6]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF8C00]" />
          <p className="text-sm text-gray-500">Cargando detalles de la sesión...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEF9F6]">
        <div className="text-center max-w-md px-6">
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

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEF9F6]">
        <div className="text-center max-w-md px-6">
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
      </div>
    );
  }

  // ─── Full detail view ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FEF9F6]">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              {isStudent ? 'Detalle de tu tutoría' : 'Detalle de la solicitud'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isStudent ? 'Tutoría' : 'Solicitud de tutoría'} #{sessionId.slice(0, 8)}
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

        {/* Content cards */}
        <div className="space-y-4">
          {/* Person info — tutors see student, students see tutor */}
          {isTutor && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Estudiante</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-[#FF8C00]">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{student?.name || 'Estudiante'}</p>
                  <p className="text-sm text-gray-500 truncate">{student?.email}</p>
                </div>
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
            </div>
          </div>

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
      </div>
    </div>
  );
}
