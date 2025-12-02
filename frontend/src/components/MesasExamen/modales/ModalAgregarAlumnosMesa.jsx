import React, { useEffect, useMemo, useState } from "react";
import { FaTimes, FaPlus, FaSearch } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalAgregarAlumnosMesa.css";

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Modal para agregar ALUMNOS (previas) a una mesa.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - numeroMesa: number
 *  - fechaObjetivo: string (YYYY-MM-DD) | null
 *  - idTurnoObjetivo: number | null
 *  - onAdded: () => void
 *  - onError: (mensaje: string) => void
 */
const ModalAgregarAlumnosMesa = ({
  open,
  onClose,
  numeroMesa,
  fechaObjetivo,
  idTurnoObjetivo,
  onAdded,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [candidatas, setCandidatas] = useState([]);
  const [busca, setBusca] = useState("");

  const fetchCandidatas = async () => {
    try {
      setLoading(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesa_previas_candidatas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            numero_mesa_destino: Number(numeroMesa),
            fecha_objetivo: fechaObjetivo || null,
            id_turno_objetivo: idTurnoObjetivo ?? null,
          }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }

      // data esperada: [{ id_previa, dni, alumno, materia, curso_div, elegible, motivo }, ...]
      setCandidatas(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      onError?.(e.message || "No se pudieron cargar las previas disponibles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCandidatas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, numeroMesa, fechaObjetivo, idTurnoObjetivo]);

  const list = useMemo(() => {
    const q = norm(busca);
    return candidatas.filter((c) => {
      if (!q) return true;
      const blob = `${c.dni || ""} ${c.alumno || ""} ${c.materia || ""} ${
        c.curso_div || ""
      }`;
      return norm(blob).includes(q);
    });
  }, [candidatas, busca]);

  const agregar = async (id_previa) => {
    try {
      setLoading(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesa_agregar_alumno`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            numero_mesa: Number(numeroMesa),
            id_previa: Number(id_previa),
          }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito) {
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      }
      onAdded?.();
    } catch (e) {
      onError?.(e.message || "No se pudo agregar el alumno a la mesa.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="agalum_backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agalum_title"
    >
      <div className="agalum_modal">
        {/* HEADER */}
        <div className="agalum_header">
          <h3 id="agalum_title">
            Agregar alumno a la mesa N° {numeroMesa}
          </h3>
          <button
            className="agalum_close"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar modal"
          >
            <FaTimes />
          </button>
        </div>

        {/* BODY */}
        <div className="agalum_body">
          {/* BUSCADOR */}
          <div className="agalum_search">
            <FaSearch className="agalum_search_icon" />
            <input
              className="agalum_search_input"
              placeholder="Buscar por DNI, alumno, materia, curso…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* ESTADOS */}
          {loading ? (
            <div className="agalum_nodata">
              <p>Cargando…</p>
            </div>
          ) : list.length === 0 ? (
            <div className="agalum_nodata">
              <p>No hay previas sin mesa disponibles.</p>
            </div>
          ) : (
            <div className="agalum_table">
              {/* HEADER TABLA */}
              <div className="agalum_headerrow">
                <div className="agalum_column agalum_col_dni">DNI</div>
                <div className="agalum_column agalum_col_alumno">Alumno</div>
                <div className="agalum_column agalum_col_materia">Materia</div>
                <div className="agalum_column agalum_col_curso">
                  Curso
                </div>
                <div className="agalum_column agalum_col_accion">Acción</div>
              </div>

              {/* BODY TABLA */}
              {list.map((c) => (
                <div key={c.id_previa} className="agalum_row">
                  <div className="agalum_column agalum_col_dni">
                    {c.dni || "—"}
                  </div>
                  <div
                    className="agalum_column agalum_col_alumno"
                    title={c.alumno || ""}
                  >
                    {c.alumno || "—"}
                  </div>
                  <div
                    className="agalum_column agalum_col_materia"
                    title={c.materia || ""}
                  >
                    {c.materia || "—"}
                  </div>
                  <div className="agalum_column agalum_col_curso">
                    {c.curso_div || "—"}
                    {c.elegible === false &&
                      ` (No elegible${
                        c.motivo ? `: ${c.motivo}` : ""
                      })`}
                  </div>
                  <div className="agalum_column agalum_col_accion">
                    <button
                      className="agalum_iconbtn"
                      disabled={loading || c.elegible === false}
                      title={
                        c.elegible === false
                          ? "No elegible para esta mesa"
                          : "Agregar a esta mesa"
                      }
                      onClick={() => agregar(c.id_previa)}
                      aria-disabled={loading || c.elegible === false}
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
        <div className="agalum_footer">
          <button className="agalum_btnclose" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalAgregarAlumnosMesa;
