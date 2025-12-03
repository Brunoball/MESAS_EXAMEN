// src/components/MesasExamen/modales/ModalMoverPreviaMesa.jsx
import React, { useEffect, useState } from "react";
import { FaTimes, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalMoverPreviaMesa.css";

/**
 * ModalMoverPreviaMesa
 *
 * Props:
 * - open: boolean
 * - previa: objeto previa (id_previa, alumno, etc.)
 * - onClose: function
 * - onMoved: function(jsonRespuesta) => void   // se llama cuando se mueve con éxito
 */
const ModalMoverPreviaMesa = ({ open, previa, onClose, onMoved }) => {
  const [loading, setLoading] = useState(false);
  const [mesas, setMesas] = useState([]);
  const [error, setError] = useState(null);

  const [materiaNombre, setMateriaNombre] = useState("");
  const [numeroMesaActual, setNumeroMesaActual] = useState(null);

  const [selectedNumeroMesa, setSelectedNumeroMesa] = useState(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!open || !previa?.id_previa) return;

    let abortado = false;

    const cargarOpciones = async () => {
      setLoading(true);
      setError(null);
      setMesas([]);
      setSelectedNumeroMesa(null);

      try {
        const resp = await fetch(
          `${BASE_URL}/api.php?action=mesas_opciones_mover_previa`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_previa: Number(previa.id_previa) }),
          }
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || `HTTP ${resp.status}`);
        }

        if (!abortado) {
          setMesas(Array.isArray(json.mesas) ? json.mesas : []);
          setMateriaNombre(json.previa?.materia || "");
          setNumeroMesaActual(json.previa?.numero_mesa_actual || null);
        }
      } catch (e) {
        if (!abortado) {
          const msg =
            e.message ||
            "Error al obtener las mesas disponibles para mover la previa.";
          setError(msg);
        }
      } finally {
        if (!abortado) setLoading(false);
      }
    };

    cargarOpciones();

    return () => {
      abortado = true;
    };
  }, [open, previa]);

  if (!open || !previa) return null;

  const handleOverlayClick = () => {
    if (!loading && !moving) onClose?.();
  };

  const stop = (e) => e.stopPropagation();

  const handleSelectMesa = (numero) => {
    if (moving) return;
    setSelectedNumeroMesa(numero);
  };

  const handleMover = async () => {
    if (!selectedNumeroMesa || !previa?.id_previa) return;

    setMoving(true);
    setError(null);

    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesas_mover_previa`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_previa: Number(previa.id_previa),
            numero_mesa_destino: Number(selectedNumeroMesa),
          }),
        }
      );

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }

      // Avisamos al padre que se movió OK (para cerrar ambos modales y mostrar toast)
      if (typeof onMoved === "function") {
        onMoved(json);
      }
      // No cerramos acá directamente el modal de previas, eso lo hace el padre.
      // Este modal se cierra cuando el padre hace setSelectedPrevia(null).
    } catch (e) {
      const msg = e.message || "Error al mover la previa de mesa.";
      setError(msg);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div
      className="modal-mover-previa-overlay"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
    >
      <div className="modal-mover-previa-container" onClick={stop}>
        <header className="modal-mover-previa-header">
          <h3 className="modal-mover-previa-title">
            Mover previa de {previa.alumno}
          </h3>
          {materiaNombre && (
            <p className="modal-mover-previa-subtitle">
              Materia: <strong>{materiaNombre}</strong>
            </p>
          )}
          {numeroMesaActual && (
            <p className="modal-mover-previa-subtitle">
              Mesa actual: <strong>Nº {numeroMesaActual}</strong>
            </p>
          )}
          <button
            type="button"
            className="modal-mover-previa-close"
            onClick={onClose}
            disabled={loading || moving}
            aria-label="Cerrar"
          >
            <FaTimes />
          </button>
        </header>

        <div className="modal-mover-previa-body">
          {loading && (
            <p className="modal-mover-previa-info">
              Cargando mesas de la misma materia…
            </p>
          )}
          {error && !loading && (
            <p className="modal-mover-previa-error">{error}</p>
          )}

          {!loading && !error && (
            <>
              {mesas.length === 0 ? (
                <p className="modal-mover-previa-info">
                  No hay otras mesas con la misma materia para mover esta
                  previa.
                </p>
              ) : (
                <div className="modal-mover-previa-table-wrapper">
                  <table className="modal-mover-previa-table">
                    <thead>
                      <tr>
                        <th>Seleccionar</th>
                        <th>Nº Mesa</th>
                        <th>Fecha</th>
                        <th>Turno</th>
                        <th>Materia</th>
                        <th>Docente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mesas.map((m) => {
                        let fechaFmt = "";
                        if (m.fecha_mesa) {
                          const [y, mo, d] = m.fecha_mesa.split("-");
                          if (y && mo && d) {
                            fechaFmt = `${d}/${mo}/${y}`;
                          }
                        }

                        const materiaDestino = m.materia || materiaNombre || "-";
                        const docenteDestino = m.docente || "-";

                        return (
                          <tr key={m.numero_mesa}>
                            <td>
                              <input
                                type="radio"
                                name="dest_mesa"
                                value={m.numero_mesa}
                                checked={
                                  Number(selectedNumeroMesa) ===
                                  Number(m.numero_mesa)
                                }
                                onChange={() =>
                                  handleSelectMesa(m.numero_mesa)
                                }
                                disabled={moving}
                              />
                            </td>
                            <td>{m.numero_mesa}</td>
                            <td>{fechaFmt || "-"}</td>
                            <td>{m.nombre_turno || "-"}</td>
                            <td>{materiaDestino}</td>
                            <td>{docenteDestino}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="modal-mover-previa-footer">
          <button
            type="button"
            className="modal-mover-previa-footer-btn cancelar"
            onClick={onClose}
            disabled={loading || moving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="modal-mover-previa-footer-btn mover"
            onClick={handleMover}
            disabled={
              loading || moving || !selectedNumeroMesa || mesas.length === 0
            }
          >
            <FaCheck style={{ marginRight: 6 }} />
            {moving ? "Moviendo…" : "Mover previa"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ModalMoverPreviaMesa;
