// src/components/MesasExamen/modales/ModalAgregarMesas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FaTimes, FaPlus, FaSearch } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalAgregarMesas.css";

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const ModalAgregarMesas = ({
  open,
  onClose,
  idGrupo, // puede ser null
  numeroMesaActual,
  fechaObjetivo, // string YYYY-MM-DD
  idTurnoObjetivo, // number | null
  onAdded,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("mesas"); // "mesas" | "previas"
  const [mesas, setMesas] = useState([]);
  const [previas, setPrevias] = useState([]);
  const [busca, setBusca] = useState("");

  const fetchCandidatas = async () => {
    try {
      setLoading(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesas_no_agrupadas_candidatas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha_objetivo: fechaObjetivo || null,
            id_turno_objetivo: idTurnoObjetivo ?? null,
            numero_mesa_actual: numeroMesaActual,
          }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }

      const data = json.data;

      // Soporta formato nuevo { mesas, previas } y el viejo [ ... ]
      if (Array.isArray(data)) {
        setMesas(data);
        setPrevias([]);
      } else {
        setMesas(Array.isArray(data?.mesas) ? data.mesas : []);
        setPrevias(Array.isArray(data?.previas) ? data.previas : []);
      }
    } catch (e) {
      onError?.(
        e.message ||
          "No se pudieron cargar las mesas no agrupadas / previas."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setTab("mesas"); // siempre arrancar en la pestaña de mesas
      fetchCandidatas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fechaObjetivo, idTurnoObjetivo, numeroMesaActual]);

  // Filtro de búsqueda para mesas
  const mesasFiltradas = useMemo(() => {
    const q = norm(busca);
    return mesas.filter((c) => {
      if (!q) return true;
      const blob = `${c.numero_mesa} ${c.materia || ""} ${(c.docentes || []).join(
        " "
      )} ${(c.alumnos || []).join(" ")}`;
      return norm(blob).includes(q);
    });
  }, [mesas, busca]);

  // Filtro de búsqueda para previas
  const previasFiltradas = useMemo(() => {
    const q = norm(busca);
    return previas.filter((p) => {
      if (!q) return true;
      const blob = `${p.dni || ""} ${p.alumno || ""} ${p.materia || ""} ${
        p.curso_div || ""
      }`;
      return norm(blob).includes(q);
    });
  }, [previas, busca]);

  // Agregar una mesa no agrupada al grupo (lógica de siempre)
  const agregarMesa = async (numero) => {
    try {
      setLoading(true);
      const action = "mesa_grupo_agregar_numero";

      const payload = idGrupo
        ? {
            id_grupo: Number(idGrupo),
            numero_mesa: Number(numero),
            fecha_objetivo: fechaObjetivo || null,
          }
        : {
            numeros_mesa: [Number(numeroMesaActual), Number(numero)],
            fecha_objetivo: fechaObjetivo || null,
          };

      const url = idGrupo
        ? `${BASE_URL}/api.php?action=${action}`
        : `${BASE_URL}/api.php?action=mesa_grupo_crear`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }

      onAdded?.();
    } catch (e) {
      onError?.(e.message || "No se pudo agregar la mesa al grupo.");
    } finally {
      setLoading(false);
    }
  };

  // NUEVO: crear mesa desde PREVIA (sin numero_mesa) y agregarla al grupo
  const agregarPrevia = async (id_previa) => {
    // Para esto sí o sí necesitamos un grupo existente
    if (!idGrupo) {
      onError?.(
        "Para agregar una previa sin número de mesa es necesario estar editando un grupo ya creado."
      );
      return;
    }

    try {
      setLoading(true);

      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesa_grupo_agregar_numero`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_grupo: Number(idGrupo),
            id_previa: Number(id_previa),
            fecha_objetivo: fechaObjetivo || null,
          }),
        }
      );

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(
          json?.mensaje ||
            `HTTP ${resp.status} al crear mesa desde previa ${id_previa}`
        );
      }

      onAdded?.();
    } catch (e) {
      onError?.(
        e.message ||
          "No se pudo crear la mesa a partir de la previa y agregarla al grupo."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const isMesasTab = tab === "mesas";
  const listaActual = isMesasTab ? mesasFiltradas : previasFiltradas;

  return (
    <div
      className="agmes_backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agmes_title"
    >
      <div className="agmes_modal">
        {/* HEADER */}
        <div className="agmes_header">
          <h3 id="agmes_title">Agregar número al grupo</h3>
          <button
            className="agmes_close"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar modal"
          >
            <FaTimes />
          </button>
        </div>

        {/* TABS */}
        <div className="agmes_tabs">
          <button
            className={`agmes_tab ${isMesasTab ? "agmes_tab--active" : ""}`}
            type="button"
            onClick={() => setTab("mesas")}
          >
            Mesas no agrupadas
          </button>
          <button
            className={`agmes_tab ${!isMesasTab ? "agmes_tab--active" : ""}`}
            type="button"
            onClick={() => setTab("previas")}
          >
            Previas sin número de mesa
          </button>
        </div>

        {/* BODY */}
        <div className="agmes_body">
          {/* BUSCADOR */}
          <div className="agmes_search" style={{ width: "100%" }}>
            <FaSearch />
            <input
              placeholder={
                isMesasTab
                  ? "Buscar por número, materia, docente, alumno…"
                  : "Buscar por DNI, alumno, materia, curso…"
              }
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* ESTADOS */}
          {loading ? (
            <div className="agmes_nodata">
              <p>Cargando…</p>
            </div>
          ) : listaActual.length === 0 ? (
            <div className="agmes_nodata">
              <p>
                {isMesasTab
                  ? "No hay mesas no agrupadas disponibles."
                  : "No hay previas sin número de mesa disponibles."}
              </p>
            </div>
          ) : (
            <div className="agmes_table">
              {/* HEADER TABLA */}
              {isMesasTab ? (
                <div className="agmes_headerrow">
                  <div className="agmes_column num">N° Mesa</div>
                  <div className="agmes_column materia">Materia</div>
                  <div className="agmes_column docentes">Docentes</div>
                  <div className="agmes_column elegible">Elegible</div>
                  <div className="agmes_column accion">Acción</div>
                </div>
              ) : (
                <div className="agmes_headerrow">
                  <div className="agmes_column num">DNI</div>
                  <div className="agmes_column materia">Alumno</div>
                  <div className="agmes_column docentes">Materia</div>
                  <div className="agmes_column elegible">Curso / Div.</div>
                  <div className="agmes_column accion">Acción</div>
                </div>
              )}

              {/* BODY TABLA */}
              {isMesasTab
                ? listaActual.map((c) => (
                    <div key={c.numero_mesa} className="agmes_row">
                      <div className="agmes_column num">{c.numero_mesa}</div>
                      <div
                        className="agmes_column materia"
                        title={c.materia || ""}
                      >
                        {c.materia || "—"}
                      </div>
                      <div className="agmes_column docentes">
                        {c.docentes && c.docentes.length
                          ? c.docentes.join(" | ")
                          : "—"}
                      </div>
                      <div className="agmes_column elegible">
                        {c.elegible
                          ? "Sí"
                          : `No (${c.motivo || "regla prioridad-1"})`}
                      </div>
                      <div className="agmes_column accion">
                        <button
                          className="agmes_iconbtn"
                          disabled={!c.elegible || loading}
                          title={
                            c.elegible
                              ? "Agregar a este grupo"
                              : "No elegible"
                          }
                          onClick={() => agregarMesa(c.numero_mesa)}
                          aria-disabled={!c.elegible || loading}
                        >
                          <FaPlus />
                        </button>
                      </div>
                    </div>
                  ))
                : listaActual.map((p) => (
                    <div key={p.id_previa} className="agmes_row">
                      <div className="agmes_column num">{p.dni || "—"}</div>
                      <div
                        className="agmes_column materia"
                        title={p.alumno || ""}
                      >
                        {p.alumno || "—"}
                      </div>
                      <div
                        className="agmes_column docentes"
                        title={p.materia || ""}
                      >
                        {p.materia || "—"}
                      </div>
                      <div className="agmes_column elegible">
                        {p.curso_div || "—"}
                      </div>
                      <div className="agmes_column accion">
                        <button
                          className="agmes_iconbtn"
                          disabled={loading}
                          title="Crear mesa para esta previa y agregarla al grupo"
                          onClick={() => agregarPrevia(p.id_previa)}
                          aria-disabled={loading}
                        >
                          <FaPlus />
                        </button>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="agmes_footer">
          <button className="agmes_btnclose" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalAgregarMesas;
