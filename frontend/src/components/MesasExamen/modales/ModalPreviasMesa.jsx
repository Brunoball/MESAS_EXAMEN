// src/components/MesasExamen/modales/ModalPreviasMesa.jsx
import React, { useEffect, useState } from "react";
import { FaTimes, FaExchangeAlt } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import ModalMoverPreviaMesa from "./ModalMoverPreviaMesa";
import "./ModalPreviasMesa.css";

/**
 * ModalPreviasMesa
 *
 * Props:
 * - open: boolean
 * - onClose: function
 * - numeroMesa: number
 * - onPreviaMoved: function(mensaje, json) => void   // opcional, para que el padre muestre Toast y recargue
 */
const ModalPreviasMesa = ({ open, onClose, numeroMesa, onPreviaMoved }) => {
  const [loading, setLoading] = useState(false);
  const [previas, setPrevias] = useState([]);
  const [error, setError] = useState(null);

  // Para recargar luego de mover una previa (si se mantuviera abierto)
  const [reloadFlag, setReloadFlag] = useState(0);

  // Previa seleccionada para mover
  const [selectedPrevia, setSelectedPrevia] = useState(null);

  useEffect(() => {
    if (!open || !numeroMesa) return;

    let abortado = false;

    const cargarPrevias = async () => {
      setLoading(true);
      setError(null);

      try {
        const resp = await fetch(
          `${BASE_URL}/api.php?action=mesas_previas_por_mesa`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ numero_mesa: Number(numeroMesa) }),
          }
        );
        const json = await resp.json().catch(() => ({}));

        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || `HTTP ${resp.status}`);
        }

        if (!abortado) {
          setPrevias(Array.isArray(json.data) ? json.data : []);
        }
      } catch (e) {
        if (!abortado) {
          setError(e.message || "Error al obtener las previas de la mesa.");
        }
      } finally {
        if (!abortado) setLoading(false);
      }
    };

    cargarPrevias();

    return () => {
      abortado = true;
    };
  }, [open, numeroMesa, reloadFlag]);

  if (!open) return null;

  const handleOverlayClick = () => {
    // Si está abierto el modal de mover previa, no cierres el principal
    if (selectedPrevia) return;
    if (!loading) onClose?.();
  };

  const stop = (e) => e.stopPropagation();

  const handleAbrirMoverPrevia = (previa) => {
    setSelectedPrevia(previa);
  };

  const handleCierreMoverPrevia = () => {
    setSelectedPrevia(null);
  };

  // Se llama cuando ModalMoverPreviaMesa informa que la previa se movió OK
  const handlePreviaMovida = (json) => {
    // Cerramos el modal de mover
    setSelectedPrevia(null);

    // Si el padre quiere mostrar toast y recargar, le mandamos el mensaje
    if (typeof onPreviaMoved === "function") {
      const msg =
        json?.mensaje || "Previa movida correctamente a la nueva mesa.";
      onPreviaMoved(msg, json);
    }

    // Cerramos también este modal de previas
    onClose?.();

    // Si quisieras solo recargar sin cerrar, podrías usar esto en vez de onClose:
    // setReloadFlag((f) => f + 1);
  };

  return (
    <>
      <div
        className="mprev_overlay"
        role="dialog"
        aria-modal="true"
        onClick={handleOverlayClick}
      >
        <div className="mprev_modal" onClick={stop}>
          {/* HEADER con gradiente como ModalAgregarMesas */}
          <header className="mprev_header">
            <h3 className="mprev_title">
              Previas de la mesa Nº {numeroMesa}
            </h3>
            <button
              type="button"
              className="mprev_close"
              onClick={onClose}
              disabled={loading}
              aria-label="Cerrar"
            >
              <FaTimes />
            </button>
          </header>

          {/* BODY mismo estilo de body que el otro modal */}
          <div className="mprev_body">
            {loading && (
              <p className="mprev_info">Cargando previas…</p>
            )}

            {error && !loading && (
              <p className="mprev_error">{error}</p>
            )}

            {!loading && !error && (
              <>
                {previas.length === 0 ? (
                  <p className="mprev_info">
                    No hay previas asignadas a esta mesa.
                  </p>
                ) : (
                  <div className="mprev_tablewrapper">
                    <table className="mprev_table">
                      <thead>
                        <tr>
                          <th>DNI</th>
                          <th>Alumno</th>
                          <th>Curso</th>
                          <th style={{ textAlign: "center" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previas.map((p) => {
                          const curso =
                            p.nombre_curso || p.materia_id_curso || "";
                          const division =
                            p.nombre_division || p.materia_id_division || "";
                          const cursoCompleto = `${curso} ${division}`.trim();

                          return (
                            <tr key={p.id_previa}>
                              <td>{p.dni}</td>
                              <td>{p.alumno}</td>
                              <td>{cursoCompleto}</td>
                              <td className="mprev_actions">
                                <button
                                  type="button"
                                  className="mprev_actionbtn"
                                  title="Mover esta previa a otra mesa de la misma materia"
                                  onClick={() => handleAbrirMoverPrevia(p)}
                                >
                                  <FaExchangeAlt />
                                </button>
                              </td>
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

          {/* FOOTER igual estilo que el otro modal */}
          <footer className="mprev_footer">
            <button
              type="button"
              className="mprev_btnclose"
              onClick={onClose}
              disabled={loading}
            >
              Cerrar
            </button>
          </footer>
        </div>
      </div>

      {/* Modal secundario para mover la previa */}
      <ModalMoverPreviaMesa
        open={!!selectedPrevia}
        previa={selectedPrevia}
        onClose={handleCierreMoverPrevia}
        onMoved={handlePreviaMovida}
      />
    </>
  );
};

export default ModalPreviasMesa;
