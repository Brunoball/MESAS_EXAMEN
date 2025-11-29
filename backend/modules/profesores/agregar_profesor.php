<?php
// backend/modules/profesores/agregar_profesor.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Solo JSON
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Payload inválido'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $docente    = isset($body['docente'])  ? trim($body['docente']) : '';
    $id_cargo   = isset($body['id_cargo']) ? (int)$body['id_cargo'] : 0;
    $bloques_no = (isset($body['bloques_no']) && is_array($body['bloques_no'])) ? $body['bloques_no'] : [];

    // Validar campos obligatorios
    if ($docente === '' || $id_cargo <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan campos obligatorios (docente, id_cargo).'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Normalizamos espacios y a mayúsculas
    $docente = mb_strtoupper(preg_replace('/\s+/', ' ', $docente));

    // Normalizador y validadores
    $isDate = function($d) {
        if ($d === null) return true;
        return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$d);
    };

    // Limpiamos bloques: máx 4, trim, nulls, de-duplicado
    $clean = [];
    foreach ($bloques_no as $b) {
        $id_turno = (isset($b['id_turno']) && $b['id_turno'] !== '' && $b['id_turno'] !== null) ? (int)$b['id_turno'] : null;
        $fecha    = isset($b['fecha']) ? trim((string)$b['fecha']) : null;
        if ($fecha === '') $fecha = null;
        // ignorar vacíos totales
        if ($id_turno === null && $fecha === null) continue;

        // validar formato de fecha si viene
        if (!$isDate($fecha)) {
            http_response_code(400);
            echo json_encode(['exito' => false, 'mensaje' => 'Bloque NO con fecha inválida (use YYYY-MM-DD).'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $clean[] = ['id_turno' => $id_turno, 'fecha' => $fecha];
        if (count($clean) >= 4) break;
    }

    // De-duplicado (id_turno, fecha)
    $seen = [];
    $uniq = [];
    foreach ($clean as $b) {
        $key = ($b['id_turno'] === null ? 'NULL' : (string)$b['id_turno']) . '|' . ($b['fecha'] === null ? 'NULL' : $b['fecha']);
        if (!isset($seen[$key])) {
            $seen[$key] = true;
            $uniq[] = $b;
        }
    }

    // Validar que exista a lo sumo UN "NUNCA en turno" (id_turno != null y fecha == null)
    $countNunca = 0;
    foreach ($uniq as $b) {
        if ($b['id_turno'] !== null && $b['fecha'] === null) $countNunca++;
    }
    if ($countNunca > 1) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Solo puede existir un bloque "NUNCA en ese turno".'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Comenzamos transacción
    $pdo->beginTransaction();

    // Insert en docentes
    $sql = "
        INSERT INTO docentes
            (docente, id_cargo, activo, fecha_carga)
        VALUES
            (:docente, :id_cargo, 1, CURDATE())
    ";
    $st = $pdo->prepare($sql);
    $st->execute([
        ':docente'  => $docente,
        ':id_cargo' => $id_cargo
    ]);

    $id_docente = (int)$pdo->lastInsertId();

    // Insert de bloques (si hay)
    if (!empty($uniq)) {
        $ins = $pdo->prepare("
            INSERT INTO docentes_bloques_no (id_docente, id_turno, fecha)
            VALUES (:id_docente, :id_turno, :fecha)
        ");

        foreach ($uniq as $b) {
            $id_turno_b = $b['id_turno'];
            $fecha_b    = $b['fecha'];

            // Validar que el turno exista (si viene)
            if ($id_turno_b !== null) {
                $chk = $pdo->prepare("SELECT 1 FROM turnos WHERE id_turno = ?");
                $chk->execute([$id_turno_b]);
                if (!$chk->fetchColumn()) {
                    // si el turno no existe, degradamos a día completo si hay fecha, o lo descartamos si tampoco hay fecha
                    if ($fecha_b === null) continue; // quedaría vacío total, lo omitimos
                    $id_turno_b = null;
                }
            }

            $ins->execute([
                ':id_docente' => $id_docente,
                ':id_turno'   => $id_turno_b,  // puede ser NULL
                ':fecha'      => $fecha_b,     // puede ser NULL
            ]);
        }
    }

    $pdo->commit();

    echo json_encode([
        'exito'      => true,
        'mensaje'    => 'Docente creado exitosamente',
        'id_docente' => $id_docente,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al agregar docente: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
