// src/components/MesasExamen/modales/GenerarPDF.jsx
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Genera el PDF de mesas apilando múltiples tablas por página.
 * - Header (logo + título) fijo por página con reserva de margen superior.
 * - Cada mesa imprime un subtítulo y su tabla.
 * - ✅ Si una mesa NO entra completa en el espacio restante => pasa a hoja nueva.
 * - Evita que el encabezado quede “huérfano”.
 * - Logo preserva aspecto.
 */
export async function generarPDFMesas({
  mesasFiltradas,
  baseUrl,
  notify,
  logoPath,
  id_grupo = null,
  agrupaciones = null, // [[12,13,14], [29], [31,32], ...]
}) {
  /* =================== Utils =================== */
  const normalizar = (s = "") =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

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

  const NOMBRE_MES = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return { dia: "", mesNum: "", anio: "", mes: "" };
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
      mes: meses[parseInt(m[2], 10) - 1] || "",
    };
  };

  const DIA_SEMANA = (iso) => {
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

  const HORA_POR_TURNO = (turno = "", fallback = "07:30 HS.") => {
    const t = normalizar(turno);
    if (t.includes("man")) return "07:30 HS.";
    if (t.includes("tar")) return "13:30 HS.";
    return fallback;
  };

  // ✅ Usa hora DB si viene (HH:mm o HH:mm:ss) y si no, cae al turno
  const HORA_DESDE_DB = (hora = "", turno = "", fallback = "07:30 HS.") => {
    const raw = (hora ?? "").toString().trim();
    if (raw) {
      const parts = raw.split(":");
      const hh = parts?.[0] ?? "";
      const mm = parts?.[1] ?? "";
      if (hh && mm) return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")} HS.`;
    }
    return HORA_POR_TURNO(turno, fallback);
  };

  const loadHTMLImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  // Resize con preservación de aspecto dentro de un “box” w×h
  const fitImage = (img, maxW, maxH) => {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const r = Math.min(maxW / iw, maxH / ih);
    return { w: Math.round(iw * r), h: Math.round(ih * r) };
  };

  const getNumerosDeMesas = (filas = []) => {
    const s = new Set();
    for (const r of filas || []) {
      for (const k of ["numero_mesa", "numeroMesa", "id_mesa", "id_mesa_repr", "id"]) {
        const n = parseInt(r?.[k], 10);
        if (Number.isFinite(n) && n > 0) {
          s.add(n);
          break;
        }
      }
    }
    return [...s].sort((a, b) => a - b);
  };

  const limpiarCurso = (s) => {
    let out = String(s ?? "");
    out = out.replace(/°\s*°/g, "°");
    out = out.replace(/\s{2,}/g, " ");
    return out.trim();
  };

  /* =================== Fetch + normalize =================== */
  try {
    // 1) Preparar payload (unión de números)
    let numerosNecesarios = [];
    let payload;

    if (Array.isArray(agrupaciones) && agrupaciones.length) {
      const s = new Set();
      for (const arr of agrupaciones) {
        for (const n of arr || []) {
          const nn = parseInt(n, 10);
          if (Number.isFinite(nn)) s.add(nn);
        }
      }
      numerosNecesarios = Array.from(s).sort((a, b) => a - b);
    } else if (!id_grupo && mesasFiltradas?.length) {
      numerosNecesarios = getNumerosDeMesas(mesasFiltradas);
    }

    if (id_grupo != null) {
      payload = { id_grupo };
    } else {
      if (!numerosNecesarios.length) {
        notify?.({ tipo: "warning", mensaje: "No hay números de mesa para exportar." });
        return;
      }
      payload = { numeros_mesa: numerosNecesarios };
    }

    // 2) Backend
    const resp = await fetch(`${baseUrl}/api.php?action=mesas_detalle_pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await resp.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
    }
    if (!resp.ok || !json?.exito) throw new Error(json?.mensaje || "No se pudo obtener el detalle.");

    const subMesas = (Array.isArray(json.data) ? json.data : []).map((m) => ({
      numero_mesa: m.numero_mesa ?? null,
      fecha: m.fecha ?? "",
      turno: m.turno ?? "",
      hora: m.hora ?? "", // ✅ traemos hora
      materia: m.materia ?? "",
      docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
      alumnos: Array.isArray(m.alumnos)
        ? m.alumnos.map((a) => ({
            alumno: a.alumno ?? "",
            dni: a.dni ?? "",
            curso: a.curso ?? "",
          }))
        : [],
    }));

    if (!subMesas.length) {
      notify?.({ tipo: "warning", mensaje: "No hay detalle para exportar." });
      return;
    }

    // 3) AGRUPACIONES efectivas
    let agrupacionesEfectivas = [];
    if (Array.isArray(agrupaciones) && agrupaciones.length) {
      agrupacionesEfectivas = agrupaciones
        .map((arr) => (arr || []).map((n) => parseInt(n, 10)).filter(Number.isFinite))
        .filter((a) => a.length);
    } else if (id_grupo != null) {
      const setNums = new Set(subMesas.map((x) => parseInt(x.numero_mesa, 10)).filter(Number.isFinite));
      agrupacionesEfectivas = [Array.from(setNums).sort((a, b) => a - b)];
    } else {
      agrupacionesEfectivas = [numerosNecesarios];
    }

    // Aux: mesa lógica desde submesas de una agrupación
    const buildMesaLogicaFrom = (arr) => {
      const fechaStar = mode(arr.map((x) => x.fecha)) || arr.find((x) => x.fecha)?.fecha || "";
      const turnoStar = mode(arr.map((x) => x.turno)) || arr.find((x) => x.turno)?.turno || "";
      const horaStar = mode(arr.map((x) => x.hora)) || arr.find((x) => x.hora)?.hora || ""; // ✅
      const materiaStar = mode(arr.map((x) => x.materia)) || arr[0]?.materia || "";
      const subNumeros = [...new Set(arr.map((x) => x.numero_mesa).filter((v) => v != null))].sort((a, b) => a - b);

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
          .sort((A, B) => String(A).localeCompare(String(B), "es", { sensitivity: "base" }));
        for (const d of dQueTienen) {
          const a = mapa.get(d).get(mat) || [];
          const uniq = Array.from(new Map(a.map((x) => [x.dni || x.alumno || Math.random(), x])).values());
          uniq.sort((A, B) =>
            String(A.alumno).localeCompare(String(B.alumno), "es", { sensitivity: "base" })
          );
          bloques.push({ docente: d, materia: mat, alumnos: uniq });
        }
      }

      return { fecha: fechaStar, turno: turnoStar, hora: horaStar, materia: materiaStar, subNumeros, bloques };
    };

    // 4) Mesas lógicas por agrupación
    const mesasLogicas = [];
    for (const nums of agrupacionesEfectivas) {
      const setNums = new Set(nums);
      const arr = subMesas.filter((sm) => setNums.has(sm.numero_mesa));
      if (!arr.length) continue;
      mesasLogicas.push(buildMesaLogicaFrom(arr));
    }

    if (!mesasLogicas.length) {
      notify?.({ tipo: "warning", mensaje: "No hay datos para las agrupaciones seleccionadas." });
      return;
    }

    // Orden por fecha, turno, primer número
    const turnRank = (t) => (normalizar(t).includes("man") ? 0 : 1);
    mesasLogicas.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      const ta = turnRank(a.turno),
        tb = turnRank(b.turno);
      if (ta !== tb) return ta - tb;
      return (a.subNumeros[0] ?? 0) - (b.subNumeros[0] ?? 0);
    });

    /* =================== PDF =================== */
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

    // Dimensiones / layout
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ML = 28; // margen lateral
    const MTOP = 30; // margen superior
    const LOGO_BOX = 44; // caja máxima del logo
    const HEADER_GAP = 8; // respiro bajo header
    const BOTTOM_SAFE = 34; // margen inferior
    const GAP_BETWEEN_TABLES = 12; // separación entre mesas
    const MIN_ROWS_AFTER_HEAD = 2; // al menos 2 filas tras head

    // Tipografías
    const FT_TITLE = 16,
      FT_SUB = 10,
      FT_HEAD = 9,
      FT_BODY = 9,
      PAD = 4;

    // Logo
    let logoImg = null;
    let logoW = LOGO_BOX,
      logoH = LOGO_BOX;
    try {
      logoImg = await loadHTMLImage(logoPath || `${window.location.origin}/img/Escudo.png`);
      const sz = fitImage(logoImg, LOGO_BOX, LOGO_BOX);
      logoW = sz.w;
      logoH = sz.h;
    } catch {
      /* sin logo */
    }

    // Header de página
    const HEADER_H = Math.max(logoH, 44) + 18;
    const CONTENT_TOP = MTOP + HEADER_H + HEADER_GAP;

    // Anchos de columnas (escala al ancho útil)
    const usableW = pageW - ML * 2;
    const COLS = { HORA: 90, ESPACIO: 170, ESTUDIANTE: 210, DNI: 80, CURSO: 70, DOCENTES: 90 };
    const sumCols = Object.values(COLS).reduce((a, b) => a + b, 0);
    const scale = usableW / sumCols;
    for (const k of Object.keys(COLS)) COLS[k] = Math.floor(COLS[k] * scale);

    const drawPageHeader = () => {
      if (logoImg) doc.addImage(logoImg, "PNG", ML, MTOP, logoW, logoH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(FT_TITLE);
      const titleY = MTOP + Math.max(18, Math.ceil(logoH * 0.5));
      doc.text("MESAS DE EXAMEN FEBRERO 2026", pageW / 2, titleY, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(FT_SUB);
      doc.text('IPET N° 50 "Ing. Emilio F. Olmos"', pageW / 2, titleY + 14, { align: "center" });

      const lineY = MTOP + HEADER_H - 6;
      doc.setDrawColor(0);
      doc.setLineWidth(0.6);
      doc.line(ML, lineY, pageW - ML, lineY);
    };

    // Caption por mesa
    const drawMesaCaption = (mesa, y) => {
      const { dia, mes, anio } = NOMBRE_MES(mesa.fecha);
      const fechaTxt = `${DIA_SEMANA(mesa.fecha)} ${String(dia).padStart(2, "0")} ${mes} ${anio}`.trim();

      const horaTxt = HORA_DESDE_DB(mesa.hora, mesa.turno);
      const turnoTxt = `${String(mesa.turno || "").toUpperCase()} · ${horaTxt}`;
      const mesaTxt = `N° de mesa: ${mesa.subNumeros.join(" • ") || "—"}`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(fechaTxt, ML, y);

      doc.setFont("helvetica", "normal");
      doc.text(turnoTxt, ML, y + 12);

      doc.setFont("helvetica", "bold");
      doc.text(mesaTxt, pageW - ML, y, { align: "right" });

      doc.setDrawColor(200);
      doc.setLineWidth(0.6);
      doc.line(ML, y + 16, pageW - ML, y + 16);

      return y + 20;
    };

    // Body table por mesa
    const buildBody = (mesa) => {
      const { dia, mes } = NOMBRE_MES(mesa.fecha);
      const horaTxt = HORA_DESDE_DB(mesa.hora, mesa.turno);
      const HORA =
        `${DIA_SEMANA(mesa.fecha)}\n${String(dia).padStart(2, "0")}\n${mes}\n${String(mesa.turno || "").toUpperCase()}\n${horaTxt}`;

      const nRowsPorBloque = mesa.bloques.map((b) => Math.max(1, b.alumnos.length));
      const totalRows = nRowsPorBloque.reduce((a, b) => a + b, 0);

      // Segmentos contiguos por MATERIA
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
          segMateria.push({ materia: curMat, startRow: startMat, rowSpan: accMat });
          curMat = mat;
          startMat = rowCursor;
          accMat = 0;
        }
        accMat += n;
        rowCursor += n;
      }
      if (curMat !== null) segMateria.push({ materia: curMat, startRow: startMat, rowSpan: accMat });

      // Segmentos contiguos por DOCENTE
      const segDocente = [];
      let curDoc = null,
        accDoc = 0,
        startDoc = 0,
        rowCursor2 = 0;
      for (let i = 0; i < mesa.bloques.length; i++) {
        const docen = mesa.bloques[i].docente || "—";
        const n = nRowsPorBloque[i];
        if (curDoc === null) {
          curDoc = docen;
          startDoc = rowCursor2;
          accDoc = 0;
        }
        if (docen !== curDoc) {
          segDocente.push({ docente: curDoc, startRow: startDoc, rowSpan: accDoc });
          curDoc = docen;
          startDoc = rowCursor2;
          accDoc = 0;
        }
        accDoc += n;
        rowCursor2 += n;
      }
      if (curDoc !== null) segDocente.push({ docente: curDoc, startRow: startDoc, rowSpan: accDoc });

      const materiaStart = new Map(segMateria.map((s) => [s.startRow, s]));
      const docenteStart = new Map(segDocente.map((s) => [s.startRow, s]));

      const body = [];
      let filaGlobal = 0;

      for (let idx = 0; idx < mesa.bloques.length; idx++) {
        const bloque = mesa.bloques[idx];
        const n = nRowsPorBloque[idx];

        for (let i = 0; i < n; i++) {
          const a = bloque.alumnos[i] || { alumno: "—", dni: "—", curso: "—" };
          const row = [];

          // Hora (solo 1 vez)
          if (filaGlobal === 0) {
            row.push({
              content: HORA,
              rowSpan: totalRows || 1,
              styles: {
                halign: "center",
                valign: "middle",
                fontStyle: "bold",
                fontSize: FT_BODY - 0.5,
              },
            });
          }

          // Materia fusionada por segmento
          const segM = materiaStart.get(filaGlobal);
          if (segM) {
            row.push({
              content: String(segM.materia || ""),
              rowSpan: segM.rowSpan || 1,
              styles: { halign: "left", valign: "middle", fontStyle: "bold" },
            });
          }

          // Alumno / DNI / Curso
          row.push(String(a.alumno || ""));
          row.push(String(a.dni || ""));
          row.push(limpiarCurso(a.curso));

          // Docente fusionado por segmento
          const segD = docenteStart.get(filaGlobal);
          if (segD) {
            row.push({
              content: String(segD.docente || "—"),
              rowSpan: segD.rowSpan || 1,
              styles: { halign: "left", valign: "middle", fontStyle: "bold" },
            });
          }

          body.push(row);
          filaGlobal++;
        }
      }

      if (totalRows === 0) {
        body.push([
          {
            content: HORA,
            rowSpan: 1,
            styles: { halign: "center", valign: "middle", fontStyle: "bold", fontSize: FT_BODY - 0.5 },
          },
          { content: mesa.materia || "—", rowSpan: 1, styles: { halign: "left", valign: "middle", fontStyle: "bold" } },
          "—",
          "—",
          limpiarCurso("—"),
          { content: "—", rowSpan: 1, styles: { halign: "left" } },
        ]);
      }

      return body;
    };

    // ✅ Estimación simple de altura de una mesa para decidir salto de página.
    // No necesita ser perfecta: con esto evitás que autoTable “corte” cuando sí entraba.
    const estimateMesaHeight = (mesa) => {
      const nRows = (mesa.bloques || []).reduce((acc, b) => acc + Math.max(1, (b?.alumnos || []).length), 0) || 1;
      const rowH = Math.max(11, FT_BODY + PAD * 2 + 2); // aproximación
      const headH = Math.max(16, FT_HEAD + PAD * 2 + 3);
      const captionH = 20;
      const extra = 10; // líneas / respiros
      return captionH + headH + nRows * rowH + extra;
    };

    // Header primera página
    drawPageHeader();
    let currentY = CONTENT_TOP;

    // Espacio mínimo para no dejar head huérfano
    const CAPTION_HEIGHT = 20;
    const HEAD_APPROX = 18;
    const MIN_TABLE_BLOCK = CAPTION_HEIGHT + HEAD_APPROX + MIN_ROWS_AFTER_HEAD * 12;

    for (let idxMesa = 0; idxMesa < mesasLogicas.length; idxMesa++) {
      const mesa = mesasLogicas[idxMesa];

      // 1) Si no hay espacio ni para caption + head + 2 filas => nueva página
      if (currentY > pageH - BOTTOM_SAFE - MIN_TABLE_BLOCK) {
        doc.addPage();
        drawPageHeader();
        currentY = CONTENT_TOP;
      }

      // 2) ✅ Si la mesa completa NO entra en el espacio restante => nueva página
      // (esto es lo que te faltaba para que no se “corte en cualquier lado”)
      const remaining = pageH - BOTTOM_SAFE - currentY;
      const approxMesaH = estimateMesaHeight(mesa);

      // Si entra justo, la dejamos. Si no entra, la pasamos entera a la próxima página.
      // OJO: si la mesa es más grande que una hoja, igual se va a partir (inevitable).
      const maxBlockPerPage = pageH - BOTTOM_SAFE - CONTENT_TOP;
      const mesaEsMasGrandeQueUnaHoja = approxMesaH > maxBlockPerPage;

      if (!mesaEsMasGrandeQueUnaHoja && approxMesaH > remaining) {
        doc.addPage();
        drawPageHeader();
        currentY = CONTENT_TOP;
      }

      // Caption
      currentY = drawMesaCaption(mesa, currentY);

      // Tabla
      autoTable(doc, {
        startY: currentY,
        margin: { top: CONTENT_TOP, bottom: BOTTOM_SAFE, left: ML, right: ML },

        // ✅ CLAVE: evita partir la tabla si puede entrar completa en una página.
        // Si no entra en el espacio restante, autoTable arranca en la hoja siguiente.
        pageBreak: "avoid",

        // Esta ayuda a evitar cortes feos; si una fila (muy alta) no entra, pasa de página.
        rowPageBreak: "avoid",

        styles: {
          font: "helvetica",
          fontSize: FT_BODY,
          cellPadding: PAD,
          lineWidth: 0.5,
          halign: "center",
          valign: "middle",
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: 60,
          fontStyle: "bold",
          fontSize: FT_HEAD,
          lineWidth: 0.5,
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.8,
        theme: "grid",

        head: [["Hora", "Espacio Curricular", "Estudiante", "DNI", "Curso", "Docentes"]],
        body: buildBody(mesa),

        columnStyles: {
          0: { cellWidth: COLS.HORA, halign: "center" },
          1: { cellWidth: COLS.ESPACIO, halign: "left" },
          2: { cellWidth: COLS.ESTUDIANTE, halign: "left" },
          3: { cellWidth: COLS.DNI, halign: "center" },
          4: { cellWidth: COLS.CURSO, halign: "center" },
          5: { cellWidth: COLS.DOCENTES, halign: "left" },
        },

        // Header por página (cuando autoTable agrega páginas por ser muy largo)
        didDrawPage: () => drawPageHeader(),
      });

      const last = doc.lastAutoTable;
      currentY = (last?.finalY ?? currentY) + GAP_BETWEEN_TABLES;
    }

    // Guardar
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    doc.save(`MesasDeExamen_${yyyy}-${mm}-${dd}.pdf`);
  } catch (e) {
    console.error("Error generando PDF:", e);
    notify?.({ tipo: "error", mensaje: e.message || "No se pudo exportar PDF." });
  }
}
