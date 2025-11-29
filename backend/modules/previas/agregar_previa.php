<?php
// backend/modules/previas/agregar_previa.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']); exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);

    // ---- Campos desde el payload ----
    $dni = isset($in['dni']) ? preg_replace('/\D+/', '', $in['dni']) : '';

    // Soporte: si vienen apellido/nombre (nuevo front), los componemos "APELLIDO, NOMBRE"
    $apellido = isset($in['apellido']) ? trim($in['apellido']) : '';
    $nombre   = isset($in['nombre']) ? trim($in['nombre']) : '';
    $alumno_in = isset($in['alumno']) ? trim($in['alumno']) : '';

    // Componer si corresponde; prioridad: alumno ya armado (del front), sino apellido/nombre
    if ($alumno_in !== '') {
        $alumno = $alumno_in;
    } else if ($apellido !== '' || $nombre !== '') {
        $alumno = strtoupper($apellido) . (($apellido !== '' && $nombre !== '') ? ', ' : '') . strtoupper($nombre);
    } else {
        $alumno = '';
    }

    // El front asegura que estos sean enteros o null, pero la BD espera int.
    // Usamos (int) para asegurar un 0 si vienen null/vacío (aunque el front valida > 0)
    $cursando_id_curso      = (int)($in['cursando_id_curso'] ?? 0);
    $cursando_id_division   = (int)($in['cursando_id_division'] ?? 0);
    $id_materia             = (int)($in['id_materia'] ?? 0);
    $materia_id_curso       = (int)($in['materia_id_curso'] ?? 0);
    $materia_id_division    = (int)($in['materia_id_division'] ?? 0);
    $id_condicion           = (int)($in['id_condicion'] ?? 0);
    $anio                   = (int)($in['anio'] ?? date('Y'));
    $inscripcion            = (int)($in['inscripcion'] ?? 0);
    $fecha_carga            = isset($in['fecha_carga']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['fecha_carga'])
                              ? $in['fecha_carga'] : date('Y-m-d');

    // ---- Validaciones mínimas ----
    if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
        throw new InvalidArgumentException('DNI inválido');
    }
    if ($alumno === '') {
        throw new InvalidArgumentException('El nombre del alumno es obligatorio');
    }
    // Validaciones de la previa específica (curso/división cursando puede ser 0 si es EGRESADO, pero el front ya lo maneja)
    if ($id_materia <= 0) throw new InvalidArgumentException('id_materia es obligatorio');
    if ($materia_id_curso <= 0) throw new InvalidArgumentException('materia_id_curso es obligatorio');
    if ($materia_id_division <= 0) throw new InvalidArgumentException('materia_id_division es obligatorio');
    if ($id_condicion <= 0) throw new InvalidArgumentException('id_condicion es obligatorio');

    // ---- Insert ----
    $sql = "INSERT INTO previas
            (dni, alumno, cursando_id_curso, cursando_id_division, id_materia,
             materia_id_curso, materia_id_division, id_condicion, inscripcion, anio, fecha_carga)
            VALUES
            (:dni, :alumno, :c_curso, :c_div, :id_materia,
             :m_curso, :m_div, :id_cond, :insc, :anio, :fecha)";
    $st = $pdo->prepare($sql);
    $st->execute([
        ':dni'      => $dni,
        ':alumno'   => $alumno, // <— ya viene "APELLIDO, NOMBRE"
        ':c_curso'  => $cursando_id_curso,
        ':c_div'    => $cursando_id_division,
        ':id_materia'=> $id_materia,
        ':m_curso'  => $materia_id_curso,
        ':m_div'    => $materia_id_division,
        ':id_cond'  => $id_condicion,
        ':insc'     => $inscripcion ? 1 : 0,
        ':anio'     => $anio,
        ':fecha'    => $fecha_carga,
    ]);

    $id = (int)$pdo->lastInsertId();

    // Devolvemos el ID de la nueva previa
    $q = $pdo->prepare("
        SELECT p.*
        FROM previas p
        WHERE p.id_previa = :id
        LIMIT 1
    ");
    $q->execute([':id' => $id]);
    $fila = $q->fetch(PDO::FETCH_ASSOC);

    // Se mantiene la estructura, se elimina la devolución de campos vacíos
    echo json_encode(['exito' => true, 'previa' => $fila]);
} catch (Throwable $e) {
    http_response_code(200);
    echo json_encode(['exito' => false, 'mensaje' => $e->getMessage()]);
}