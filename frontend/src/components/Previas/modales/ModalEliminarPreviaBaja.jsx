// src/components/Previas/modales/ModalEliminarPreviaBaja.jsx
import React, { useEffect, useRef } from "react";
import { FaTimes, FaTrash } from "react-icons/fa";
import "./ModalEliminarPreviaBaja.css";

const ModalEliminarPreviaBaja = ({ open, item, loading, error, onCancel, onConfirm }) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onConfirm?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="delprev-overlay" role="dialog" aria-modal="true" onMouseDown={onCancel}>
      <div className="delprev-card" onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="delprev-x"
          onClick={onCancel}
          disabled={loading}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <FaTimes />
        </button>

        <div className="delprev-icon" aria-hidden="true">
          <FaTrash />
        </div>

        <h3 className="delprev-title">Confirmar eliminación</h3>

        <p className="delprev-text">
          ¿Seguro que querés <strong>eliminar</strong> este registro?
        </p>

        {item && (
          <div className="delprev-pill">
            <strong>{item.alumno}</strong>
            <div className="delprev-sub">DNI: {item.dni}</div>
          </div>
        )}

        {error ? (
          <div className="delprev-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="delprev-actions">
          <button
            type="button"
            className="delprev-btn delprev-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="delprev-btn delprev-btn--danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEliminarPreviaBaja;
