<?php
// backend/modules/formulario/buscar_previas.php
// Responde siempre 200. En validaciones/errores: { exito:false, mensaje, detalle?, ya_inscripto? }

header('Content-Type: application/json; charset=utf-8');

// Solo POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
    exit;
}

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true);

$dni   = isset($in['dni']) ? preg_replace('/\D+/', '', $in['dni']) : '';
$gmail = isset($in['gmail']) ? trim($in['gmail']) : '';

if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
    echo json_encode(['exito' => false, 'mensaje' => 'DNI inválido']);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

try {
    if ($pdo instanceof PDO) {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec("SET NAMES utf8mb4");
    }

    $anioActual = (int)date('Y');

    // ===== SOLO PREVIAS ACTIVAS (activo = 1) =====
    $sql = "
        SELECT 
            p.dni,
            p.alumno,
            p.anio,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            COALESCE(p.inscripcion,0) AS inscripcion,

            m.id_materia,
            m.materia,

            -- Curso/división que cursa actualmente
            c_cur.nombre_curso      AS cursando_curso_nombre,
            d_cur.nombre_division   AS cursando_division_nombre,

            -- Curso/división de la materia
            c_mat.nombre_curso      AS materia_curso_nombre,
            d_mat.nombre_division   AS materia_division_nombre

        FROM previas AS p
        INNER JOIN materias  AS m     ON m.id_materia    = p.id_materia
        LEFT  JOIN curso     AS c_cur ON c_cur.id_curso  = p.cursando_id_curso
        LEFT  JOIN division  AS d_cur ON d_cur.id_division = p.cursando_id_division
        LEFT  JOIN curso     AS c_mat ON c_mat.id_curso  = p.materia_id_curso
        LEFT  JOIN division  AS d_mat ON d_mat.id_division = p.materia_id_division
        WHERE p.dni = :dni
          AND p.id_condicion IN (3,5,6)
          AND p.activo = 1
        ORDER BY m.materia ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute([':dni' => $dni]);
    $rows = $st->fetchAll();

    if (!$rows || count($rows) === 0) {
        echo json_encode([
            'exito'        => false,
            'mensaje'      => 'No se encontraron materias previas activas para ese DNI.',
            'ya_inscripto' => false
        ]);
        exit;
    }

    // ===== Datos del alumno (desde la primera fila) =====
    $alumnoNombre = $rows[0]['alumno'];
    $cursando = [
        'curso_id'     => isset($rows[0]['cursando_id_curso'])    ? (int)$rows[0]['cursando_id_curso']    : null,
        'division_id'  => isset($rows[0]['cursando_id_division']) ? (int)$rows[0]['cursando_id_division'] : null,
        'curso'        => $rows[0]['cursando_curso_nombre']    ?? null,
        'division'     => $rows[0]['cursando_division_nombre'] ?? null,
    ];

    // ===== Mapper =====
    $mapRow = function(array $r) {
        return [
            'id_materia'   => (int)$r['id_materia'],
            'materia'      => (string)$r['materia'],
            'curso_id'     => (int)$r['materia_id_curso'],
            'division_id'  => (int)$r['materia_id_division'],
            'curso'        => $r['materia_curso_nombre']    ?? null,
            'division'     => $r['materia_division_nombre'] ?? null,
            'id_condicion' => (int)$r['id_condicion'],
            'anio'         => (int)$r['anio'],
            'inscripcion'  => (int)$r['inscripcion'],
        ];
    };

    $materias_cond3 = [];
    $materias_cond5 = [];
    $materias_cond6 = [];

    foreach ($rows as $r) {
        if ((int)$r['id_condicion'] === 3) {
            $materias_cond3[] = $mapRow($r);
        } elseif ((int)$r['id_condicion'] === 5) {
            $materias_cond5[] = $mapRow($r);
        } elseif ((int)$r['id_condicion'] === 6) {
            $materias_cond6[] = $mapRow($r);
        }
    }

    // ===== Inscripción =====
    $totalCond3      = count($materias_cond3);
    $inscriptasCond3 = array_sum(array_map(fn($m) => $m['inscripcion'] === 1 ? 1 : 0, $materias_cond3));
    $yaInscriptas    = ($totalCond3 > 0 && $inscriptasCond3 === $totalCond3);

    echo json_encode([
        'exito' => true,
        'alumno' => [
            'dni'              => $dni,
            'nombre'           => $alumnoNombre,
            'anio_actual'      => $anioActual,
            'cursando'         => $cursando,
            'materias'         => $materias_cond3,
            'materias_cond5'   => $materias_cond5,
            'materias_cond6'   => $materias_cond6,
        ],
        'gmail'             => $gmail,
        'ya_inscripto'      => $yaInscriptas,
        'anio_inscripcion'  => $anioActual,
        'resumen' => [
            'total_cond3' => $totalCond3,
            'inscriptas'  => $inscriptasCond3,
            'pendientes'  => $totalCond3 - $inscriptasCond3,
            'total_cond5' => count($materias_cond5),
            'total_cond6' => count($materias_cond6),
        ]
    ]);

} catch (Throwable $e) {
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al consultar previas.',
        'detalle' => $e->getMessage()
    ]);
}
