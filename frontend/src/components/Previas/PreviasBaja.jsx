// src/components/Previas/PreviasBaja.jsx
import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import {
  FaArrowLeft,
  FaUsers,
  FaSearch,
  FaTimes,
  FaUserPlus,
  FaTrash,
} from "react-icons/fa";
import Toast from "../Global/Toast";

import DarAltaPreviaModal from "./modales/DarAltaPreviaModal";
import ModalEliminarPreviaBaja from "./modales/ModalEliminarPreviaBaja";

import "../Global/roots.css";
import "../Global/section-ui.css";
import "../Profesores/ProfesorBaja.css";

const normalizar = (str = "") =>
  (str?.toString?.() ?? String(str))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const fmtFechaAR = (v) => {
  if (!v) return "-";
  const s = String(v).slice(0, 10); // "YYYY-MM-DD"
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

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

  const [modalEliminar, setModalEliminar] = useState({
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

      const res = await fetch(
        `${BASE_URL}/api.php?action=previas_baja&ts=${Date.now()}`
      );
      const data = await res.json();

      if (!data?.exito) throw new Error(data?.mensaje || "Error desconocido");

      const procesadas = (data.previas || []).map((p) => ({
        ...p,
        _alumno: normalizar(p.alumno),
        _dni: String(p.dni || "").toLowerCase(),
        _motivo: normalizar(p.motivo_baja),
      }));

      setPrevias(procesadas);
    } catch (e) {
      mostrarToast(e.message || "Error al obtener bajas", "error");
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
      (p) => p._alumno.includes(q) || p._dni.includes(q) || p._motivo.includes(q)
    );
  }, [previas, busqueda]);

  // ===== MODAL ALTA =====
  const abrirModalAlta = useCallback((p) => {
    setModalAlta({ open: true, item: p, loading: false, error: "" });
  }, []);

  const cerrarModalAlta = useCallback(() => {
    setModalAlta((m) => (m.loading ? m : { open: false, item: null, loading: false, error: "" }));
  }, []);

  const confirmarAlta = useCallback(
    async ({ fecha_alta, motivo_alta }) => {
      try {
        setModalAlta((m) => ({ ...m, loading: true, error: "" }));

        const payload = {
          id_previa: modalAlta.item?.id_previa,
          fecha_alta,
          motivo_alta,
        };

        const res = await fetch(
          `${BASE_URL}/api.php?action=previa_dar_alta&ts=${Date.now()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

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

  // ===== MODAL ELIMINAR =====
  const abrirModalEliminar = useCallback((p) => {
    setModalEliminar({ open: true, item: p, loading: false, error: "" });
  }, []);

  const cerrarModalEliminar = useCallback(() => {
    setModalEliminar((m) =>
      m.loading ? m : { open: false, item: null, loading: false, error: "" }
    );
  }, []);

  const confirmarEliminar = useCallback(async () => {
    try {
      const id = Number(modalEliminar.item?.id_previa || 0);
      if (!id) throw new Error("ID inválido");

      setModalEliminar((m) => ({ ...m, loading: true, error: "" }));

      // ✅ llama a tu eliminar_registro.php mediante api.php
      const res = await fetch(
        `${BASE_URL}/api.php?action=previa_eliminar&ts=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_previa: id }),
        }
      );

      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || "No se pudo eliminar");

      await cargarBajas();
      setModalEliminar({ open: false, item: null, loading: false, error: "" });
      mostrarToast("Registro eliminado", "exito");
    } catch (e) {
      setModalEliminar((m) => ({
        ...m,
        loading: false,
        error: e?.message || "Error desconocido",
      }));
    }
  }, [modalEliminar.item, cargarBajas, mostrarToast]);

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

      {/* Modal Eliminar */}
      <ModalEliminarPreviaBaja
        open={modalEliminar.open}
        item={modalEliminar.item}
        loading={modalEliminar.loading}
        error={modalEliminar.error}
        onCancel={cerrarModalEliminar}
        onConfirm={confirmarEliminar}
      />

      {/* Barra superior */}
      <div className="emp-baja-glass">
        <div className="emp-baja-barra-superior">
          <div className="emp-baja-titulo-container">
            <h2 className="emp-baja-titulo">Previas dadas de baja</h2>
          </div>

          <button
            className="emp-baja-nav-btn emp-baja-nav-btn--volver-top"
            onClick={() => navigate("/previas")}
            type="button"
          >
            <FaArrowLeft className="ico" />
            <span>Volver</span>
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="emp-baja-buscador-container">
        <input
          type="text"
          className="emp-baja-buscador"
          placeholder="Buscar por alumno, DNI o motivo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          disabled={cargando || modalAlta.loading || modalEliminar.loading}
        />

        {busqueda && (
          <button
            type="button"
            className="prev-baja-clear"
            onClick={() => setBusqueda("")}
            title="Limpiar"
            disabled={cargando || modalAlta.loading || modalEliminar.loading}
          >
            <FaTimes />
          </button>
        )}

        <div className="emp-baja-buscador-icono">
          <FaSearch />
        </div>
      </div>

      {/* Tabla */}
      {cargando ? (
        <p className="emp-baja-cargando">Cargando previas dadas de baja...</p>
      ) : (
        <div className="emp-baja-tabla-container">
          <div className="emp-baja-controles-superiores">
            <div className="emp-baja-contador">
              Mostrando <strong>{bajasFiltradas.length}</strong> previas
              <FaUsers style={{ marginLeft: 8, opacity: 0.7 }} />
            </div>
          </div>

          <div className="emp-baja-tabla-header-container">
            <div className="emp-baja-tabla-header">
              <div className="prev-col-dni">DNI</div>
              <div className="prev-col-alumno">Alumno</div>
              <div className="prev-col-motivo">Motivo</div>
              <div className="prev-col-fecha">Fecha baja</div>
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
              bajasFiltradas.map((p) => (
                <div className="emp-baja-fila" key={p.id_previa}>
                  <div className="prev-col-dni">{p.dni}</div>
                  <div className="prev-col-alumno">{p.alumno}</div>
                  <div className="prev-col-motivo" title={p.motivo_baja || ""}>
                    {p.motivo_baja || "-"}
                  </div>
                  <div className="prev-col-fecha" title={p.fecha_baja || ""}>
                    {fmtFechaAR(p.fecha_baja)}
                  </div>

                  {/* ✅ ACCIONES: alta + eliminar */}
                  <div className="prev-col-acciones">
                    <div className="emp-baja-iconos">
                      <button
                        className="emp-baja-icono prev-baja-btn-alta"
                        title="Dar de alta"
                        onClick={() => abrirModalAlta(p)}
                        aria-label="Dar de alta"
                        disabled={modalAlta.loading || modalEliminar.loading}
                        type="button"
                      >
                        <FaUserPlus />
                      </button>

                      <button
                        className="emp-baja-icono prev-baja-btn-trash"
                        title="Eliminar registro"
                        onClick={() => abrirModalEliminar(p)}
                        aria-label="Eliminar registro"
                        disabled={modalAlta.loading || modalEliminar.loading}
                        type="button"
                      >
                        <FaTrash />
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
