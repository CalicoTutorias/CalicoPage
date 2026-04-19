'use client';

/**
 * AttachmentList — Renders a list of session file attachments with download links.
 *
 * Props:
 *   attachments  — Array of { id, fileName, fileSize, mimeType, downloadUrl }
 *   loading      — Whether the attachments are being fetched
 *   error        — Error message string (null if no error)
 */

import { FileText, Image, Download, Loader2 } from 'lucide-react';

const FILE_TYPE_ICONS = {
  'application/pdf': FileText,
  'image/png': Image,
  'image/jpeg': Image,
  'image/jpg': Image,
  'application/msword': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
};

const FILE_TYPE_LABELS = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({ attachments = [], loading = false, error = null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Cargando archivos adjuntos...</span>
      </div>
    );
  }

  if (error) {
    return null; // Graceful degradation — don't show anything on 403/error
  }

  if (attachments.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-2">No se adjuntaron archivos.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {attachments.map((att) => {
        const Icon = FILE_TYPE_ICONS[att.mimeType] || FileText;
        const typeLabel = FILE_TYPE_LABELS[att.mimeType] || 'Archivo';

        return (
          <li
            key={att.id}
            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
          >
            {/* File type icon */}
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-50 text-[#FF8C00] shrink-0">
              <Icon className="w-4.5 h-4.5" />
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{att.fileName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{formatFileSize(att.fileSize)}</span>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">{typeLabel}</span>
              </div>
            </div>

            {/* Download button */}
            <a
              href={att.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[#FF8C00] bg-orange-50 hover:bg-orange-100 transition-colors shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
