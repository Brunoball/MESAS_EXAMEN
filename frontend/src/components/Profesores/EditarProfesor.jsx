// src/components/Profesores/EditarProfesor.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faArrowLeft,
  faUser,
  faBriefcase,
  faBan,
  faList
} from '@fortawesome/free-solid-svg-icons';

import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';

// 🔹 Reutilizamos el MISMO CSS base del diseño (tokens, header, tabs, grids, botón fijo, etc.)
import './AgregarProfesor.css';
// 🔹 Y sumamos estilos específicos de edición (tooltip, compactos, mínimos overrides)
import './EditarProfesor.css';

const toMayus = (v) => (typeof v === 'string' ? v.toUpperCase() : v);

// Split "APELLIDO, NOMBRE"
const splitNyAP = (fullName = '') => {
  const s = String(fullName || '').trim();
  if (!s) return ['', ''];
  if (s.includes(',')) {
    const [ap, no] = s.split(',', 2).map((t) => t.trim());
    return [ap || '', no || ''];
  }
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const apellido = parts.pop() || '';
    const nombre = parts.join(' ');
    return [apellido.trim(), nombre.trim()];
  }
  return ['', s];
};

const useClickOpensDatepicker = () => {
  const ref = useRef(null);
  const openCalendar = (e) => {
    if (e && e.type === 'mousedown') e.preventDefault();
    const el = ref.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };
  return { ref, openCalendar };
};

const emptyNo = { id_turno: '', fecha: '' };
const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const fmtFecha = (iso = '') => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export default function EditarProfesor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('datos'); // 'datos' | 'no'

  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [idCargo, setIdCargo] = useState('');
  const [cargos, setCargos] = useState([]);
  const [turnos, setTurnos] = useState([]);

  const [bloquesNo, setBloquesNo] = useState([
    { ...emptyNo }, { ...emptyNo }, { ...emptyNo }, { ...emptyNo }
  ]);

  const [fechaCarga, setFechaCarga] = useState('');
  const fechaCargaCtl = useClickOpensDatepicker();

  const [idProfesor, setIdProfesor] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [toast, setToast] = useState({ show: false, message: '', type: 'exito' });
  const showToast = (message, type = 'exito', duracion = 2500) => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), duracion);
  };

  const turnoPorId = useMemo(() => {
    const m = new Map();
    (turnos || []).forEach(t => m.set(Number(t.id_turno), t.turno));
    return m;
  }, [turnos]);

  const indexNuncaTurno = useMemo(() => {
    return bloquesNo.findIndex(b => hasVal(b.id_turno) && !hasVal(b.fecha));
  }, [bloquesNo]);

  useEffect(() => {
    const ctrl = new AbortController();
    const cargar = async () => {
      try {
        setCargando(true);
        setError('');
        const res = await fetch(
          `${BASE_URL}/api.php?action=editar_profesor&id=${encodeURIComponent(id)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data?.exito) throw new Error(data?.mensaje || 'No se pudo cargar el profesor');

        const p = data.profesor || {};
        setIdProfesor(p.id_profesor ?? id);

        const [ap, no] = splitNyAP(p.nombre_completo || '');
        setApellido(toMayus(ap));
        setNombre(toMayus(no));
        setIdCargo(p.id_cargo ?? '');
        setFechaCarga(p.fecha_carga ?? '');

        setCargos(Array.isArray(data.cargos) ? data.cargos : []);
        setTurnos(Array.isArray(data.turnos) ? data.turnos : []);

        const bn = Array.isArray(p.bloques_no) ? p.bloques_no.slice(0, 4) : [];
        const normalizados = bn.map(b => ({
          id_turno: (b.id_turno ?? '') === null ? '' : (b.id_turno ?? ''),
          fecha: b.fecha ?? ''
        }));
        while (normalizados.length < 4) normalizados.push({ ...emptyNo });
        setBloquesNo(normalizados);

      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message || 'Error al cargar');
      } finally {
        setCargando(false);
      }
    };
    if (id) cargar();
    return () => ctrl.abort();
  }, [id]);

  const onChangeBloque = (idx, field, value) => {
    setBloquesNo(prev => {
      const copy = prev.map(x => ({ ...x }));
      if (field === 'id_turno') {
        const yaHayNunca = prev.findIndex((b, i) => i !== idx && hasVal(b.id_turno) && !hasVal(b.fecha)) !== -1;
        const esteTieneFecha = hasVal(copy[idx].fecha);
        if (yaHayNunca && !esteTieneFecha && hasVal(value)) {
          return prev; // bloquea segundo "NUNCA"
        }
        copy[idx][field] = value;
        return copy;
      }
      if (field === 'fecha') {
        const quiereVaciar = !hasVal(value);
        const tieneTurno = hasVal(copy[idx].id_turno);
        const yaHayNunca = prev.findIndex((b, i) => i !== idx && hasVal(b.id_turno) && !hasVal(b.fecha)) !== -1;
        if (quiereVaciar && tieneTurno && yaHayNunca) {
          return prev; // evita doble "NUNCA"
        }
        copy[idx][field] = value;
        return copy;
      }
      copy[idx][field] = value;
      return copy;
    });
  };

  const limpiarBloques = (arr) => {
    const compact = arr
      .filter(b => hasVal(b.id_turno) || hasVal(b.fecha))
      .map(b => ({
        id_turno: hasVal(b.id_turno) ? Number(b.id_turno) : null,
        fecha: hasVal(b.fecha) ? b.fecha : null
      }));
    // opcional: deduplicar si quisieras
    return compact.slice(0, 4);
  };

  const resumenItems = useMemo(() => {
    const items = [];
    bloquesNo.forEach((b) => {
      const tieneTurno = hasVal(b.id_turno);
      const tieneFecha = hasVal(b.fecha);
      if (!tieneTurno && !tieneFecha) return;

      const turnoNombre = tieneTurno ? (turnoPorId.get(Number(b.id_turno)) || `Turno ${b.id_turno}`) : '';
      const fechaBonita = fmtFecha(b.fecha);

      if (tieneTurno && !tieneFecha) {
        items.push(`• No puede nunca en el turno ${turnoNombre}.`);
      } else if (!tieneTurno && tieneFecha) {
        items.push(`• No puede en todo el día ${fechaBonita}.`);
      } else {
        items.push(`• No puede en el turno ${turnoNombre} el día ${fechaBonita}.`);
      }
    });
    return items.length ? items : ['Sin restricciones configuradas aún.'];
  }, [bloquesNo, turnoPorId]);

  const guardar = async (e) => {
    e.preventDefault();

    if (!apellido.trim()) {
      showToast('El apellido es obligatorio', 'error');
      setActiveTab('datos');
      return;
    }
    if (!idCargo) {
      showToast('Debés seleccionar un cargo', 'error');
      setActiveTab('datos');
      return;
    }

    const bn = limpiarBloques(bloquesNo);

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=editar_profesor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_profesor: idProfesor,
          apellido: toMayus(apellido.trim()),
          nombre: nombre.trim() ? toMayus(nombre.trim()) : null,
          id_cargo: idCargo,
          bloques_no: bn,
          fecha_carga: fechaCarga || null,
        }),
      });
      const json = await res.json();
      if (json?.exito) {
        showToast('Profesor actualizado correctamente', 'exito', 900);
        setTimeout(() => navigate('/profesores'), 900);
      } else {
        showToast(json?.mensaje || 'No se pudo actualizar', 'error');
      }
    } catch (e2) {
      showToast('Error al guardar: ' + e2.message, 'error');
    }
  };

  const tabs = [
    { id: 'datos', label: 'Datos del docente', icon: faUser },
    { id: 'no', label: 'Indisponibilidad', icon: faBan },
  ];

  const onKeyDownTabs = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === activeTab);
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    if (e.key === 'ArrowLeft')  nextIdx = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home')       nextIdx = 0;
    if (e.key === 'End')        nextIdx = tabs.length - 1;
    setActiveTab(tabs[nextIdx].id);
  };

  return (
    <>
      {toast.show && (
        <Toast
          tipo={toast.type}
          mensaje={toast.message}
          onClose={() => setToast((prev) => ({ ...prev, show: false }))}
          duracion={2500}
        />
      )}

      {/* 🔹 MISMA SHELL visual que AgregarProfesor */}
      <div className="add-alumno-container">
        <div className="add-alumno-box">
          {/* Header */}
          <div className="add-header">
            <div className="add-icon-title">
              <FontAwesomeIcon icon={faUser} className="add-icon" aria-hidden="true" />
              <div>
                <h1>Editar Profesor {idProfesor ? `#${idProfesor}` : ''}</h1>
                <p>{[apellido, nombre].filter(Boolean).join(', ') || 'Modificá los datos del docente'}</p>
              </div>
            </div>

            <button
              type="button"
              className="add-back-btn"
              onClick={() => navigate(-1)}
              title="Volver"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Volver
            </button>
          </div>

          {/* Tabs (idénticas) */}
          <div
            className="tabs-bar"
            role="tablist"
            aria-label="Secciones de edición"
            onKeyDown={onKeyDownTabs}
          >
            {tabs.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                aria-controls={`panel-${t.id}`}
                id={`tab-${t.id}`}
                className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                type="button"
              >
                <FontAwesomeIcon icon={t.icon} style={{ marginRight: 8 }} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Formulario scrolleable con padding-bottom para no tapar por el botón */}
          <form onSubmit={guardar} className="add-alumno-form" aria-label="Formulario de edición de docente">
            {/* Panel: Datos */}
            <section
              id="panel-datos"
              role="tabpanel"
              aria-labelledby="tab-datos"
              aria-hidden={activeTab !== 'datos'}
              hidden={activeTab !== 'datos'}
            >
              <div className="datos-grid">
                {/* IZQUIERDA: inputs */}
                <div className="datos-col">
                  <div className="add-group">
                    <div className={`add-input-wrapper ${apellido ? 'has-value' : ''}`}>
                      <label className="add-label">Apellido *</label>
                      <input
                        className="add-input"
                        name="apellido"
                        value={apellido}
                        onChange={(e) => setApellido(toMayus(e.target.value))}
                        placeholder="Ej: GÓMEZ"
                        required
                      />
                      <span className="add-input-highlight" />
                    </div>

                    <div className={`add-input-wrapper ${nombre ? 'has-value' : ''}`}>
                      <label className="add-label">Nombre</label>
                      <input
                        className="add-input"
                        name="nombre"
                        value={nombre}
                        onChange={(e) => setNombre(toMayus(e.target.value))}
                        placeholder="Ej: ANA MARÍA"
                      />
                      <span className="add-input-highlight" />
                    </div>
                  </div>

                  <div className="add-group">
                    <div className="add-input-wrapper always-active">
                      <label className="add-label">
                        <FontAwesomeIcon icon={faBriefcase} />&nbsp;Cargo *
                      </label>
                      <select
                        className="add-input"
                        name="id_cargo"
                        value={idCargo || ''}
                        onChange={(e) => setIdCargo(e.target.value)}
                        disabled={cargando}
                        required
                      >
                        <option value="" disabled>Seleccionar…</option>
                        {cargos.map((c) => (
                          <option key={c.id_cargo} value={c.id_cargo}>
                            {c.cargo}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="add-input-wrapper always-active" onMouseDown={fechaCargaCtl.openCalendar}>
                      <label className="add-label">Fecha de carga</label>
                      <input
                        ref={fechaCargaCtl.ref}
                        className="add-input"
                        type="date"
                        name="fecha_carga"
                        value={fechaCarga || ''}
                        onChange={(e) => setFechaCarga(e.target.value)}
                        onFocus={fechaCargaCtl.openCalendar}
                      />
                      <span className="add-input-highlight" />
                    </div>
                  </div>
                </div>

                {/* DERECHA: panel guía (sticky) */}
                <aside className="datos-col">
                  <section className="add-panel" style={{ position: 'sticky', top: 10 }}>
                    <div className="add-panel-header">
                      <h3 className="add-panel-title">Completá los datos del docente</h3>
                    </div>
                    <div className="add-panel-body">
                      <ul style={{ margin: 0 }}>
                        <li>El <b>Apellido</b> es obligatorio.</li>
                        <li>Seleccioná el <b>Cargo</b> correspondiente.</li>
                        <li>La <b>Fecha de carga</b> es opcional.</li>
                      </ul>
                    </div>
                  </section>
                </aside>
              </div>
            </section>

            {/* Panel: Indisponibilidad */}
            <section
              id="panel-no"
              role="tabpanel"
              aria-labelledby="tab-no"
              aria-hidden={activeTab !== 'no'}
              hidden={activeTab !== 'no'}
            >
              <div className="indisp-grid">
                {/* IZQUIERDA: inputs de indisponibilidad */}
                <div className="indisp-left">
                  <div className="add-panel" style={{ marginTop: 0 }}>
                    <div className="add-panel-header">
                      <h3 className="add-panel-title">
                        <FontAwesomeIcon icon={faBan} />&nbsp;Indisponibilidad (hasta 4)
                      </h3>

                      {/* Tooltip simple */}
                      <span className="tooltip">
                        <button
                          type="button"
                          className="tooltip-trigger"
                          aria-describedby="tip-indisp"
                          title="Ayuda sobre reglas"
                        >
                          i
                        </button>
                        <span id="tip-indisp" role="tooltip" className="tooltip-bubble">
                          <b>Tip:</b> <b>solo turno</b> = nunca en ese turno · <b>solo fecha</b> = no disponible todo el día · <b>ambos</b> = no disponible en ese turno ese día.
                        </span>
                      </span>
                    </div>

                    <div className="add-panel-body">
                      {[0,1,2,3].map((idx) => {
                        const turnoDisabled =
                          cargando ||
                          (indexNuncaTurno !== -1 && indexNuncaTurno !== idx && !hasVal(bloquesNo[idx]?.fecha));
                        return (
                          <div className="add-group" key={idx}>
                            <div className="add-input-wrapper always-active slim">
                              <label className="add-label">Turno NO #{idx + 1}</label>
                              <select
                                className="add-input compact"
                                value={bloquesNo[idx]?.id_turno ?? ''}
                                onChange={(e) => onChangeBloque(idx, 'id_turno', e.target.value)}
                                disabled={turnoDisabled}
                                title={turnoDisabled ? 'Bloqueado: hay un turno marcado como NUNCA sin fecha' : ''}
                              >
                                <option value="">(sin turno)</option>
                                {turnos.map((t) => (
                                  <option key={t.id_turno} value={t.id_turno}>
                                    {t.turno}
                                  </option>
                                ))}
                              </select>
                              <span className="add-input-highlight" />
                            </div>

                            <div className="add-input-wrapper always-active slim" onClick={e => e.currentTarget.querySelector('input')?.showPicker?.()}>
                              <label className="add-label">Fecha NO #{idx + 1}</label>
                              <input
                                className="add-input compact"
                                type="date"
                                value={bloquesNo[idx]?.fecha ?? ''}
                                onChange={(e) => onChangeBloque(idx, 'fecha', e.target.value)}
                              />
                              <span className="add-input-highlight" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* DERECHA: Resumen + Ayuda */}
                <aside className="indisp-right">
                  <section className="add-panel">
                    <div className="add-panel-header">
                      <h3 className="add-panel-title">
                        <FontAwesomeIcon icon={faList} />&nbsp;Configuración actual
                      </h3>
                    </div>
                    <div className="add-panel-body">
                      {resumenItems.map((txt, idx) => (
                        <div key={idx}>{txt}</div>
                      ))}
                      {indexNuncaTurno !== -1 && (
                        <div className="panel-footnote">
                          ⚠️ Hay un turno marcado como <b>“nunca”</b>. Los demás select de turno quedan bloqueados
                          hasta asignar una <b>fecha</b> o borrar ese turno.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="add-panel panel-info">
                    <div className="add-panel-header">
                      <h3 className="add-panel-title">Cómo configurar indisponibilidades</h3>
                    </div>
                    <div className="add-panel-body">
                      <ul style={{ marginTop: 0, marginBottom: 0 }}>
                        <li><b>Solo Turno</b> (dejar la fecha vacía): <u>nunca</u> puede en ese turno (máximo uno).</li>
                        <li><b>Solo Fecha</b> (dejar turno en blanco): no puede en <u>todo ese día</u>.</li>
                        <li><b>Turno + Fecha</b>: no puede en ese <u>turno</u> ese <u>día</u>.</li>
                        <li>Hasta <b>4</b> reglas; los slots vacíos se ignoran.</li>
                      </ul>
                    </div>
                  </section>
                </aside>
              </div>
            </section>

            {/* Botón fijo abajo derecha */}
            <div className="add-save-bottom">
              <button
                type="submit"
                className="add-alumno-button"
                disabled={cargando}
                title="Guardar"
              >
                <FontAwesomeIcon icon={faSave} className="add-icon-button" />
                <span className="add-button-text">
                  {cargando ? 'Guardando...' : 'Guardar Cambios'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
