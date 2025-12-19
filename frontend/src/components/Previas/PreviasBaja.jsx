// src/components/Previas/PreviasBaja.jsx
import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import { FaArrowLeft, FaUsers, FaSearch, FaTimes, FaUserPlus } from "react-icons/fa";
import Toast from "../Global/Toast";
import DarAltaPreviaModal from "./modales/DarAltaPreviaModal";

import "../Global/roots.css";
import "../Global/section-ui.css";

// ✅ Reutilizá la estética de ProfesorBaja
import "../Profesores/ProfesorBaja.css";

// ✅ CSS SOLO para columnas/labels de previas


const normalizar = (str = "") =>
  (str?.toString?.() ?? String(str))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const PreviasBaja = () => {
  const navigate = useNavigate();

  const [previas, setPrevias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [toast, setToast] = useState({ mostrar: false, tipo: "", mensaje: "" });

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
      const res = await fetch(`${BASE_URL}/api.php?action=previas_baja&ts=${Date.now()}`);
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
      (p) => p._alumno?.includes(q) || p._dni?.includes(q) || p._materia?.includes(q)
    );
  }, [previas, busqueda]);

  const abrirModalAlta = useCallback((p) => {
    setModalAlta({ open: true, item: p, loading: false, error: "" });
  }, []);

  const cerrarModalAlta = useCallback(() => {
    if (modalAlta.loading) return;
    setModalAlta({ open: false, item: null, loading: false, error: "" });
  }, [modalAlta.loading]);

  const confirmarAlta = useCallback(
    async ({ fecha_alta, motivo_alta }) => {
      try {
        setModalAlta((m) => ({ ...m, loading: true, error: "" }));

        const payload = {
          id_previa: modalAlta.item?.id_previa,
          fecha_alta,
          motivo_alta,
        };

        const res = await fetch(`${BASE_URL}/api.php?action=previa_dar_alta&ts=${Date.now()}`, {
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
    },
    [modalAlta.item, cargarBajas, mostrarToast]
  );

  return (
    <div className="emp-baja-container prev-baja-container">
      {/* Toast */}
      {toast.mostrar && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={() => setToast({ mostrar: false, tipo: "", mensaje: "" })}
          duracion={3000}
        />
      )}

      {/* Modal Dar Alta */}
      <DarAltaPreviaModal
        open={modalAlta.open}
        item={modalAlta.item}
        loading={modalAlta.loading}
        error={modalAlta.error}
        onCancel={cerrarModalAlta}
        onConfirm={confirmarAlta}
      />

      {/* Franja superior (igual ProfesorBaja) */}
      <div className="emp-baja-glass">
        <div className="emp-baja-barra-superior">
          <div className="emp-baja-titulo-container">
            <h2 className="emp-baja-titulo">Previas dadas de baja</h2>
          </div>

          <button
            className="emp-baja-nav-btn emp-baja-nav-btn--volver-top"
            onClick={() => navigate("/previas")}
            title="Volver"
            type="button"
          >
            <FaArrowLeft className="ico" />
            <span>Volver</span>
          </button>
        </div>
      </div>

      {/* Buscador (misma estética) */}
      <div className="emp-baja-buscador-container">
        <input
          type="text"
          className="emp-baja-buscador"
          placeholder="Buscar por alumno, DNI o materia..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          disabled={cargando}
        />
        {busqueda ? (
          <button
            type="button"
            className="prev-baja-clear"
            onClick={() => setBusqueda("")}
            title="Limpiar"
            aria-label="Limpiar búsqueda"
            disabled={cargando}
          >
            <FaTimes />
          </button>
        ) : null}

        <div className="emp-baja-buscador-icono" aria-hidden="true">
          <FaSearch />
        </div>
      </div>

      {/* Tabla / Lista */}
      {cargando ? (
        <p className="emp-baja-cargando">Cargando previas dadas de baja...</p>
      ) : (
        <div className="emp-baja-tabla-container prev-baja-tabla-container">
          <div className="emp-baja-controles-superiores">
            <div className="emp-baja-contador">
              Mostrando <strong>{bajasFiltradas.length}</strong> previas{" "}
              <FaUsers style={{ marginLeft: 8, opacity: 0.7 }} />
            </div>

            {/* (si después querés agregar exportar/eliminar, lo ponés acá como en Profesores) */}
            <div className="emp-baja-acciones-derecha" />
          </div>

          <div className="emp-baja-tabla-header-container">
            <div className="emp-baja-tabla-header prev-baja-header">
              <div className="prev-col-alumno">Alumno</div>
              <div className="prev-col-dni">DNI</div>
              <div className="prev-col-materia">Materia</div>
              <div className="prev-col-condicion">Condición</div>
              <div className="prev-col-curso">Curso</div>
              <div className="prev-col-acciones">Acciones</div>
            </div>
          </div>

          <div className="emp-baja-tabla-body">
            {bajasFiltradas.length === 0 ? (
              <div className="emp-baja-sin-resultados emp-baja-sin-resultados--fill">
                <FaUsers className="emp-baja-sin-icono" />
                No hay registros dados de baja
              </div>
            ) : (
              bajasFiltradas.map((p, idx) => (
                <div className="emp-baja-fila prev-baja-fila" key={p.id_previa ?? idx}>
                  <div className="prev-col-alumno" title={p.alumno}>{p.alumno}</div>
                  <div className="prev-col-dni" title={p.dni}>{p.dni}</div>
                  <div className="prev-col-materia" title={p.materia_nombre}>{p.materia_nombre}</div>
                  <div className="prev-col-condicion" title={p.condicion_nombre}>{p.condicion_nombre}</div>
                  <div className="prev-col-curso" title={p.materia_curso_division}>{p.materia_curso_division}</div>

                  <div className="prev-col-acciones">
                    <div className="emp-baja-iconos">
                      <button
                        className="emp-baja-icono prev-baja-btn-alta "
                        id="iconbaja"
                        title="Dar de alta"
                        onClick={() => abrirModalAlta(p)}
                        aria-label="Dar de alta"
                        disabled={modalAlta.loading}
                        type="button"
                      >
                        <FaUserPlus />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviasBaja;
