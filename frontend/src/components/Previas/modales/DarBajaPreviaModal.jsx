// src/components/Previas/modales/DarBajaPreviaModal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FaTimes, FaUserMinus } from "react-icons/fa";
import "./DarBajaPreviaModal.css";

const DarBajaPreviaModal = ({
  open,
  item,
  loading,
  error,
  onCancel,
  onConfirm,
}) => {
  const cancelRef = useRef(null);
  const motivoRef = useRef(null);

  const [motivo, setMotivo] = useState("");

  const nombreAlumno = useMemo(() => {
    const a = (item?.alumno || "").trim();
    return a || "este alumno";
  }, [item]);

  useEffect(() => {
    if (!open) return;

    setMotivo("");
    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();

      // Evitar que Enter dentro del textarea dispare confirmación
      const tag = (e.target?.tagName || "").toLowerCase();
      const isTypingInTextarea = tag === "textarea";

      if (e.key === "Enter" && !isTypingInTextarea) {
        e.preventDefault();
        handleConfirm();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ✅ ahora con 1 carácter ya vale
  const motivoValido = motivo.trim().length >= 1;

  const handleConfirm = useCallback(() => {
    const txt = motivo.trim();

    // ✅ 1 solo carácter mínimo
    if (txt.length < 1) {
      motivoRef.current?.focus();
      return;
    }

    // ✅ sin fecha: backend usa NOW()
    // ✅ por las dudas, enviamos en mayúsculas igual
    onConfirm?.({
      motivo_baja: txt.toUpperCase(),
    });
  }, [motivo, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prev-baja-title"
      onMouseDown={onCancel}
    >
      <div
        className="logout-modal-container logout-modal--danger prev-baja-card"
        id="modalBajaPrevia"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* X */}
        <button
          type="button"
          className="prev-baja-x"
          onClick={onCancel}
          disabled={loading}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <FaTimes />
        </button>

        <div className="prev-baja-icon" aria-hidden="true">
          <FaUserMinus />
        </div>

        <h3 id="prev-baja-title" className="prev-baja-title">
          Confirmar baja de previa
        </h3>

        <p className="prev-baja-question">
          ¿Estás seguro que deseas dar de baja a{" "}
          <strong>{nombreAlumno}</strong>?
        </p>

        {/* MOTIVO */}
        <label className="prev-baja-label" htmlFor="motivo-baja-previa">
          Motivo de la baja <span className="prev-baja-required">*</span>
        </label>

        <div className="prev-baja-textarea-wrap">
          <textarea
            id="motivo-baja-previa"
            ref={motivoRef}
            rows={4}
            value={motivo}
            onChange={(e) => {
              // ✅ todo a mayúsculas mientras escribe
              setMotivo((e.target.value || "").toUpperCase());
            }}
            placeholder="Escribí el motivo (obligatorio)"
            disabled={loading}
            className="prev-baja-textarea"
            maxLength={250}
          />
          <div className="prev-baja-counter">{motivo.length}/250</div>
        </div>

        {error && (
          <div className="prev-baja-error" role="alert">
            {error}
          </div>
        )}

        <div className="prev-baja-buttons">
          <button
            type="button"
            className="prev-baja-btn prev-baja-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="prev-baja-btn prev-baja-btn--danger"
            onClick={handleConfirm}
            disabled={loading || !motivoValido}
            title={!motivoValido ? "Ingresá un motivo" : ""}
          >
            {loading ? "Procesando..." : "Confirmar baja"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarBajaPreviaModal;
