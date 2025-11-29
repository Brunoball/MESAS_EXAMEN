// src/components/ConfigFormulario/ConfigForm.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "../Global/roots.css";
import "./ConfigForm.css";
import Toast from "../Global/Toast";

/* ================= Utils ================= */
const pad2 = (n) => String(n).padStart(2, "0");

const isoToParts = (iso) => {
  if (!iso) return { fecha: "", hora: "00", min: "00" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { fecha: "", hora: "00", min: "00" };
  return {
    fecha: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    hora: pad2(d.getHours()),
    min: pad2(d.getMinutes()),
  };
};

const partsToMySQL = ({ fecha, hora, min }) => {
  if (!fecha || !hora || !min) return null;
  return `${fecha} ${hora}:${min}:00`;
};

const partsToISO = ({ fecha, hora, min }) => {
  if (!fecha || !hora || !min) return "";
  return `${fecha}T${hora}:${min}:00`;
};

// —— Formato en 24 h para la previsualización (con “hs”)
const _fmtFechaES = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtLargo = (isoLike) => {
  if (!isoLike) return "-";
  const d = new Date(isoLike);
  if (isNaN(d.getTime())) return isoLike;
  const fecha = _fmtFechaES.format(d);
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${fecha}, ${hh}:${mm} hs`;
};

// helpers de lista 24h y minutos
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));     // ["00".."23"]
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));   // ["00".."59"]

/* ================= Componente ================= */
const ConfigForm = () => {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Toast (slot único)
  const [toast, setToast] = useState(null);
  const pushToast = useCallback((t) => {
    setToast({
      id: crypto.randomUUID(),
      tipo: t.tipo, // 'exito' | 'error' | 'advertencia' | 'info' | 'cargando'
      mensaje: t.mensaje,
      duracion: t.duracion ?? 3000,
    });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  // Helpers de notificación centralizados
  const notifyError = useCallback(
    (mensaje, duracion = 4000) => {
      setError(mensaje);
      pushToast({ tipo: "error", mensaje, duracion });
    },
    [pushToast]
  );

  const notifyWarn = useCallback(
    (mensaje, duracion = 3000) => {
      pushToast({ tipo: "advertencia", mensaje, duracion });
    },
    [pushToast]
  );

  const notifySuccess = useCallback(
    (mensaje, duracion = 3000) => {
      setOkMsg(mensaje);
      pushToast({ tipo: "exito", mensaje, duracion });
    },
    [pushToast]
  );

  // Estado del formulario (sin "activo")
  const [form, setForm] = useState({
    id_config: null,
    nombre: "",
    // inicio
    insc_inicio_fecha: "",
    insc_inicio_hora: "00",
    insc_inicio_min: "00",
    // fin
    insc_fin_fecha: "",
    insc_fin_hora: "00",
    insc_fin_min: "00",
    mensaje_cerrado: "La inscripción está cerrada. Consultá Secretaría.",
  });

  const setFormField = (name, value) =>
    setForm((f) => ({ ...f, [name]: value }));

  const fetchConfig = useCallback(
    async (silent = true) => {
      setCargando(true);
      setError("");
      setOkMsg("");
      try {
        const resp = await fetch(`${BASE_URL}/api.php?action=form_obtener_config_inscripcion`);
        if (!resp.ok) {
          throw new Error(`Fallo HTTP ${resp.status} al obtener configuración`);
        }
        const json = await resp.json();

        if (!json.exito) {
          const msg = json.mensaje || "No se pudo obtener la configuración.";
          notifyError(msg);
          setCargando(false);
          return;
        }

        if (!json.hay_config) {
          setForm((f) => ({
            ...f,
            id_config: null,
            nombre: "Mesas Examen",
            insc_inicio_fecha: "",
            insc_inicio_hora: "00",
            insc_inicio_min: "00",
            insc_fin_fecha: "",
            insc_fin_hora: "00",
            insc_fin_min: "00",
            mensaje_cerrado: "La inscripción está cerrada. Consultá Secretaría.",
          }));
        } else {
          const iniParts = isoToParts(json.inicio);
          const finParts = isoToParts(json.fin);
          setForm({
            id_config: json.id_config ?? null,
            nombre: json.titulo || "Mesas Examen",
            insc_inicio_fecha: iniParts.fecha,
            insc_inicio_hora: iniParts.hora,
            insc_inicio_min: iniParts.min,
            insc_fin_fecha: finParts.fecha,
            insc_fin_hora: finParts.hora,
            insc_fin_min: finParts.min,
            mensaje_cerrado:
              json.mensaje_cerrado || "La inscripción está cerrada. Consultá Secretaría.",
          });
        }

        if (!silent) notifySuccess("Configuración cargada.");
      } catch (e) {
        notifyError(
          e instanceof Error
            ? `Error al consultar la configuración: ${e.message}`
            : "Error de red al consultar la configuración."
        );
      } finally {
        setCargando(false);
      }
    },
    [notifyError, notifySuccess]
  );

  useEffect(() => {
    fetchConfig(true);
  }, [fetchConfig]);

  // Abierta solo por fechas
  const abiertaPreview = useMemo(() => {
    const iniISO = partsToISO({
      fecha: form.insc_inicio_fecha,
      hora: form.insc_inicio_hora,
      min: form.insc_inicio_min,
    });
    const finISO = partsToISO({
      fecha: form.insc_fin_fecha,
      hora: form.insc_fin_hora,
      min: form.insc_fin_min,
    });
    if (!iniISO || !finISO) return false;
    const now = new Date();
    const ini = new Date(iniISO);
    const fin = new Date(finISO);
    return now >= ini && now <= fin;
  }, [
    form.insc_inicio_fecha,
    form.insc_inicio_hora,
    form.insc_inicio_min,
    form.insc_fin_fecha,
    form.insc_fin_hora,
    form.insc_fin_min,
  ]);

  const validar = () => {
    if (!form.nombre.trim()) return "Ingresá un título.";
    if (!form.insc_inicio_fecha) return "Seleccioná fecha de inicio.";
    if (!form.insc_fin_fecha) return "Seleccioná fecha de fin.";

    const iniISO = partsToISO({
      fecha: form.insc_inicio_fecha,
      hora: form.insc_inicio_hora,
      min: form.insc_inicio_min,
    });
    const finISO = partsToISO({
      fecha: form.insc_fin_fecha,
      hora: form.insc_fin_hora,
      min: form.insc_fin_min,
    });

    const ini = new Date(iniISO);
    const fin = new Date(finISO);
    if (isNaN(ini.getTime()) || isNaN(fin.getTime())) {
      return "Formato de fecha/hora inválido.";
    }
    if (!(ini < fin)) return "La fecha/hora de inicio debe ser anterior a la de fin.";
    return null;
  };

  const onGuardar = async (e) => {
    e.preventDefault();
    setOkMsg("");

    const err = validar();
    if (err) {
      notifyWarn(err);
      return;
    }

    setError("");
    setGuardando(true);
    pushToast({ tipo: "cargando", mensaje: "Guardando configuración…", duracion: 2500 });

    try {
      const payload = {
        id_config: form.id_config,
        nombre: form.nombre.trim(),
        insc_inicio: partsToMySQL({
          fecha: form.insc_inicio_fecha,
          hora: form.insc_inicio_hora,
          min: form.insc_inicio_min,
        }),
        insc_fin: partsToMySQL({
          fecha: form.insc_fin_fecha,
          hora: form.insc_fin_hora,
          min: form.insc_fin_min,
        }),
        mensaje_cerrado: form.mensaje_cerrado.trim(),
        activo: 1, // compat con backend, UI siempre por fechas
      };

      const resp = await fetch(`${BASE_URL}/api.php?action=admin_guardar_config_inscripcion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error(`Fallo HTTP ${resp.status} al guardar configuración`);
      }

      let json;
      try {
        json = await resp.json();
      } catch {
        throw new Error("Respuesta del servidor inválida (no es JSON).");
      }

      if (!json.exito) {
        const msg = json.mensaje || "No se pudo guardar la configuración.";
        notifyError(msg, 4500);
        return;
      }

      notifySuccess("Configuración guardada correctamente.");
      await fetchConfig(true);
    } catch (e) {
      notifyError(
        e instanceof Error
          ? `Error al guardar la configuración: ${e.message}`
          : "Error de red al guardar la configuración."
      );
    } finally {
      setGuardando(false);
    }
  };

  // ISO-like para previsualización legible
  const inicioISOForPreview = partsToISO({
    fecha: form.insc_inicio_fecha,
    hora: form.insc_inicio_hora,
    min: form.insc_inicio_min,
  });
  const finISOForPreview = partsToISO({
    fecha: form.insc_fin_fecha,
    hora: form.insc_fin_hora,
    min: form.insc_fin_min,
  });

  return (
    <div className="config-page-bg">
      {/* ===== Toast (slot único) ===== */}
      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 9999 }}>
        {toast && (
          <Toast
            key={toast.id}
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            duracion={toast.duracion}
            onClose={clearToast}
          />
        )}
      </div>

      <div className="shell">
        <header className="topbar">
          <div className="topbar-left">
            <h1>Configurar Formulario</h1>
            <p>Definí el período de inscripción y el mensaje de cierre.</p>
          </div>
          <div className="topbar-right">
            <span className={`status-dot ${abiertaPreview ? "ok" : "off"}`} />
            <span className="status-text">
              {abiertaPreview ? "Inscripción abierta" : "Inscripción cerrada"}
            </span>
          </div>
        </header>

        <div className="content-grid">
          {/* MAIN */}
          <form className="panel" onSubmit={onGuardar} noValidate>
            {(cargando || error || okMsg) && (
              <div className="stack">
                {cargando && <div className="notice">Cargando configuración…</div>}
                {error && <div className="notice danger">{error}</div>}
                {okMsg && <div className="notice success">{okMsg}</div>}
              </div>
            )}

            <div className="form-grid">
              <label className="field col-12">
                <span className="label">Título</span>
                <input
                  type="text"
                  className="input"
                  name="nombre"
                  value={form.nombre}
                  onChange={(e) => setFormField("nombre", e.target.value)}
                  placeholder="Mesas Examen Noviembre"
                  required
                />
              </label>

              {/* ================= INICIO ================= */}
              <div className="field col-12">
                <span className="label">Inicio</span>
                <div className="row-when">
                  <input
                    type="date"
                    className="input"
                    lang="es-AR"
                    value={form.insc_inicio_fecha}
                    onChange={(e) => setFormField("insc_inicio_fecha", e.target.value)}
                    required
                  />
                  <select
                    className="input"
                    aria-label="Hora (00-23)"
                    value={form.insc_inicio_hora}
                    onChange={(e) => setFormField("insc_inicio_hora", e.target.value)}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="sep">:</span>
                  <select
                    className="input"
                    aria-label="Minutos (00-59)"
                    value={form.insc_inicio_min}
                    onChange={(e) => setFormField("insc_inicio_min", e.target.value)}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <span className="suffix">hs</span>
                </div>
              </div>

              {/* ================= FIN ================= */}
              <div className="field col-12">
                <span className="label">Fin</span>
                <div className="row-when">
                  <input
                    type="date"
                    className="input"
                    lang="es-AR"
                    value={form.insc_fin_fecha}
                    onChange={(e) => setFormField("insc_fin_fecha", e.target.value)}
                    required
                  />
                  <select
                    className="input"
                    aria-label="Hora (00-23)"
                    value={form.insc_fin_hora}
                    onChange={(e) => setFormField("insc_fin_hora", e.target.value)}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="sep">:</span>
                  <select
                    className="input"
                    aria-label="Minutos (00-59)"
                    value={form.insc_fin_min}
                    onChange={(e) => setFormField("insc_fin_min", e.target.value)}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <span className="suffix">hs</span>
                </div>
              </div>

              <label className="field col-12">
                <span className="label">Mensaje cuando está cerrado</span>
                <input
                  type="text"
                  className="input"
                  name="mensaje_cerrado"
                  value={form.mensaje_cerrado}
                  onChange={(e) => setFormField("mensaje_cerrado", e.target.value)}
                />
              </label>
            </div>

            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  pushToast({ tipo: "info", mensaje: "Volviendo…", duracion: 1200 });
                  navigate(-1);
                }}
              >
                Volver
              </button>
              <button type="submit" className="btn btn-primary" disabled={guardando || !!validar()}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>

          {/* ASIDE PREVIEW */}
          <aside className="aside">
            <div className="aside-card">
              <div className="aside-title">Previsualización</div>
              <ul className="meta">
                <li>
                  <b>Desde</b>
                  <span>{fmtLargo(inicioISOForPreview)}</span>
                </li>
                <li>
                  <b>Hasta</b>
                  <span>{fmtLargo(finISOForPreview)}</span>
                </li>
                <li>
                  <b>Estado</b>
                  <span className={`chip ${abiertaPreview ? "chip-ok" : "chip-off"}`}>
                    {abiertaPreview ? "ABIERTA" : "CERRADA"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="aside-tip">
              <p>
                Consejo: usá rangos de fechas claros. El formulario queda abierto solo entre inicio y fin.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ConfigForm;
