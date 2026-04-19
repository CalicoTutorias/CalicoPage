/**
 * TermsModal Component
 * 
 * Modal reutilizable para mostrar términos y condiciones o tratamiento de datos
 * sin perder el estado del formulario de registro
 * 
 * Props:
 * - isOpen: boolean - si el modal está abierto
 * - onClose: function - función para cerrar el modal
 * - title: string - título del modal
 * - content: React.ReactNode - contenido a mostrar
 */

"use client";

import React from 'react';
import styles from './TermsModal.module.css';

export const TermsModal = ({ isOpen, onClose, title, content }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Cerrar modal"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {content}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.closeButtonFooter}
            onClick={onClose}
            type="button"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
