// src/components/Previas/AgregarPrevia.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';
import '../Global/roots.css';
import './AgregarPrevia.css';

// Font Awesome
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faArrowLeft, faSave, faPlus, faTrashAlt } from '@fortawesome/free-solid-svg-icons';

// --- Helpers ---
const hoyISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getDefaultPrevia = (anio = new Date().getFullYear(), fecha_carga = hoyISO()) => ({
  materia_id_curso: '',
  materia_id_division: '',
  id_materia: '',
  id_condicion: '',
  anio,
  fecha_carga,
  inscripcion: 0,
  loading: false,
  saved: false,
});

// Campos que van en mayúsculas
const UPPERCASE_FIELDS = new Set(['apellido', 'nombre']);

const AgregarPrevia = () => {
  const navigate = useNavigate();

  // 🔹 Pestañas principales: "alumno" | "previas"
  const [activeMainTab, setActiveMainTab] = useState('alumno');

  // ---------- Listas (desde backend) ----------
  const [listas, setListas] = useState({
    cursos: [],
    divisiones: [],
    condiciones: [],
  });
  const [listasLoading, setListasLoading] = useState(true);

  // Materias dependientes (se carga para la PREVIA ACTIVA)
  const [materiasMap, setMateriasMap] = useState({}); // { 'curso-division': [materias] }
  const [materiasLoading, setMateriasLoading] = useState(false);

  // ---------- Form (Datos del alumno - COMUNES a todas las previas) ----------
  const [alumnoForm, setAlumnoForm] = useState({
    dni: '',
    apellido: '',
    nombre: '',
    cursando_id_curso: '',
    cursando_id_division: '',
  });

  // ---------- Form (Datos de las previas - ARRAY) ----------
  const [previasForm, setPreviasForm] = useState([getDefaultPrevia()]);
  const [activePreviaIndex, setActivePreviaIndex] = useState(0);

  const activePrevia = previasForm[activePreviaIndex] || {};

  // ----- Toast (arriba) -----
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastTipo, setToastTipo] = useState('info');

  const lanzarToast = (tipo, mensaje, duracion = 2500) => {
    setToastTipo(tipo);
    setToastMsg(mensaje);
    setShowToast(true);
  };

  // Ref para el input de fecha (abrir el almanaque programáticamente)
  const fechaRef = useRef(null);

  // 🔹 Helper para agregar EGRESADO solo en esta pantalla
  const agregarEgresado = (cursos) => {
    const yaExiste = cursos.some((c) => Number(c.id) === 8);
    if (yaExiste) return cursos;
    return [...cursos, { id: 8, nombre: 'EGRESADO' }];
  };

  // ---------- Efecto: cargar listas ----------
  useEffect(() => {
    const cargarListas = async () => {
      try {
        setListasLoading(true);
        const res = await fetch(`${BASE_URL}/api.php?action=listas_basicas`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || 'No se pudieron obtener las listas');

        const cursosBase = json.listas?.cursos ?? [];
        const cursosConEgresado = agregarEgresado(cursosBase);

        setListas({
          cursos: cursosConEgresado,
          divisiones: json.listas?.divisiones ?? [],
          condiciones: json.listas?.condiciones ?? [],
        });
      } catch (e) {
        lanzarToast('error', e.message || 'Error cargando listas');
      } finally {
        setListasLoading(false);
      }
    };
    cargarListas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Fetch de materias dependiente de curso+división (materia) ----------
  const materiaComboKey = `${activePrevia.materia_id_curso}-${activePrevia.materia_id_division}`;
  const puedeCargarMaterias =
    String(activePrevia.materia_id_curso) && String(activePrevia.materia_id_division);

  useEffect(() => {
    if (!puedeCargarMaterias || materiasMap[materiaComboKey]) return; // Ya cargado

    let cancelado = false;

    const cargarMaterias = async () => {
      try {
        setMateriasLoading(true);
        const url = `${BASE_URL}/api.php?action=materias_por_curso_division&id_curso=${activePrevia.materia_id_curso}&id_division=${activePrevia.materia_id_division}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json?.exito)
          throw new Error(json?.mensaje || 'No se pudieron obtener las materias');

        if (!cancelado) {
          setMateriasMap((m) => ({ ...m, [materiaComboKey]: json.materias ?? [] }));
        }
      } catch (e) {
        if (!cancelado) lanzarToast('error', e.message || 'Error cargando materias');
      } finally {
        if (!cancelado) setMateriasLoading(false);
      }
    };

    cargarMaterias();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiaComboKey, puedeCargarMaterias]);

  // Materias a mostrar en el select de la previa activa
  const materiasParaSelect = useMemo(() => {
    return materiasMap[materiaComboKey] || [];
  }, [materiaComboKey, materiasMap]);

  // ---------- Handlers Comunes (Alumno) ----------
  const onChangeAlumno = (e) => {
    const { name, value, type } = e.target;

    if (name === 'dni') {
      const digits = (value || '').replace(/\D+/g, '');
      setAlumnoForm((f) => ({ ...f, dni: digits }));
      return;
    }

    if (type !== 'select-one' && UPPERCASE_FIELDS.has(name)) {
      const upper = (value || '').toUpperCase();
      setAlumnoForm((f) => ({ ...f, [name]: upper }));
      return;
    }
    setAlumnoForm((f) => ({ ...f, [name]: value }));
  };

  // ---------- Handlers Específicos (Previa Activa) ----------
  const onChangePrevia = (e) => {
    const { name, value } = e.target;

    setPreviasForm((f) => {
      const newPrevias = [...f];
      const activePrev = newPrevias[activePreviaIndex];

      // Si cambia curso/division de materia, se resetea la materia seleccionada
      if ((name === 'materia_id_curso' || name === 'materia_id_division') && activePrev.id_materia) {
        activePrev.id_materia = '';
      }

      // Actualizar el valor
      activePrev[name] = value;
      return newPrevias;
    });
  };

  const addPrevia = () => {
    const newPrevia = getDefaultPrevia();
    setPreviasForm((f) => [...f, newPrevia]);
    setActivePreviaIndex(previasForm.length); // Mover a la nueva pestaña
    setActiveMainTab('previas'); // Ir directo a la pestaña de previas
  };

  const removePrevia = (indexToRemove) => {
    if (previasForm.length === 1) {
      lanzarToast('advertencia', 'Debe quedar al menos una materia previa.');
      return;
    }

    setPreviasForm((f) => {
      const newPrevias = f.filter((_, index) => index !== indexToRemove);

      // Ajustar el índice activo
      let newActiveIndex = activePreviaIndex;
      if (indexToRemove < activePreviaIndex) {
        newActiveIndex = activePreviaIndex - 1;
      } else if (
        indexToRemove === activePreviaIndex &&
        activePreviaIndex === newPrevias.length
      ) {
        newActiveIndex = newPrevias.length - 1;
      }

      setActivePreviaIndex(newActiveIndex);
      return newPrevias;
    });
    lanzarToast('info', `Materia ${indexToRemove + 1} eliminada.`);
  };

  // --- Lógica de Submit ---

  const buildAlumno = (apellido, nombre) => {
    const a = String(apellido || '').trim();
    const n = String(nombre || '').trim();
    if (!a && !n) return '';
    return `${a.toUpperCase()}${a && n ? ', ' : ''}${n.toUpperCase()}`;
  };

  const validarAlumnoComun = () => {
    if (!/^\d{7,9}$/.test((alumnoForm.dni || '').replace(/\D+/g, ''))) {
      return 'DNI inválido';
    }
    if (!String(alumnoForm.apellido || '').trim()) return 'El apellido es obligatorio';
    if (!String(alumnoForm.nombre || '').trim()) return 'El nombre es obligatorio';
    if (!String(alumnoForm.cursando_id_curso)) return 'Seleccioná el curso (cursando)';
    if (!String(alumnoForm.cursando_id_division)) return 'Seleccioná la división (cursando)';
    return '';
  };

  const validarPrevia = (previa) => {
    if (!String(previa.materia_id_curso)) return 'Seleccioná el curso de la materia';
    if (!String(previa.materia_id_division)) return 'Seleccioná la división de la materia';
    if (!String(previa.id_materia)) return 'Seleccioná la materia';
    if (!String(previa.id_condicion)) return 'Seleccioná la condición';
    if (!previa.anio || isNaN(parseInt(previa.anio))) return 'Año es obligatorio y debe ser numérico';
    return '';
  };

  const normalizeForSubmit = (previa) => {
    const toInt = (v) =>
      v === '' || v === null || typeof v === 'undefined' ? null : parseInt(v, 10);

    const alumno = buildAlumno(alumnoForm.apellido, alumnoForm.nombre);

    return {
      dni: String(alumnoForm.dni || '').trim(),
      alumno,
      cursando_id_curso: toInt(alumnoForm.cursando_id_curso),
      cursando_id_division: toInt(alumnoForm.cursando_id_division),
      id_materia: toInt(previa.id_materia),
      materia_id_curso: toInt(previa.materia_id_curso),
      materia_id_division: toInt(previa.materia_id_division),
      id_condicion: toInt(previa.id_condicion),
      anio: toInt(previa.anio),
      fecha_carga: previa.fecha_carga,
      inscripcion: toInt(previa.inscripcion) || 0,
    };
  };

  const guardarPreviaIndividual = async (previa, index) => {
    const vComun = validarAlumnoComun();
    if (vComun) {
      lanzarToast('advertencia', vComun);
      setActiveMainTab('alumno');
      return false;
    }

    const vPrevia = validarPrevia(previa);
    if (vPrevia) {
      lanzarToast('advertencia', `Materia ${index + 1}: ${vPrevia}`);
      setActiveMainTab('previas');
      setActivePreviaIndex(index);
      return false;
    }

    if (previa.saved) {
      lanzarToast('info', `Materia ${index + 1} ya fue guardada.`);
      return true; // Considerar éxito
    }

    // Setear el loading solo para esta previa
    setPreviasForm((f) => f.map((p, i) => (i === index ? { ...p, loading: true } : p)));

    try {
      const payload = normalizeForSubmit(previa);

      const res = await fetch(`${BASE_URL}/api.php?action=previa_agregar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json?.exito) throw new Error(json?.mensaje || 'No se pudo agregar');

      lanzarToast('exito', `Materia ${index + 1} guardada correctamente.`, 2000);

      // Actualizar estado de guardado
      setPreviasForm((f) =>
        f.map((p, i) =>
          i === index ? { ...p, loading: false, saved: true, id_previa: json.previa.id_previa } : p
        )
      );
      return true;
    } catch (e2) {
      lanzarToast('error', `Materia ${index + 1}: ${e2.message || 'Error desconocido'}`);
      setPreviasForm((f) => f.map((p, i) => (i === index ? { ...p, loading: false } : p)));
      return false;
    }
  };

  // Función para el botón general (Guarda SOLO la previa activa)
  const guardarActiva = async (e) => {
    e.preventDefault();
    if (activePrevia.loading) return;
    await guardarPreviaIndividual(activePrevia, activePreviaIndex);
  };

  // Función para guardar TODAS las previas no guardadas
  const guardarTodas = async () => {
    const vComun = validarAlumnoComun();
    if (vComun) {
      lanzarToast('advertencia', vComun);
      setActiveMainTab('alumno');
      return;
    }

    let allSuccess = true;
    for (let i = 0; i < previasForm.length; i++) {
      if (!previasForm[i].saved) {
        setActiveMainTab('previas');
        setActivePreviaIndex(i); // Mostrar la pestaña que se está guardando
        const success = await guardarPreviaIndividual(previasForm[i], i);
        if (!success) {
          allSuccess = false;
          break; // Detener en el primer error
        }
      }
    }

    if (allSuccess) {
      lanzarToast('exito', 'Todas las previas han sido guardadas.', 2500);
      setTimeout(() => navigate('/previas'), 1000);
    } else {
      lanzarToast('error', 'Algunas previas no se guardaron. Revisá los mensajes.');
    }
  };

  // ---------- Render Helpers ----------
  const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== '';

  const openCalendar = (e) => {
    if (e && e.type === 'mousedown') e.preventDefault();
    const el = fechaRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        el.focus();
      }
    } catch {
      el.focus();
    }
  };

  const activeLoading = previasForm.some((p) => p.loading);
  const allSaved = previasForm.every((p) => p.saved);

  // --- Componente para una única Previa ---
  const PreviaSection = ({ previa, index }) => {
    const materiaSelectDisabled =
      !puedeCargarMaterias || materiasLoading || materiasParaSelect.length === 0;
    const comboKey = `${previa.materia_id_curso}-${previa.materia_id_division}`;
    const currentMaterias = materiasMap[comboKey] || [];

    const refProp =
      index === activePreviaIndex
        ? { ref: fechaRef, onMouseDown: openCalendar, onFocus: openCalendar }
        : {};

    return (
      <div className="prev-add-grid">
        {/* Col 1: Materia */}
        <div className="prev-section">
          <h3 className="prev-section-title">Materia Previa (Materia {index + 1})</h3>

          <div className="prev-rowsdd">
            {/* Materia: curso */}
            <div className="prev-col">
              <div className="prev-input-wrapper always-active">
                <label className="prev-label">Materia: curso</label>
                <select
                  className="prev-input"
                  name="materia_id_curso"
                  value={previa.materia_id_curso}
                  onChange={onChangePrevia}
                  disabled={listasLoading || previa.saved}
                >
                  <option value="">Seleccionar…</option>
                  {listas.cursos.map((c) => (
                    <option key={`mcur-${c.id}`} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <span className="prev-input-highlight" />
              </div>
            </div>

            {/* Materia: división */}
            <div className="prev-col">
              <div className="prev-input-wrapper always-active">
                <label className="prev-label">Materia: división</label>
                <select
                  className="prev-input"
                  name="materia_id_division"
                  value={previa.materia_id_division}
                  onChange={onChangePrevia}
                  disabled={listasLoading || previa.saved}
                >
                  <option value="">Seleccionar…</option>
                  {listas.divisiones.map((d) => (
                    <option key={`mdiv-${d.id}`} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
                <span className="prev-input-highlight" />
              </div>
            </div>
          </div>

          {/* Materia (dependiente) */}
          <div className="prev-input-wrapper always-active">
            <label className="prev-label">Materia</label>
            <select
              className="prev-input"
              name="id_materia"
              value={previa.id_materia}
              onChange={onChangePrevia}
              disabled={materiaSelectDisabled || previa.saved}
            >
              {!String(previa.materia_id_curso) || !String(previa.materia_id_division) ? (
                <option value="">Elegí curso y división de materia</option>
              ) : materiasLoading ? (
                <option value="">Cargando materias…</option>
              ) : currentMaterias.length === 0 ? (
                <option value="">Sin materias para esa combinación</option>
              ) : (
                <>
                  <option value="">Seleccionar…</option>
                  {currentMaterias.map((m) => (
                    <option key={`mat-${m.id}`} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </>
              )}
            </select>
            <span className="prev-input-highlight" />
          </div>
        </div>

        {/* Col 2: Administrativo */}
        <div className="prev-section">
          <h3 className="prev-section-title">Administrativo</h3>

          {/* Condición */}
          <div className="prev-input-wrapper always-active">
            <label className="prev-label">Condición</label>
            <select
              className="prev-input"
              name="id_condicion"
              value={previa.id_condicion}
              onChange={onChangePrevia}
              disabled={listasLoading || previa.saved}
            >
              <option value="">Seleccionar…</option>
              {listas.condiciones.map((c) => (
                <option key={`cond-${c.id}`} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <span className="prev-input-highlight" />
          </div>

          {/* Año + Fecha carga en la misma fila */}
          <div className="prev-rowsdd">
            {/* Año */}
            <div className="prev-col">
              <div
                className={`prev-input-wrapper ${
                  hasVal(previa.anio) ? 'has-value' : ''
                }`}
              >
                <label className="prev-label">Año (previa)</label>
                <input
                  className="prev-input"
                  type="number"
                  name="anio"
                  value={previa.anio}
                  onChange={onChangePrevia}
                  min="2000"
                  max="2100"
                  disabled={previa.saved}
                />
                <span className="prev-input-highlight" />
              </div>
            </div>

            {/* Fecha carga */}
            <div className="prev-col">
              <div
                className={`prev-input-wrapper ${
                  hasVal(previa.fecha_carga) ? 'has-value' : ''
                }`}
              >
                <label className="prev-label">Fecha carga</label>
                <input
                  {...refProp}
                  className="prev-input"
                  type="date"
                  name="fecha_carga"
                  value={previa.fecha_carga}
                  onChange={onChangePrevia}
                  disabled={previa.saved}
                />
                <span className="prev-input-highlight" />
              </div>
            </div>
          </div>

          {/* Inscripción */}
          <div className="prev-input-wrapper always-active">
            <label className="prev-label">Inscripción</label>
            <select
              className="prev-input"
              name="inscripcion"
              value={previa.inscripcion}
              onChange={onChangePrevia}
              disabled={previa.saved}
            >
              <option value={0}>No</option>
              <option value={1}>Sí</option>
            </select>
            <span className="prev-input-highlight" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 🔔 Toast global, flotante arriba */}
      {showToast && (
        <Toast
          tipo={toastTipo}
          mensaje={toastMsg}
          duracion={2500}
          onClose={() => setShowToast(false)}
        />
      )}

      <div className="prev-add-container">
        <div className="prev-add-box">
          {/* Header con gradiente + volver */}
          <div className="prev-add-header">
            <div className="prev-add-icon-title">
              <FontAwesomeIcon icon={faBookOpen} className="prev-add-icon" aria-hidden="true" />
              <div>
                <h1>Agregar Previa(s)</h1>
                <p>Cargá los datos del alumno y las materias previas</p>
              </div>
            </div>

            <button
              type="button"
              className="prev-add-back-btn"
              onClick={() => navigate(-1)}
              title="Volver"
            >
              <FontAwesomeIcon icon={faArrowLeft} style={{ marginRight: 8 }} />
              Volver
            </button>
          </div>

          <div className="prev-add-form-wrapper">
            <form onSubmit={guardarActiva} className="prev-add-form">
              {/* ================= Pestañas PRINCIPALES ================= */}
              <div className="prev-main-tabs">
                <button
                  type="button"
                  className={`prev-main-tab-btn ${
                    activeMainTab === 'alumno' ? 'active' : ''
                  }`}
                  onClick={() => setActiveMainTab('alumno')}
                  disabled={activeLoading}
                >
                  Datos del alumno
                </button>
                <button
                  type="button"
                  className={`prev-main-tab-btn ${
                    activeMainTab === 'previas' ? 'active' : ''
                  }`}
                  onClick={() => setActiveMainTab('previas')}
                  disabled={activeLoading || listasLoading}
                >
                  Materias previas
                </button>
              </div>

              {/* ============= TAB 1: Alumno + Cursado actual ============= */}
              {activeMainTab === 'alumno' && (
                <div className="prev-main-tab-panel">
                  <div className="prev-add-grid-alumno">
                    {/* ===== Col 1: Datos del alumno ===== */}
                    <div className="prev-section">
                      <h3 className="prev-section-title">Datos del alumno</h3>

                      {/* DNI */}
                      <div
                        className={`prev-input-wrapper always-active ${
                          hasVal(alumnoForm.dni) ? 'has-value' : ''
                        }`}
                      >
                        <label className="prev-label">DNI</label>
                        <input
                          className="prev-input"
                          name="dni"
                          value={alumnoForm.dni}
                          onChange={onChangeAlumno}
                          placeholder="Ej: 40123456"
                        />
                        <span className="prev-input-highlight" />
                      </div>

                      {/* Apellido */}
                      <div
                        className={`prev-input-wrapper always-active ${
                          hasVal(alumnoForm.apellido) ? 'has-value' : ''
                        }`}
                      >
                        <label className="prev-label">Apellido</label>
                        <input
                          className="prev-input"
                          name="apellido"
                          value={alumnoForm.apellido}
                          onChange={onChangeAlumno}
                          placeholder="Ej: PÉREZ"
                        />
                        <span className="prev-input-highlight" />
                      </div>

                      {/* Nombre */}
                      <div
                        className={`prev-input-wrapper always-active ${
                          hasVal(alumnoForm.nombre) ? 'has-value' : ''
                        }`}
                      >
                        <label className="prev-label">Nombre</label>
                        <input
                          className="prev-input"
                          name="nombre"
                          value={alumnoForm.nombre}
                          onChange={onChangeAlumno}
                          placeholder="Ej: ANA MARÍA"
                        />
                        <span className="prev-input-highlight" />
                      </div>
                    </div>

                    {/* ===== Col 2: Cursado Actual ===== */}
                    <div className="prev-section">
                      <h3 className="prev-section-title">Cursado Actual</h3>

                      <div className="prev-rowsdd">
                        {/* Cursando: curso */}
                        <div className="prev-col">
                          <div className="prev-input-wrapper always-active">
                            <label className="prev-label">Curso actual</label>
                            <select
                              className="prev-input"
                              name="cursando_id_curso"
                              value={alumnoForm.cursando_id_curso}
                              onChange={onChangeAlumno}
                              disabled={listasLoading}
                            >
                              <option value="">Seleccionar…</option>
                              {listas.cursos.map((c) => (
                                <option key={`cur-${c.id}`} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))}
                            </select>
                            <span className="prev-input-highlight" />
                          </div>
                        </div>

                        {/* Cursando: división */}
                        <div className="prev-col">
                          <div className="prev-input-wrapper always-active">
                            <label className="prev-label">División actual</label>
                            <select
                              className="prev-input"
                              name="cursando_id_division"
                              value={alumnoForm.cursando_id_division}
                              onChange={onChangeAlumno}
                              disabled={listasLoading}
                            >
                              <option value="">Seleccionar…</option>
                              {listas.divisiones.map((d) => (
                                <option key={`cdiv-${d.id}`} value={d.id}>
                                  {d.nombre}
                                </option>
                              ))}
                            </select>
                            <span className="prev-input-highlight" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ============= TAB 2: Previas + Botones ============= */}
              {activeMainTab === 'previas' && (
                <div className="prev-main-tab-panel">


                  {/* Tabs de materias */}
                  <div className="prev-tabs-header">
                    {previasForm.map((previa, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`prev-tab-btn ${
                          index === activePreviaIndex ? 'active' : ''
                        } ${previa.saved ? 'saved' : ''}`}
                        onClick={() => setActivePreviaIndex(index)}
                        disabled={activeLoading}
                      >
                        Materia {index + 1} {previa.saved && '✅'}
                        {previasForm.length > 1 && !previa.saved && (
                          <FontAwesomeIcon
                            icon={faTrashAlt}
                            title="Eliminar esta materia"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePrevia(index);
                            }}
                            className="prev-tab-remove-icon"
                          />
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="prev-tab-add-btn"
                      onClick={addPrevia}
                      disabled={activeLoading}
                      title="Agregar otra materia previa"
                    >
                      <FontAwesomeIcon icon={faPlus} style={{ marginRight: 5 }} />
                      Otra
                    </button>
                  </div>

                  {/* Previa activa */}
                  {activePrevia && (
                    <PreviaSection previa={activePrevia} index={activePreviaIndex} />
                  )}

                  {/* Botonera inferior */}
                  <div className="prev-add-buttons">
                    {allSaved && (
                      <button
                        type="button"
                        className="prev-add-button primary-action"
                        onClick={guardarTodas}
                        title="Todas las previas guardadas. Ir a la lista."
                        style={{ backgroundColor: 'var(--color-exito)', color: 'white' }}
                      >
                        <FontAwesomeIcon icon={faArrowLeft} style={{ marginRight: 8 }} />
                        Ir a la lista
                      </button>
                    )}

                    {!allSaved && (
                      <button
                        type="submit"
                        className="prev-add-button primary-action"
                        disabled={activeLoading || listasLoading || activePrevia.saved}
                        title={`Guardar Materia ${activePreviaIndex + 1}`}
                      >
                        <FontAwesomeIcon icon={faSave} style={{ marginRight: 8 }} />
                        <span className="prev-add-button-text">
                          {activePrevia.loading
                            ? 'Guardando...'
                            : activePrevia.saved
                            ? 'Materia Guardada ✅'
                            : `Guardar Materia ${activePreviaIndex + 1}`}
                        </span>
                      </button>
                    )}

                    {previasForm.length > 1 && !allSaved && (
                      <button
                        type="button"
                        className="prev-add-button secondary-action"
                        onClick={guardarTodas}
                        disabled={activeLoading || listasLoading}
                        title="Guardar todas las materias no guardadas y salir."
                      >
                        <FontAwesomeIcon icon={faSave} style={{ marginRight: 8 }} />
                        Guardar Todas y Salir
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default AgregarPrevia;
