<?php
// backend/modules/previas/actualizar_previa.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);

    $id_previa = (int)($in['id_previa'] ?? 0);
    if ($id_previa <= 0) {
        throw new InvalidArgumentException('id_previa inválido');
    }

    // ===== Campos principales =====
    $dni = isset($in['dni']) ? preg_replace('/\D+/', '', $in['dni']) : '';
    $alumno = isset($in['alumno']) ? trim($in['alumno']) : '';

    // Curso cursando (puede ser EGRESADO = 8)
    $cursando_id_curso = isset($in['cursando_id_curso'])
        ? (int)$in['cursando_id_curso']
        : 0;

    // División cursando (puede ser NULL si curso=8)
    $cursando_id_division_raw = $in['cursando_id_division'] ?? null;
    $cursando_id_division = ($cursando_id_division_raw === '' || $cursando_id_division_raw === null)
        ? null
        : (int)$cursando_id_division_raw;

    // Datos de materia
    $id_materia          = (int)($in['id_materia'] ?? 0);
    $materia_id_curso    = (int)($in['materia_id_curso'] ?? 0);
    $materia_id_division = (int)($in['materia_id_division'] ?? 0);

    // Condición / año / inscripción / fecha
    $id_condicion = (int)($in['id_condicion'] ?? 0);
    $anio         = (int)($in['anio'] ?? date('Y'));
    $inscripcion  = (int)($in['inscripcion'] ?? 0);
    $fecha_carga  = (isset($in['fecha_carga']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['fecha_carga']))
        ? $in['fecha_carga']
        : date('Y-m-d');

    // ===== Validaciones =====
    if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
        throw new InvalidArgumentException('DNI inválido');
    }
    if ($alumno === '') {
        throw new InvalidArgumentException('El nombre del alumno es obligatorio');
    }

    // Curso cursando
    if ($cursando_id_curso <= 0) {
        throw new InvalidArgumentException('cursando_id_curso es obligatorio');
    }

    // Si NO es egresado (8), la división es obligatoria
    if ($cursando_id_curso !== 8) {
        if ($cursando_id_division === null || $cursando_id_division <= 0) {
            throw new InvalidArgumentException('cursando_id_division es obligatorio para no egresados');
        }
    } else {
        // EGRESADO → forzamos NULL para que no rompa la FK
        $cursando_id_division = null;
    }

    // Materia y demás
    if ($id_materia <= 0) {
        throw new InvalidArgumentException('id_materia es obligatorio');
    }
    if ($materia_id_curso <= 0) {
        throw new InvalidArgumentException('materia_id_curso es obligatorio');
    }
    if ($materia_id_division <= 0) {
        throw new InvalidArgumentException('materia_id_division es obligatorio');
    }
    if ($id_condicion <= 0) {
        throw new InvalidArgumentException('id_condicion es obligatorio');
    }

    // ===== UPDATE =====
    $sql = "UPDATE previas
            SET dni                 = :dni,
                alumno              = :alumno,
                cursando_id_curso   = :c_curso,
                cursando_id_division= :c_div,
                id_materia          = :id_materia,
                materia_id_curso    = :m_curso,
                materia_id_division = :m_div,
                id_condicion        = :id_cond,
                inscripcion         = :insc,
                anio                = :anio,
                fecha_carga         = :fecha
            WHERE id_previa = :id_previa
            LIMIT 1";

    $st = $pdo->prepare($sql);
    $st->execute([
        ':dni'        => $dni,
        ':alumno'     => $alumno,
        ':c_curso'    => $cursando_id_curso,
        // Si es null, PDO lo manda como NULL (la FK lo acepta)
        ':c_div'      => $cursando_id_division,
        ':id_materia' => $id_materia,
        ':m_curso'    => $materia_id_curso,
        ':m_div'      => $materia_id_division,
        ':id_cond'    => $id_condicion,
        ':insc'       => $inscripcion ? 1 : 0,
        ':anio'       => $anio,
        ':fecha'      => $fecha_carga,
        ':id_previa'  => $id_previa,
    ]);

    // Devolver la fila actualizada (simple)
    $q = $pdo->prepare("SELECT * FROM previas WHERE id_previa = :id LIMIT 1");
    $q->execute([':id' => $id_previa]);
    $fila = $q->fetch(PDO::FETCH_ASSOC);

    if (!$fila) {
        echo json_encode([
            'exito'   => true,
            'previa'  => null,
            'mensaje' => 'Actualizado, pero no se pudo recargar la fila',
        ]);
        exit;
    }

    $fila += [
        'cursando_curso_nombre'    => $fila['cursando_curso_nombre']    ?? '',
        'cursando_division_nombre' => $fila['cursando_division_nombre'] ?? '',
        'materia_curso_nombre'     => $fila['materia_curso_nombre']     ?? '',
        'materia_division_nombre'  => $fila['materia_division_nombre']  ?? '',
        'materia_nombre'           => $fila['materia_nombre']           ?? '',
        'condicion_nombre'         => $fila['condicion_nombre']         ?? '',
    ];

    echo json_encode(['exito' => true, 'previa' => $fila]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => $e->getMessage()]);
}
