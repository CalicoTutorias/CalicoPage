'use client';

/**
 * SessionAttachments — collapsible per-session panel that lazy-loads the
 * files the student uploaded to S3 for a tutoring session and renders them
 * with presigned download links.
 *
 * Fetch is deferred until the panel is first expanded so the history list
 * doesn't fire one request per card on mount.
 */

import { useState, useCallback } from 'react';
import { Paperclip, ChevronDown } from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import AttachmentList from '../AttachmentList/AttachmentList';

export default function SessionAttachments({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
        </div>
      )}
    </div>
  );
}
