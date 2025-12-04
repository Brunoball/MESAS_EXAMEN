<?php
// backend/modules/mesas/mesas_listar_grupos_incompletos.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE);

require_once __DIR__ . '/../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
    http_response_code($status);
    echo json_encode(
        $ok
            ? ['exito' => true, 'data' => $payload]
            : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(false, 'Método no permitido', 405);
    }

    // Podés seguir mandando fecha_mesa e id_turno desde el front,
    // pero acá ya NO se filtra por esos campos: se devuelven
    // TODOS los grupos incompletos.
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    // Solo se parsean por si en el futuro querés usarlos de nuevo
    $fecha = isset($input['fecha_mesa']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$input['fecha_mesa'])
        ? $input['fecha_mesa']
        : null;
    $id_turno = isset($input['id_turno']) ? (int)$input['id_turno'] : null;

    // Trae TODOS los grupos con al menos un slot libre (algún numero_mesa = 0)
    $sql = "
        SELECT
            mg.id_mesa_grupos AS id_grupo,
            mg.numero_mesa_1,
            mg.numero_mesa_2,
            mg.numero_mesa_3,
            mg.numero_mesa_4,
            mg.fecha_mesa,
            mg.id_turno
        FROM mesas_grupos mg
        WHERE
            (mg.numero_mesa_1 = 0)
            OR (mg.numero_mesa_2 = 0)
            OR (mg.numero_mesa_3 = 0)
            OR (mg.numero_mesa_4 = 0)
        ORDER BY
            mg.fecha_mesa,
            mg.id_turno,
            mg.id_mesa_grupos
    ";

    $st = $pdo->prepare($sql);
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    respond(true, $rows);
} catch (Throwable $e) {
    respond(false, 'Error al listar grupos incompletos: ' . $e->getMessage(), 500);
}
