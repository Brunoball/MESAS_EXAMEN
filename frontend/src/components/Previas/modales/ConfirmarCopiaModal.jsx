// src/components/Previas/modales/ConfirmarCopiaModal.jsx
import React, { useEffect, useRef } from "react";
import { FaUpload } from "react-icons/fa";
import "./ConfirmarCopiaModal.css";

/**
 * Modal de confirmación para guardar snapshot/copia de inscriptos.
 *
 * Props:
 * - open: boolean
 * - loading: boolean
 * - error: string
 * - cantidad: number
 * - onCancel: () => void
 * - onConfirm: () => void
 */
const ConfirmarCopiaModal = ({
  open,
  loading,
  error,
  cantidad,
  onCancel,
  onConfirm,
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-modal-title"
      onMouseDown={onCancel}
    >
      <div
        className="logout-modal-container confirmar-copia-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon" aria-hidden="true">
          <FaUpload />
        </div>

        <h3 id="copy-modal-title" className="logout-modal-title">
          Guardar copia de inscriptos
        </h3>

        <p className="logout-modal-text">
          Se guardará una copia (snapshot) de los{" "}
          <strong>{cantidad}</strong> registros inscriptos en una tabla secundaria.
          <br />
          Esto <strong>no elimina</strong> nada de la tabla principal.
        </p>

        {error && (
          <div className="prev-modal-error" role="alert">
            {error}
          </div>
        )}

        <div className="logout-modal-buttons">
          <button
            type="button"
            className="logout-btn logout-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="logout-btn logout-btn--solid"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Guardando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmarCopiaModal;
