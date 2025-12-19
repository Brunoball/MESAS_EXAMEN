import React, { useEffect, useRef, useState } from "react";
import { FaTimes, FaUserMinus, FaCalendarAlt, FaCommentDots } from "react-icons/fa";
import "./DarBajaPreviaModal.css";

const hoyISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const DarBajaPreviaModal = ({
  open,
  item,
  loading,
  error,
  onCancel,
  onConfirm,
}) => {
  const cancelRef = useRef(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    setFecha(hoyISO());
    setMotivo("");

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const motivoValido = motivo.trim().length >= 3;

  return (
    <div
      className="dbm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dbm-title"
      onMouseDown={onCancel}
    >
      <div className="dbm-container" onMouseDown={(e) => e.stopPropagation()}>
        <button
          className="dbm-close"
          onClick={onCancel}
          disabled={loading}
          aria-label="Cerrar"
        >
          <FaTimes />
        </button>

        <div className="dbm-icon" aria-hidden="true">
          <FaUserMinus />
        </div>

        <h3 id="dbm-title" className="dbm-title">
          Dar de baja
        </h3>

        <p className="dbm-subtitle">
          Confirmá la baja e indicá la fecha y el motivo.
        </p>

        {item && (
          <div className="dbm-item">
            <strong>{item.alumno}</strong> — DNI {item.dni}
            <br />
            Materia: {item.materia_nombre}
          </div>
        )}

        {/* FECHA */}
        <div className="dbm-field">
          <label className="dbm-label">
            <FaCalendarAlt /> Fecha de baja
          </label>
          <input
            type="date"
            className="dbm-input"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* MOTIVO */}
        <div className="dbm-field">
          <label className="dbm-label">
            <FaCommentDots /> Motivo de la baja
          </label>
          <textarea
            className="dbm-textarea"
            placeholder="Ej: Alumno ya aprobó, se cambió de institución, error de carga…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={loading}
            rows={3}
          />
        </div>

        {error && (
          <div className="dbm-error" role="alert">
            {error}
          </div>
        )}

        <div className="dbm-actions">
          <button
            type="button"
            className="dbm-btn dbm-btn-ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="dbm-btn dbm-btn-danger"
            onClick={() =>
              onConfirm?.({
                fecha_baja: fecha,
                motivo_baja: motivo.trim(),
              })
            }
            disabled={loading || !fecha || !motivoValido}
            title={!motivoValido ? "Ingresá un motivo (mínimo 3 caracteres)" : ""}
          >
            {loading ? "Procesando..." : "Dar de baja"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarBajaPreviaModal;
