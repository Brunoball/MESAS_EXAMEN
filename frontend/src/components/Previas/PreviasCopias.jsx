// src/components/Previas/PreviasCopias.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import {
  FaArrowLeft,
  FaSearch,
  FaTimes,
  FaList,
  FaCalendarAlt,
  FaChevronDown,
  FaTrash,
} from "react-icons/fa";

import ConfirmarLimpiarCopiasModal from "./modales/ConfirmarLimpiarCopiasModal";

import "../Global/roots.css";
import "../Global/section-ui.css";
import "./Previas.css";

const normalizar = (str = "") =>
  (str ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const formatearFechaISO = (v) => {
  if (!v || typeof v !== "string") return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export default function PreviasCopias() {
  const navigate = useNavigate();

  const [toast, setToast] = useState({ mostrar: false, tipo: "", mensaje: "" });

  const [cargando, setCargando] = useState(false);
  const [copias, setCopias] = useState([]); // lista de runs
  const [runSeleccionado, setRunSeleccionado] = useState(null);
  const [detalle, setDetalle] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  // dropdown runs
  const [openRuns, setOpenRuns] = useState(false);
  const runsRef = useRef(null);

  // modal limpiar
  const [modalLimpiar, setModalLimpiar] = useState({
    open: false,
    loading: false,
    error: "",
  });

  const mostrarToast = useCallback((mensaje, tipo = "exito") => {
    setToast({ mostrar: true, tipo, mensaje });
  }, []);

  const cargarCopias = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch(`${BASE_URL}/api.php?action=previas_copias_listar`);
      const json = await res.json();
      if (!json?.exito)
        throw new Error(json?.mensaje || "No se pudieron obtener las copias");

      const lista = json?.copias || [];
      setCopias(lista);

      if (lista.length > 0) {
        setRunSeleccionado((prev) => {
          // mantener selección si existe
          if (prev?.snapshot_run_id) {
            const found = lista.find((x) => x.snapshot_run_id === prev.snapshot_run_id);
            return found || lista[0];
          }
          return lista[0];
        });
      } else {
        setRunSeleccionado(null);
        setDetalle([]);
      }
    } catch (e) {
      mostrarToast(e.message || "Error cargando copias", "error");
    } finally {
      setCargando(false);
    }
  }, [mostrarToast]);

  const cargarDetalle = useCallback(
    async (snapshot_run_id) => {
      if (!snapshot_run_id) return;
      try {
        setCargando(true);
        const res = await fetch(`${BASE_URL}/api.php?action=previas_copia_detalle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot_run_id }),
        });
        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || "No se pudo obtener el detalle");

        const rows = (json?.rows || []).map((r) => ({
          ...r,
          _alumno: normalizar(r?.alumno ?? ""),
          _dni: String(r?.dni ?? ""),
          _materia: normalizar(r?.materia_nombre ?? ""),
        }));

        setDetalle(rows);
      } catch (e) {
        mostrarToast(e.message || "Error cargando detalle", "error");
      } finally {
        setCargando(false);
      }
    },
    [mostrarToast]
  );

  useEffect(() => {
    cargarCopias();
  }, [cargarCopias]);

  useEffect(() => {
    if (runSeleccionado?.snapshot_run_id) {
      cargarDetalle(runSeleccionado.snapshot_run_id);
    }
  }, [runSeleccionado, cargarDetalle]);

  // cerrar dropdown al click afuera
  useEffect(() => {
    const onDown = (e) => {
      if (!openRuns) return;
      if (!runsRef.current) return;
      if (!runsRef.current.contains(e.target)) setOpenRuns(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openRuns]);

  const detalleFiltrado = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return detalle;

    return detalle.filter(
      (r) =>
        r._alumno.includes(q) ||
        r._materia.includes(q) ||
        (r._dni || "").includes(busqueda.trim())
    );
  }, [detalle, busqueda]);

  // ✅ 4 columnas: Alumno, DNI, Materia, Fecha alta
  const GRID = "1.6fr 0.7fr 1fr 0.7fr";

  const abrirModalLimpiar = useCallback(() => {
    setModalLimpiar({ open: true, loading: false, error: "" });
  }, []);

  const cerrarModalLimpiar = useCallback(() => {
    if (modalLimpiar.loading) return;
    setModalLimpiar({ open: false, loading: false, error: "" });
  }, [modalLimpiar.loading]);

  const confirmarLimpiar = useCallback(async () => {
    try {
      setModalLimpiar((m) => ({ ...m, loading: true, error: "" }));

      const res = await fetch(`${BASE_URL}/api.php?action=previas_copias_limpiar`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || "No se pudo eliminar");

      setModalLimpiar({ open: false, loading: false, error: "" });
      setOpenRuns(false);
      setBusqueda("");
      setDetalle([]);
      setRunSeleccionado(null);
      await cargarCopias();

      mostrarToast(`Copias eliminadas: ${json?.eliminados ?? 0}`, "exito");
    } catch (e) {
      setModalLimpiar((m) => ({
        ...m,
        loading: false,
        error: e.message || "Error desconocido",
      }));
    }
  }, [cargarCopias, mostrarToast]);

  const textoRunSeleccionado = useMemo(() => {
    if (!runSeleccionado) return "Sin copias";
    return `${formatearFechaISO(runSeleccionado.fecha_accion)} — ${runSeleccionado.cantidad} inscriptos`;
  }, [runSeleccionado]);

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

        <ConfirmarLimpiarCopiasModal
          open={modalLimpiar.open}
          loading={modalLimpiar.loading}
          error={modalLimpiar.error}
          onCancel={cerrarModalLimpiar}
          onConfirm={confirmarLimpiar}
        />

        {/* Header */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Copias de inscriptos (historial)</span>

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
            <button className="glob-search-button" title="Buscar" type="button">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>
        </div>

        {/* Selector de corrida */}
        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline" style={{ gap: 12, alignItems: "center" }}>
              <div className="glob-contador-container">
                <span className="glob-profesores-desktop">
                  Copias: {copias.length} — Registros: {detalleFiltrado.length}
                </span>
                <span className="glob-profesores-mobile">{detalleFiltrado.length}</span>
                <FaList className="glob-icono-profesor" />
              </div>

              {/* ✅ Dropdown tipo selector */}
              <div
                ref={runsRef}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  position: "relative",
                }}
              >
                <button
                  type="button"
                  className="glob-filtros-button BTN-seeleccionarcp"
                  onClick={() => setOpenRuns((v) => !v)}
                  disabled={cargando || copias.length === 0}
                  title="Seleccionar copia"
                >
                  <FaCalendarAlt className="glob-icon-button" />
                  <span
                    style={{
                      maxWidth: 380,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {textoRunSeleccionado}
                  </span>
                  <FaChevronDown className={`glob-chevron-icon ${openRuns ? "glob-rotate" : ""}`} />
                </button>

                {openRuns && (
                  <div
                    className="glob-filtros-menu"
                    role="menu"
                    style={{ minWidth: 420, maxWidth: 520 }}
                  >
                    {copias.map((c) => {
                      const active = c.snapshot_run_id === runSeleccionado?.snapshot_run_id;

                      return (
                        <button
                          key={c.snapshot_run_id}
                          type="button"
                          className={`glob-filtros-menu-item ${active ? "is-selected" : ""}`}
                          onClick={() => {
                            setRunSeleccionado(c);
                            setBusqueda("");
                            setOpenRuns(false);
                          }}
                          role="menuitem"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            textAlign: "left",
                          }}
                        >
                          <span>{formatearFechaISO(c.fecha_accion)}</span>
                          <span className="glob-chip-mini" style={{ margin: 0 }}>
                            {c.cantidad}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="glob-box-table">
            <div className="glob-header" style={{ gridTemplateColumns: GRID }}>
              <div className="glob-column-header">Alumno</div>
              <div className="glob-column-header">DNI</div>
              <div className="glob-column-header">Materia</div>
              <div className="glob-column-header">Fecha alta</div>
            </div>

            <div className="glob-body">
              {cargando ? (
                <div className="glob-loading-spinner-container">
                  <div className="glob-loading-spinner"></div>
                </div>
              ) : detalleFiltrado.length === 0 ? (
                <div className="glob-no-data-message">
                  <div className="glob-message-content">
                    <p>No hay registros para mostrar</p>
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: "55vh", overflow: "auto", width: "100%" }}>
                  {detalleFiltrado.map((r, idx) => (
                    <div
                      key={`${r.snapshot_id ?? idx}`}
                      className={`glob-row ${idx % 2 === 0 ? "glob-even-row" : "glob-odd-row"}`}
                      style={{ gridTemplateColumns: GRID }}
                    >
                      <div className="glob-column glob-column-nombre" title={r.alumno}>
                        {r.alumno}
                      </div>
                      <div className="glob-column glob-column-dni" title={r.dni}>
                        {r.dni}
                      </div>
                      <div className="glob-column" title={r.materia_nombre}>
                        {r.materia_nombre}
                      </div>
                      <div className="glob-column" title={r.fecha_carga}>
                        {formatearFechaISO(r.fecha_carga)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => navigate("/previas")}
            aria-label="Volver"
            title="Volver"
            type="button"
          >
            <FaArrowLeft className="glob-profesor-icon-button" />
            <p>Volver Atrás</p>
          </button>

          {/* ✅ nuevo botón eliminar registros */}
          <button
            className="glob-profesor-button glob-hover-effect"
            onClick={abrirModalLimpiar}
            aria-label="Eliminar registros"
            title="Eliminar todas las copias guardadas"
            disabled={cargando || copias.length === 0}
            style={{ background: "var(--danger, #d9534f)" }}
            type="button"
          >
            <FaTrash className="glob-profesor-icon-button" />
            <p>Eliminar registros</p>
          </button>
        </div>
      </div>
    </div>
  );
}
