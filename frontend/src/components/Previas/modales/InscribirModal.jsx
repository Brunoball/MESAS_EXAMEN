// src/components/Previas/modales/InscribirModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import './InscribirModal.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const InscribirModal = ({
  open,
  item,
  materiasAlumno = [],
  loading,
  error,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef(null);

  const [email, setEmail] = useState('');
  const [touchedEmail, setTouchedEmail] = useState(false);

  // IDs de las materias seleccionadas para inscribir
  const [materiasSeleccionadas, setMateriasSeleccionadas] = useState([]);

  useEffect(() => {
    if (!open) return;

    // Resetear campos cada vez que se abre
    setEmail('');
    setTouchedEmail(false);

    let iniciales = [];
    const principalId = item?.id_previa ? Number(item.id_previa) : null;

    if (materiasAlumno && materiasAlumno.length > 0) {
      if (
        principalId &&
        materiasAlumno.some((m) => Number(m.id_previa) === principalId)
      ) {
        iniciales = [principalId];
      } else {
        iniciales = [Number(materiasAlumno[0].id_previa)];
      }
    } else if (principalId) {
      iniciales = [principalId];
    }

    setMateriasSeleccionadas(iniciales);

    // Focus en botón cancelar
    cancelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel, item, materiasAlumno]);

  if (!open) return null;

  const emailTrim = email.trim();
  const emailValido = EMAIL_REGEX.test(emailTrim);
  const mostrarErrorEmail = touchedEmail && !emailValido;

  const tieneMaterias = materiasAlumno && materiasAlumno.length > 0;

  const toggleMateria = (id) => {
    setMateriasSeleccionadas((prev) => {
      const numId = Number(id);
      if (prev.includes(numId)) {
        return prev.filter((x) => x !== numId);
      }
      return [...prev, numId];
    });
  };

  const handleConfirmClick = async () => {
    if (!emailValido || loading) return;

    let ids = materiasSeleccionadas;

    // Fallback: si no hay selección, usamos la principal del item
    if (!ids.length && item?.id_previa) {
      ids = [Number(item.id_previa)];
    }

    if (!ids.length) return;

    // === COMPATIBILIDAD BACKEND: enviamos ids e id_previa (primero del array) ===
    const idPreviaPrincipal =
      ids && ids.length > 0
        ? Number(ids[0])
        : item?.id_previa
        ? Number(item.id_previa)
        : null;

    onConfirm?.({
      email: emailTrim,
      ids,               // para el backend nuevo (array de ids)
      id_previa: idPreviaPrincipal, // para el backend viejo o validaciones que miran solo un id_previa
    });

    // Envío de mail de confirmación (independiente de la respuesta de la API)
    try {
      const materiasSeleccionadasDetalle =
        materiasAlumno && materiasAlumno.length
          ? materiasAlumno
              .filter((m) => ids.includes(Number(m.id_previa)))
              .map((m) => m.materia_nombre || '')
              .filter(Boolean)
          : item?.materia_nombre
          ? [item.materia_nombre]
          : [];

      const payload = {
        toEmail: emailTrim,
        nombre: item?.alumno || '',
        dni: item?.dni || '',
        materias: materiasSeleccionadasDetalle,
      };

      await fetch(
        'https://inscripcion.ipet50.edu.ar/mails/confirm_inscripcion.php',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    } catch (e) {
      console.warn('Error enviando correo de confirmación manual', e);
    }
  };

  const botonInscribirDeshabilitado =
    loading || !emailValido || !materiasSeleccionadas.length;

  return (
    <div
      className="inscrib-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inscribir-modal-title"
      onMouseDown={onCancel}
    >
      <div
        className="inscrib-container inscrib-container--success"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div id="inscribirmodal" className="inscrib-icon is-success">
          <FaCheckCircle />
        </div>

        <h3
          id="inscribir-modal-title"
          className="inscrib-title inscrib-title--success"
        >
          Confirmar inscripción
        </h3>

        <p className="inscrib-text">
          ¿Querés inscribir manualmente a este alumno/a en las materias
          seleccionadas?
        </p>

        {item && (
          <div className="inscrib-item" style={{ marginTop: 12 }}>
            <strong>{item.alumno}</strong> — DNI {item.dni}
            <br />
            Materia principal: {item.materia_nombre}
          </div>
        )}

        {/* EMAIL */}
        <div className="inscrib-field" style={{ marginTop: 16 }}>
          <label
            htmlFor="inscribir-email"
            className="inscrib-label"
            style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}
          >
            Email del alumno/a para enviar comprobante
          </label>

          <input
            id="inscribir-email"
            type="email"
            className="inscrib-input"
            placeholder="ejemplo@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouchedEmail(true)}
            disabled={loading}
            autoComplete="email"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: mostrarErrorEmail ? '2px solid #e63946' : '2px solid #d1d5db',
              outline: 'none',
              fontSize: 15,
              transition: '0.2s ease',
              background: '#f9fafb',
              boxShadow: mostrarErrorEmail
                ? '0 0 0 4px rgba(230,57,70,0.15)'
                : '0 1px 3px rgba(0,0,0,0.08)',
            }}
          />

          {mostrarErrorEmail && (
            <div className="inscrib-error" role="alert" style={{ marginTop: 6 }}>
              Ingresá un correo electrónico válido.
            </div>
          )}
        </div>

        {/* LISTA DE MATERIAS CON CHECKBOXES CUSTOM */}
        <div className="inscrib-field" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>
            Materias a inscribir
          </div>

          {tieneMaterias ? (
            <div className="inscrib-materias-list">
              {materiasAlumno.map((m) => {
                const idNum = Number(m.id_previa);
                const esPrincipal =
                  item?.id_previa && Number(item.id_previa) === idNum;
                const checked = materiasSeleccionadas.includes(idNum);

                const cardClass = [
                  'inscrib-materia-card',
                  checked ? 'inscrib-materia-card--checked' : '',
                  loading ? 'inscrib-materia-card--disabled' : '',
                ]
                  .join(' ')
                  .trim();

                return (
                  <label
                    key={m.id_previa}
                    className={cardClass}
                  >
                    <span className="inscrib-materia-checkwrap">
                      <input
                        type="checkbox"
                        className="inscrib-materia-checkbox"
                        checked={checked}
                        onChange={() => toggleMateria(idNum)}
                        disabled={loading}
                      />
                      <span className="inscrib-materia-checkbox-ui" />
                    </span>

                    <div className="inscrib-materia-info">
                      <div className="inscrib-materia-title">
                        {m.materia_nombre}{' '}
                        {esPrincipal && (
                          <span className="inscrib-materia-pill">
                            Principal
                          </span>
                        )}
                      </div>
                      <div className="inscrib-materia-sub">
                        {m.materia_curso_division}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: '#6b7280',
                fontStyle: 'italic',
              }}
            >
              Este alumno no tiene listado de materias con condición previa cargado,
              se inscribirá solo la materia principal del registro.
            </div>
          )}
        </div>

        {error && (
          <div className="inscrib-error" role="alert">
            {error}
          </div>
        )}

        <div className="inscrib-buttons">
          <button
            type="button"
            className="inscrib-btn inscrib-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            id="inscribirr"
            type="button"
            className="inscrib-btn inscrib-btn--solid-success"
            onClick={handleConfirmClick}
            disabled={botonInscribirDeshabilitado}
            style={{
              background: botonInscribirDeshabilitado ? '#9ca3af' : '#1dbf73',
              cursor: botonInscribirDeshabilitado ? 'not-allowed' : 'pointer',
              transition: '0.2s ease',
            }}
          >
            {loading ? 'Procesando...' : 'Inscribir'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InscribirModal;
