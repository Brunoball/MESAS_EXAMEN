import React, { useEffect, useRef } from "react";
import { FaTrash } from "react-icons/fa";
import "../Previas.css"; // o el css que uses para modales globales

export default function ConfirmarLimpiarCopiasModal({
  open,
  loading,
  error,
  onCancel,
  onConfirm,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
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
      aria-labelledby="confirm-limpiar-title"
      onMouseDown={onCancel}
    >
      <div
        className="logout-modal-container logout-modal--danger"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon is-danger" aria-hidden="true">
          <FaTrash />
        </div>

        <h3
          id="confirm-limpiar-title"
          className="logout-modal-title logout-modal-title--danger"
        >
          Eliminar registros de copias
        </h3>

        <p className="logout-modal-text">
          Esta acción eliminará <strong>todas</strong> las copias guardadas del historial.
          No se puede deshacer.
        </p>

        {error ? (
          <div className="prev-modal-error" role="alert">
            {error}
          </div>
        ) : null}

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
            className="logout-btn logout-btn--solid-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
