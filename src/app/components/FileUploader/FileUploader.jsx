'use client';

/**
 * FileUploader — Drag-and-drop file upload component with per-file progress.
 *
 * Props:
 *   fileUpload    — The object returned by useFileUpload() hook
 *   maxFiles      — Max files allowed (default 5, for display only)
 *   disabled      — Disable all interactions (e.g., during payment)
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText, Image, FileWarning, RotateCcw, Check } from 'lucide-react';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.doc,.docx';

const FILE_TYPE_ICONS = {
  'application/pdf': FileText,
  'image/png': Image,
  'image/jpeg': Image,
  'image/jpg': Image,
  'application/msword': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploader({ fileUpload, maxFiles = 5, disabled = false }) {
  const { files, addFiles, removeFile, retryFile, isUploading } = fileUpload;
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  const handleFiles = useCallback(
    (fileList) => {
      if (disabled) return;
      setValidationErrors([]);
      const { rejected } = addFiles(fileList);
      if (rejected.length > 0) {
        setValidationErrors(rejected.map((r) => r.error));
        // Auto-clear validation errors after 5 seconds
        setTimeout(() => setValidationErrors([]), 5000);
      }
    },
    [addFiles, disabled],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles, disabled],
  );

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e) => {
      handleFiles(e.target.files);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFiles],
  );

  const canAddMore = files.length < maxFiles && !disabled;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {canAddMore && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-2
            rounded-xl border-2 border-dashed p-4 sm:p-6
            cursor-pointer transition-all duration-200
            ${isDragging
              ? 'border-[#FF8C00] bg-orange-50/60'
              : 'border-gray-200 bg-gray-50/50 hover:border-[#FF8C00]/50 hover:bg-orange-50/30'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <Upload
            className={`w-8 h-8 ${isDragging ? 'text-[#FF8C00]' : 'text-gray-400'}`}
          />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              {isDragging ? 'Suelta los archivos aquí' : 'Arrastra archivos o haz clic para seleccionar'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, PNG, JPG, DOC, DOCX — Máx. 10 MB por archivo — {files.length}/{maxFiles} archivos
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
          {validationErrors.map((error, i) => (
            <p key={i} className="text-xs text-red-600 flex items-center gap-1.5">
              <FileWarning className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <FileRow
              key={f.id}
              entry={f}
              onRemove={() => removeFile(f.id)}
              onRetry={() => retryFile(f.id)}
              disabled={disabled || isUploading}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({ entry, onRemove, onRetry, disabled }) {
  const { fileName, fileSize, mimeType, status, progress, error } = entry;
  const Icon = FILE_TYPE_ICONS[mimeType] || FileText;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
      {/* Icon */}
      <div
        className={`
          flex items-center justify-center w-9 h-9 rounded-lg shrink-0
          ${status === 'error' ? 'bg-red-50 text-red-500' : ''}
          ${status === 'success' ? 'bg-green-50 text-green-600' : ''}
          ${status === 'pending' || status === 'uploading' ? 'bg-orange-50 text-[#FF8C00]' : ''}
        `}
      >
        {status === 'success' ? (
          <Check className="w-4.5 h-4.5" />
        ) : status === 'error' ? (
          <FileWarning className="w-4.5 h-4.5" />
        ) : (
          <Icon className="w-4.5 h-4.5" />
        )}
      </div>

      {/* File info + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{fileName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{formatFileSize(fileSize)}</span>
          {status === 'uploading' && (
            <span className="text-xs text-[#FF8C00] font-medium">{progress}%</span>
          )}
          {status === 'success' && (
            <span className="text-xs text-green-600 font-medium">Subido</span>
          )}
          {status === 'error' && (
            <span className="text-xs text-red-500 truncate">{error}</span>
          )}
        </div>

        {/* Progress bar */}
        {status === 'uploading' && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#FF8C00] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {status === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            disabled={disabled}
            className="p-1.5 rounded-md text-gray-400 hover:text-[#FF8C00] hover:bg-orange-50 transition-colors disabled:opacity-40"
            title="Reintentar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
          title="Eliminar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}
