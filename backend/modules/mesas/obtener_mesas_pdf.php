<?php
// backend/modules/mesas/obtener_mesas_pdf.php
// Devuelve el detalle DE TODA LA MESA (alumnos + docentes) a partir de:
//   - { "id_grupo": number }  ó
//   - { "numeros_mesa": number[] }
//
// Ahora se arma el detalle a nivel
//   numero_mesa + materia + docente
// para que en el PDF cada docente tenga su/s materia/s correctas y
// sólo los alumnos que le corresponden.

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

function respond_json(bool $ok, $payload = null, int $status = 200): void {
    http_response_code($status);
    echo json_encode(
        $ok
            ? ['exito' => true, 'data' => $payload]
            : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond_json(false, 'Método no permitido.', 405);
    }
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        respond_json(false, 'Conexión PDO no disponible.', 500);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input') ?: '';
    $in  = json_decode($raw, true);
    if (!is_array($in)) {
        respond_json(false, 'Body JSON inválido.', 400);
    }

    // ------------------------------------------------------------------
    // 1) Resolver lista de numeros de mesa
    // ------------------------------------------------------------------
    $numeros = [];

    if (array_key_exists('id_grupo', $in)) {
        $idg = (int)$in['id_grupo'];
        if ($idg <= 0) {
            respond_json(false, 'id_grupo inválido.', 400);
        }

        $qg = $pdo->prepare("
            SELECT numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
            FROM mesas_grupos
            WHERE id_mesa_grupos = ?
        ");
        $qg->execute([$idg]);
        $g = $qg->fetch(PDO::FETCH_ASSOC);
        if (!$g) {
            respond_json(false, 'Grupo no encontrado.', 404);
        }

        foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $k) {
            $nm = (int)($g[$k] ?? 0);
            if ($nm > 0) {
                $numeros[] = $nm;
            }
        }
    } elseif (!empty($in['numeros_mesa']) && is_array($in['numeros_mesa'])) {
        $numeros = array_values(array_unique(array_map('intval', $in['numeros_mesa'])));
    }

    if (!$numeros) {
        respond_json(false, 'Debe indicar id_grupo o una lista de numeros_mesa.', 400);
    }

    // ------------------------------------------------------------------
    // 2) Query único: mesas + previas + catedras + materias + docentes
    //    HORA:
    //      - Si está en grupo -> mesas_grupos.hora
    //      - Si es no agrupada -> mesas_no_agrupadas.hora
    // ------------------------------------------------------------------
    $placeholders = implode(',', array_fill(0, count($numeros), '?'));

    $sql = "
        SELECT
            m.numero_mesa,
            m.fecha_mesa,
            m.id_turno,
            t.turno,
            COALESCE(mg.hora, mna.hora) AS hora,   -- <-- HORA unificada
            m.id_catedra,
            c.id_materia             AS id_materia,
            mat.materia              AS nombre_materia,
            m.id_docente,
            d.docente                AS nombre_docente,
            p.alumno,
            p.dni,
            p.materia_id_curso       AS id_curso,
            p.materia_id_division    AS id_division,
            cu.nombre_curso          AS nombre_curso,
            dv.nombre_division       AS nombre_division
        FROM mesas m
            INNER JOIN previas   p   ON p.id_previa      = m.id_previa
            LEFT  JOIN turnos    t   ON t.id_turno       = m.id_turno
            LEFT  JOIN mesas_grupos mg
                   ON m.numero_mesa IN (
                        mg.numero_mesa_1,
                        mg.numero_mesa_2,
                        mg.numero_mesa_3,
                        mg.numero_mesa_4
                   )
            LEFT  JOIN mesas_no_agrupadas mna
                   ON mna.numero_mesa = m.numero_mesa
            LEFT  JOIN catedras  c   ON c.id_catedra     = m.id_catedra
            LEFT  JOIN materias  mat ON mat.id_materia   = c.id_materia
            LEFT  JOIN docentes  d   ON d.id_docente     = m.id_docente
            LEFT  JOIN curso     cu  ON cu.id_curso      = p.materia_id_curso
            LEFT  JOIN division  dv  ON dv.id_division   = p.materia_id_division
        WHERE m.numero_mesa IN ($placeholders)
        ORDER BY
            m.numero_mesa ASC,
            nombre_materia ASC,
            nombre_docente ASC,
            p.alumno ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute($numeros);

    // ------------------------------------------------------------------
    // 3) Armar estructura:
    //    mesa -> (materia,docente) -> alumnos[]
    // ------------------------------------------------------------------
    $tmp = []; // [numero_mesa][subKey] = [...subMesa...]
    while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
        $nm           = (int)($r['numero_mesa'] ?? 0);
        $fechaMesa    = (string)($r['fecha_mesa'] ?? '');
        $idTurno      = $r['id_turno'] !== null ? (int)$r['id_turno'] : null;
        $turno        = (string)($r['turno'] ?? '');
        $hora         = (string)($r['hora'] ?? '');              // <-- viene de COALESCE
        $idMateria    = $r['id_materia'] !== null ? (int)$r['id_materia'] : null;
        $nombreMat    = (string)($r['nombre_materia'] ?? '');
        $nombreDoc    = (string)($r['nombre_docente'] ?? '');

        if ($nm <= 0) {
            continue;
        }

        if (!isset($tmp[$nm])) {
            $tmp[$nm] = [];
        }

        // Clave de sub-mesa: materia + docente
        $subKey = $nombreMat . '|' . $nombreDoc;

        if (!isset($tmp[$nm][$subKey])) {
            $tmp[$nm][$subKey] = [
                'numero_mesa' => $nm,
                'fecha'       => $fechaMesa,
                'id_turno'    => $idTurno,
                'turno'       => $turno,
                'hora'        => $hora,       // se envía al frontend
                'id_materia'  => $idMateria,
                'materia'     => $nombreMat,
                'docentes'    => $nombreDoc !== '' ? [$nombreDoc] : [],
                'alumnos'     => [],
                '__seen_alumnos' => [] // para evitar duplicados
            ];
        }

        // Armar texto de curso "3° D", usando curso/división si existen
        $cursoNom = (string)($r['nombre_curso'] ?? '');
        $divNom   = (string)($r['nombre_division'] ?? '');
        $cursoStr = '';
        if ($cursoNom !== '' && $divNom !== '') {
            $cursoStr = $cursoNom . '° ' . $divNom;
        } elseif ($cursoNom !== '') {
            $cursoStr = $cursoNom . '°';
        } elseif ($divNom !== '') {
            $cursoStr = $divNom;
        } else {
            $idc = isset($r['id_curso']) ? (string)$r['id_curso'] : '';
            $idd = isset($r['id_division']) ? (string)$r['id_division'] : '';
            if ($idc !== '' && $idd !== '') {
                $cursoStr = $idc . '° ' . $idd;
            } elseif ($idc !== '') {
                $cursoStr = $idc . '°';
            } elseif ($idd !== '') {
                $cursoStr = $idd;
            }
        }

        $alumnoNom = (string)($r['alumno'] ?? '');
        $dni       = (string)($r['dni'] ?? '');

        // Evitar alumno duplicado dentro de la misma sub-mesa
        $alKey = mb_strtolower(trim($alumnoNom . '|' . $dni . '|' . $cursoStr), 'UTF-8');
        if (!isset($tmp[$nm][$subKey]['__seen_alumnos'][$alKey])) {
            $tmp[$nm][$subKey]['__seen_alumnos'][$alKey] = true;
            $tmp[$nm][$subKey]['alumnos'][] = [
                'alumno' => $alumnoNom,
                'dni'    => $dni,
                'curso'  => $cursoStr,
            ];
        }
    }

    if (!$tmp) {
        respond_json(true, []); // sin datos
    }

    // ------------------------------------------------------------------
    // 4) Flatten a la estructura final (sin campos internos)
    // ------------------------------------------------------------------
    $out = [];
    ksort($tmp);
    foreach ($tmp as $nm => $subMesas) {
        foreach ($subMesas as $sub) {
            unset($sub['__seen_alumnos']);
            // Ordenar alumnos por nombre
            if (!empty($sub['alumnos']) && is_array($sub['alumnos'])) {
                usort($sub['alumnos'], function ($a, $b) {
                    return strcmp(
                        mb_strtolower((string)($a['alumno'] ?? ''), 'UTF-8'),
                        mb_strtolower((string)($b['alumno'] ?? ''), 'UTF-8')
                    );
                });
            }
            $out[] = $sub;
        }
    }

    respond_json(true, $out);

} catch (Throwable $e) {
    error_log('[obtener_mesas_pdf] ' . $e->getMessage());
    respond_json(false, 'Error: ' . $e->getMessage(), 500);
}
