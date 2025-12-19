import React, { useEffect, useRef, useState } from "react";
import { FaTimes, FaUserPlus, FaCalendarAlt } from "react-icons/fa";
import "./DarAltaPreviaModal.css";

const hoyISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const DarAltaPreviaModal = ({ open, item, loading, error, onCancel, onConfirm }) => {
  const cancelRef = useRef(null);
  const dateRef = useRef(null);              // 👈 nuevo
  const [fecha, setFecha] = useState(hoyISO());

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    setFecha(hoyISO());

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  const openDatePicker = (e) => {            // 👈 nuevo (igual que en Profesores)
    e?.preventDefault?.();
    const el = dateRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
      try { el.click(); } catch {}
    }
  };

  const handleKeyDownPicker = (e) => {       // 👈 nuevo
    if (e.key === "Enter" || e.key === " ") openDatePicker(e);
  };

  if (!open) return null;

  return (
    <div
      className="dam-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-title"
      onMouseDown={onCancel}
    >
      <div className="dam-card" onMouseDown={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="dam-head">
          <div className="dam-head-left">
            <div className="dam-badge" aria-hidden="true">
              <FaUserPlus />
            </div>
            <div>
              <h3 id="dam-title" className="dam-title">
                Reactivar previa
              </h3>
              <p className="dam-subtitle">Esto devuelve la previa a la lista activa.</p>
            </div>
          </div>

          <button
            className="dam-x"
            onClick={onCancel}
            disabled={loading}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <FaTimes />
          </button>
        </div>

        {/* resumen item */}
        {item && (
          <div className="dam-summary">
            <div className="dam-summary-row">
              <span className="dam-label">Alumno</span>
              <span className="dam-value">{item.alumno}</span>
            </div>
            <div className="dam-summary-row">
              <span className="dam-label">DNI</span>
              <span className="dam-value">{item.dni}</span>
            </div>
            <div className="dam-summary-row">
              <span className="dam-label">Materia</span>
              <span className="dam-value">{item.materia_nombre}</span>
            </div>
          </div>
        )}

        {/* form (solo fecha) */}
        <div className="dam-grid">
          <div className="dam-field dam-field--full">
            <label className="dam-field-label">
              <FaCalendarAlt /> Fecha (se guardará en Fecha de carga)
            </label>

            {/* 👇 contenedor clickeable (cualquier click abre calendario) */}
            <div
              className="dam-date-wrap"
              role="button"
              tabIndex={0}
              onMouseDown={openDatePicker}
              onKeyDown={handleKeyDownPicker}
              aria-label="Abrir selector de fecha"
            >
              <input
                ref={dateRef}
                type="date"
                className="dam-input dam-input--date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={loading}
              />

            </div>
          </div>
        </div>

        {error && (
          <div className="dam-error" role="alert">
            {error}
          </div>
        )}

        {/* footer */}
        <div className="dam-actions">
          <button
            type="button"
            className="dam-btn dam-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="dam-btn dam-btn--primary"
            onClick={() => onConfirm?.({ fecha_alta: fecha })}
            disabled={loading || !fecha}
            title={!fecha ? "Elegí una fecha" : "Reactivar"}
          >
            {loading ? "Procesando..." : "Dar de alta"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarAltaPreviaModal;
