import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import { FaArrowLeft, FaUsers, FaSearch, FaTimes, FaUserPlus } from "react-icons/fa";
import Toast from "../Global/Toast";
import DarAltaPreviaModal from "./modales/DarAltaPreviaModal"; // ✅ nuevo modal
import "../Global/roots.css";
import "../Global/section-ui.css";
import "./Previas.css";

const normalizar = (str = "") =>
  str
    .toString()
    .toLowerCase?.() ?? String(str).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const PreviasBaja = () => {
  const navigate = useNavigate();

  const [previas, setPrevias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [toast, setToast] = useState({
    mostrar: false,
    tipo: "",
    mensaje: "",
  });

  const [modalAlta, setModalAlta] = useState({
    open: false,
    item: null,
    loading: false,
    error: "",
  });

  const mostrarToast = useCallback((mensaje, tipo = "exito") => {
    setToast({ mostrar: true, tipo, mensaje });
  }, []);

  const cargarBajas = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch(`${BASE_URL}/api.php?action=previas_baja`);
      const data = await res.json();

      if (data?.exito) {
        const procesados = (data.previas || []).map((p) => ({
          ...p,
          _alumno: normalizar(p?.alumno ?? ""),
          _dni: String(p?.dni ?? "").toLowerCase(),
          _materia: normalizar(p?.materia_nombre ?? ""),
          materia_curso_division: `${p.materia_curso_nombre || ""} ${p.materia_division_nombre || ""}`.trim(),
        }));
        setPrevias(procesados);
      } else {
        mostrarToast(`Error al obtener bajas: ${data?.mensaje || "desconocido"}`, "error");
      }
    } catch {
      mostrarToast("Error de red al obtener bajas", "error");
    } finally {
      setCargando(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    cargarBajas();
  }, [cargarBajas]);

  const bajasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return previas;

    return previas.filter(
      (p) =>
        p._alumno?.includes(q) ||
        p._dni?.includes(q) ||
        p._materia?.includes(q)
    );
  }, [previas, busqueda]);

  const abrirModalAlta = useCallback((p) => {
    setModalAlta({ open: true, item: p, loading: false, error: "" });
  }, []);

  const cerrarModalAlta = useCallback(() => {
    if (modalAlta.loading) return;
    setModalAlta({ open: false, item: null, loading: false, error: "" });
  }, [modalAlta.loading]);

  const confirmarAlta = useCallback(async ({ fecha_alta, motivo_alta }) => {
    try {
      setModalAlta((m) => ({ ...m, loading: true, error: "" }));

      const payload = {
        id_previa: modalAlta.item?.id_previa,
        fecha_alta,
        motivo_alta,
      };

      const res = await fetch(`${BASE_URL}/api.php?action=previa_dar_alta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || "No se pudo dar de alta");

      await cargarBajas();
      setModalAlta({ open: false, item: null, loading: false, error: "" });
      mostrarToast("Previa dada de alta", "exito");
    } catch (e) {
      setModalAlta((m) => ({
        ...m,
        loading: false,
        error: e?.message || "Error desconocido",
      }));
    }
  }, [modalAlta.item, cargarBajas, mostrarToast]);

  return (
    <div className="glob-profesor-container">
      <div className="glob-profesor-box">
        {toast.mostrar && (
          <Toast
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            onClose={() => setToast({ mostrar: false, tipo: "", mensaje: "" })}
            duracion={3000}
          />
        )}

        {/* ✅ Modal Dar Alta (nuevo y distinto) */}
        <DarAltaPreviaModal
          open={modalAlta.open}
          item={modalAlta.item}
          loading={modalAlta.loading}
          error={modalAlta.error}
          onCancel={cerrarModalAlta}
          onConfirm={confirmarAlta}
        />

        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Previas dadas de baja</span>

          {/* Buscador */}
          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por alumno, DNI o materia"
              className="glob-search-input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              disabled={cargando}
            />
            {busqueda ? (
              <FaTimes className="glob-clear-search-icon" onClick={() => setBusqueda("")} />
            ) : null}
            <button className="glob-search-button" title="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>
        </div>

        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline">
              <div className="glob-contador-container">
                <span className="glob-profesores-desktop">Cant bajas: {bajasFiltradas.length}</span>
                <span className="glob-profesores-mobile">{bajasFiltradas.length}</span>
                <FaUsers className="glob-icono-profesor" />
              </div>
            </div>
          </div>

          <div className="glob-box-table">
            {/* ✅ + Acciones */}
            <div
              className="glob-header"
              style={{ gridTemplateColumns: "1.6fr 0.7fr 1fr 1fr 0.8fr 0.7fr" }}
            >
              <div className="glob-column-header">Alumno</div>
              <div className="glob-column-header">DNI</div>
              <div className="glob-column-header">Materia</div>
              <div className="glob-column-header">Condición</div>
              <div className="glob-column-header">Curso</div>
              <div className="glob-column-header">Acciones</div>
            </div>

            <div className="glob-body">
              {cargando ? (
                <div className="glob-loading-spinner-container">
                  <div className="glob-loading-spinner"></div>
                </div>
              ) : bajasFiltradas.length === 0 ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content">
                    <p>No hay registros dados de baja</p>
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: "60vh", overflow: "auto" }}>
                  {bajasFiltradas.map((p, idx) => (
                    <div
                      key={p.id_previa ?? idx}
                      className={`glob-row ${idx % 2 === 0 ? "glob-even-row" : "glob-odd-row"}`}
                      style={{ gridTemplateColumns: "1.6fr 0.7fr 1fr 1fr 0.8fr 0.7fr" }}
                    >
                      <div className="glob-column glob-column-nombre" title={p.alumno}>{p.alumno}</div>
                      <div className="glob-column glob-column-dni" title={p.dni}>{p.dni}</div>
                      <div className="glob-column" title={p.materia_nombre}>{p.materia_nombre}</div>
                      <div className="glob-column" title={p.condicion_nombre}>{p.condicion_nombre}</div>
                      <div className="glob-column" title={p.materia_curso_division}>{p.materia_curso_division}</div>

                      {/* Acciones */}
                      <div className="glob-column glob-icons-column">
                        <div className="glob-icons-container">
                          <button
                            className="glob-iconchip is-affirm"
                            title="Dar de alta"
                            onClick={() => abrirModalAlta(p)}
                            aria-label="Dar de alta"
                            disabled={modalAlta.loading}
                          >
                            <FaUserPlus />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Volver */}
        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => navigate("/previas")}
            aria-label="Volver"
            title="Volver"
          >
            <FaArrowLeft className="glob-profesor-icon-button" />
            <p>Volver</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviasBaja;
