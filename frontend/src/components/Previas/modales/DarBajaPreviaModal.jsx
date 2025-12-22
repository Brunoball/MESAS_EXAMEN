// src/components/Previas/modales/DarBajaPreviaModal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FaTimes, FaUserMinus } from "react-icons/fa";
import "./DarBajaPreviaModal.css";

const MOTIVOS = {
  APROBO_DIA: "APROBO_DIA",
  PASE_OTRO_COLEGIO: "PASE_OTRO_COLEGIO",
  OTRO: "OTRO",
};

const hoyISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const DarBajaPreviaModal = ({ open, item, loading, error, onCancel, onConfirm }) => {
  const cancelRef = useRef(null);
  const fechaRef = useRef(null);
  const miniTextRef = useRef(null);

  const [tipoMotivo, setTipoMotivo] = useState(MOTIVOS.APROBO_DIA);
  const [fechaAprobado, setFechaAprobado] = useState("");
  const [otroMotivo, setOtroMotivo] = useState("");

  const [openOtroModal, setOpenOtroModal] = useState(false);
  const [draftOtro, setDraftOtro] = useState("");

  const nombreAlumno = useMemo(() => {
    const a = (item?.alumno || "").trim();
    return a || "este alumno";
  }, [item]);

  // ✅ Abre el picker del input date aunque toques cualquier parte del input
  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el || loading || tipoMotivo !== MOTIVOS.APROBO_DIA) return;

    // Chrome/Edge nuevos
    if (typeof el.showPicker === "function") {
      el.showPicker();
      return;
    }

    // Fallback general
    el.focus();
    el.click();
  }, [loading, tipoMotivo]);

  // ✅ 1) Reset SOLO cuando abre el modal principal
  useEffect(() => {
    if (!open) return;

    setTipoMotivo(MOTIVOS.APROBO_DIA);
    setOtroMotivo("");
    setFechaAprobado(hoyISO());

    setOpenOtroModal(false);
    setDraftOtro("");

    setTimeout(() => cancelRef.current?.focus(), 30);
  }, [open]);

  // ✅ 2) Listener de teclado separado
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (openOtroModal) {
          e.preventDefault();
          setOpenOtroModal(false);
          return;
        }
        onCancel?.();
        return;
      }

      const tag = (e.target?.tagName || "").toLowerCase();
      const isTyping = tag === "textarea" || tag === "input";

      if (e.key === "Enter" && !isTyping && !openOtroModal) {
        e.preventDefault();
        handleConfirm();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openOtroModal]);

  const formValido = useMemo(() => {
    if (tipoMotivo === MOTIVOS.APROBO_DIA) return !!fechaAprobado;
    if (tipoMotivo === MOTIVOS.OTRO) return (otroMotivo || "").trim().length >= 1;
    return true;
  }, [tipoMotivo, fechaAprobado, otroMotivo]);

  const handleConfirm = useCallback(() => {
    if (tipoMotivo === MOTIVOS.APROBO_DIA) {
      if (!fechaAprobado) {
        fechaRef.current?.focus();
        return;
      }
      onConfirm?.({
        tipo_motivo: MOTIVOS.APROBO_DIA,
        motivo_baja: "APROBÓ",
        fecha_baja: fechaAprobado,
      });
      return;
    }

    if (tipoMotivo === MOTIVOS.PASE_OTRO_COLEGIO) {
      onConfirm?.({
        tipo_motivo: MOTIVOS.PASE_OTRO_COLEGIO,
        motivo_baja: "PASE A OTRO COLEGIO",
      });
      return;
    }

    const txt = (otroMotivo || "").trim();
    if (txt.length < 1) {
      setDraftOtro(otroMotivo || "");
      setOpenOtroModal(true);
      setTimeout(() => miniTextRef.current?.focus(), 60);
      return;
    }

    onConfirm?.({
      tipo_motivo: MOTIVOS.OTRO,
      motivo_baja: txt.toUpperCase(),
      motivo_otro: txt.toUpperCase(),
    });
  }, [tipoMotivo, fechaAprobado, otroMotivo, onConfirm]);

  const selectAprobo = useCallback(() => {
    if (loading) return;
    setTipoMotivo(MOTIVOS.APROBO_DIA);
    setTimeout(() => fechaRef.current?.focus(), 40);
  }, [loading]);

  const selectPase = useCallback(() => {
    if (loading) return;
    setTipoMotivo(MOTIVOS.PASE_OTRO_COLEGIO);
  }, [loading]);

  const openOtro = useCallback(() => {
    if (loading) return;
    setTipoMotivo(MOTIVOS.OTRO);
    setDraftOtro(otroMotivo || "");
    setOpenOtroModal(true);
    setTimeout(() => miniTextRef.current?.focus(), 60);
  }, [loading, otroMotivo]);

  const closeOtroModal = useCallback(() => {
    setOpenOtroModal(false);
  }, []);

  const saveOtroModal = useCallback(() => {
    const txt = (draftOtro || "").trim();
    if (!txt) {
      miniTextRef.current?.focus();
      return;
    }
    setTipoMotivo(MOTIVOS.OTRO);
    setOtroMotivo(txt.toUpperCase());
    setOpenOtroModal(false);
  }, [draftOtro]);

  if (!open) return null;

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prev-baja-title"
      onClick={() => {
        if (openOtroModal) return;
        onCancel?.();
      }}
    >
      <div
        className="logout-modal-container logout-modal--danger prev-baja-card"
        id="modalBajaPrevia"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
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
          <div
            role="button"
            tabIndex={0}
            className={`prev-baja-motivo-item ${
              tipoMotivo === MOTIVOS.APROBO_DIA ? "is-checked" : ""
            }`}
            onClick={() => {
              selectAprobo();
              // ✅ opcional: si tocás la tarjeta, abre el calendario al toque
              setTimeout(() => openDatePicker(), 0);
            }}
            onKeyDown={(e) => e.key === "Enter" && selectAprobo()}
          >
            <label className="prev-baja-radio" onClick={(e) => e.stopPropagation()}>
              <input
                type="radio"
                name="motivo_baja"
                value={MOTIVOS.APROBO_DIA}
                checked={tipoMotivo === MOTIVOS.APROBO_DIA}
                onChange={selectAprobo}
                disabled={loading}
              />
              <span>APROBÓ EL DÍA</span>
            </label>

            <input
              ref={fechaRef}
              type="date"
              className="prev-baja-date"
              value={fechaAprobado}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                openDatePicker(); // ✅ abre tocando cualquier parte del input
              }}
              onChange={(e) => setFechaAprobado(e.target.value)}
              disabled={loading || tipoMotivo !== MOTIVOS.APROBO_DIA}
              title="Seleccioná la fecha"
            />
          </div>

          {/* PASE */}
          <div
            role="button"
            tabIndex={0}
            className={`prev-baja-motivo-item ${
              tipoMotivo === MOTIVOS.PASE_OTRO_COLEGIO ? "is-checked" : ""
            }`}
            onClick={selectPase}
            onKeyDown={(e) => e.key === "Enter" && selectPase()}
          >
            <label className="prev-baja-radio" onClick={(e) => e.stopPropagation()}>
              <input
                type="radio"
                name="motivo_baja"
                value={MOTIVOS.PASE_OTRO_COLEGIO}
                checked={tipoMotivo === MOTIVOS.PASE_OTRO_COLEGIO}
                onChange={selectPase}
                disabled={loading}
              />
              <span>PASE A OTRO COLEGIO</span>
            </label>
          </div>

          {/* OTRO */}
          <div
            role="button"
            tabIndex={0}
            className={`prev-baja-motivo-item ${
              tipoMotivo === MOTIVOS.OTRO ? "is-checked" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              openOtro();
            }}
            onKeyDown={(e) => e.key === "Enter" && openOtro()}
          >
            <label className="prev-baja-radio" onClick={(e) => e.stopPropagation()}>
              <input
                type="radio"
                name="motivo_baja"
                value={MOTIVOS.OTRO}
                checked={tipoMotivo === MOTIVOS.OTRO}
                onChange={openOtro}
                disabled={loading}
              />
              <span>OTRO MOTIVO (escribir)</span>
            </label>

            {tipoMotivo === MOTIVOS.OTRO && (otroMotivo || "").trim() ? (
              <span className="prev-baja-otro-preview" title={otroMotivo}>
                {otroMotivo.length > 22 ? `${otroMotivo.slice(0, 22)}…` : otroMotivo}
              </span>
            ) : (
              <span className="prev-baja-otro-preview prev-baja-otro-preview--hint">
                Escribir…
              </span>
            )}
          </div>
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

        {/* MINI MODAL OTRO */}
        {openOtroModal && (
          <div
            className="prev-baja-mini-overlay"
            onClick={closeOtroModal}
            role="dialog"
            aria-modal="true"
            aria-label="Escribir motivo"
          >
            <div className="prev-baja-mini-card" onClick={(e) => e.stopPropagation()}>
              <div className="prev-baja-mini-head">
                <div className="prev-baja-mini-title">Escribir motivo</div>
                <button
                  type="button"
                  className="prev-baja-mini-x"
                  onClick={closeOtroModal}
                  disabled={loading}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  <FaTimes />
                </button>
              </div>

              <textarea
                ref={miniTextRef}
                rows={4}
                value={draftOtro}
                onChange={(e) => setDraftOtro((e.target.value || "").toUpperCase())}
                placeholder="Escribí el motivo (obligatorio)"
                disabled={loading}
                className="prev-baja-mini-textarea"
                maxLength={250}
              />

              <div className="prev-baja-mini-counter">{draftOtro.length}/250</div>

              <div className="prev-baja-mini-actions">
                <button
                  type="button"
                  className="prev-baja-btn prev-baja-btn--ghost"
                  onClick={closeOtroModal}
                  disabled={loading}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="prev-baja-btn prev-baja-btn--danger"
                  onClick={saveOtroModal}
                  disabled={loading || (draftOtro || "").trim().length < 1}
                  title={(draftOtro || "").trim().length < 1 ? "Escribí un motivo" : ""}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DarBajaPreviaModal;
