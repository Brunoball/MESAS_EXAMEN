<?php
// backend/modules/mesas/mesa_previas_candidatas.php
//
// Devuelve las PREVIAS (inscripcion = 1) que todavía
// no tienen ninguna mesa asociada en `mesas_examen.mesas`,
// FILTRADAS para que coincidan en MATERIA con la mesa
// (caja) desde la cual se abrió el modal.
//
// Entrada (JSON):
// {
//   "numero_mesa_destino": 35,
//   "fecha_objetivo": "2025-12-02",   // hoy NO se usan
//   "id_turno_objetivo": 2           // pero se leen por si a futuro
// }
//
// Respuesta:
// {
//   "exito": true,
//   "data": [
//      {
//        "id_previa": 123,
//        "dni": "12345678",
//        "alumno": "PEREZ, JUAN",
//        "id_materia": 45,
//        "materia": "BIOLOGÍA",
//        "materia_id_curso": 3,
//        "materia_id_division": 7,
//        "nombre_curso": "3°",
//        "nombre_division": "A",
//        "curso_div": "3° A",
//        "elegible": true,
//        "motivo": null
//      },
//      ...
//   ]
// }

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../config/db.php'; // debe exponer $pdo (PDO)

    // -----------------------
    // Leer body
    // -----------------------
    $raw = file_get_contents('php://input');
    $input = json_decode($raw ?: '[]', true);
    if (!is_array($input)) {
        $input = [];
    }

    $numeroMesaDestino = isset($input['numero_mesa_destino'])
        ? (int)$input['numero_mesa_destino']
        : null;
    $fechaObjetivo = $input['fecha_objetivo'] ?? null;
    $idTurnoObjetivo = isset($input['id_turno_objetivo'])
        ? (int)$input['id_turno_objetivo']
        : null;

    // Año actual (puedes quitar este filtro si querés todo)
    $anioActual = (int)date('Y');

    // ============================================================
    // 0) Obtener MATERIA de la mesa destino
    //    (la caja desde la cual se abre el modal)
    // ============================================================
    $idMateriaMesa = null;

    if ($numeroMesaDestino) {
        // Tomamos una mesa base de ese número y su cátedra
        $sqlMesaBase = "
            SELECT
                c.id_materia
            FROM mesas_examen.mesas AS me
            INNER JOIN mesas_examen.catedras AS c
                ON c.id_catedra = me.id_catedra
            WHERE me.numero_mesa = :numero_mesa
            ORDER BY me.id_mesa ASC
            LIMIT 1
        ";
        $stMesaBase = $pdo->prepare($sqlMesaBase);
        $stMesaBase->execute([':numero_mesa' => $numeroMesaDestino]);
        $mesaBase = $stMesaBase->fetch(PDO::FETCH_ASSOC);

        if ($mesaBase) {
            $idMateriaMesa = (int)$mesaBase['id_materia'];
        } else {
            // Si no hay mesa/cátedra para ese número, devolvemos lista vacía.
            echo json_encode([
                'exito' => true,
                'data'  => [],
            ]);
            return;
        }
    } else {
        // Sin número de mesa destino no tiene sentido la búsqueda:
        echo json_encode([
            'exito' => true,
            'data'  => [],
        ]);
        return;
    }

    // ============================================================
    // 1) PREVIAS INSCRIPTAS (inscripcion = 1) SIN NINGUNA MESA,
    //    Y QUE COINCIDAN EN MATERIA con la mesa destino
    // ============================================================
    //
    // LEFT JOIN con `mesas_examen.mesas` por id_previa y filtramos
    // donde me.id_mesa IS NULL  => previa no está en ninguna mesa.
    // Además, filtramos por la MATERIA de la mesa destino.
    //
    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            m.materia,
            c.nombre_curso,
            d.nombre_division,
            CONCAT(
                COALESCE(c.nombre_curso, ''),
                CASE WHEN c.nombre_curso IS NOT NULL AND d.nombre_division IS NOT NULL
                     THEN ' '
                     ELSE ''
                END,
                COALESCE(d.nombre_division, '')
            ) AS curso_div
        FROM mesas_examen.previas AS p
        INNER JOIN mesas_examen.materias AS m
            ON m.id_materia = p.id_materia
        LEFT JOIN mesas_examen.curso AS c
            ON c.id_curso = p.materia_id_curso
        LEFT JOIN mesas_examen.division AS d
            ON d.id_division = p.materia_id_division
        LEFT JOIN mesas_examen.mesas AS me
            ON me.id_previa = p.id_previa
        WHERE
            p.inscripcion = 1
            AND p.anio = :anio_actual
            AND me.id_mesa IS NULL
            AND p.id_materia = :id_materia_mesa
        ORDER BY
            p.alumno ASC,
            m.materia ASC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':anio_actual'     => $anioActual,
        ':id_materia_mesa' => $idMateriaMesa,
    ]);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Normalizamos salida y agregamos `elegible`
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id_previa'           => (int)$r['id_previa'],
            'dni'                 => $r['dni'],
            'alumno'              => $r['alumno'],
            'id_materia'          => (int)$r['id_materia'],
            'materia'             => $r['materia'],
            'materia_id_curso'    => isset($r['materia_id_curso']) ? (int)$r['materia_id_curso'] : null,
            'materia_id_division' => isset($r['materia_id_division']) ? (int)$r['materia_id_division'] : null,
            'nombre_curso'        => $r['nombre_curso'] ?? null,
            'nombre_division'     => $r['nombre_division'] ?? null,
            'curso_div'           => trim($r['curso_div'] ?? ''),
            'elegible'            => true,  // por ahora todas elegibles
            'motivo'              => null,
        ];
    }

    echo json_encode([
        'exito' => true,
        'data'  => $out,
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error obteniendo previas sin mesa: ' . $e->getMessage(),
    ]);
}
