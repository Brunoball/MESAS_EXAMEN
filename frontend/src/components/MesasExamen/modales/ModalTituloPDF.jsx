// src/components/MesasExamen/modales/ModalTituloPDF.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./ModalTituloPDF.css";

export default function ModalTituloPDF({
  open,
  onClose,
  onConfirm,
  tituloBase = "MESAS DE EXAMEN",
  defaultExtra = "",
}) {
  const [extra, setExtra] = useState(defaultExtra || "");

  // Reset cuando abre
  useEffect(() => {
    if (open) setExtra(defaultExtra || "");
  }, [open, defaultExtra]);

  // cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tituloFinal = useMemo(() => {
    const base = String(tituloBase || "").trim();
    const ex = String(extra || "").trim();
    return ex ? `${base} ${ex}` : base;
  }, [tituloBase, extra]);

  const confirmar = () => {
    // Podés exigir que escriban algo en extra si querés:
    // if (!String(extra || "").trim()) return;
    onConfirm?.({
      tituloBase: String(tituloBase || "").trim(),
      tituloExtra: String(extra || "").trim(),
      tituloFinal,
    });
  };

  if (!open) return null;

  return (
    <div className="mtp-backdrop" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="mtp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mtp-header">
          <div className="mtp-title">Título del PDF</div>
          <button className="mtp-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="mtp-body">
          <p className="mtp-hint">
            Elegí cómo querés que salga el título arriba del PDF.
          </p>

          <div className="mtp-row">
            <div className="mtp-field">
              <label className="mtp-label">Título fijo</label>
              <input
                className="mtp-input mtp-input--readonly"
                value={tituloBase}
                readOnly
              />
            </div>

            <div className="mtp-field">
              <label className="mtp-label">Continuación</label>
              <input
                className="mtp-input"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Ej: FEBRERO 2026"
                autoFocus
              />
            </div>
          </div>

          <div className="mtp-preview">
            <span className="mtp-preview-label">Vista previa:</span>
            <span className="mtp-preview-title">{tituloFinal}</span>
          </div>
        </div>

        <div className="mtp-actions">
          <button className="mtp-btn mtp-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="mtp-btn mtp-btn--primary" onClick={confirmar}>
            Confirmar y exportar
          </button>
        </div>
      </div>
    </div>
  );
}
