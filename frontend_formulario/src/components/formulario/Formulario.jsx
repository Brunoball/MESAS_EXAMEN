// src/components/Formulario/Formulario.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import "./Formulario.css";
import Toast from "../global/Toast";
import escudo from "../../imagenes/Escudo.png";
import BASE_URL from "../../config/config";

/* ======== Claves de localStorage ======== */
const LS = {
  REMEMBER: "form_previas_recordarme",
  GMAIL: "form_previas_gmail",
  DNI: "form_previas_dni",
};

/* ======== Util: fecha/hora linda en ES ======== */
const fmtFechaHoraES = (iso) => {
  try {
    if (!iso) return "-";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso || "-";
  }
};

/* =========================================================
   Hook ventana de inscripción con REFRESCO EN TIEMPO REAL
   ========================================================= */
const useVentanaInscripcion = (pollMs = 10000) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const prevAbiertaRef = useRef(null);

  const fetchVentana = useCallback(async () => {
    try {
      setError("");
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_obtener_config_inscripcion&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = await resp.json();
      if (!json.exito) {
        setError(json.mensaje || "No se pudo obtener la configuración.");
        setData((old) => (old ? { ...old, abierta: false } : null));
      } else {
        setData(json);
      }
    } catch (e) {
      setError("Error de red al consultar la configuración.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    fetchVentana();
  }, [fetchVentana]);

  useEffect(() => {
    const id = setInterval(fetchVentana, pollMs);
    return () => clearInterval(id);
  }, [fetchVentana, pollMs]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") fetchVentana();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchVentana]);

  useEffect(() => {
    if (data?.abierta !== undefined && prevAbiertaRef.current !== null) {
      if (prevAbiertaRef.current !== data.abierta) {
        const ev = new CustomEvent("ventana:cambio", {
          detail: { abierta: data.abierta, data },
        });
        window.dispatchEvent(ev);
      }
    }
    if (data?.abierta !== undefined) prevAbiertaRef.current = data.abierta;
  }, [data]);

  return { cargando, error, data, refetch: fetchVentana };
};

/* ================== Pantalla fuera de término ================== */
const InscripcionCerrada = ({ cfg }) => {
  const titulo = cfg?.titulo || "Mesas de Examen";
  const msg = cfg?.mensaje_cerrado || "Inscripción cerrada / fuera de término.";
  return (
    <div className="auth-page">
      <div className="auth-card">
        <aside className="auth-hero is-login">
          <div className="hero-inner">
            <div className="her-container">
              <h1 className="hero-title">{titulo}</h1>
              <p className="hero-sub">Inscripción en línea</p>
            </div>
            <img
              src={escudo}
              alt="Escudo IPET 50"
              className="hero-logo hero-logo--big"
            />
          </div>
        </aside>

        <section className="auth-body">
          <header className="auth-header">
            <h2 className="auth-title">Inscripción no disponible</h2>
            <p className="auth-sub">{msg}</p>
          </header>

          {cfg?.inicio && cfg?.fin && (
            <div className="closed-box">
              <p>
                <strong>Ventana de inscripción:</strong>
              </p>
              <ul className="closed-list">
                <li>
                  <strong>Desde:</strong> {fmtFechaHoraES(cfg.inicio)}
                </li>
                <li>
                  <strong>Hasta:</strong> {fmtFechaHoraES(cfg.fin)}
                </li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* ============== Subvista: Resumen Alumno ============== */
const ResumenAlumno = ({
  data,
  onVolver,
  onConfirmar,
  ventana,
  onVentanaCerro,
}) => {
  // Materias inscribibles (cond=3)
  const materiasCond3 = data?.alumno?.materias ?? [];
  // Materias "Tercera materia" (cond=5) — solo visualización
  const materiasCond5 = data?.alumno?.materias_cond5 ?? [];
  // Materias "pendientes" (cond=6) — solo visualización (gris, no inscribibles)
  const materiasCond6 = data?.alumno?.materias_cond6 ?? [];

  // ⬇️ Por defecto TODAS DESELECCIONADAS
  // CORRECCIÓN: Usar una clave única que combine id_materia + curso + división
  const [seleccion, setSeleccion] = useState(() => new Set());

  // Si cambian las materias (por otro alumno o refresh), limpiamos selección
  useEffect(() => {
    setSeleccion(new Set());
  }, [materiasCond3.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) onVentanaCerro?.();
    };
    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [onVentanaCerro]);

  // Generar clave única para cada materia que incluya curso y división
  const generarClaveUnica = (materia) => {
    return `${materia.id_materia}_${materia.curso_id}_${materia.division_id}`;
  };

  // Toggle por clave única
  const toggle = (claveUnica, disabled) => {
    if (disabled) return;
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(claveUnica) ? next.delete(claveUnica) : next.add(claveUnica);
      return next;
    });
  };

  const materiasOrdenadas = useMemo(
    () =>
      [...materiasCond3].sort((a, b) =>
        a.materia.localeCompare(b.materia, "es", { sensitivity: "base" })
      ),
    [materiasCond3]
  );

  const materias5Ordenadas = useMemo(
    () =>
      [...materiasCond5].sort((a, b) =>
        a.materia.localeCompare(b.materia, "es", { sensitivity: "base" })
      ),
    [materiasCond5]
  );

  const materias6Ordenadas = useMemo(
    () =>
      [...materiasCond6].sort((a, b) =>
        a.materia.localeCompare(b.materia, "es", { sensitivity: "base" })
      ),
    [materiasCond6]
  );

  const handleConfirm = () => {
    // CORRECCIÓN: Filtrar usando la misma clave única que en el map
    const elegidas = materiasOrdenadas.filter((m) => {
      const claveUnica = generarClaveUnica(m);
      return !Number(m.inscripcion) && seleccion.has(claveUnica);
    });

    // CORRECCIÓN CRÍTICA: Enviar información completa al backend para identificar única
    onConfirmar({
      dni: data.alumno.dni,
      gmail: data.gmail ?? "",
      nombre_alumno: data.alumno?.nombre ?? "",
      // Enviar array de objetos con toda la información necesaria
      materias: elegidas.map((m) => ({
        id_materia: m.id_materia,
        curso_id: m.curso_id,
        division_id: m.division_id
      })),
      materias_nombres: elegidas.map((m) => m.materia || ""),
    });
  };

  const a = data.alumno;
  const abierta = !!ventana?.abierta;

  // Accesibilidad: permitir Enter/Espacio para activar la tarjeta
  const handleKeyToggle = (e, claveUnica, disabled) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(claveUnica, false);
    }
  };

  return (
    <div className="auth-card">
      {/* Caja izquierda (datos) + VOLVER abajo (desktop) */}
      <aside className="auth-hero">
        <div className="hero-scroll">
          <div className="hero-inner">
            <div className="hero-top">
              <img src={escudo} alt="Escudo IPET 50" className="hero-logo" />
              <h1 className="hero-title">¡Bienvenido!</h1>
              <p className="hero-sub">Revisá tus datos de inscripción.</p>
            </div>

            <div
              className="hero-form"
              aria-label="Datos del alumno (solo lectura)"
            >
              <label className="hf-field">
                <span className="hf-label">Nombre y Apellido</span>
                <input className="hf-input" value={a?.nombre ?? ""} readOnly />
              </label>

              <label className="hf-field">
                <span className="hf-label">DNI</span>
                <input className="hf-input" value={a?.dni ?? ""} readOnly />
              </label>

              <div className="hf-row-3">
                <label className="hf-field">
                  <span className="hf-label">Año actual</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.anio_actual ?? ""}
                    readOnly
                  />
                </label>
                <label className="hf-field">
                  <span className="hf-label">Curso</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.cursando?.curso ?? ""}
                    readOnly
                  />
                </label>
                <label className="hf-field">
                  <span className="hf-label">División</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.cursando?.division ?? ""}
                    readOnly
                  />
                </label>
              </div>

              <label className="hf-field">
                <span className="hf-label">Gmail</span>
                <input
                  className="hf-input"
                  value={data?.gmail ?? ""}
                  readOnly
                />
              </label>

              <div className="hf-hint">
                Estos datos no se pueden modificar aquí.
              </div>
            </div>

            {/* VOLVER — solo desktop */}
            <div className="actions-left only-desktop">
              <button
                type="button"
                className="btn-hero-secondary"
                onClick={onVolver}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Caja derecha (materias) + CONFIRMAR abajo (desktop) */}
      <section className="auth-body">
        <header className="auth-header">
          <h2 className="auth-title">Materias pendientes de rendir</h2>
          <p className="auth-sub">
            Estas son tus materias previas (adeudadas).
          </p>
          {ventana && (
            <div
              className={`ventana-pill ${
                abierta ? "is-open" : "is-closed"
              }`}
            >
              {abierta ? (
                <>
                  Inscripción abierta hasta{" "}
                  <strong className="fecha-cierre">
                    {fmtFechaHoraES(ventana.fin)}
                  </strong>
                  .
                </>
              ) : (
                <>
                  Inscripción cerrada (desde{" "}
                  {fmtFechaHoraES(ventana.inicio)} hasta{" "}
                  {fmtFechaHoraES(ventana.fin)}).
                </>
              )}
            </div>
          )}
        </header>

        {/* Grid cond=3 (inscribibles) */}
        <div className="materias-scroll">
          <div className="materias-grid">
            {materiasOrdenadas.map((m) => {
              // CORRECCIÓN: Clave única que combina id_materia + curso_id + division_id
              const claveUnica = generarClaveUnica(m);
              const yaInscripto = !!Number(m.inscripcion);
              const selected = seleccion.has(claveUnica);
              const disabled = yaInscripto || !abierta;
              const classes = [
                "materia-card",
                yaInscripto ? "inscripto" : selected ? "selected" : "",
                !abierta ? "disabled" : "",
                "clickable",
              ]
                .join(" ")
                .trim();

              const title = yaInscripto
                ? "Ya estás inscripto en esta materia"
                : !abierta
                ? "La inscripción está cerrada"
                : "Click para seleccionar/deseleccionar";

              return (
                <div
                  key={claveUnica} // CORRECCIÓN: Usar clave única como key
                  className={classes}
                  title={title}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-pressed={selected}
                  onClick={() => !disabled && toggle(claveUnica, false)}
                  onKeyDown={(e) => handleKeyToggle(e, claveUnica, disabled)}
                >
                  <span className="nombre">
                    {m.materia}
                    {yaInscripto && (
                      <span className="badge-inscripto">INSCRIPTO</span>
                    )}
                  </span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bloque adicional: Materias pendientes (cond=6) - SOLO VISUALIZACIÓN - SIN CHECKBOX */}
        {materias6Ordenadas.length > 0 && (
          <div className="materias-pendientes-section">
            <h3 className="auth-title">Materias pendientes</h3>
            <p className="auth-sub">
              Solo visualización (no se puede inscribir en estas).
            </p>
            <div className="materias-grid">
              {materias6Ordenadas.map((m) => (
                <div
                  key={`c6-${generarClaveUnica(m)}`} // CORRECCIÓN: Usar clave única
                  className="materia-card disabled only-visual"
                  title="Materia pendiente (no inscribible en esta instancia)"
                >
                  <span className="nombre">{m.materia}</span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bloque adicional: Tercera materia (cond=5) - SOLO VISUALIZACIÓN */}
        {materias5Ordenadas.length > 0 && (
          <div className="tercera-materia-section">
            <h3 className="auth-title">Tercera materia</h3>
            <p className="auth-sub">
              Solo visualización (no se puede inscribir en estas).
            </p>
            <div className="materias-grid">
              {materias5Ordenadas.map((m) => (
                <div
                  key={`c5-${generarClaveUnica(m)}`} // CORRECCIÓN: Usar clave única
                  className="materia-card disabled only-visual"
                  title="Tercera materia: solo visualización"
                >
                  <span className="nombre">{m.materia}</span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONFIRMAR — solo desktop */}
        <div className="actions-right only-desktop">
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={!abierta}
            title={!abierta ? "La inscripción está cerrada" : ""}
          >
            Confirmar inscripción
          </button>
        </div>
      </section>

      {/* Barra fija SOLO para móviles (resumen) */}
      <nav className="nav-bar only-mobile">
        <button type="button" className="btn-light" onClick={onVolver}>
          Volver
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!abierta}
          title={!abierta ? "La inscripción está cerrada" : ""}
        >
          Confirmar inscripción
        </button>
      </nav>
    </div>
  );
};

/* ============== Formulario principal (login) ============== */
const Formulario = () => {
  const {
    cargando: cargandoVentana,
    error: errorVentana,
    data: ventana,
    refetch: refetchVentana,
  } = useVentanaInscripcion(10000);

  const [gmail, setGmail] = useState("");
  const [dni, setDni] = useState("");
  const [remember, setRemember] = useState(false);

  // Toast reforzado: si hay uno visible, se reemplaza instantáneamente por el nuevo
  const [toast, setToast] = useState(null);

  // Forzar remount del Toast para cortar animaciones y mostrar el nuevo sin delay
  const showToastReplace = useCallback((tipo, mensaje, duracion = 3800) => {
    setToast(null);
    setTimeout(() => {
      setToast({ tipo, mensaje, duracion, key: Date.now() });
    }, 0);
  }, []);

  const [cargando, setCargando] = useState(false);
  const [dataAlumno, setDataAlumno] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) {
        showToastReplace(
          "advertencia",
          ventana?.mensaje_cerrado || "La inscripción se cerró."
        );
      } else if (e?.detail?.abierta === true) {
        showToastReplace("exito", "La inscripción se abrió.");
      }
    };
    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [showToastReplace, ventana?.mensaje_cerrado]);

  const isValidGmail = useCallback(
    (v) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(v.trim()),
    []
  );
  const isValidDni = useCallback((v) => /^[0-9]{7,9}$/.test(v), []);

  useEffect(() => {
    try {
      const savedRemember = localStorage.getItem(LS.REMEMBER) === "1";
      if (savedRemember) {
        const savedGmail = localStorage.getItem(LS.GMAIL) || "";
        const savedDni = localStorage.getItem(LS.DNI) || "";
        setRemember(true);
        if (savedGmail) setGmail(savedGmail);
        if (savedDni) setDni(savedDni);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (remember)
      try {
        localStorage.setItem(LS.GMAIL, gmail || "");
      } catch {}
  }, [gmail, remember]);

  useEffect(() => {
    if (remember)
      try {
        localStorage.setItem(LS.DNI, dni || "");
      } catch {}
  }, [dni, remember]);

  const onToggleRemember = (e) => {
    const checked = e.target.checked;
    setRemember(checked);
    try {
      if (checked) {
        localStorage.setItem(LS.REMEMBER, "1");
        localStorage.setItem(LS.GMAIL, gmail || "");
        localStorage.setItem(LS.DNI, dni || "");
      } else {
        localStorage.removeItem(LS.REMEMBER);
        localStorage.removeItem(LS.GMAIL);
        localStorage.removeItem(LS.DNI);
      }
    } catch {}
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    await refetchVentana();

    if (ventana && !ventana.abierta) {
      showToastReplace(
        "advertencia",
        ventana.mensaje_cerrado || "Inscripción cerrada."
      );
      return;
    }
    if (!isValidGmail(gmail)) {
      showToastReplace("error", "Ingresá un Gmail válido (@gmail.com).");
      return;
    }
    if (!isValidDni(dni)) {
      showToastReplace("error", "Ingresá un DNI válido (7 a 9 dígitos).");
      return;
    }

    try {
      setCargando(true);
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_buscar_previas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail: gmail.trim(), dni }),
        }
      );
      const json = await resp.json();

      if (!json.exito) {
        // —— Ajuste de duración a 3s SOLO para el caso "no se encontraron previas/materias previas"
        const mensajeServidor =
          typeof json.mensaje === "string" ? json.mensaje.trim() : "";
        const mensajeFallback = "No se encontraron previas para el DNI.";
        const mensajeMostrar = mensajeServidor || mensajeFallback;

        const esNoPrevias =
          /no se encontraron.*(materias\s*previas|previas).*(dni)/i.test(
            mensajeMostrar
          );

        showToastReplace(
          "advertencia",
          mensajeMostrar,
          esNoPrevias ? 3000 : 3800
        );
        return;
      }
      if (json.ya_inscripto) {
        showToastReplace(
          "advertencia",
          `El alumno ya fue inscrito en todas las materias adeudadas.`
        );
      }
      setDataAlumno({ ...json, gmail: gmail.trim() });
    } catch (err) {
      showToastReplace("error", "Error consultando el servidor.");
    } finally {
      setCargando(false);
    }
  };

  // Envío de confirmación
  const confirmarInscripcion = async ({
    dni,
    materias,
    materias_nombres,
    gmail,
    nombre_alumno,
  }) => {
    if (!materias?.length) {
      showToastReplace("advertencia", "Seleccioná al menos una materia.");
      return;
    }

    await refetchVentana();
    if (ventana && !ventana.abierta) {
      showToastReplace(
        "advertencia",
        ventana.mensaje_cerrado || "Inscripción cerrada."
      );
      return;
    }

    try {
      // CORRECCIÓN CRÍTICA: Enviar estructura completa al backend
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_registrar_inscripcion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            dni, 
            materias: materias // Ahora es array de objetos, no solo IDs
          }),
        }
      );
      const json = await resp.json();

      if (!json.exito) {
        showToastReplace(
          "error",
          json?.mensaje || `No se pudo registrar la inscripción.`
        );
        return;
      }

      // Duración específica: si insertó 1 materia => 3000ms; si más, usamos 3800ms (por defecto)
      const insertados = Number(json.insertados || 0);
      const duracionExito = insertados === 1 ? 3000 : 3800;

      showToastReplace(
        "exito",
        `Inscripción registrada (${insertados} materia/s).`,
        duracionExito
      );

      // E-mail de confirmación (no bloqueante)
      try {
        await fetch(
          `https://inscripcion.ipet50.edu.ar/mails/confirm_inscripcion.php`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toEmail: gmail,
              nombre: nombre_alumno || "",
              dni,
              materias: materias_nombres || [],
            }),
          }
        );
      } catch (e) {
        console.warn("Error enviando correo de confirmación", e);
      }

      setDataAlumno(null);
      if (!remember) {
        setDni("");
        setGmail("");
      }
    } catch {
      showToastReplace("error", "Error de red al registrar la inscripción.");
    }
  };

  /* ==== Estados de carga/error/closed ==== */
  if (cargandoVentana) {
    return (
      <div className="auth-page">
        <div className="loading-center">
          <div className="spinner" aria-label="Cargando configuración..." />
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (errorVentana) {
    return (
      <InscripcionCerrada
        cfg={{
          mensaje_cerrado: "Inscripción no disponible por el momento.",
        }}
      />
    );
  }

  if (ventana && !ventana.abierta) {
    return <InscripcionCerrada cfg={ventana} />;
  }

  /* ==== Ventana abierta: render normal ==== */
  const isLoginScreen = !dataAlumno;

  return (
    <div className={`auth-page ${isLoginScreen ? "is-login-screen" : ""}`}>
      {toast && (
        <Toast
          key={toast.key /* fuerza remount para cortar el anterior */}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      {dataAlumno ? (
        <ResumenAlumno
          data={dataAlumno}
          onVolver={() => setDataAlumno(null)}
          onConfirmar={confirmarInscripcion}
          ventana={ventana}
          onVentanaCerro={() => {
            setDataAlumno(null);
          }}
        />
      ) : (
        <div className="auth-card">
          <aside className="auth-hero is-login">
            <div className="hero-inner">
              <div className="her-container">
                <h1 className="hero-title">
                  {ventana?.titulo || "Mesas de Examen · IPET 50"}
                </h1>
                <p className="hero-sub">
                  Ingresá tu Gmail y DNI para consultar e inscribirte.
                </p>
              </div>
              <img
                src={escudo}
                alt="Escudo IPET 50"
                className="hero-logo hero-logo--big"
              />
            </div>
          </aside>

          <section className="auth-body">
            <header className="auth-header">
              <h2 className="auth-title">Iniciar sesión</h2>
              <p className="auth-sub">
                Inscripción abierta hasta{" "}
                <strong className="fecha-cierre">
                  {fmtFechaHoraES(ventana?.fin)}
                </strong>
                .
              </p>
            </header>

            <form
              className="auth-form"
              onSubmit={onSubmit}
              noValidate
              id="login-form"
            >
              <label className="field">
                <span className="field-label">Gmail</span>
                <input
                  className="field-input"
                  id="gmail"
                  type="email"
                  inputMode="email"
                  placeholder="tuusuario@gmail.com"
                  value={gmail}
                  onChange={(e) => setGmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>

              <label className="field">
                <span className="field-label">DNI</span>
                <input
                  className="field-input"
                  id="dni"
                  type="text"
                  inputMode="numeric"
                  placeholder="Solo números"
                  value={dni}
                  onChange={(e) =>
                    setDni(e.target.value.replace(/\D+/g, ""))
                  }
                  required
                  autoComplete="off"
                />
              </label>

              <div className="form-extra">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={onToggleRemember}
                  />{" "}
                  <span>Recordarme</span>
                </label>
              </div>

              {/* Botón solo escritorio */}
              <button
                type="submit"
                className="btn-cta only-desktop"
                disabled={cargando}
              >
                {cargando ? "Buscando..." : "Continuar"}
              </button>
            </form>
          </section>

          {/* Barra fija SOLO para móviles en pantalla de inicio */}
          <nav className="nav-login-mobile only-mobile">
            <button
              type="submit"
              form="login-form"
              className="btn-cta"
              disabled={cargando}
            >
              {cargando ? "Buscando..." : "Continuar"}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default Formulario;