// src/components/Previas/modales/DarBajaPreviaModal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FaTimes, FaUserMinus } from "react-icons/fa";
import "./DarBajaPreviaModal.css";

const MOTIVOS = {
  APROBO_DIA: "APROBO_DIA",
  PASE_OTRO_COLEGIO: "PASE_OTRO_COLEGIO",
  OTRO: "OTRO",
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
  const otroRef = useRef(null);
  const fechaRef = useRef(null);

  const [tipoMotivo, setTipoMotivo] = useState(MOTIVOS.APROBO_DIA);
  const [fechaAprobado, setFechaAprobado] = useState("");
  const [otroMotivo, setOtroMotivo] = useState("");

  const nombreAlumno = useMemo(() => {
    const a = (item?.alumno || "").trim();
    return a || "este alumno";
  }, [item]);

  useEffect(() => {
    if (!open) return;

    setTipoMotivo(MOTIVOS.APROBO_DIA);
    setOtroMotivo("");

    // default: hoy (YYYY-MM-DD)
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    setFechaAprobado(`${yyyy}-${mm}-${dd}`);

    setTimeout(() => cancelRef.current?.focus(), 30);

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();

      const tag = (e.target?.tagName || "").toLowerCase();
      const isTyping = tag === "textarea" || tag === "input";
      if (e.key === "Enter" && !isTyping) {
        e.preventDefault();
        handleConfirm();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const formValido = useMemo(() => {
    if (tipoMotivo === MOTIVOS.APROBO_DIA) return !!fechaAprobado;
    if (tipoMotivo === MOTIVOS.OTRO) return otroMotivo.trim().length >= 1;
    return true;
  }, [tipoMotivo, fechaAprobado, otroMotivo]);

  const handleConfirm = useCallback(() => {
    // ✅ APROBÓ (con fecha elegida)
    if (tipoMotivo === MOTIVOS.APROBO_DIA) {
      if (!fechaAprobado) {
        fechaRef.current?.focus();
        return;
      }

      onConfirm?.({
        tipo_motivo: MOTIVOS.APROBO_DIA,
        // Compatibilidad: algunos padres mandan motivo_baja
        motivo_baja: "APROBÓ",
        fecha_baja: fechaAprobado, // YYYY-MM-DD
      });
      return;
    }

    // ✅ PASE A OTRO COLEGIO (fecha hoy)
    if (tipoMotivo === MOTIVOS.PASE_OTRO_COLEGIO) {
      onConfirm?.({
        tipo_motivo: MOTIVOS.PASE_OTRO_COLEGIO,
        motivo_baja: "PASE A OTRO COLEGIO",
      });
      return;
    }

    // ✅ OTRO (texto obligatorio)
    const txt = otroMotivo.trim();
    if (txt.length < 1) {
      otroRef.current?.focus();
      return;
    }

    onConfirm?.({
      tipo_motivo: MOTIVOS.OTRO,
      motivo_baja: txt.toUpperCase(),
      motivo_otro: txt.toUpperCase(), // por si el backend usa este
    });
  }, [tipoMotivo, fechaAprobado, otroMotivo, onConfirm]);

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
          ¿Estás seguro que deseas dar de baja a <strong>{nombreAlumno}</strong>?
        </p>

        <label className="prev-baja-label">
          Motivo de la baja <span className="prev-baja-required">*</span>
        </label>

        <div className="prev-baja-motivos">
          {/* APROBÓ EL DÍA + fecha */}
          <div className="prev-baja-motivo-row">
            <label className="prev-baja-radio">
              <input
                type="radio"
                name="motivo_baja"
                value={MOTIVOS.APROBO_DIA}
                checked={tipoMotivo === MOTIVOS.APROBO_DIA}
                onChange={() => setTipoMotivo(MOTIVOS.APROBO_DIA)}
                disabled={loading}
              />
              <span>APROBÓ EL DÍA</span>
            </label>

            <input
              ref={fechaRef}
              type="date"
              className="prev-baja-date"
              value={fechaAprobado}
              onChange={(e) => setFechaAprobado(e.target.value)}
              disabled={loading || tipoMotivo !== MOTIVOS.APROBO_DIA}
              title="Seleccioná la fecha"
            />
          </div>

          {/* PASE */}
          <div className="prev-baja-motivo-row">
            <label className="prev-baja-radio">
              <input
                type="radio"
                name="motivo_baja"
                value={MOTIVOS.PASE_OTRO_COLEGIO}
                checked={tipoMotivo === MOTIVOS.PASE_OTRO_COLEGIO}
                onChange={() => setTipoMotivo(MOTIVOS.PASE_OTRO_COLEGIO)}
                disabled={loading}
              />
              <span>PASE A OTRO COLEGIO</span>
            </label>
          </div>

          {/* OTRO */}
          <div className="prev-baja-motivo-row">
            <label className="prev-baja-radio">
              <input
                type="radio"
                name="motivo_baja"
                value={MOTIVOS.OTRO}
                checked={tipoMotivo === MOTIVOS.OTRO}
                onChange={() => setTipoMotivo(MOTIVOS.OTRO)}
                disabled={loading}
              />
              <span>OTRO MOTIVO (escribir)</span>
            </label>
          </div>

          {tipoMotivo === MOTIVOS.OTRO && (
            <div className="prev-baja-textarea-wrap" style={{ marginTop: 10 }}>
              <textarea
                ref={otroRef}
                rows={4}
                value={otroMotivo}
                onChange={(e) => setOtroMotivo((e.target.value || "").toUpperCase())}
                placeholder="Escribí el motivo (obligatorio)"
                disabled={loading}
                className="prev-baja-textarea"
                maxLength={250}
              />
              <div className="prev-baja-counter">{otroMotivo.length}/250</div>
            </div>
          )}
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
            disabled={loading || !formValido}
            title={!formValido ? "Completá el motivo" : ""}
          >
            {loading ? "Procesando..." : "Confirmar baja"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarBajaPreviaModal;
