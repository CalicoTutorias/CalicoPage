'use client';

/**
 * SessionAttachments — collapsible per-session panel that lazy-loads the files
 * the student uploaded to S3 for a tutoring session and renders them with
 * presigned download links.
 *
 * When `canUpload` is set (the student's own, non-cancelled sessions), the
 * panel also lets them add MORE files after the fact: it uses the
 * session-scoped upload flow (the server derives the subject and verifies the
 * requester is a participant), then refreshes the list.
 *
 * Fetch is deferred until the panel is first expanded so the history list
 * doesn't fire one request per card on mount.
 */

import { useState, useCallback } from 'react';
import { Paperclip, ChevronDown, UploadCloud, Loader2 } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import AttachmentList from '../AttachmentList/AttachmentList';
import FileUploader from '../FileUploader/FileUploader';
import { useFileUpload } from '../../hooks/useFileUpload';

const MAX_PER_SESSION = 5;

export default function SessionAttachments({ sessionId, canUpload = false }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Upload state (only meaningful when canUpload).
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Session-scoped presigned URLs: the server derives the subject from the
  // session and checks the caller is the session's student.
  const getUploadUrls = useCallback(
    (files) =>
      authFetch(`/api/sessions/${encodeURIComponent(sessionId)}/attachments/upload-urls`, {
        method: 'POST',
        body: JSON.stringify({ files }),
      }),
    [sessionId],
  );

  const fileUpload = useFileUpload({ getUploadUrls });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, data } = await authFetch(`/api/sessions/${sessionId}/attachments`);
      if (ok && data?.success) {
        setAttachments(data.attachments || []);
      } else if (data?.code === 'FORBIDDEN') {
        setError('forbidden');
      } else {
        setError('Error al cargar los archivos.');
      }
    } catch {
      setError('Error al cargar los archivos.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [sessionId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  };

  const remaining = Math.max(0, MAX_PER_SESSION - attachments.length);
  const hasPending = fileUpload.files.some(
    (f) => f.status === 'pending' || f.status === 'error',
  );

  const handleSubmit = useCallback(async () => {
    setUploadError(null);
    setSubmitting(true);
    try {
      // Upload to S3 and use the RETURNED metadata (never the derived value —
      // that's the stale-closure trap the booking flow hit).
      const metas = await fileUpload.uploadFiles();
      if (metas.length === 0) {
        setUploadError('No se pudo subir ningún archivo. Intenta de nuevo.');
        return;
      }

      const { ok, data } = await authFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/register`,
        { method: 'POST', body: JSON.stringify({ attachments: metas }) },
      );

      if (!ok || !data?.success) {
        setUploadError(data?.error || 'No se pudieron registrar los archivos.');
        return;
      }

      fileUpload.reset();
      await load(); // refresh with the newly added files (+ fresh download URLs)
    } catch {
      setUploadError('Error al subir los archivos. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [fileUpload, sessionId, load]);

  return (
    <div className="session-attachments">
      <button
        type="button"
        onClick={toggle}
        className="session-attachments__toggle"
        aria-expanded={open}
      >
        <Paperclip className="w-4 h-4" />
        <span>Archivos adjuntos</span>
        <ChevronDown
          className="w-4 h-4"
          style={{
            marginLeft: 'auto',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <div className="session-attachments__body">
          {loaded && error === 'forbidden' ? (
            <p className="text-sm text-gray-400 py-2">
              Los archivos ya no están disponibles para esta sesión.
            </p>
          ) : (
            <AttachmentList
              attachments={attachments}
              loading={loading}
              error={error === 'forbidden' ? null : error}
            />
          )}

          {/* Add-more uploader (student's own, non-cancelled sessions). */}
          {canUpload && loaded && error !== 'forbidden' && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">
                Subir nuevos archivos
              </p>

              {remaining === 0 ? (
                <p className="text-xs text-gray-400">
                  Límite de {MAX_PER_SESSION} archivos por sesión alcanzado.
                </p>
              ) : (
                <>
                  <FileUploader
                    fileUpload={fileUpload}
                    maxFiles={remaining}
                    disabled={submitting}
                  />

                  {uploadError && (
                    <p className="text-xs text-red-600 mt-2">{uploadError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!hasPending || submitting}
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#FF8C00] hover:bg-[#e07d00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    {submitting ? 'Subiendo…' : 'Subir archivos'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
