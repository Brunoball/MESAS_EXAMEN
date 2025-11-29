<?php
// backend/modules/previas/eliminar_registro.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // acepto JSON
    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);
    $id  = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'ID inválido'
        ]);
        exit;
    }

    // ¿existe?
    $stmt = $pdo->prepare("SELECT id_previa FROM previas WHERE id_previa = :id");
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetchColumn()) {
        http_response_code(404);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Registro no encontrado'
        ]);
        exit;
    }

    // eliminar
    $del = $pdo->prepare("DELETE FROM previas WHERE id_previa = :id");
    $del->execute([':id' => $id]);

    echo json_encode(['exito' => true]);

} catch (PDOException $e) {
    // Manejo específico de errores de base de datos
    $sqlState   = $e->getCode();          // por ej. '23000'
    $errorInfo  = $e->errorInfo ?? [];
    $driverCode = $errorInfo[1] ?? null;  // por ej. 1451 en MySQL

    // Error de integridad referencial: la previa está usada en mesas
    if ($sqlState === '23000' && (int)$driverCode === 1451) {
        http_response_code(409); // conflicto
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'No se puede eliminar el alumno porque está registrado en una mesa de examen. '
        ]);
    } else {
        // Otros errores de base de datos
        http_response_code(500);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Error al eliminar la previa. Intentalo de nuevo más tarde.'
        ]);
    }

} catch (Throwable $e) {
    // Errores generales de PHP
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Ocurrió un error inesperado al eliminar la previa.'
    ]);
}
