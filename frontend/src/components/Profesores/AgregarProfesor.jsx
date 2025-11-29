// src/components/Profesores/AgregarProfesor.jsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft, faUserPlus, faBan, faList } from '@fortawesome/free-solid-svg-icons';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';
import './AgregarProfesor.css';

const toUpper = (v) => (typeof v === 'string' ? v.toUpperCase() : v);
const trimSpaces = (s) => (s || '').replace(/\s+/g, ' ').trim();

const useClickOpensDatepicker = () => {
  const ref = useRef(null);
  const onClick = () => {
    const el = ref.current;
    if (!el) return;
    try { if (typeof el.showPicker === 'function') el.showPicker(); else el.focus(); }
    catch { el.focus(); }
  };
  return { ref, onClick };
};

const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const emptyNo = { id_turno: '', fecha: '' };

export default function AgregarProfesor() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('datos'); // 'datos' | 'no'
  const tabs = [
    { id: 'datos', label: 'Datos del docente', icon: faUserPlus },
    { id: 'no',    label: 'Indisponibilidad',  icon: faBan },
  ];

  const [cargos, setCargos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(false);

  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [idCargo, setIdCargo] = useState('');

  const [bloquesNo, setBloquesNo] = useState([
    { ...emptyNo }, { ...emptyNo }, { ...emptyNo }, { ...emptyNo }
  ]);

  // 4 refs determinísticos para los datepickers
  const fechaCtl0 = useClickOpensDatepicker();
  const fechaCtl1 = useClickOpensDatepicker();
  const fechaCtl2 = useClickOpensDatepicker();
  const fechaCtl3 = useClickOpensDatepicker();
  const fechasCtl = [fechaCtl0, fechaCtl1, fechaCtl2, fechaCtl3];

  const [toast, setToast] = useState({ show: false, message: '', type: 'exito' });
  const showToast = (message, type = 'exito', duracion = 3000) => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'exito' }), duracion);
  };

  useEffect(() => {
    const fetchListas = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${BASE_URL}/api.php?action=obtener_listas`);
        const json = await res.json();
        if (!json?.exito) {
          showToast(json?.mensaje || 'No se pudieron cargar las listas.', 'error');
          return;
        }
        const cargosLista = Array.isArray(json?.listas?.cargos) ? json.listas.cargos : [];
        const cargosNorm = cargosLista.map(c => ({
          id_cargo: c.id_cargo ?? c.id ?? null,
          cargo: c.cargo ?? c.nombre ?? ''
        })).filter(c => c.id_cargo !== null && c.cargo);
        setCargos(cargosNorm);

        const turnosRaw = Array.isArray(json?.listas?.turnos) ? json.listas.turnos : [];
        const turnosNorm = turnosRaw.map(t => ({
          id_turno: t.id_turno ?? t.id ?? null,
          turno: t.turno ?? t.nombre ?? '',
        })).filter(t => t.id_turno !== null && t.turno !== '');
        setTurnos(turnosNorm);
      } catch {
        showToast('Error de conexión al cargar listas', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchListas();
  }, []);

  const turnoPorId = useMemo(() => {
    const m = new Map();
    (turnos || []).forEach(t => m.set(Number(t.id_turno), t.turno));
    return m;
  }, [turnos]);

  const indexNuncaTurno = useMemo(() => {
    return bloquesNo.findIndex(b => hasVal(b.id_turno) && !hasVal(b.fecha));
  }, [bloquesNo]);

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
          return prev; // evita doble "NUNCA" borrando fecha
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
        fecha: hasVal(b.fecha) ? b.fecha : null,
      }));

    const seen = new Set();
    const uniq = [];
    for (const b of compact) {
      const key = `${b.id_turno ?? 'NULL'}|${b.fecha ?? 'NULL'}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(b);
      }
    }
    return uniq.slice(0, 4);
  };

  const validar = () => {
    const ap = trimSpaces(apellido);
    const no = trimSpaces(nombre);
    if (!ap) return 'El apellido es obligatorio.';
    if (!no) return 'El nombre es obligatorio.';
    if (!idCargo) return 'Seleccioná un cargo.';
    if (!/^[A-ZÑÁÉÍÓÚÜ.\s-]+$/.test(ap)) return 'Apellido: solo letras y espacios.';
    if (!/^[A-ZÑÁÉÍÓÚÜ.\s-]+$/.test(no)) return 'Nombre: solo letras y espacios.';

    const isDate = (d) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
    for (const b of bloquesNo) {
      if (hasVal(b.fecha) && !isDate(b.fecha)) {
        return 'Formato de fecha inválido (use YYYY-MM-DD).';
      }
    }
    return null;
  };

  const resumenItems = useMemo(() => {
    const items = [];
    bloquesNo.forEach((b) => {
      const tieneTurno = hasVal(b.id_turno);
      const tieneFecha = hasVal(b.fecha);
      if (!tieneTurno && !tieneFecha) return;

      const turnoNombre = tieneTurno ? (turnoPorId.get(Number(b.id_turno)) || `Turno ${b.id_turno}`) : '';
      const fechaBonita = (() => {
        if (!b.fecha) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.fecha);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : b.fecha;
      })();

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

  const onSubmit = async (e) => {
    e.preventDefault();
    const err = validar();
    if (err) { showToast(err, 'error'); setActiveTab('datos'); return; }

    const ap = toUpper(trimSpaces(apellido));
    const no = toUpper(trimSpaces(nombre));
    const docente = `${ap}, ${no}`;
    const bn = limpiarBloques(bloquesNo);

    try {
      setLoading(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=agregar_profesor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docente,
          id_cargo: Number(idCargo),
          bloques_no: bn,
        }),
      });

      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = null; }

      if (resp.ok && data?.exito) {
        showToast('Docente agregado correctamente', 'exito');
        setTimeout(() => navigate('/profesores'), 800);
      } else {
        const msg = data?.mensaje || `No se pudo agregar el docente. ${!resp.ok ? `HTTP ${resp.status}` : ''}`;
        showToast(msg, 'error');
      }
    } catch {
      showToast('Error de red al guardar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-alumno-container">
      {toast.show && (
        <Toast
          tipo={toast.type}
          mensaje={toast.message}
          onClose={() => setToast({ show: false, message: '', type: 'exito' })}
          duracion={3000}
        />
      )}

      <div className="add-alumno-box">
        {/* Header */}
        <div className="add-header">
          <div className="add-icon-title">
            <FontAwesomeIcon icon={faUserPlus} className="add-icon" />
            <div>
              <h1>Agregar Nuevo Docente</h1>
              <p>Completá los datos mínimos para crear el registro</p>
            </div>
          </div>
          <button
            className="add-back-btn"
            onClick={() => navigate('/profesores')}
            disabled={loading}
            type="button"
            title="Volver a la lista"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver
          </button>
        </div>

        {/* Tabs */}
        <div
          className="tabs-bar"
          role="tablist"
          aria-label="Secciones de alta de docente"
          onKeyDown={onKeyDownTabs}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              aria-controls={`panel-${t.id}`}
              id={`tab-${t.id}`}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              type="button"
              tabIndex={activeTab === t.id ? 0 : -1}
            >
              <FontAwesomeIcon icon={t.icon} style={{ marginRight: 8 }} />
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="add-alumno-form" aria-label="Formulario para agregar docente">
          {/* Panel: Datos */}
          <section
            id="panel-datos"
            role="tabpanel"
            aria-labelledby="tab-datos"
            aria-hidden={activeTab !== 'datos'}
            hidden={activeTab !== 'datos'}
          >
            <div className="datos-grid">
              {/* Col izquierda: inputs */}
              <div className="datos-col">
                <div className="add-group">
                  <div className={`add-input-wrapper ${apellido ? 'has-value' : ''}`}>
                    <label className="add-label">Apellido *</label>
                    <input
                      name="apellido"
                      value={apellido}
                      onChange={(e) => setApellido(toUpper(e.target.value))}
                      className="add-input"
                      autoFocus
                      required
                    />
                    <span className="add-input-highlight" />
                  </div>

                  <div className={`add-input-wrapper ${nombre ? 'has-value' : ''}`}>
                    <label className="add-label">Nombre *</label>
                    <input
                      name="nombre"
                      value={nombre}
                      onChange={(e) => setNombre(toUpper(e.target.value))}
                      className="add-input"
                      required
                    />
                    <span className="add-input-highlight" />
                  </div>
                </div>

                <div className="add-group">
                  <div className="add-input-wrapper always-active">
                    <label className="add-label">Cargo *</label>
                    <select
                      name="id_cargo"
                      value={idCargo}
                      onChange={(e) => setIdCargo(e.target.value)}
                      className="add-input"
                      disabled={loading}
                      required
                    >
                      <option value="">Seleccionar cargo</option>
                      {cargos.map((c) => (
                        <option key={c.id_cargo} value={c.id_cargo}>{c.cargo}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Col derecha: panel guía */}
              <aside className="datos-col">
                <section className="add-panel" style={{ position: 'sticky', top: 10 }}>
                  <div className="add-panel-header">
                    <h3 className="add-panel-title">Completá los datos del docente</h3>
                  </div>
                  <div className="add-panel-body">
                    <ul style={{ marginTop: 0, marginBottom: 0 }}>
                      <li>El <b>Apellido</b> y el <b>Nombre</b> son obligatorios.</li>
                      <li>Seleccioná el <b>Cargo</b> correspondiente.</li>
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
              {/* IZQ: inputs de indisponibilidad */}
              <div className="indisp-left">
                <div className="add-panel" style={{ marginTop: 0 }}>
                  <div className="add-panel-header">
                    <h3 className="add-panel-title">
                      <FontAwesomeIcon icon={faBan} />&nbsp;Indisponibilidad (hasta 4)
                    </h3>
                  </div>
                  <div className="add-panel-body">
                    {[0,1,2,3].map((idx) => {
                      const turnoDisabled =
                        loading ||
                        (indexNuncaTurno !== -1 && indexNuncaTurno !== idx && !hasVal(bloquesNo[idx]?.fecha));
                      return (
                        <div className="add-group" key={idx}>
                          <div className="add-input-wrapper always-active">
                            <label className="add-label">Turno NO #{idx + 1}</label>
                            <select
                              name={`id_turno_no_${idx}`}
                              value={bloquesNo[idx]?.id_turno ?? ''}
                              onChange={(e) => onChangeBloque(idx, 'id_turno', e.target.value)}
                              className="add-input"
                              disabled={turnoDisabled}
                              title={turnoDisabled ? 'Bloqueado: hay un turno marcado como NUNCA sin fecha' : ''}
                            >
                              <option value="">-- Sin especificar --</option>
                              {turnos.map((t) => (
                                <option key={t.id_turno} value={t.id_turno}>{t.turno}</option>
                              ))}
                            </select>
                          </div>

                          <div
                            className="add-input-wrapper always-active"
                            onClick={fechasCtl[idx].onClick}
                          >
                            <label className="add-label">Fecha NO #{idx + 1}</label>
                            <input
                              ref={fechasCtl[idx].ref}
                              type="date"
                              value={bloquesNo[idx]?.fecha ?? ''}
                              onChange={(e) => onChangeBloque(idx, 'fecha', e.target.value)}
                              className="add-input"
                            />
                            <span className="add-input-highlight" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* DER: Resumen + Ayuda */}
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
                        ⚠️ Hay un turno marcado como <b>“nunca”</b>. Los demás select de turno
                        quedan bloqueados hasta asignar una <b>fecha</b> o borrar ese turno.
                      </div>
                    )}
                  </div>
                </section>

                <section className="add-panel">
                  <div className="add-panel-header">
                    <h3 className="add-panel-title">
                      <FontAwesomeIcon icon={faList} />&nbsp;Cómo configurar indisponibilidades
                    </h3>
                  </div>
                  <div className="add-panel-body">
                    <ul style={{ margin: 0 }}>
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

          {/* Footer fijo en la parte inferior */}
          <div className="add-save-bottom">
            <button type="submit" className="add-alumno-button" disabled={loading} aria-label="Guardar docente">
              <FontAwesomeIcon icon={faSave} className="add-icon-button" />
              <span className="add-button-text">{loading ? 'Guardando...' : 'Guardar Docente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}