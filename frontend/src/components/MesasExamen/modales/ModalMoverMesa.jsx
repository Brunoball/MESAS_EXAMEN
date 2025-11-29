// src/components/MesasExamen/modales/ModalMoverMesa.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FaTimes, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";

/**
 * MISMA estética que ModalCrearMesas / ModalInfoPrevia:
 * - Reutiliza clases: mi-modal__*, mi-card, mi-input, mi-btn, etc.
 */
import "./ModalCrearMesas.css"; // ⬅️ Reutilizamos todo el theme ya existente
import "./ModalMoverMesa.css"; // ⬅️ (Opcional) pequeños ajustes locales

const turnoLabel = (idTurno) => {
  const n = Number(idTurno);
  if (n === 1) return "Mañana";
  if (n === 2) return "Tarde";
  if (!idTurno && idTurno !== 0) return "Sin turno";
  return `Turno ${idTurno}`;
};

const ModalMoverMesa = ({
  open,
  onClose,
  numeroMesaOrigen, // número a mover
  fechaObjetivo, // YYYY-MM-DD
  idTurnoObjetivo, // number | null
  onMoved,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState([]); // grupos incompletos
  const [destino, setDestino] = useState("");
  const [detallesPorMesa, setDetallesPorMesa] = useState({}); // numero_mesa -> { materia, docentes }

  const closeIfOverlay = useCallback(
    (e) => {
      if (e.target.classList.contains("mi-modal__overlay")) onClose?.();
    },
    [onClose]
  );

  // Carga grupos incompletos y, con sus números de mesa, trae detalle materia/docentes
  const cargarGrupos = async () => {
    try {
      setLoading(true);
      setGrupos([]);
      setDetallesPorMesa({});

      const body = {
        fecha_mesa: fechaObjetivo || null,
        id_turno: idTurnoObjetivo ?? null,
      };

      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesas_listar_grupos_incompletos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }

      const arr = Array.isArray(json.data) ? json.data : [];

      // Filtramos grupos donde ya esté el número origen (por seguridad)
      const filtrado = arr.filter((g) =>
        ![
          g.numero_mesa_1,
          g.numero_mesa_2,
          g.numero_mesa_3,
          g.numero_mesa_4,
        ]
          .map((n) => Number(n || 0))
          .includes(Number(numeroMesaOrigen))
      );

      setGrupos(filtrado);

      // ==========================
      // Cargar detalle materia/docentes de cada mesa del listado
      // ==========================
      const setNums = new Set();
      filtrado.forEach((g) => {
        [
          g.numero_mesa_1,
          g.numero_mesa_2,
          g.numero_mesa_3,
          g.numero_mesa_4,
        ]
          .map((n) => Number(n || 0))
          .filter((n) => n > 0)
          .forEach((n) => setNums.add(n));
      });

      const numeros = Array.from(setNums).sort((a, b) => a - b);
      if (!numeros.length) {
        setDetallesPorMesa({});
        return;
      }

      const respDet = await fetch(
        `${BASE_URL}/api.php?action=mesas_detalle_pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numeros_mesa: numeros }),
        }
      );

      const rawDet = await respDet.text();
      let jsonDet;
      try {
        jsonDet = JSON.parse(rawDet);
      } catch {
        throw new Error(
          rawDet.slice(0, 400) || "Respuesta no JSON al obtener detalle."
        );
      }

      if (!respDet.ok || !jsonDet?.exito) {
        throw new Error(
          jsonDet?.mensaje ||
            "No se pudo obtener el detalle de materias/docentes."
        );
      }

      const detalle = Array.isArray(jsonDet.data) ? jsonDet.data : [];
      const mapa = {};

      for (const m of detalle) {
        const num = Number(m.numero_mesa);
        if (!Number.isFinite(num) || num <= 0) continue;

        const materia = m.materia ?? "";
        const docentesArr = Array.isArray(m.docentes)
          ? m.docentes.filter(Boolean)
          : [];
        const docentes = docentesArr.join(" / ");

        mapa[num] = { materia, docentes };
      }

      setDetallesPorMesa(mapa);
    } catch (e) {
      onError?.(e.message || "No se pudieron cargar grupos incompletos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) cargarGrupos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, numeroMesaOrigen, fechaObjetivo, idTurnoObjetivo]);

  const puedeMover = useMemo(() => !!destino, [destino]);

  const mover = async () => {
    try {
      if (!destino) return;
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesa_mover_de_grupo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            numero_mesa: Number(numeroMesaOrigen),
            id_grupo_destino: Number(destino),
          }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }
      onMoved?.();
      onClose?.();
    } catch (e) {
      onError?.(e.message || "No se pudo mover la mesa.");
    }
  };

  if (!open) return null;

  const subTitle = [
    fechaObjetivo ? `Fecha: ${fechaObjetivo}` : null,
    Number.isFinite(Number(idTurnoObjetivo))
      ? `Turno: ${turnoLabel(idTurnoObjetivo)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mi-modal__overlay" onClick={closeIfOverlay}>
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-mover-mesa"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="titulo-mover-mesa" className="mi-modal__title">
              Mover número {numeroMesaOrigen}
            </h2>
            <p className="mi-modal__subtitle">
              {subTitle || "Seleccioná el grupo de destino"}
            </p>
          </div>
          <button
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
          >
            <FaTimes />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="mi-modal__content">
          <section className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Grupo destino</h3>

                {loading ? (
                  <p className="mi-help">Cargando grupos…</p>
                ) : grupos.length === 0 ? (
                  <p className="mi-help">
                    No hay grupos con lugar para la fecha/turno seleccionados.
                  </p>
                ) : (
                  <>
                    <p className="mi-help">
                      Elegí a qué grupo querés mover la mesa. Solo aparecen
                      grupos de la misma fecha y turno, con al menos un slot
                      libre.
                    </p>

                    <div className="mi-grid-destinos">
                      {grupos.map((g) => {
                        const numeros = [
                          g.numero_mesa_1,
                          g.numero_mesa_2,
                          g.numero_mesa_3,
                          g.numero_mesa_4,
                        ]
                          .map((n) => Number(n || 0))
                          .filter((n) => n > 0);

                        const libres = 4 - numeros.length;
                        const isSelected =
                          String(destino) === String(g.id_grupo);

                        return (
                          <div
                            key={g.id_grupo}
                            className={`mi-card mi-card--destino ${
                              isSelected ? "is-selected" : ""
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setDestino(String(g.id_grupo))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDestino(String(g.id_grupo));
                              }
                            }}
                          >
                            <div className="mi-card__header-row">
                              <span className="mi-pill">
                                Grupo {g.id_grupo}
                              </span>
                              <span className="mi-pill mi-pill--soft">
                                Libres: {libres}
                              </span>
                            </div>

                            <div className="mi-card__meta">
                              <span>{g.fecha_mesa}</span>
                              <span>Turno: {turnoLabel(g.id_turno)}</span>
                            </div>

                            <div className="mi-card__body">
                              <p className="mi-card__subtitle">
                                Mesas del grupo
                              </p>
                              <ul className="mi-list mi-list--compact">
                                {numeros.length === 0 && (
                                  <li className="mi-list__item">
                                    Este grupo todavía no tiene mesas asignadas.
                                  </li>
                                )}
                                {numeros.map((n) => {
                                  const info = detallesPorMesa[n] || {};
                                  return (
                                    <li
                                      key={n}
                                      className="mi-list__item"
                                    >
                                      <strong>N° {n}:</strong>{" "}
                                      {info.materia || "Sin materia"}
                                      {info.docentes
                                        ? ` — Docentes: ${info.docentes}`
                                        : ""}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mi-help">
                      Al mover, la mesa adoptará la fecha y el turno del grupo
                      destino.
                    </p>
                  </>
                )}
              </article>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mi-modal__footer">
          <button
            type="button"
            className="mi-btn mi-btn--ghost"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="mi-btn mi-btn--primary"
            onClick={mover}
            disabled={!puedeMover}
            title="Mover al grupo destino"
          >
            <FaCheck style={{ marginRight: 6 }} />
            Mover
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalMoverMesa;
