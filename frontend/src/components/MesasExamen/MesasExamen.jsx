// src/components/MesasExamen/MesasExamen.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEdit,
  FaTrash,
  FaArrowLeft,
  FaUserPlus,
  FaFileExcel,
  FaSearch,
  FaTimes,
  FaUsers,
  FaFilter,
  FaChevronDown,
  FaCalendarAlt,
  FaClock,
  FaEraser,
  FaFilePdf,
  FaLayerGroup,
  FaUnlink,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css";

import Toast from "../Global/Toast";
import FullScreenLoader from "../Global/FullScreenLoader";

import ModalCrearMesas from "./modales/ModalCrearMesas";
import ModalEliminarMesas from "./modales/ModalEliminarMesas";
import ModalEliminarMesa from "./modales/ModalEliminarMesa";

import { generarPDFMesas } from "./modales/GenerarPDF";
import escudo from "../../imagenes/Escudo.png";

/* ================================
   Utils
================================ */
const normalizar = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const formatearFechaISO = (v) => {
  if (!v || typeof v !== "string") return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

/** Debounce hook */
function useDebounce(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ================================
   Helpers para “Detalle (como PDF)”
================================ */
const mode = (arr = []) => {
  const counts = new Map();
  for (const v0 of arr) {
    const v = (v0 ?? "").toString().trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "",
    max = -1;
  for (const [k, n] of counts) {
    if (n > max) {
      max = n;
      best = k;
    }
  }
  return best;
};

const nombreMes = (iso = "") => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return { dia: "", mesNum: "", anio: "", mesTxt: "" };
  const meses = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];
  return {
    dia: m[3],
    mesNum: m[2],
    anio: m[1],
    mesTxt: meses[parseInt(m[2], 10) - 1] || "",
  };
};

const diaSemana = (iso) => {
  const dias = [
    "DOMINGO",
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
  ];
  const d = new Date(`${iso || ""}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : dias[d.getDay()] || "";
};

const horaPorTurno = (turno = "", fallback = "07:30 HS.") => {
  const t = normalizar(turno);
  if (t.includes("man")) return "07:30 HS.";
  if (t.includes("tar")) return "13:30 HS.";
  return fallback;
};

/** Usa hora de la DB si viene; si no, cae al turno */
const formatearHoraDesdeDB = (hora = "", turno = "") => {
  const raw = (hora ?? "").toString().trim();
  if (raw) {
    const [hh = "", mm = ""] = raw.split(":");
    if (hh && mm) {
      return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")} HS.`;
    }
  }
  return horaPorTurno(turno);
};

const limpiarCurso = (s) =>
  String(s ?? "")
    .replace(/°\s*°/g, "°")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * Construye “mesas lógicas” (igual que el PDF) a partir del detalle del backend.
 *
 * AHORA con fallbackPorNumero:
 *  - Si en el detalle viene alguna mesa sin fecha/turno/hora,
 *    se completan desde los grupos/no-agrupadas (dataset base).
 */
function buildMesasLogicas({ detalle, agrupaciones, id_grupo, fallbackPorNumero }) {
  const subMesas = (Array.isArray(detalle) ? detalle : []).map((m) => {
    const numero = m.numero_mesa ?? null;

    let fecha = m.fecha ?? "";
    let turno = m.turno ?? "";
    let hora = m.hora ?? "";

    // ✅ Fallback: si falta fecha/turno/hora en el detalle,
    // usamos la info proveniente de los grupos/no-agrupadas.
    if (fallbackPorNumero && Number.isFinite(Number(numero))) {
      const fb = fallbackPorNumero.get(Number(numero));
      if (fb) {
        if (!fecha && fb.fecha) fecha = fb.fecha;
        if (!turno && fb.turno) turno = fb.turno;
        if (!hora && fb.hora) hora = fb.hora;
      }
    }

    return {
      numero_mesa: numero,
      fecha,
      turno,
      hora, // viene de la DB o fallback
      materia: m.materia ?? "",
      docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
      alumnos: Array.isArray(m.alumnos)
        ? m.alumnos.map((a) => ({
            alumno: a.alumno ?? "",
            dni: a.dni ?? "",
            curso: a.curso ?? "",
          }))
        : [],
    };
  });

  // Si viene id_grupo, la agrupación es la unión de todos los sub números.
  let agrupacionesEfectivas = [];
  if (Array.isArray(agrupaciones) && agrupaciones.length) {
    agrupacionesEfectivas = agrupaciones
      .map((arr) =>
        (arr || [])
          .map((n) => parseInt(n, 10))
          .filter(Number.isFinite)
      )
      .filter((a) => a.length);
  } else if (id_grupo != null) {
    const setNums = new Set(
      subMesas
        .map((x) => parseInt(x.numero_mesa, 10))
        .filter(Number.isFinite)
    );
    agrupacionesEfectivas = [Array.from(setNums).sort((a, b) => a - b)];
  } else {
    agrupacionesEfectivas = [
      Array.from(new Set(subMesas.map((sm) => sm.numero_mesa)))
        .filter(Boolean)
        .sort((a, b) => a - b),
    ];
  }

  const buildMesaLogicaFrom = (arr) => {
    const fechaStar =
      mode(arr.map((x) => x.fecha)) || arr.find((x) => x.fecha)?.fecha || "";
    const turnoStar =
      mode(arr.map((x) => x.turno)) || arr.find((x) => x.turno)?.turno || "";
    const horaStar =
      mode(arr.map((x) => x.hora)) || arr.find((x) => x.hora)?.hora || "";
    const materiaStar =
      mode(arr.map((x) => x.materia)) || arr[0]?.materia || "";
    const subNumeros = [...new Set(arr.map((x) => x.numero_mesa).filter((v) => v != null))].sort(
      (a, b) => a - b
    );

    // Mapa Docente -> Materia -> alumnos[]
    const DOC_FALLBACK = "—";
    const mapa = new Map();
    const add = (doc, mat, al) => {
      if (!mapa.has(doc)) mapa.set(doc, new Map());
      const m2 = mapa.get(doc);
      if (!m2.has(mat)) m2.set(mat, []);
      m2.get(mat).push(...al);
    };
    for (const sm of arr) {
      const docentesSM = sm.docentes?.length ? sm.docentes : [DOC_FALLBACK];
      for (const d of docentesSM) add(d, sm.materia || "", sm.alumnos || []);
    }

    // Bloques (Materia -> Docente) con alumnos dedupe
    const bloques = [];
    const docentes = [...mapa.keys()];
    const materiasSet = new Set();
    for (const d of docentes) for (const mat of mapa.get(d).keys()) materiasSet.add(mat);
    const materiasOrden = [...materiasSet].sort((A, B) =>
      String(A).localeCompare(String(B), "es", { sensitivity: "base" })
    );

    for (const mat of materiasOrden) {
      const dQueTienen = docentes
        .filter((d) => mapa.get(d).has(mat))
        .sort((A, B) =>
          String(A).localeCompare(String(B), "es", { sensitivity: "base" })
        );
      for (const d of dQueTienen) {
        const a = mapa.get(d).get(mat) || [];
        const uniq = Array.from(
          new Map(
            a.map((x) => [x.dni || x.alumno || Math.random(), x])
          ).values()
        );
        uniq.sort((A, B) =>
          String(A.alumno).localeCompare(String(B.alumno), "es", {
            sensitivity: "base",
          })
        );
        bloques.push({ docente: d, materia: mat, alumnos: uniq });
      }
    }
    return {
      fecha: fechaStar,
      turno: turnoStar,
      hora: horaStar, // << hora principal del grupo (ya con fallback)
      materia: materiaStar,
      subNumeros,
      bloques,
    };
  };

  const mesasLogicas = [];
  for (const nums of agrupacionesEfectivas) {
    const setNums = new Set(nums);
    const arr = subMesas.filter((sm) => setNums.has(sm.numero_mesa));
    if (!arr.length) continue;
    mesasLogicas.push(buildMesaLogicaFrom(arr));
  }

  // Orden por fecha, turno (Mañana/Tarde), primer número
  const turnRank = (t) => (normalizar(t).includes("man") ? 0 : 1);
  mesasLogicas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    const ta = turnRank(a.turno),
      tb = turnRank(b.turno);
    if (ta !== tb) return ta - tb;
    return (a.subNumeros[0] ?? 0) - (b.subNumeros[0] ?? 0);
  });
  return mesasLogicas;
}

/* ================================
   Componente Mesas de Examen
================================ */

// CLAVE PARA GUARDAR ESTADO ENTRE PANTALLAS
const STORAGE_KEY = "mesasExamenUI_v1";
// Flag en sessionStorage para saber si volvemos de Editar
const STORAGE_FLAG_FROM_EDIT = "mesasExamen_from_edit";

const MesasExamen = () => {
  const navigate = useNavigate();

  // Vistas superiores
  const [vista, setVista] = useState("grupos"); // "grupos" | "no-agrupadas"

  // Datos
  const [grupos, setGrupos] = useState([]);
  const [gruposDB, setGruposDB] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [noAgrupadas, setNoAgrupadas] = useState([]);
  const [noAgrupadasDB, setNoAgrupadasDB] = useState([]);
  const [cargandoNo, setCargandoNo] = useState(false);

  // Loader global durante creación + armado
  const [creandoMesas, setCreandoMesas] = useState(false);

  // listas básicas (para filtros / combos)
  const [listas, setListas] = useState({
    cursos: [],
    divisiones: [],
    turnos: [],
  });

  // filtros y UI
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [q, setQ] = useState("");
  const qDebounced = useDebounce(q, 220);

  // Filtros seleccionados
  const [fechaSel, setFechaSel] = useState("");
  const [turnoSel, setTurnoSel] = useState("");

  // Estado de acordeones (cerrados por defecto)
  const [openFecha, setOpenFecha] = useState(false);
  const [openTurno, setOpenTurno] = useState(false);

  // modales (lote)
  const [abrirCrear, setAbrirCrear] = useState(false);
  const [abrirEliminar, setAbrirEliminar] = useState(false);

  // modal eliminar individual
  const [abrirEliminarUno, setAbrirEliminarUno] = useState(false);
  const [mesaAEliminar, setMesaAEliminar] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);
  const notify = useCallback(
    ({ tipo = "info", mensaje = "", duracion = 3000 }) =>
      setToast({ tipo, mensaje, duracion }),
    []
  );

  // ====== SCROLL / ESTADO PERSISTENTE ======
  const pdfScrollRef = useRef(null);
  const scrollPosRef = useRef(0);
  const initialStateLoadedRef = useRef(false);
  const dataLoadedRef = useRef(false);
  const scrollRestoredRef = useRef(false);

  // Restaurar estado (vista, filtros, scroll) SOLO si volvemos de Editar
  useEffect(() => {
    if (initialStateLoadedRef.current) return;
    initialStateLoadedRef.current = true;

    if (typeof window === "undefined") return;

    let shouldRestore = false;

    try {
      const flag = window.sessionStorage.getItem(STORAGE_FLAG_FROM_EDIT);
      if (flag === "1") {
        shouldRestore = true;
        // Consumimos el flag para que no se reaplique en el futuro
        window.sessionStorage.removeItem(STORAGE_FLAG_FROM_EDIT);
      }
    } catch (e) {
      console.warn("No se pudo leer flag de from_edit:", e);
    }

    // Si NO venimos de editar => limpiar cualquier estado viejo y salir
    if (!shouldRestore) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn("No se pudo limpiar estado antiguo MesasExamen:", e);
      }
      return;
    }

    // Si SÍ venimos de editar => restaurar estado guardado
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const st = JSON.parse(raw);

      if (st.vista === "grupos" || st.vista === "no-agrupadas") {
        setVista(st.vista);
      }
      if (typeof st.q === "string") setQ(st.q);
      if (typeof st.fechaSel === "string") setFechaSel(st.fechaSel);
      if (typeof st.turnoSel === "string") setTurnoSel(st.turnoSel);
      if (typeof st.scrollTop === "number") {
        scrollPosRef.current = st.scrollTop;
      }
    } catch (e) {
      console.warn("No se pudo restaurar estado MesasExamen:", e);
    }
  }, []);

  const persistState = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const el = pdfScrollRef.current;
      const scrollTop = el ? el.scrollTop : scrollPosRef.current || 0;
      scrollPosRef.current = scrollTop;

      const payload = {
        vista,
        q,
        fechaSel,
        turnoSel,
        scrollTop,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("No se pudo guardar estado MesasExamen:", e);
    }
  }, [vista, q, fechaSel, turnoSel]);

  // Guardar cada vez que cambian vista / filtros / búsqueda
  useEffect(() => {
    persistState();
  }, [vista, q, fechaSel, turnoSel, persistState]);

  // Guardar también al desmontar
  useEffect(() => {
    return () => {
      persistState();
    };
  }, [persistState]);

  // ======= Carga de listas =======
  const fetchListas = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=obtener_listas`, {
        cache: "no-store",
      });
      const json = await resp.json();
      if (json?.exito) {
        setListas({
          cursos: json.listas?.cursos || [],
          divisiones: json.listas?.divisiones || [],
          turnos: json.listas?.turnos || [],
        });
      }
    } catch {
      /* noop */
    }
  }, []);

  // ======= Carga de grupos =======
  const fetchGrupos = useCallback(async () => {
    setCargando(true);
    dataLoadedRef.current = false;
    scrollRestoredRef.current = false;
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_listar_grupos`, {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito) throw new Error(json?.mensaje || "Error al listar grupos.");

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((g) => {
        const tribunalStr = Array.isArray(g.tribunal)
          ? g.tribunal.filter(Boolean).join(" | ")
          : g.tribunal || "";

        return {
          id: g.id_grupo,
          id_grupo: g.id_grupo,
          numero_mesa_1: g.numero_mesa_1,
          numero_mesa_2: g.numero_mesa_2,
          numero_mesa_3: g.numero_mesa_3,
          numero_mesa_4: g.numero_mesa_4 ?? null,
          id_materia: g.id_materia ?? null,
          materia: g.materia ?? "",
          fecha: g.fecha ?? "",
          id_turno: g.id_turno ?? null,
          turno: g.turno ?? "",
          profesor: tribunalStr,
          _materia: normalizar(g.materia ?? ""),
          _turno: normalizar(g.turno ?? ""),
          // si el backend más adelante manda hora, la podés mapear acá:
          hora: g.hora ?? "",
        };
      });

      setGrupos(procesadas);
      setGruposDB(procesadas);
      dataLoadedRef.current = true;
    } catch {
      setGrupos([]);
      setGruposDB([]);
      dataLoadedRef.current = true;
    } finally {
      setCargando(false);
    }
  }, []);

  // ======= Carga de "no agrupadas" =======
  const fetchNoAgrupadas = useCallback(async () => {
    setCargandoNo(true);
    dataLoadedRef.current = false;
    scrollRestoredRef.current = false;
    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesas_listar_no_agrupadas`,
        { cache: "no-store" }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito)
        throw new Error(json?.mensaje || "Error al listar no agrupadas.");

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((r) => ({
        id: r.id,
        id_grupo: null,
        numero_mesa_1: r.numero_mesa,
        numero_mesa_2: null,
        numero_mesa_3: null,
        numero_mesa_4: null,
        id_materia: r.id_materia ?? null,
        materia: r.materia ?? "",
        fecha: r.fecha ?? "",
        id_turno: r.id_turno ?? null,
        turno: r.turno ?? "",
        profesor: r.tribunal || "",
        _materia: normalizar(r.materia ?? ""),
        _turno: normalizar(r.turno ?? ""),
        _esNoAgrupada: true,
        hora: r.hora ?? "",
      }));

      setNoAgrupadas(procesadas);
      setNoAgrupadasDB(procesadas);
      dataLoadedRef.current = true;
    } catch {
      setNoAgrupadas([]);
      setNoAgrupadasDB([]);
      dataLoadedRef.current = true;
    } finally {
      setCargandoNo(false);
    }
  }, []);

  useEffect(() => {
    fetchListas();
    fetchGrupos();
    fetchNoAgrupadas();
  }, [fetchListas, fetchGrupos, fetchNoAgrupadas]);

  // Turnos únicos
  const turnosUnicos = useMemo(() => {
    if (listas.turnos?.length) {
      return listas.turnos
        .map((t) => String(t.nombre ?? t.turno ?? "").trim())
        .filter(Boolean);
    }
    const dataset = vista === "grupos" ? gruposDB : noAgrupadasDB;
    const s = new Set((dataset || []).map((m) => m.turno).filter(Boolean));
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [gruposDB, noAgrupadasDB, listas.turnos, vista]);

  // Fechas únicas (ISO)
  const fechasUnicas = useMemo(() => {
    const dataset = vista === "grupos" ? gruposDB : noAgrupadasDB;
    const set = new Set((dataset || []).map((m) => m.fecha).filter(Boolean));
    return Array.from(set).sort();
  }, [gruposDB, noAgrupadasDB, vista]);

  // Dataset base según pestaña
  const datasetBase = vista === "grupos" ? grupos : noAgrupadas;
  const datasetBaseDB = vista === "grupos" ? gruposDB : noAgrupadasDB;
  const cargandoVista = vista === "grupos" ? cargando : cargandoNo;

  /* =======================================================
   *  DETALLE (como PDF): fetch + cache de docentes/alumnos
   * ======================================================= */
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [mesasDetalle, setMesasDetalle] = useState([]);
  // Cache: numero_mesa -> texto normalizado (docentes + alumnos)
  const [detalleCache, setDetalleCache] = useState({});

  useEffect(() => {
    const cargarDetalle = async () => {
      try {
        setLoadingDetalle(true);
        setMesasDetalle([]);
        setDetalleCache({});

        const datasetDBLocal = vista === "grupos" ? gruposDB : noAgrupadasDB;
        if (!datasetDBLocal || !datasetDBLocal.length) return;

        // Agrupaciones por filas (igual que antes)
        const agrupaciones = datasetDBLocal
          .map((g) =>
            [
              g.numero_mesa_1,
              g.numero_mesa_2,
              g.numero_mesa_3,
              g.numero_mesa_4,
            ]
              .filter((n) => n != null)
              .map(Number)
          )
          .filter((arr) => arr.length);

        // ✅ Mapa de fallback: número de mesa -> {fecha, turno, hora}
        const fallbackPorNumero = new Map();
        for (const g of datasetDBLocal) {
          const numeros = [
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
          ]
            .filter((n) => n != null)
            .map(Number);

          for (const n of numeros) {
            if (!fallbackPorNumero.has(n)) {
              fallbackPorNumero.set(n, {
                fecha: g.fecha ?? "",
                turno: g.turno ?? "",
                hora: g.hora ?? "",
              });
            }
          }
        }

        const setNums = new Set();
        agrupaciones.forEach((arr) => arr.forEach((n) => setNums.add(n)));
        const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);
        if (!numerosOrdenados.length) return;

        const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle_pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numeros_mesa: numerosOrdenados }),
        });
        const raw = await resp.text();
        let json;
        try {
          json = JSON.parse(raw);
        } catch {
          throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
        }
        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || "No se pudo obtener el detalle.");
        }
        const detalle = Array.isArray(json.data) ? json.data : [];
        if (!detalle.length) {
          notify({ tipo: "warning", mensaje: "No hay detalle para mostrar." });
          return;
        }

        // ✅ ahora le pasamos también fallbackPorNumero
        const mesasLogicas = buildMesasLogicas({
          detalle,
          agrupaciones,
          id_grupo: null,
          fallbackPorNumero,
        });
        setMesasDetalle(mesasLogicas);

        // Cache de texto docentes + alumnos
        const nuevoCache = {};
        for (const m of detalle) {
          const num = Number(m.numero_mesa);
          if (!Number.isFinite(num)) continue;
          let texto = "";
          if (Array.isArray(m.docentes)) {
            texto += " " + m.docentes.join(" ");
          }
          if (Array.isArray(m.alumnos)) {
            for (const a of m.alumnos) {
              if (a?.alumno) texto += " " + a.alumno;
            }
          }
          const norm = normalizar(texto);
          if (!norm) continue;
          nuevoCache[num] = (nuevoCache[num] || "") + " " + norm;
        }
        setDetalleCache(nuevoCache);
      } catch (e) {
        console.error(e);
        notify({
          tipo: "error",
          mensaje: e?.message || "No se pudo cargar el detalle.",
        });
      } finally {
        setLoadingDetalle(false);
      }
    };

    cargarDetalle();
  }, [vista, gruposDB, noAgrupadasDB, notify]);

  // Filtrado (incluyendo búsqueda por docentes / alumnos)
  const filasFiltradas = useMemo(() => {
    let res = datasetBase;

    if (qDebounced?.trim()) {
      const nq = normalizar(qDebounced);

      res = res.filter((m) => {
        // Coincidencias base (materia, turno, fecha, id, números)
        const baseMatch =
          m._materia.includes(nq) ||
          m._turno.includes(nq) ||
          (m.fecha || "").includes(nq) ||
          String(m.id_grupo ?? "").includes(nq) ||
          String(m.numero_mesa_1 ?? "").includes(nq) ||
          String(m.numero_mesa_2 ?? "").includes(nq) ||
          String(m.numero_mesa_3 ?? "").includes(nq) ||
          String(m.numero_mesa_4 ?? "").includes(nq);

        if (baseMatch) return true;

        // Extra: buscar también en docentes + alumnos usando el cache
        if (detalleCache && Object.keys(detalleCache).length) {
          const nums = [
            m.numero_mesa_1,
            m.numero_mesa_2,
            m.numero_mesa_3,
            m.numero_mesa_4,
          ]
            .filter((n) => n != null)
            .map(Number);

          for (const n of nums) {
            const texto = detalleCache[n] || "";
            if (texto.includes(nq)) return true;
          }
        }

        return false;
      });
    }

    if (fechaSel) {
      res = res.filter((m) => (m.fecha || "") === fechaSel);
    }

    if (turnoSel) {
      const nt = normalizar(turnoSel);
      res = res.filter((m) => m._turno === nt);
    }

    return res;
  }, [datasetBase, qDebounced, fechaSel, turnoSel, detalleCache]);

  const hayResultados = filasFiltradas.length > 0;

  // Para deshabilitar "Crear Mesas" si ya existe al menos UNA mesa (en grupos o no agrupadas)
  const hayAlgunaMesa = useMemo(() => {
    return (gruposDB?.length || 0) + (noAgrupadasDB?.length || 0) > 0;
  }, [gruposDB, noAgrupadasDB]);

  /* =======================================================
   *  Exportar Excel — DETALLADO
   * ======================================================= */
  const exportarExcel = useCallback(async () => {
    try {
      if (!filasFiltradas.length) return;

      const setNums = new Set();
      for (const g of filasFiltradas) {
        [
          g.numero_mesa_1,
          g.numero_mesa_2,
          g.numero_mesa_3,
          g.numero_mesa_4,
        ]
          .filter((n) => n != null)
          .map(Number)
          .forEach((n) => setNums.add(n));
      }
      const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);
      if (!numerosOrdenados.length) {
        notify({
          tipo: "warning",
          mensaje: "No hay números de mesa visibles para exportar.",
        });
        return;
      }

      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeros_mesa: numerosOrdenados }),
      });

      const raw = await resp.text();
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
      }
      if (!resp.ok || !json?.exito) {
        throw new Error(
          json?.mensaje || "No se pudo obtener el detalle para Excel."
        );
      }

      const detalle = Array.isArray(json.data) ? json.data : [];
      if (!detalle.length) {
        notify({
          tipo: "warning",
          mensaje: "El servidor no devolvió detalle para exportar.",
        });
        return;
      }

      const limpiarCursoX = (s) =>
        String(s ?? "")
          .replace(/°\s*°/g, "°")
          .replace(/\s{2,}/g, " ")
          .trim();

      const turnoRank = (t) => {
        const x = (t || "").toLowerCase();
        if (x.includes("mañ") || x.includes("man")) return 0;
        if (x.includes("tar")) return 1;
        return 2;
      };

      // hora para Excel: usa DB si viene, si no por turno
      const horaX = (t, desdeDB = "") => {
        const limpia = (desdeDB || "").trim();
        if (limpia) {
          const [hh = "", mm = ""] = limpia.split(":");
          if (hh && mm) return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
        }
        const x = (t || "").toLowerCase();
        if (x.includes("mañ") || x.includes("man")) return "07:30";
        if (x.includes("tar")) return "13:30";
        return "";
      };

      const mapaNumero = new Map();
      for (const g of filasFiltradas) {
        [
          g.numero_mesa_1,
          g.numero_mesa_2,
          g.numero_mesa_3,
          g.numero_mesa_4,
        ]
          .filter((n) => n != null)
          .map(Number)
          .forEach((n) => {
            if (!mapaNumero.has(n)) {
              mapaNumero.set(n, {
                id_grupo: g.id_grupo ?? null,
                fecha: g.fecha ?? "",
                turno: g.turno ?? "",
              });
            }
          });
      }

      const filas = [];
      for (const m of detalle) {
        const numeroMesa = m.numero_mesa ?? null;
        const fb = mapaNumero.get(numeroMesa) || {
          id_grupo: "",
          fecha: "",
          turno: "",
        };
        const fechaISO = m.fecha || fb.fecha || "";
        const turno = m.turno || fb.turno || "";
        const idGrupo = fb.id_grupo ?? "";
        const horaCalc = horaX(turno, m.hora ?? "");
        const materia = m.materia ?? "";
        const docentes =
          Array.isArray(m.docentes) && m.docentes.length
            ? m.docentes
            : ["—"];
        const alumnos =
          Array.isArray(m.alumnos) && m.alumnos.length
            ? m.alumnos
            : [{ alumno: "—", dni: "—", curso: "—" }];

        for (const d of docentes) {
          for (const a of alumnos) {
            filas.push({
              "ID Grupo": idGrupo || "",
              "N° Mesa": numeroMesa ?? "",
              Fecha: fechaISO ? formatearFechaISO(fechaISO) : "",
              Turno: turno || "",
              Hora: horaCalc,
              "Espacio Curricular": materia || "",
              Docente: d || "—",
              Estudiante: a?.alumno || "—",
              DNI: a?.dni || "—",
              Curso: limpiarCursoX(a?.curso || "—"),
              _sortFechaISO: fechaISO || "9999-12-31",
              _sortTurnoRank: turnoRank(turno),
            });
          }
        }
      }

      filas.sort((A, B) => {
        if (A._sortFechaISO !== B._sortFechaISO)
          return A._sortFechaISO < B._sortFechaISO ? -1 : 1;
        if (A._sortTurnoRank !== B._sortTurnoRank)
          return A._sortTurnoRank - B._sortTurnoRank;
        const nA = parseInt(A["N° Mesa"] || 0, 10);
        const nB = parseInt(B["N° Mesa"] || 0, 10);
        if (nA !== nB) return nA - nB;
        const d = String(A.Docente || "").localeCompare(
          String(B.Docente || ""),
          "es",
          { sensitivity: "base" }
        );
        if (d !== 0) return d;
        return String(A.Estudiante || "").localeCompare(
          String(B.Estudiante || ""),
          "es",
          { sensitivity: "base" }
        );
      });

      const filasFinales = filas.map(
        ({ _sortFechaISO, _sortTurnoRank, ...rest }) => rest
      );
      const headers = [
        "ID Grupo",
        "N° Mesa",
        "Fecha",
        "Turno",
        "Hora",
        "Espacio Curricular",
        "Docente",
        "Estudiante",
        "DNI",
        "Curso",
      ];

      const ws = XLSX.utils.json_to_sheet(filasFinales, { header: headers });
      ws["!cols"] = [
        { wch: 10 },
        { wch: 9 },
        { wch: 12 },
        { wch: 10 },
        { wch: 9 },
        { wch: 28 },
        { wch: 26 },
        { wch: 28 },
        { wch: 12 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        vista === "grupos" ? "Mesas (detalle)" : "No agrupadas (detalle)"
      );

      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/octet-stream" });

      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const nombre =
        vista === "grupos"
          ? `MesasDeExamen_Detalle_${yyyy}-${mm}-${dd}(${filasFinales.length} filas).xlsx`
          : `MesasNoAgrupadas_Detalle_${yyyy}-${mm}-${dd}(${filasFinales.length} filas).xlsx`;
      saveAs(blob, nombre);

      notify({
        tipo: "exito",
        mensaje: `Exportadas ${filasFinales.length} filas detalladas.`,
      });
    } catch (e) {
      console.error("Excel detalle — error:", e);
      notify({
        tipo: "error",
        mensaje: e?.message || "No se pudo exportar el Excel detallado.",
      });
    }
  }, [filasFiltradas, notify, vista]);

  // ===== Exportar PDF SOLO del registro (fila actual) =====
  const exportarPDFDeRegistro = useCallback(
    (g) => {
      if (!g) return;

      const logoPath = escudo;

      if (vista === "grupos" && g.id_grupo != null) {
        const agrupaciones = [
          [
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
          ]
            .filter((n) => n != null)
            .map(Number),
        ];

        generarPDFMesas({
          mesasFiltradas: [],
          agrupaciones,
          id_grupo: g.id_grupo,
          baseUrl: BASE_URL,
          notify,
          logoPath,
        });
        return;
      }

      const nums = [
        g.numero_mesa_1,
        g.numero_mesa_2,
        g.numero_mesa_3,
        g.numero_mesa_4,
      ]
        .filter((n) => n != null)
        .map(Number);
      const agrupaciones = [nums.length ? nums : []];

      generarPDFMesas({
        mesasFiltradas: nums.map((n) => ({ numero_mesa: n })),
        agrupaciones,
        baseUrl: BASE_URL,
        notify,
        logoPath,
      });
    },
    [vista, notify]
  );

  // Mesas lógicas filtradas según las filas visibles (para la vista PDF)
  const mesasDetalleFiltradas = useMemo(() => {
    if (!mesasDetalle.length || !filasFiltradas.length) return [];
    const setNums = new Set();
    for (const g of filasFiltradas) {
      [
        g.numero_mesa_1,
        g.numero_mesa_2,
        g.numero_mesa_3,
        g.numero_mesa_4,
      ]
        .filter((n) => n != null)
        .map(Number)
        .forEach((n) => setNums.add(n));
    }
    if (!setNums.size) return [];
    return mesasDetalle.filter(
      (mesa) =>
        Array.isArray(mesa.subNumeros) &&
        mesa.subNumeros.some((n) => setNums.has(n))
    );
  }, [mesasDetalle, filasFiltradas]);

  // RESTAURAR SCROLL CUANDO YA CARGÓ TODO
  useEffect(() => {
    if (cargandoVista || loadingDetalle) return;

    const timer = setTimeout(() => {
      const el = pdfScrollRef.current;
      if (!el) return;
      if (!scrollRestoredRef.current && scrollPosRef.current > 0) {
        el.scrollTop = scrollPosRef.current;
        scrollRestoredRef.current = true;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [cargandoVista, loadingDetalle, mesasDetalleFiltradas.length]);

  // Función para restaurar scroll manualmente después de operaciones
  const restaurarScroll = useCallback(() => {
    const timer = setTimeout(() => {
      const el = pdfScrollRef.current;
      if (el && scrollPosRef.current > 0) {
        el.scrollTop = scrollPosRef.current;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  /* ======================
   *  Render
   * ====================== */
  return (
    <div className="glob-profesor-container">
      {/* Loader global con el escudo */}
      <FullScreenLoader visible={creandoMesas} title="Procesando…" />

      <div className="glob-profesor-box">
        {/* Header */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Mesas de Examen</span>

          {/* Buscador */}
          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por materia, turno, fecha, número, docente o alumno"
              className="glob-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={cargandoVista}
            />
            {q ? (
              <FaTimes
                className="glob-clear-search-icon"
                onClick={() => setQ("")}
              />
            ) : null}
            <button className="glob-search-button" type="button" title="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          {/* Panel de filtros */}
          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => {
                setMostrarFiltros((prev) => {
                  const next = !prev;
                  if (next) {
                    setOpenFecha(false);
                    setOpenTurno(false);
                  }
                  return next;
                });
              }}
              disabled={cargandoVista}
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown
                className={`glob-chevron-icon ${
                  mostrarFiltros ? "glob-rotate" : ""
                }`}
              />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                {/* FECHA */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${
                      openFecha ? "is-open" : ""
                    }`}
                    aria-expanded={openFecha}
                    onClick={() => setOpenFecha((v) => !v)}
                  >
                    <span className="glob-filtros-group-title">
                      <FaCalendarAlt style={{ marginRight: 8 }} /> Filtrar por
                      fecha
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div
                    className={`glob-filtros-group-body ${
                      openFecha ? "is-open" : "is-collapsed"
                    }`}
                  >
                    <div className="glob-grid-filtros">
                      {fechasUnicas.map((f) => (
                        <button
                          key={`fecha-${f}`}
                          className={`glob-chip-filtro ${
                            fechaSel === f ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setFechaSel(fechaSel === f ? "" : f);
                            setMostrarFiltros(false);
                          }}
                          title={`Filtrar por ${formatearFechaISO(f)}`}
                        >
                          {formatearFechaISO(f)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TURNO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${
                      openTurno ? "is-open" : ""
                    }`}
                    aria-expanded={openTurno}
                    onClick={() => setOpenTurno((v) => !v)}
                  >
                    <span className="glob-filtros-group-title">
                      <FaClock style={{ marginRight: 8 }} /> Filtrar por turno
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div
                    className={`glob-filtros-group-body ${
                      openTurno ? "is-open" : "is-collapsed"
                    }`}
                  >
                    <div className="glob-grid-filtros">
                      {turnosUnicos.map((t) => (
                        <button
                          key={`turno-${t}`}
                          className={`glob-chip-filtro ${
                            turnoSel === t ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setTurnoSel(turnoSel === t ? "" : t);
                            setMostrarFiltros(false);
                          }}
                          title={`Filtrar por ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contador + Tabs + Chips */}
        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline">
              {/* CONTADOR */}
              <div className="contador-grups-noencontrado">
                <div className="glob-contador-container">
                  <span className="glob-profesores-desktop">
                    {vista === "grupos" ? "Grupos: " : "No agrupadas: "}
                    {filasFiltradas.length}
                  </span>
                  <span className="glob-profesores-mobile">
                    {filasFiltradas.length}
                  </span>
                  <FaUsers className="glob-icono-profesor" />
                </div>

                {/* TABS vista datasets */}
                <div
                  className="glob-tabs glob-tabs--inline"
                  role="tablist"
                  aria-label="Cambiar vista"
                >
                  <button
                    className={`glob-tab ${
                      vista === "grupos" ? "glob-tab--active" : ""
                    }`}
                    onClick={() => {
                      setVista("grupos");
                      scrollRestoredRef.current = false;
                    }}
                    title="Ver grupos armados"
                    aria-pressed={vista === "grupos"}
                    role="tab"
                  >
                    <FaLayerGroup style={{ marginRight: 6 }} />
                    Grupos
                  </button>
                  <button
                    className={`glob-tab ${
                      vista === "no-agrupadas" ? "glob-tab--active" : ""
                    }`}
                    onClick={() => {
                      setVista("no-agrupadas");
                      scrollRestoredRef.current = false;
                    }}
                    title="Ver mesas no agrupadas"
                    aria-pressed={vista === "no-agrupadas"}
                    role="tab"
                  >
                    <FaUnlink style={{ marginRight: 6 }} />
                    No agrupadas
                  </button>
                </div>

                {/* CHIPS filtros */}
                {(q || fechaSel || turnoSel) && (
                  <div className="glob-chips-container">
                    {q && (
                      <div className="glob-chip-mini" title="Filtro activo">
                        <span className="glob-chip-mini-text glob-profesores-desktop">
                          Búsqueda: {q}
                        </span>
                        <span className="glob-chip-mini-text glob-profesores-mobile">
                          {q.length > 6 ? `${q.substring(0, 6)}…` : q}
                        </span>
                        <button
                          className="glob-chip-mini-close"
                          onClick={() => setQ("")}
                          aria-label="Quitar"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {fechaSel && (
                      <div className="glob-chip-mini" title="Filtro activo">
                        <span className="glob-chip-mini-text">
                          Fecha: {formatearFechaISO(fechaSel)}
                        </span>
                        <button
                          className="glob-chip-mini-close"
                          onClick={() => setFechaSel("")}
                          aria-label="Quitar"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {turnoSel && (
                      <div className="glob-chip-mini" title="Filtro activo">
                        <span className="glob-chip-mini-text">
                          Turno: {turnoSel}
                        </span>
                        <button
                          className="glob-chip-mini-close"
                          onClick={() => setTurnoSel("")}
                          aria-label="Quitar"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <button
                      className="glob-chip-mini glob-chip-clear-all"
                      onClick={() => {
                        setQ("");
                        setFechaSel("");
                        setTurnoSel("");
                      }}
                      title="Quitar todos los filtros"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ----- ÚNICA VISTA: DETALLE (como PDF) ----- */}
          <div className="glob-box-table pdf-view">
            {cargandoVista || loadingDetalle ? (
              <div
                className="glob-loading-spinner-container"
                style={{ height: "50vh" }}
              >
                <div className="glob-loading-spinner" />
              </div>
            ) : datasetBaseDB.length === 0 ? (
              <div className="glob-no-data-message">
                <div className="glob-message-content">
                  <p>
                    {vista === "grupos"
                      ? "No hay grupos registrados"
                      : "No hay mesas no agrupadas registradas"}
                  </p>
                </div>
              </div>
            ) : !hayResultados ? (
              <div className="glob-no-data-message">
                <div className="glob-message-content">
                  <p>No hay resultados con los filtros actuales</p>
                </div>
              </div>
            ) : !mesasDetalleFiltradas.length ? (
              <div className="glob-no-data-message">
                <div className="glob-message-content">
                  <p>No hay detalle para mostrar.</p>
                </div>
              </div>
            ) : (
              <div className="pdf-scroll" ref={pdfScrollRef}>
                {mesasDetalleFiltradas.map((mesa, idxMesa) => {
                  const { dia, mesTxt, anio } = nombreMes(mesa.fecha);
                  const headerTitulo = `MESAS DE EXAMEN ${
                    mesTxt ? mesTxt + " " : ""
                  }${anio || ""}`.trim();
                  const sub =
                    `${diaSemana(mesa.fecha)} ${String(dia).padStart(
                      2,
                      "0"
                    )} · ` +
                    `${String(mesa.turno || "").toUpperCase()} · ${formatearHoraDesdeDB(
                      mesa.hora,
                      mesa.turno
                    )}`;

                  // preparar "segmentos contiguos" para fusionar celdas Materia y Docente
                  const nRowsPorBloque = mesa.bloques.map((b) =>
                    Math.max(1, b.alumnos.length)
                  );
                  const totalRows = nRowsPorBloque.reduce((a, b) => a + b, 0);

                  const segMateria = [];
                  let curMat = null,
                    accMat = 0,
                    startMat = 0,
                    rowCursor = 0;
                  for (let i = 0; i < mesa.bloques.length; i++) {
                    const mat = mesa.bloques[i].materia || "";
                    const n = nRowsPorBloque[i];
                    if (curMat === null) {
                      curMat = mat;
                      startMat = rowCursor;
                      accMat = 0;
                    }
                    if (mat !== curMat) {
                      segMateria.push({
                        materia: curMat,
                        startRow: startMat,
                        rowSpan: accMat,
                      });
                      curMat = mat;
                      startMat = rowCursor;
                      accMat = 0;
                    }
                    accMat += n;
                    rowCursor += n;
                  }
                  if (curMat !== null)
                    segMateria.push({
                      materia: curMat,
                      startRow: startMat,
                      rowSpan: accMat,
                    });

                  const segDocente = [];
                  let curDoc = null,
                    accDoc = 0,
                    startDoc = 0;
                  let rowCursor2 = 0;
                  for (let i = 0; i < mesa.bloques.length; i++) {
                    const doc = mesa.bloques[i].docente || "—";
                    const n = nRowsPorBloque[i];
                    if (curDoc === null) {
                      curDoc = doc;
                      startDoc = rowCursor2;
                      accDoc = 0;
                    }
                    if (doc !== curDoc) {
                      segDocente.push({
                        docente: curDoc,
                        startRow: startDoc,
                        rowSpan: accDoc,
                      });
                      curDoc = doc;
                      startDoc = rowCursor2;
                      accDoc = 0;
                    }
                    accDoc += n;
                    rowCursor2 += n;
                  }
                  if (curDoc !== null)
                    segDocente.push({
                      docente: curDoc,
                      startRow: startDoc,
                      rowSpan: accDoc,
                    });

                  const materiaStart = new Map(
                    segMateria.map((s) => [s.startRow, s])
                  );
                  const docenteStart = new Map(
                    segDocente.map((s) => [s.startRow, s])
                  );
                  // filas fin de cada bloque
                  const materiaEndRows = new Set(
                    Array.from(materiaStart.values()).map(
                      (s) => s.startRow + (s.rowSpan || 1) - 1
                    )
                  );
                  const docenteEndRows = new Set(
                    Array.from(docenteStart.values()).map(
                      (s) => s.startRow + (s.rowSpan || 1) - 1
                    )
                  );

                  const rowsHTML = [];
                  let filaGlobal = 0;
                  for (let bi = 0; bi < mesa.bloques.length; bi++) {
                    const bloque = mesa.bloques[bi];
                    const n = nRowsPorBloque[bi];

                    for (let i = 0; i < n; i++) {
                      const a =
                        bloque.alumnos[i] || {
                          alumno: "—",
                          dni: "—",
                          curso: "—",
                        };
                      const celdas = [];

                      if (filaGlobal === 0) {
                        celdas.push(
                          <td
                            key="hora"
                            rowSpan={Math.max(totalRows, 1)}
                            className="pdf-hora-cell"
                          >
                            {`${diaSemana(mesa.fecha)}\n${String(dia).padStart(
                              2,
                              "0"
                            )}\n${mesTxt}\n${String(
                              mesa.turno || ""
                            ).toUpperCase()}\n${formatearHoraDesdeDB(
                              mesa.hora,
                              mesa.turno
                            )}`}
                          </td>
                        );
                      }

                      const mStart = materiaStart.get(filaGlobal);
                      if (mStart) {
                        celdas.push(
                          <td
                            key={`mat-${filaGlobal}`}
                            rowSpan={mStart.rowSpan || 1}
                            className="pdf-materia-cell"
                          >
                            {String(mStart.materia || "")}
                          </td>
                        );
                      }

                      // Celdas de Estudiante/DNI/Curso
                      celdas.push(
                        <td
                          key={`al-${filaGlobal}`}
                          className="pdf-td-left col-estudiante"
                        >
                          {String(a.alumno || "")}
                        </td>
                      );
                      celdas.push(
                        <td key={`dni-${filaGlobal}`} className="col-dni">
                          {String(a.dni || "")}
                        </td>
                      );
                      celdas.push(
                        <td
                          key={`cur-${filaGlobal}`}
                          className="pdf-td-center col-curso"
                        >
                          {limpiarCurso(a.curso)}
                        </td>
                      );

                      const dStart = docenteStart.get(filaGlobal);
                      if (dStart) {
                        celdas.push(
                          <td
                            key={`doc-${filaGlobal}`}
                            rowSpan={dStart.rowSpan || 1}
                            className="pdf-docente-cell"
                          >
                            <div className="docente-cell-content">
                              <span className="docente-nombre">
                                {String(dStart.docente || "—")}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      // Flags de inicio/fin de bloque
                      const isDocenteStart = docenteStart.has(filaGlobal);
                      const isDocenteEnd = docenteEndRows.has(filaGlobal);
                      const isMateriaStart = materiaStart.has(filaGlobal);
                      const isMateriaEnd = materiaEndRows.has(filaGlobal);

                      rowsHTML.push(
                        <tr
                          key={`r-${idxMesa}-${filaGlobal}`}
                          className={`${isDocenteStart ? "doc-block-start" : ""} ${
                            isDocenteEnd ? "doc-block-end" : ""
                          } ${isMateriaStart ? "mat-block-start" : ""} ${
                            isMateriaEnd ? "mat-block-end" : ""
                          }`}
                        >
                          {celdas}
                        </tr>
                      );

                      filaGlobal++;
                    }
                  }

                  if (totalRows === 0) {
                    rowsHTML.push(
                      <tr
                        key={`r-empty-${idxMesa}`}
                        className="doc-block-start doc-block-end mat-block-start mat-block-end"
                      >
                        <td className="pdf-hora-cell">
                          {`${diaSemana(mesa.fecha)}\n${String(dia).padStart(
                            2,
                            "0"
                          )}\n${mesTxt}\n${String(
                            mesa.turno || ""
                          ).toUpperCase()}\n${formatearHoraDesdeDB(
                            mesa.hora,
                            mesa.turno
                          )}`}
                        </td>
                        <td className="pdf-materia-cell">
                          {mesa.materia || "—"}
                        </td>
                        <td className="pdf-td-left col-estudiante">—</td>
                        <td className="pdf-td-center col-dni">—</td>
                        <td className="pdf-td-center col-curso">—</td>
                        <td className="pdf-docente-cell">
                          <div className="docente-cell-content">
                            <span className="docente-nombre">—</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Primer número de mesa de la agrupación (para editar/eliminar)
                  const primerNumero =
                    Array.isArray(mesa.subNumeros) && mesa.subNumeros.length
                      ? mesa.subNumeros[0]
                      : null;

                  return (
                    <div key={`mesa-${idxMesa}`} className="mesa-detalle-box">
                      {/* Header "idéntico" al PDF */}
                      <div className="pdf-header">
                        <div className="pdf-header-left">
                          <img src={escudo} alt="Logo" className="pdf-logo" />
                          <div className="pdf-header-titles">
                            <div className="pdf-title">{headerTitulo}</div>
                            <div className="pdf-subtitle">
                              IPET N° 50 "Ing. Emilio F. Olmos"
                            </div>
                          </div>
                        </div>

                        <div className="pdf-header-right">
                          <div className="pdf-subinfo">{sub}</div>
                          <div className="pdf-subinfo">
                            <strong>N° de mesa:</strong>{" "}
                            {mesa.subNumeros.join(" • ") || "—"}
                          </div>
                        </div>
                      </div>

                      {/* Tabla como el PDF */}
                      <div className="pdf-table-wrapper">
                        <table className="tabla-detalle-mesa">
                          <thead>
                            <tr>
                              <th>Hora</th>
                              <th>Espacio Curricular</th>
                              <th>Estudiante</th>
                              <th className="col-dni">DNI</th>
                              <th className="pdf-td-center">Curso</th>
                              <th>Docentes</th>
                            </tr>
                          </thead>
                          <tbody>{rowsHTML}</tbody>
                        </table>
                      </div>

                      {/* Acciones rápidas por mesa/agrupación */}
                      <div className="pdf-actions">
                        <button
                          className="glob-iconchip pdfbuttons"
                          title="Exportar esta mesa a PDF"
                          onClick={() => {
                            const agrupacion = [mesa.subNumeros];
                            generarPDFMesas({
                              mesasFiltradas: mesa.subNumeros.map((n) => ({
                                numero_mesa: n,
                              })),
                              agrupaciones: agrupacion,
                              baseUrl: BASE_URL,
                              notify,
                              logoPath: escudo,
                            });
                          }}
                          aria-label="Exportar PDF de esta mesa"
                        >
                          <FaFilePdf />
                          &nbsp; PDF (esta mesa)
                        </button>

                        {/* Botón Editar */}
                        <button
                          className="glob-iconchip pdfbuttons"
                          title="Editar (primera mesa de la agrupación)"
                          onClick={() => {
                            if (!primerNumero) return;

                            try {
                              if (typeof window !== "undefined") {
                                window.sessionStorage.setItem(
                                  STORAGE_FLAG_FROM_EDIT,
                                  "1"
                                );
                              }
                            } catch (e) {
                              console.warn(
                                "No se pudo setear flag from_edit:",
                                e
                              );
                            }

                            persistState();
                            navigate(`/mesas/editar/${primerNumero}`);
                          }}
                          aria-label="Editar mesa"
                          style={{ marginLeft: 8 }}
                        >
                          <FaEdit />
                          &nbsp; Editar
                        </button>

                        {/* Botón Eliminar */}
                        <button
                          className="glob-iconchip pdfbuttons"
                          title="Eliminar (primera mesa de la agrupación)"
                          onClick={() => {
                            if (!primerNumero) return;
                            setMesaAEliminar({ numero_mesa: primerNumero });
                            setAbrirEliminarUno(true);
                          }}
                          aria-label="Eliminar mesa"
                          style={{ marginLeft: 8 }}
                        >
                          <FaTrash />
                          &nbsp; Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* BOTONERA INFERIOR */}
        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => {
              try {
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(STORAGE_KEY);
                  window.sessionStorage.removeItem(STORAGE_FLAG_FROM_EDIT);
                }
              } catch (e) {
                console.warn("No se pudo limpiar estado al volver:", e);
              }
              navigate("/panel");
            }}
            aria-label="Volver"
            title="Volver"
          >
            <FaArrowLeft className="glob-profesor-icon-button" />
            <p>Volver Atrás</p>
          </button>

          <div className="glob-botones-container">
            {/* CREAR MESAS */}
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirCrear(true)}
              aria-label="Crear"
              title={
                hayAlgunaMesa
                  ? "Ya hay mesas creadas. Elimina las mesas para volver a crear."
                  : "Crear mesas (confirmar)"
              }
              disabled={hayAlgunaMesa}
            >
              <FaUserPlus className="glob-profesor-icon-button" />
              <p>Crear Mesas</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!filasFiltradas.length}
              aria-label="Exportar"
              title={
                filasFiltradas.length
                  ? "Exportar Excel (detalle completo por mesa)"
                  : "No hay filas visibles para exportar"
              }
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar Excel</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => {
                if (!filasFiltradas.length) return;

                const agrupaciones = filasFiltradas.map((g) =>
                  [
                    g.numero_mesa_1,
                    g.numero_mesa_2,
                    g.numero_mesa_3,
                    g.numero_mesa_4,
                  ]
                    .filter((n) => n != null)
                    .map(Number)
                );

                const setNums = new Set();
                for (const arr of agrupaciones)
                  for (const n of arr) setNums.add(n);
                const numerosOrdenados = Array.from(setNums).sort(
                  (a, b) => a - b
                );

                generarPDFMesas({
                  mesasFiltradas: numerosOrdenados.map((n) => ({
                    numero_mesa: n,
                  })),
                  agrupaciones,
                  baseUrl: BASE_URL,
                  notify,
                  logoPath: escudo,
                });
              }}
              disabled={!filasFiltradas.length}
              aria-label="Exportar PDF"
              title="Exportar PDF (una hoja por mesa)"
              style={{ background: "var(--glob-primary, #2d3436)" }}
            >
              <FaFilePdf className="glob-profesor-icon-button" />
              <p>Exportar PDF</p>
            </button>

            {/* ELIMINAR MESAS */}
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirEliminar(true)}
              aria-label="Eliminar"
              title="Eliminar mesas (confirmar)"
              disabled={!hayAlgunaMesa}
            >
              <FaEraser className="glob-profesor-icon-button" />
              <p>Eliminar Mesas</p>
            </button>
          </div>
        </div>
      </div>

      {/* Modales (lote) */}
      {abrirCrear && (
        <ModalCrearMesas
          open={abrirCrear}
          onClose={() => setAbrirCrear(false)}
          onLoadingChange={(v) => setCreandoMesas(Boolean(v))}
          onSuccess={async () => {
            setAbrirCrear(false);
            await fetchGrupos();
            await fetchNoAgrupadas();

            setVista("grupos");

            notify({
              tipo: "exito",
              mensaje: "Mesas creadas y grupos actualizados.",
            });

            restaurarScroll();
          }}
          onError={(mensaje) => {
            setAbrirCrear(false);
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudieron crear las mesas.",
            });
          }}
        />
      )}

      {abrirEliminar && (
        <ModalEliminarMesas
          open={abrirEliminar}
          onClose={() => setAbrirEliminar(false)}
          onSuccess={async () => {
            setAbrirEliminar(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            notify({
              tipo: "exito",
              mensaje: "Mesas eliminadas correctamente",
            });

            restaurarScroll();
          }}
          onError={(mensaje) =>
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudieron eliminar las mesas.",
            })
          }
          listas={listas}
        />
      )}

      {/* Eliminar individual */}
      {abrirEliminarUno && mesaAEliminar?.numero_mesa && (
        <ModalEliminarMesa
          open={abrirEliminarUno}
          mesa={{ numero_mesa: mesaAEliminar.numero_mesa }}
          onClose={() => setAbrirEliminarUno(false)}
          onSuccess={async () => {
            setAbrirEliminarUno(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            notify({ tipo: "exito", mensaje: "Mesa eliminada." });

            restaurarScroll();
          }}
          onError={(mensaje) =>
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudo eliminar la mesa.",
            })
          }
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default MesasExamen;
