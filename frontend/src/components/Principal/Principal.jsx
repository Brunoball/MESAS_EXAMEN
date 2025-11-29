// src/components/Principal/Principal.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardList,     // Mesas de Examen
  faFileAlt,           // Previas
  faBookOpen,          // Cátedras
  faChalkboardTeacher, // Profesores
  faUserPlus,          // Registro
  faCogs,              // Configurar formulario (admin)
  faSignOutAlt,        // Cerrar sesión
} from "@fortawesome/free-solid-svg-icons";
import logoRH from "../../imagenes/Escudo.png";
import "./principal.css";
import "../Global/roots.css";

/* =========== Modal cierre de sesión (clases: modalprincipal-*) ============= */
const ConfirmLogoutModal = ({ open, onClose, onConfirm }) => {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="modalprincipal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalprincipal-title"
      onMouseDown={onClose}
    >
      <div
        className="modalprincipal-container modalprincipal--danger"
        onMouseDown={stop}
      >
        <div className="modalprincipal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 id="modalprincipal-title" className="modalprincipal-title">
          Confirmar cierre de sesión
        </h3>

        <p className="modalprincipal-text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>

        <div className="modalprincipal-buttons">
          <button
            type="button"
            className="modalprincipal-btn modalprincipal-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="modalprincipal-btn modalprincipal-btn--solid-danger"
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

const Principal = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      setUsuario(u || null);
    } catch {
      setUsuario(null);
    }
  }, []);

  // limpieza de restos de filtros/búsquedas
  useEffect(() => {
    try {
      localStorage.removeItem("ultimaBusqueda");
      localStorage.removeItem("ultimosResultados");
      localStorage.removeItem("alumnoSeleccionado");
      localStorage.removeItem("ultimaAccion");
    } catch {}
  }, []);

  const role = (usuario?.rol || "").toLowerCase();
  const isAdmin = role === "admin";

  // Ítems con la misma estructura visual que Cooperadora
  const menuItems = [
    { icon: faClipboardList,     text: "Mesas de Examen",       ruta: "/mesas-examen" },
    { icon: faFileAlt,           text: "Previas",               ruta: "/previas" },
    { icon: faBookOpen,          text: "Cátedras",              ruta: "/catedras" },
    { icon: faChalkboardTeacher, text: "Profesores",            ruta: "/profesores", adminOnly: true },
    { icon: faUserPlus,          text: "Registro",              ruta: "/registro" },
    { icon: faCogs,              text: "Configurar formulario", ruta: "/config-formulario", adminOnly: true },
  ];

  const visibleItems = isAdmin ? menuItems : menuItems.filter((m) => !m.adminOnly);

  const handleItemClick = (item) => {
    navigate(item.ruta);
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  };

  const handleCerrarSesion = () => setShowModal(true);

  const confirmarCierreSesion = () => {
    setIsExiting(true);
    setTimeout(() => {
      try { sessionStorage.clear(); } catch {}
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
      } catch {}
      setShowModal(false);
      navigate("/", { replace: true });
    }, 400);
  };

  return (
    <div className={`pagina-principal-container ${isExiting ? "slide-fade-out" : ""}`}>
      <div className="pagina-principal-card">
        {/* ===== Header: texto izq / logo der (igual Cooperadora) ===== */}
        <div className="pagina-principal-header header--row">
          <div className="header-text">
            <h1 className="title">
              Sistema de Gestión{" "}
              <span className="title-accent">Mesas de Examen IPET 50</span>
            </h1>
            <p className="subtitle">
              {isAdmin ? "Panel de administración" : "Panel de consulta"}
            </p>
          </div>

          <div className="logo-container logo-container--right">
            <img src={logoRH} alt="Logo IPET 50" className="logo" />
          </div>
        </div>

        {/* ===== Tarjetas (grilla 3×N, compactas) ===== */}
        <div className="menu-container">
          <div className="menu-grid">
            {visibleItems.map((item, idx) => (
              <button
                type="button"
                key={idx}
                className="menu-button"
                onClick={() => handleItemClick(item)}
                aria-label={item.text}
              >
                <div className="button-icon icon--sm">
                  <FontAwesomeIcon icon={item.icon} size="lg" />
                </div>
                <span className="button-text text--sm">{item.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ===== Botón cerrar sesión ===== */}
        <button
          type="button"
          className="logout-button"
          onClick={handleCerrarSesion}
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="logout-icon" />
          <span className="logout-text-full">Cerrar Sesión</span>
          <span className="logout-text-short">Salir</span>
        </button>

        {/* ===== Footer ===== */}
        <footer className="pagina-principal-footer">
          Desarrollado por{" "}
          <a
            href="https://3devsnet.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            3devs.solutions
          </a>
        </footer>
      </div>

      <ConfirmLogoutModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={confirmarCierreSesion}
      />
    </div>
  );
};

export default Principal;
