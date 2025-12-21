<?php
// backend/modules/previas/obtener_previas_baja.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.motivo_baja,
            p.fecha_baja
        FROM previas p
        WHERE p.activo = 0
        ORDER BY p.fecha_baja DESC, p.alumno ASC
    ";

    $stmt = $pdo->query($sql);
    $previas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'exito' => true,
        'previas' => $previas
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al obtener previas dadas de baja: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
