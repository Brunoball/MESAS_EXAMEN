// src/components/Previas/modales/DarBajaPreviaModal.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
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
  const motivoRef = useRef(null);
  const fechaRef = useRef(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open) return;

    setFecha(hoyISO());
    setMotivo("");
    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") handleConfirm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openDatePicker = useCallback(
    (e) => {
      e?.preventDefault?.();
      if (loading) return;

      const el = fechaRef.current;
      if (!el) return;

      try {
        if (typeof el.showPicker === "function") el.showPicker();
        else {
          el.focus();
          el.click();
        }
      } catch {
        el.focus();
        try {
          el.click();
        } catch {}
      }
    },
    [loading]
  );

  if (!open) return null;

  const motivoValido = motivo.trim().length >= 3;

  const handleConfirm = () => {
    const txt = motivo.trim();
    if (!fecha) return;

    if (txt.length < 3) {
      motivoRef.current?.focus();
      return;
    }

    onConfirm?.({
      fecha_baja: fecha,
      motivo_baja: txt,
    });
  };

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prev-baja-title"
      onMouseDown={onCancel}
    >
      <div
        className="logout-modal-container logout-modal--danger"
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

        <div
          className="logout-modal__icon"
          aria-hidden="true"
          style={{ color: "#D32F2F" }}
        >
          <FaUserMinus />
        </div>

        <h3
          id="prev-baja-title"
          className="logout-modal-title logout-modal-title--danger"
        >
          Dar de baja previa
        </h3>

        <p className="logout-modal-text">
          Confirmá que querés <strong>dar de baja</strong> la previa e indicá
          fecha y motivo.
        </p>

        {item && (
          <div className="prev-modal-item">
            <strong>{item.alumno}</strong> — DNI {item.dni}
            <br />
            Materia: {item.materia_nombre}
          </div>
        )}

        {/* FECHA + MOTIVO en la misma fila */}
        <div className="prev-baja-grid">
          {/* FECHA */}
          <div className="prev-baja-col">
            <label className="prev-baja-label">
              <p /> Fecha de baja
            </label>

            <div
              className="soc-input-fecha-container prev-baja-datewrap"
              role="button"
              tabIndex={0}
              onMouseDown={openDatePicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openDatePicker(e);
              }}
              aria-label="Abrir selector de fecha"
            >
              <input
                ref={fechaRef}
                type="date"
                className="soc-input-fecha-alta prev-baja-date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={loading}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  openDatePicker(e);
                }}
                onFocus={(e) => openDatePicker(e)}
              />
            </div>
          </div>

          {/* MOTIVO */}
          <div className="prev-baja-col">
            <label className="prev-baja-label" htmlFor="motivo-baja-previa">
              <p/> Motivo de la baja{" "}
              <span style={{ color: "#D32F2F" }}>*</span>
            </label>

            <textarea
              id="motivo-baja-previa"
              ref={motivoRef}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Alumno ya aprobó, se cambió de institución, error de carga…"
              disabled={loading}
              className="prev-baja-textarea"
            />
          </div>
        </div>

        {error && (
          <div className="dbm-error" role="alert">
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
            className="logout-btn logout-btn--solid-danger"
            onClick={handleConfirm}
            disabled={loading || !fecha || !motivoValido}
            title={!motivoValido ? "Ingresá un motivo (mínimo 3 caracteres)" : ""}
          >
            {loading ? "Procesando..." : "Confirmar baja"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarBajaPreviaModal;
