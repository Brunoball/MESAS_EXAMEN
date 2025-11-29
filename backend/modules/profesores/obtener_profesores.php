<?php
// backend/modules/profesores/obtener_profesores.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    $params = [];

    $where = 'WHERE 1=1';
    if ($id > 0) {
        $where .= ' AND d.id_docente = :id';
        $params[':id'] = $id;
    }

    $sql = "
        SELECT
            d.id_docente                                                      AS id_profesor,
            d.docente                                                         AS nombre_completo,

            -- Cargo
            d.id_cargo,
            c.cargo                                                           AS cargo_nombre,

            -- Fecha de carga
            d.fecha_carga,

            -- Materias (todas las que dicta, según cátedras)
            GROUP_CONCAT(DISTINCT m.materia ORDER BY m.materia SEPARATOR '||') AS materias_concat,

            -- Cátedras: curso|division|materia
            GROUP_CONCAT(
              DISTINCT CONCAT_WS('|', cu.nombre_curso, dv.nombre_division, m.materia)
              ORDER BY cu.nombre_curso, dv.nombre_division, m.materia
              SEPARATOR '§§'
            ) AS catedras_concat,

            -- Estado y motivo
            d.activo,
            d.motivo,

            -- Agregados desde docentes_bloques_no para resumen
            COALESCE(no_agg.no_total, 0)                                      AS no_total,
            no_agg.no_resumen                                                 AS no_resumen

        FROM docentes d

        /* Preferencia por nombre (igual que antes) */
        INNER JOIN (
            SELECT
                x.docente,
                COALESCE(
                    MAX(CASE WHEN x.id_cargo = 2 THEN x.id_docente END),
                    MAX(x.id_docente)
                ) AS id_docente_pref
            FROM (
                SELECT d2.id_docente, d2.docente, d2.id_cargo
                FROM docentes d2
                INNER JOIN catedras ct2 ON ct2.id_docente = d2.id_docente
                WHERE d2.activo = 1
                GROUP BY d2.id_docente, d2.docente, d2.id_cargo
            ) x
            GROUP BY x.docente
        ) pref ON pref.id_docente_pref = d.id_docente

        INNER JOIN catedras  ct ON ct.id_docente = d.id_docente
        LEFT  JOIN materias  m  ON m.id_materia  = ct.id_materia
        LEFT  JOIN curso     cu ON cu.id_curso   = ct.id_curso
        LEFT  JOIN division  dv ON dv.id_division= ct.id_division

        LEFT  JOIN cargos    c  ON c.id_cargo    = d.id_cargo

        /* Resumen de indisponibilidades (NO) */
        LEFT JOIN (
            SELECT
                dn.id_docente,
                COUNT(*) AS no_total,
                GROUP_CONCAT(
                  CONCAT(
                    dn.fecha,
                    COALESCE(CONCAT(' (', t.turno, ')'), '')
                  )
                  ORDER BY dn.fecha ASC
                  SEPARATOR '; '
                ) AS no_resumen
            FROM docentes_bloques_no dn
            LEFT JOIN turnos t ON t.id_turno = dn.id_turno
            GROUP BY dn.id_docente
        ) no_agg ON no_agg.id_docente = d.id_docente

        $where

        GROUP BY
            d.id_docente, d.docente,
            d.id_cargo, c.cargo,
            d.fecha_carga,
            d.activo, d.motivo,
            no_agg.no_total, no_agg.no_resumen

        ORDER BY d.docente ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $out = [];
    foreach ($rows as $r) {
        $materias = [];
        if (!empty($r['materias_concat'])) {
            $materias = array_values(array_filter(array_map('trim', explode('||', $r['materias_concat']))));
        }
        $materia_principal = $materias[0] ?? null;
        $materias_total    = count($materias);

        $catedras = [];
        if (!empty($r['catedras_concat'])) {
            foreach (explode('§§', $r['catedras_concat']) as $chunk) {
                $parts = explode('|', $chunk);
                $catedras[] = [
                    'curso'    => isset($parts[0]) ? trim($parts[0]) : null,
                    'division' => isset($parts[1]) ? trim($parts[1]) : null,
                    'materia'  => isset($parts[2]) ? trim($parts[2]) : null,
                ];
            }
        }

        $out[] = [
            'id_profesor'           => (int)$r['id_profesor'],
            'nombre_completo'       => $r['nombre_completo'] ?? null,

            'id_cargo'              => isset($r['id_cargo']) ? (int)$r['id_cargo'] : null,
            'cargo_nombre'          => $r['cargo_nombre'] ?? null,

            'fecha_carga'           => $r['fecha_carga'] ?? null,

            'materias'              => $materias,
            'materias_total'        => $materias_total,
            'materia_principal'     => $materia_principal,
            'materia_nombre'        => $materia_principal,
            'catedras'              => $catedras,

            'departamento'          => null,
            'area'                  => null,
            'tipo_documento_nombre' => null,
            'tipo_documento_sigla'  => null,
            'num_documento'         => null,
            'dni'                   => null,
            'sexo_nombre'           => null,
            'telefono'              => null,
            'ingreso'               => null,
            'domicilio'             => null,
            'localidad'             => null,

            'activo'                => isset($r['activo']) ? (int)$r['activo'] : 0,
            'motivo'                => $r['motivo'] ?? null,

            // Resumen indisponibilidades
            'no_total'              => (int)$r['no_total'],
            'no_resumen'            => $r['no_resumen'],
        ];
    }

    echo json_encode([
        'exito'      => true,
        'profesores' => $out,
        'cantidad'   => count($out),
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al obtener profesores: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
