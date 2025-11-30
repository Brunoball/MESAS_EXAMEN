// src/components/MesasExamen/EditarMesa.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaSave,
  FaTrash,
  FaExchangeAlt,
  FaPlus,
} from "react-icons/fa";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { createPortal } from "react-dom";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css";
import Toast from "../Global/Toast";
import ModalEliminarMesa from "./modales/ModalEliminarMesa";
import ModalAgregarMesas from "./modales/ModalAgregarMesas";
import ModalMoverMesa from "./modales/ModalMoverMesa";
import "./EditarMesa.css";
import "./modales/ModalEliminarMesas.css";
import InlineCalendar from "../Global/InlineCalendar";

/* ===== Portal inline ===== */
function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/* Utils */
const fmtISO = (d) => {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return "";
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/* Skeleton simple */
const Skeleton = ({ style, className = "" }) => (
  <div
    className={`mesa-skel ${className}`}
    style={{
      background:
        "linear-gradient(90deg, #f2f2f2 25%, #e8e8e8 37%, #f2f2f2 63%)",
      backgroundSize: "400% 100%",
      animation: "mesaShimmer 1.2s infinite",
      borderRadius: 8,
      ...style,
    }}
  />
);

const EditarMesa = () => {
  const { id: numeroMesaParam } = useParams();
  const numeroMesa = Number(numeroMesaParam);
  const navigate = useNavigate();

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [mesa, setMesa] = useState(null);
  const [idGrupo, setIdGrupo] = useState(null);
  const [numerosGrupo, setNumerosGrupo] = useState([]);
  const [detalleGrupo, setDetalleGrupo] = useState([]);
  const [turnos, setTurnos] = useState([]);

  const [fecha, setFecha] = useState("");
  const [idTurno, setIdTurno] = useState("");
  const [hora, setHora] = useState("");

  const [toast, setToast] = useState(null);
  const notify = useCallback(
    ({ tipo = "info", mensaje = "", duracion = 3500 }) =>
      setToast({ tipo, mensaje, duracion }),
    []
  );

  const [openDelete, setOpenDelete] = useState(false);
  const [openAgregar, setOpenAgregar] = useState(false);
  const [openMover, setOpenMover] = useState(false);
  const [numeroParaMover, setNumeroParaMover] = useState(null);

  // Modal integrado “Quitar número del grupo”
  const [openQuitar, setOpenQuitar] = useState(false);
  const [numeroQuitar, setNumeroQuitar] = useState(null);
  const [loadingQuitar, setLoadingQuitar] = useState(false);
  const cancelQuitarBtnRef = useRef(null);

  // Mesa sin grupo
  const [esMesaSinGrupo, setEsMesaSinGrupo] = useState(false);

  // Modal “mesa única en mesas agrupadas”
  const [openCrearGrupoUnico, setOpenCrearGrupoUnico] = useState(false);
  const [loadingCrearGrupoUnico, setLoadingCrearGrupoUnico] = useState(false);
  const cancelarGrupoUnicoRef = useRef(null);

  useEffect(() => {
    if (openQuitar) setTimeout(() => cancelQuitarBtnRef.current?.focus(), 0);
  }, [openQuitar]);

  useEffect(() => {
    if (openCrearGrupoUnico)
      setTimeout(() => cancelarGrupoUnicoRef.current?.focus(), 0);
  }, [openCrearGrupoUnico]);

  useEffect(() => {
    const onKey = (e) => {
      if (openQuitar) {
        if (e.key === "Escape" && !loadingQuitar) setOpenQuitar(false);
        if ((e.key === "Enter" || e.key === "NumpadEnter") && !loadingQuitar)
          confirmarQuitarNumeroDelGrupo();
      }
      if (openCrearGrupoUnico) {
        if (e.key === "Escape" && !loadingCrearGrupoUnico)
          setOpenCrearGrupoUnico(false);
        if (
          (e.key === "Enter" || e.key === "NumpadEnter") &&
          !loadingCrearGrupoUnico
        )
          confirmarCrearGrupoUnico();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openQuitar, loadingQuitar, openCrearGrupoUnico, loadingCrearGrupoUnico]);

  const cargarTodo = useCallback(async () => {
    if (!numeroMesa || !Number.isFinite(numeroMesa)) {
      throw new Error("Número de mesa inválido.");
    }

    // Turnos
    const resListas = await fetch(`${BASE_URL}/api.php?action=obtener_listas`, {
      cache: "no-store",
    });
    const jListas = await resListas.json().catch(() => ({}));
    const ts = (jListas?.listas?.turnos || [])
      .map((t) => ({
        id_turno: Number(t.id_turno ?? t.id ?? 0),
        turno: String(t.turno ?? t.nombre ?? "").trim(),
        _n: norm(t.turno ?? t.nombre ?? ""),
      }))
      .filter((t) => t.id_turno && t.turno);
    setTurnos(ts);

    // Grupos
    const rGr = await fetch(`${BASE_URL}/api.php?action=mesas_listar_grupos`, {
      cache: "no-store",
    });
    const jGr = await rGr.json().catch(() => ({}));
    if (!rGr.ok || !jGr?.exito)
      throw new Error(jGr?.mensaje || "No se pudieron obtener los grupos.");
    const grupos = Array.isArray(jGr.data) ? jGr.data : [];
    const filaGrupo = grupos.find((g) =>
      [g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4]
        .map((n) => Number(n || 0))
        .includes(numeroMesa)
    );

    if (!filaGrupo) {
      setEsMesaSinGrupo(true);
      setIdGrupo(null);
      setNumerosGrupo([numeroMesa]);
    } else {
      setEsMesaSinGrupo(false);
      setIdGrupo(Number(filaGrupo.id_grupo ?? filaGrupo.id_mesa_grupos ?? 0));
      const arrNums = [
        Number(filaGrupo.numero_mesa_1 || 0),
        Number(filaGrupo.numero_mesa_2 || 0),
        Number(filaGrupo.numero_mesa_3 || 0),
        Number(filaGrupo.numero_mesa_4 || 0),
      ].filter((n) => n > 0);
      setNumerosGrupo(arrNums.length ? arrNums : [numeroMesa]);
    }

    const nums = filaGrupo
      ? [
          Number(filaGrupo.numero_mesa_1 || 0),
          Number(filaGrupo.numero_mesa_2 || 0),
          Number(filaGrupo.numero_mesa_3 || 0),
          Number(filaGrupo.numero_mesa_4 || 0),
        ].filter((n) => n > 0)
      : [numeroMesa];

    const respDetGrupo = await fetch(
      `${BASE_URL}/api.php?action=mesas_detalle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeros_mesa: nums }),
      }
    );
    const jDetGrupo = await respDetGrupo.json().catch(() => ({}));
    if (!respDetGrupo.ok || !jDetGrupo?.exito) {
      throw new Error(jDetGrupo?.mensaje || `HTTP ${respDetGrupo.status}`);
    }

    const det = (Array.isArray(jDetGrupo.data) ? jDetGrupo.data : []).map(
      (m) => ({
        numero_mesa: Number(m.numero_mesa || 0),
        materia: m.materia ?? "",
        fecha: m.fecha ?? "",
        id_turno: m.id_turno ?? null,
        turno: m.turno ?? "",
        hora: m.hora ?? "",
        docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
        alumnos: Array.isArray(m.alumnos) ? m.alumnos : [],
      })
    );

    const actual = det.find((x) => x.numero_mesa === numeroMesa);
    if (!actual) throw new Error("No se encontró detalle de la mesa.");

    const fechaInicial = fmtISO(actual.fecha);
    let idTurnoInicial = "";
    if (actual.id_turno) {
      idTurnoInicial = String(actual.id_turno);
    } else if (actual.turno) {
      const tObj = ts.find((t) => t._n === norm(actual.turno));
      if (tObj?.id_turno) idTurnoInicial = String(tObj.id_turno);
    }

    // Normalizar hora a HH:MM
    let horaInicial = "";
    if (actual.hora) {
      const parts = String(actual.hora).split(":");
      if (parts.length >= 2) {
        horaInicial = `${parts[0].padStart(2, "0")}:${parts[1].padStart(
          2,
          "0"
        )}`;
      }
    }

    setMesa({ numero_mesa: numeroMesa, materia: actual.materia });
    setFecha(fechaInicial);
    setIdTurno(idTurnoInicial);
    setHora(horaInicial);

    det.sort((a, b) => a.numero_mesa - b.numero_mesa);
    setDetalleGrupo(det);
  }, [numeroMesa]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setCargando(true);
        await cargarTodo();
      } catch (e) {
        notify({ tipo: "error", mensaje: e.message || "Error cargando datos" });
      } finally {
        if (alive) setCargando(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cargarTodo, notify]);

  const materiaTitle = useMemo(() => mesa?.materia || "", [mesa]);

  const onSave = async () => {
    try {
      if (!fecha || !idTurno) {
        notify({ tipo: "error", mensaje: "Completá fecha y turno." });
        return;
      }
      setGuardando(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=mesa_actualizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_mesa: numeroMesa,
          fecha_mesa: fecha,
          id_turno: Number(idTurno),
          hora: hora || "",
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito)
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      notify({ tipo: "exito", mensaje: "Mesa actualizada correctamente." });
      await cargarTodo();
    } catch (e) {
      notify({ tipo: "error", mensaje: e.message || "Error al guardar" });
    } finally {
      setGuardando(false);
    }
  };

  const pedirQuitarNumero = (n) => {
    setNumeroQuitar(n);
    setOpenQuitar(true);
  };

  const confirmarQuitarNumeroDelGrupo = async () => {
    const n = Number(numeroQuitar);
    if (!n) return;
    try {
      setLoadingQuitar(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesa_grupo_quitar_numero`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numero_mesa: n }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito)
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      notify({ tipo: "exito", mensaje: `Número ${n} quitado del grupo.` });
      await cargarTodo();
      setOpenQuitar(false);
      setNumeroQuitar(null);
    } catch (e) {
      notify({
        tipo: "error",
        mensaje: e.message || "No se pudo quitar el número.",
      });
    } finally {
      setLoadingQuitar(false);
    }
  };

  const confirmarCrearGrupoUnico = async () => {
    try {
      if (!fecha || !idTurno) {
        notify({
          tipo: "error",
          mensaje: "Completá primero la fecha y el turno.",
        });
        return;
      }
      setLoadingCrearGrupoUnico(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesa_crear_grupo_unico`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            numero_mesa: numeroMesa,
            fecha_mesa: fecha,
            id_turno: Number(idTurno),
            hora: hora || "",
          }),
        }
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.exito)
        throw new Error(json?.mensaje || `HTTP ${resp.status}`);
      notify({
        tipo: "exito",
        mensaje: "Mesa movida a 'mesa única' en mesas agrupadas.",
      });
      setOpenCrearGrupoUnico(false);
      await cargarTodo();
    } catch (e) {
      notify({
        tipo: "error",
        mensaje: e.message || "No se pudo crear el grupo único.",
      });
    } finally {
      setLoadingCrearGrupoUnico(false);
    }
  };

  return (
    <>
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mesasexam-prev-add-container prev-add-container">
        <div className="mesasexam-prev-add-box prev-add-box" id="prev-add-boxs">
          {/* Header */}
          <div className="mesasexam-prev-add-header prev-add-header">
            <div className="mesasexam-prev-add-icon-title prev-add-icon-title">
              <FontAwesomeIcon
                icon={faPenToSquare}
                className="mesasexam-prev-add-icon prev-add-icon"
              />
              <div>
                <h1>
                  Editar Mesa Nº {mesa?.numero_mesa ?? numeroMesa}
                  {idGrupo
                    ? ` — Grupo ${idGrupo}`
                    : esMesaSinGrupo
                    ? " — Mesa no agrupada"
                    : ""}
                </h1>
                <p>{materiaTitle || (cargando ? "Cargando…" : "—")}</p>
              </div>
            </div>
            <button
              type="button"
              className="mesasexam-prev-add-back-btn prev-add-back-btn"
              onClick={() => navigate(-1)}
              title="Volver"
            >
              <FaArrowLeft />
              Volver
            </button>
          </div>

          {/* Body */}
          <div
            className="mesasexam-prev-add-form-wrapper"
            id="form-wrapper"
          >
            <div className="mesasexam-mesa-two-col mesa-two-col">
              {/* Programación */}
              <aside className="mesasexam-col-prog col-prog mesasexam-programacion-card programacion-card">
                <div
                  className="mesasexam-prev-section"
                  id="prev-section-program"
                >
                  {/* Título */}
                  <div className="mesasexam-prog-head prog-head">
                    <h3 className="mesasexam-prev-section-title prev-section-title">
                      Programación
                    </h3>
                  </div>

                  {/* Fila con Turno + Horario */}
                  {cargando ? (
                    <div className="mesasexam-program-fields">
                      <Skeleton
                        style={{ height: 40, borderRadius: 12, flex: 1 }}
                      />
                      <Skeleton
                        style={{ height: 40, borderRadius: 12, flex: 1 }}
                      />
                    </div>
                  ) : (
                    <div className="mesasexam-program-fields">
                      {/* Turno */}
                      <div className="mesasexam-float-field float-field">
                        <label
                          className="mesasexam-float-label float-label"
                          htmlFor="turno-select"
                        >
                          Turno
                        </label>
                        <select
                          id="turno-select"
                          className="mesasexam-prev-input prev-input"
                          value={idTurno}
                          onChange={(e) => setIdTurno(e.target.value)}
                        >
                          <option value="">Seleccionar…</option>
                          {turnos.map((t) => (
                            <option key={t.id_turno} value={t.id_turno}>
                              {t.turno}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Horario */}
                      <div className="mesasexam-float-field float-field">
                        <label
                          className="mesasexam-float-label float-label"
                          htmlFor="hora-input"
                        >
                          Horario
                        </label>
                        <input
                          id="hora-input"
                          type="time"
                          className="mesasexam-prev-input prev-input"
                          value={hora}
                          onChange={(e) => setHora(e.target.value)}
                        />
                        <span className="mesasexam-prev-input-highlight prev-input-highlight" />
                      </div>
                    </div>
                  )}

                  {/* Calendario debajo de los campos */}
                  <div className="mesasexam-prog-block prog-block mesasexam-calendar-block calendar-block">
                    {cargando ? (
                      <Skeleton style={{ height: 316, borderRadius: 12 }} />
                    ) : (
                      <InlineCalendar
                        className="mesasexam-cal-inline cal-inline"
                        value={fecha}
                        onChange={(v) => setFecha(v)}
                        locale="es-AR"
                        weekStartsOn={1}
                      />
                    )}
                  </div>
                </div>
              </aside>

              {/* Columna derecha */}
              <section className="mesasexam-col-materia col-materia">
                {esMesaSinGrupo ? (
                  // ======== MESA NO AGRUPADA ========
                  <div className="mesasexam-prev-section prev-section">
                    <h3 className="mesasexam-prev-section-title prev-section-title">
                      Mesa no agrupada (individual)
                    </h3>
                    <p className="mesasexam-mesa-single-info mesa-single-info">
                      Esta mesa todavía no forma parte de{" "}
                      <strong>mesas agrupadas</strong>. Podés mantenerla así o
                      crear un grupo nuevo donde será una{" "}
                      <strong>mesa única</strong> (un solo número en el grupo).
                    </p>

                    {detalleGrupo.length > 0 && (
                      <article className="mesasexam-mesa-card mesasexam-mesa-card--single mesa-card mesa-card--single">
                        <div className="mesasexam-mesa-card-head mesa-card-head">
                          <div className="mesasexam-mesa-card-main">
                            <span className="mesasexam-mesa-badge mesa-badge">
                              N° {detalleGrupo[0].numero_mesa}
                            </span>
                            <h4 className="mesasexam-mesa-card-title mesa-card-title">
                              {detalleGrupo[0].materia || "Sin materia"}
                            </h4>
                          </div>
                        </div>

                        <p className="mesasexam-mesa-card-sub mesa-card-sub">
                          {detalleGrupo[0].docentes?.length
                            ? `Docentes: ${detalleGrupo[0].docentes.join(
                                " | "
                              )}`
                            : "Docentes: —"}
                        </p>
                      </article>
                    )}

                    <button
                      type="button"
                      className="mesasexam-prev-add-button"
                      style={{ marginTop: 16 }}
                      onClick={() => setOpenCrearGrupoUnico(true)}
                      disabled={cargando || guardando}
                      title="Pasar esta mesa a 'mesa única' en mesas agrupadas"
                    >
                      <FaPlus style={{ marginRight: 8 }} />
                      Mover a mesa única en mesas agrupadas
                    </button>
                  </div>
                ) : (
                  // ======== SLOTS DEL GRUPO ========
                  <div className="mesasexam-prev-section prev-section">
                    <h3 className="mesasexam-prev-section-title prev-section-title">
                      Slots del grupo (hasta 4)
                    </h3>

                    <div className="mesasexam-mesa-cards mesa-cards">
                      {cargando
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div
                              key={`sk-${i}`}
                              className="mesasexam-mesa-card mesa-card"
                            >
                              <Skeleton
                                style={{
                                  height: 18,
                                  width: 90,
                                  borderRadius: 999,
                                }}
                              />
                              <Skeleton
                                style={{
                                  height: 16,
                                  width: "80%",
                                  borderRadius: 6,
                                  marginTop: 8,
                                }}
                              />
                              <Skeleton
                                style={{
                                  height: 14,
                                  width: "60%",
                                  borderRadius: 6,
                                  marginTop: 6,
                                }}
                              />
                              <div
                                style={{
                                  marginTop: "auto",
                                  display: "flex",
                                  gap: 8,
                                }}
                              >
                                <Skeleton
                                  style={{
                                    height: 36,
                                    width: 36,
                                    borderRadius: 999,
                                  }}
                                />
                                <Skeleton
                                  style={{
                                    height: 36,
                                    width: 36,
                                    borderRadius: 999,
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        : (() => {
                            const ocupados = [...detalleGrupo].sort(
                              (a, b) => a.numero_mesa - b.numero_mesa
                            );
                            const arr = [];
                            for (let i = 0; i < 4; i++)
                              arr.push(ocupados[i] ?? null);
                            return arr.map((slot, idx) => {
                              if (slot) {
                                const docentes = Array.isArray(slot.docentes)
                                  ? slot.docentes
                                  : [];
                                return (
                                  <article
                                    key={`slot-ok-${slot.numero_mesa}`}
                                    className="mesasexam-mesa-card mesa-card"
                                  >
                                    <div className="mesasexam-mesa-card-head mesa-card-head">
                                      {/* Fila de arriba: número + acciones */}
                                      <div className="mesasexam-mesa-card-header-row">
                                        <span className="mesasexam-mesa-badge mesa-badge">
                                          N° {slot.numero_mesa}
                                        </span>

                                        <div className="mesasexam-mesa-card-actions mesa-card-actions">
                                          <button
                                            className="mesasexam-mesa-chip mesasexam-mesa-chip-info mesa-chip info"
                                            title="Mover este número a otro grupo"
                                            onClick={() => {
                                              setNumeroParaMover(
                                                slot.numero_mesa
                                              );
                                              setOpenMover(true);
                                            }}
                                          >
                                            <FaExchangeAlt />
                                          </button>
                                          <button
                                            className="mesasexam-mesa-chip mesasexam-mesa-chip-danger mesa-chip danger"
                                            title="Quitar del grupo (no borra la mesa)"
                                            onClick={() =>
                                              pedirQuitarNumero(
                                                slot.numero_mesa
                                              )
                                            }
                                            disabled={!idGrupo}
                                          >
                                            <FaTrash />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Debajo: nombre de la materia */}
                                      <h4 className="mesasexam-mesa-card-title mesa-card-title">
                                        {slot.materia || "Sin materia"}
                                      </h4>
                                    </div>

                                    <p className="mesasexam-mesa-card-sub mesa-card-sub">
                                      {docentes.length
                                        ? `Docentes: ${docentes.join(" | ")}`
                                        : "Docentes: —"}
                                    </p>
                                  </article>
                                );
                              }
                              return (
                                <button
                                  key={`slot-free-${idx}`}
                                  className="mesasexam-mesa-card mesasexam-mesa-card-add mesa-card add"
                                  onClick={() => setOpenAgregar(true)}
                                  disabled={numerosGrupo.length >= 4}
                                  title="Agregar número al grupo"
                                >
                                  <FaPlus /> Agregar número
                                </button>
                              );
                            });
                          })()}
                    </div>
                  </div>
                )}

                {/* Botonera dentro de la columna derecha */}
                <div
                  className="mesasexam-prev-add-buttons"
                  id="v-add-buttons"
                >
                  <button
                    type="button"
                    className="mesasexam-prev-add-button mesasexam-prev-add-button-back prev-add-button prev-add-button--back"
                    onClick={() => setOpenDelete(true)}
                    title="Eliminar mesa (alumno)"
                    disabled={cargando}
                  >
                    <FaTrash style={{ marginRight: 8 }} />
                    Eliminar
                  </button>

                  <button
                    type="button"
                    className="mesasexam-prev-add-button prev-add-button"
                    disabled={guardando || cargando}
                    onClick={onSave}
                    title="Guardar"
                  >
                    <FaSave style={{ marginRight: 8 }} />
                    {guardando ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </section>
            </div>
          </div>

          {/* ===== Modales en Portal ===== */}
          {openDelete && (
            <Portal>
              <ModalEliminarMesa
                open={openDelete}
                mesa={{ numero_mesa: numeroMesa }}
                onClose={() => setOpenDelete(false)}
                onSuccess={() => {
                  setOpenDelete(false);
                  notify({ tipo: "exito", mensaje: "Mesa eliminada." });
                  setTimeout(() => navigate("/mesas-examen"), 400);
                }}
                onError={(mensaje) =>
                  notify({
                    tipo: "error",
                    mensaje: mensaje || "No se pudo eliminar la mesa.",
                  })
                }
              />
            </Portal>
          )}

          {openAgregar && !esMesaSinGrupo && (
            <Portal>
              <ModalAgregarMesas
                open={openAgregar}
                onClose={() => setOpenAgregar(false)}
                idGrupo={idGrupo}
                numeroMesaActual={numeroMesa}
                fechaObjetivo={fecha}
                idTurnoObjetivo={idTurno ? Number(idTurno) : null}
                onAdded={() => {
                  setOpenAgregar(false);
                  notify({
                    tipo: "exito",
                    mensaje: "Número agregado al grupo.",
                  });
                  cargarTodo();
                }}
                onError={(mensaje) => notify({ tipo: "error", mensaje })}
              />
            </Portal>
          )}

          {openMover && (
            <Portal>
              <ModalMoverMesa
                open={openMover}
                onClose={() => setOpenMover(false)}
                numeroMesaOrigen={numeroParaMover ?? numeroMesa}
                fechaObjetivo={fecha}
                idTurnoObjetivo={idTurno ? Number(idTurno) : null}
                onMoved={() => {
                  setOpenMover(false);
                  setNumeroParaMover(null);
                  notify({
                    tipo: "exito",
                    mensaje: "Número movido de grupo.",
                  });
                  cargarTodo();
                }}
                onError={(mensaje) => notify({ tipo: "error", mensaje })}
              />
            </Portal>
          )}

          {openQuitar && (
            <Portal>
              <div
                className="logout-modal-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-quitar-title"
                onMouseDown={() =>
                  !loadingQuitar ? setOpenQuitar(false) : null
                }
              >
                <div
                  className="logout-modal-container logout-modal--danger"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div
                    className="logout-modal__icon is-danger"
                    aria-hidden="true"
                  >
                    <FaTrash />
                  </div>

                  <h3
                    id="confirm-quitar-title"
                    className="logout-modal-title logout-modal-title--danger"
                  >
                    Confirmar acción
                  </h3>

                  <p className="logout-modal-text">
                    {`¿Quitar el número ${numeroQuitar} de este grupo? (no se borra la mesa)`}
                  </p>

                  <div
                    className="mesasexam-prev-modal-item prev-modal-item"
                    style={{ marginTop: 10 }}
                  >
                    {(idGrupo ? `Grupo ${idGrupo}` : "Sin grupo") +
                      (fecha ? ` • Fecha: ${fecha}` : "") +
                      (idTurno ? ` • Turno ID: ${idTurno}` : "") +
                      (hora ? ` • Hora: ${hora}` : "")}
                  </div>

                  <div className="logout-modal-buttons">
                    <button
                      type="button"
                      className="logout-btn logout-btn--ghost"
                      onClick={() => setOpenQuitar(false)}
                      disabled={loadingQuitar}
                      ref={cancelQuitarBtnRef}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="logout-btn logout-btn--solid-danger"
                      onClick={confirmarQuitarNumeroDelGrupo}
                      disabled={loadingQuitar}
                      aria-disabled={loadingQuitar}
                    >
                      {loadingQuitar ? "Quitando…" : "Confirmar"}
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          )}

          {openCrearGrupoUnico && (
            <Portal>
              <div
                className="logout-modal-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="grupo-unico-title"
                onMouseDown={() =>
                  !loadingCrearGrupoUnico
                    ? setOpenCrearGrupoUnico(false)
                    : null
                }
              >
                <div
                  className="logout-modal-container"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="logout-modal__icon" aria-hidden="true">
                    <FaPlus />
                  </div>

                  <h3 id="grupo-unico-title" className="logout-modal-title">
                    Mover a mesa única en mesas agrupadas
                  </h3>

                  <p className="logout-modal-text">
                    Esta mesa se pasará a la tabla de{" "}
                    <strong>mesas agrupadas</strong> como un grupo nuevo con un
                    solo número. Luego vas a poder agregarle más números o
                    dejarla como mesa única.
                  </p>

                  <div
                    className="mesasexam-prev-modal-item prev-modal-item"
                    style={{ marginTop: 10 }}
                  >
                    {`Mesa Nº ${numeroMesa}` +
                      (fecha ? ` • Fecha: ${fecha}` : "") +
                      (idTurno ? ` • Turno ID: ${idTurno}` : "") +
                      (hora ? ` • Hora: ${hora}` : "")}
                  </div>

                  <div className="logout-modal-buttons">
                    <button
                      type="button"
                      className="logout-btn logout-btn--ghost"
                      onClick={() => setOpenCrearGrupoUnico(false)}
                      disabled={loadingCrearGrupoUnico}
                      ref={cancelarGrupoUnicoRef}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="logout-btn logout-btn--solid"
                      onClick={confirmarCrearGrupoUnico}
                      disabled={loadingCrearGrupoUnico}
                      aria-disabled={loadingCrearGrupoUnico}
                    >
                      {loadingCrearGrupoUnico
                        ? "Creando grupo…"
                        : "Mover a mesa única"}
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </div>
      </div>

      {/* keyframes skeleton */}
      <style>{`@keyframes mesaShimmer{0%{background-position:100% 0}100%{background-position:0 0}}`}</style>

      {/* Overlay fullscreen por si tu CSS no lo define */}
      <style>{`.logout-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:grid;place-items:center}`}</style>
    </>
  );
};

export default EditarMesa;
