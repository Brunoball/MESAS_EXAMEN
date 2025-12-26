// src/App.js
import React, { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

/* Login / Registro / Panel */
import Inicio from "./components/Login/Inicio";
import Principal from "./components/Principal/Principal";
import Registro from "./components/Login/Registro";

/* Profesores (admin) */
import Profesores from "./components/Profesores/Profesores";
import AgregarProfesor from "./components/Profesores/AgregarProfesor";
import EditarProfesor from "./components/Profesores/EditarProfesor";
import ProfesorBaja from "./components/Profesores/ProfesorBaja";

/* Previas */
import Previas from "./components/Previas/Previas";
import AgregarPrevia from "./components/Previas/AgregarPrevia";
import EditarPrevia from "./components/Previas/EditarPrevia";
import PreviasBaja from "./components/Previas/PreviasBaja";
import PreviasCopias from "./components/Previas/PreviasCopias";

/* Cátedras */
import Catedras from "./components/Catedras/Catedras";

/* Configurar Formulario (admin) */
import ConfigForm from "./components/ConfigFormulario/ConfigForm";

/* ✅ Mesas de Examen */
import MesasExamen from "./components/MesasExamen/MesasExamen";
/* 🆕 Editor de Mesa */
import EditarMesa from "./components/MesasExamen/EditarMesa";

/* 🆕 Playground del Loader (pestaña aparte para tunear el loader) */
import LoaderPlayground from "./components/Global/LoaderPlayground";


/* ===========================
   Utilidades de sesión
=========================== */
function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

function isAuthenticated() {
  try {
    return !!localStorage.getItem("usuario") || !!localStorage.getItem("token");
  } catch {
    return false;
  }
}

function doLogoutSideEffects() {
  try { sessionStorage.clear(); } catch {}
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
  } catch {}
}

/* ===========================
   Cierre por inactividad inline
=========================== */
// 🔥 Para probar rápido: 1 minuto. Luego cambiá a 60 * 60 * 1000 (60 min).
const INACTIVITY_MS = 60 * 60 * 1000;

function InactivityBoundaryInline() {
  const navigate = useNavigate();
  const location = useLocation();
  const timerRef = useRef(null);

  useEffect(() => {
    const doLogout = () => {
      try { doLogoutSideEffects(); } catch {}
      navigate("/", { replace: true });
    };

    const resetTimer = () => {
      if (!isAuthenticated()) return;
      if (location.pathname === "/") return; // no corre en login
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doLogout, INACTIVITY_MS);
    };

    const onActivity = () => resetTimer();
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetTimer();
    };
    const onStorage = (e) => {
      if (e.key === "token" || e.key === "usuario") {
        if (!isAuthenticated()) doLogout();
      }
    };

    const events = ["pointermove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true })
    );
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    resetTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [location.pathname, navigate]);

  return null;
}

/* ===========================
   Rutas protegidas
=========================== */
function RutaProtegida({ componente }) {
  const usuario = getUsuario();
  return usuario ? componente : <Navigate to="/" replace />;
}

function RutaAdmin({ componente }) {
  const usuario = getUsuario();
  const rol = (usuario?.rol || "").toLowerCase();
  if (!usuario) return <Navigate to="/" replace />;
  return rol === "admin" ? componente : <Navigate to="/panel" replace />;
}

/* ===========================
   App
=========================== */
function App() {
  return (
    <Router>
      {/* Montamos el cierre por inactividad una sola vez */}
      <InactivityBoundaryInline />

      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />

        {/* Panel principal */}
        <Route path="/panel" element={<RutaProtegida componente={<Principal />} />} />

        {/* Mesas de Examen (protegido) */}
        <Route path="/mesas-examen" element={<RutaProtegida componente={<MesasExamen />} />} />
        <Route path="/mesas" element={<RutaProtegida componente={<MesasExamen />} />} />
        <Route path="/mesas-examen/editar/:id" element={<RutaProtegida componente={<EditarMesa />} />} />
        <Route path="/mesas/editar/:id" element={<RutaProtegida componente={<EditarMesa />} />} />

        {/* Profesores (solo ADMIN) */}
        <Route path="/profesores" element={<RutaAdmin componente={<Profesores />} />} />
        <Route path="/profesores/agregar" element={<RutaAdmin componente={<AgregarProfesor />} />} />
        <Route path="/profesores/editar/:id" element={<RutaAdmin componente={<EditarProfesor />} />} />
        <Route path="/profesores/baja" element={<RutaAdmin componente={<ProfesorBaja />} />} />

        {/* Previas (protegido) */}
        <Route path="/previas" element={<RutaProtegida componente={<Previas />} />} />
        <Route path="/previas/agregar" element={<RutaProtegida componente={<AgregarPrevia />} />} />
        <Route path="/previas/editar/:id_previa" element={<RutaProtegida componente={<EditarPrevia />} />} />
        <Route path="/previas/baja" element={<PreviasBaja />} />
        <Route path="/previas/copias" element={<PreviasCopias />} />

        {/* Cátedras (protegido) */}
        <Route path="/catedras" element={<RutaProtegida componente={<Catedras />} />} />

        {/* Configurar Formulario (solo ADMIN) */}
        <Route path="/config-formulario" element={<RutaAdmin componente={<ConfigForm />} />} />

        {/* 🆕 Ruta pública para probar el loader en otra pestaña */}
        <Route path="/dev/loader" element={<LoaderPlayground />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
