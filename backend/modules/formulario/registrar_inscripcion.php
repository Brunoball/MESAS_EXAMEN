<?php
// backend/modules/formulario/registrar_inscripcion.php
// Marca en previas la columna inscripcion=1 para las materias seleccionadas (por DNI)
// CORRECCIÓN: Ahora recibe materias como array de objetos con curso_id y division_id

header('Content-Type: application/json; charset=utf-8');

// Siempre 200 (sin 4xx), devolvemos { exito:false, mensaje, detalle? } cuando haya problemas
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
    exit;
}

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true);

$dni      = isset($in['dni']) ? preg_replace('/\D+/', '', $in['dni']) : '';
$materias = isset($in['materias']) && is_array($in['materias']) ? $in['materias'] : [];

if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
    echo json_encode(['exito' => false, 'mensaje' => 'DNI inválido']);
    exit;
}

// CORRECCIÓN CRÍTICA: Validar nueva estructura de materias
if (!count($materias)) {
    echo json_encode(['exito' => false, 'mensaje' => 'No se enviaron materias a inscribir']);
    exit;
}

// Validar que todas las materias tengan la estructura correcta
foreach ($materias as $materia) {
    if (!isset($materia['id_materia']) || !isset($materia['curso_id']) || !isset($materia['division_id'])) {
        echo json_encode(['exito' => false, 'mensaje' => 'Estructura de materias inválida']);
        exit;
    }
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

try {
    if (!($pdo instanceof PDO)) {
        echo json_encode(['exito' => false, 'mensaje' => 'Conexión PDO no inicializada']);
        exit;
    }

    // Config PDO
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

    $anioActual = (int)date('Y');

    // Transacción
    $pdo->beginTransaction();

    // CORRECCIÓN CRÍTICA: Verificar cada materia específica con curso_id y division_id
    $materiasValidas = [];
    $materiasFaltantes = [];
    
    foreach ($materias as $materia) {
        $id_materia = (int)$materia['id_materia'];
        $curso_id = (int)$materia['curso_id'];
        $division_id = (int)$materia['division_id'];
        
        $sqlCheck = "
            SELECT 
                p.id_materia,
                COALESCE(p.inscripcion,0) AS inscripcion
            FROM previas AS p
            WHERE p.dni = ?
              AND p.id_condicion = 3
              AND p.id_materia = ?
              AND p.materia_id_curso = ?
              AND p.materia_id_division = ?
        ";
        $stChk = $pdo->prepare($sqlCheck);
        $stChk->execute([$dni, $id_materia, $curso_id, $division_id]);
        $row = $stChk->fetch();
        
        if ($row) {
            $materiasValidas[] = [
                'id_materia' => $id_materia,
                'curso_id' => $curso_id,
                'division_id' => $division_id,
                'inscripcion' => (int)$row['inscripcion']
            ];
        } else {
            $materiasFaltantes[] = $id_materia;
        }
    }

    if (count($materiasFaltantes) > 0) {
        $pdo->rollBack();
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Algunas materias no corresponden a previas (condición 3) para ese DNI.',
            'materias_faltantes' => array_values($materiasFaltantes)
        ]);
        exit;
    }

    // Verificar cuántas ya estaban inscriptas
    $yaMarcadas = array_sum(array_map(fn($m) => $m['inscripcion'] === 1 ? 1 : 0, $materiasValidas));

    if ($yaMarcadas === count($materiasValidas)) {
        // Todas ya estaban marcadas como inscriptas
        $pdo->rollBack();
        echo json_encode([
            'exito'            => false,
            'mensaje'          => 'Este alumno ya fue inscripto en las materias seleccionadas.',
            'ya_inscripto'     => true,
            'anio_inscripcion' => $anioActual
        ]);
        exit;
    }

    // CORRECCIÓN CRÍTICA: Actualizar cada materia específica con curso_id y division_id
    $marcadas = 0;
    foreach ($materiasValidas as $materia) {
        // Solo actualizar si no está ya inscripta
        if ($materia['inscripcion'] === 0) {
            $sqlUpdate = "
                UPDATE previas
                SET inscripcion = 1
                WHERE dni = ?
                  AND id_condicion = 3
                  AND id_materia = ?
                  AND materia_id_curso = ?
                  AND materia_id_division = ?
                  AND COALESCE(inscripcion,0) = 0
            ";
            $stUpd = $pdo->prepare($sqlUpdate);
            $stUpd->execute([$dni, $materia['id_materia'], $materia['curso_id'], $materia['division_id']]);
            $marcadas += $stUpd->rowCount();
        }
    }

    $pdo->commit();

    echo json_encode([
        'exito'      => true,
        'mensaje'    => 'Inscripción registrada correctamente.',
        'insertados' => $marcadas,
        'marcadas'   => $marcadas,
        'anio'       => $anioActual
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al registrar la inscripción.',
        'detalle' => $e->getMessage()
    ]);
}