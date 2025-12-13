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
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(false, 'Método no permitido', 405);
    }

    // Podés seguir mandando fecha_mesa e id_turno desde el front,
    // pero acá ya NO se filtra por esos campos: se devuelven
    // TODOS los grupos incompletos "reales".
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $fecha    = isset($input['fecha_mesa']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$input['fecha_mesa'])
        ? $input['fecha_mesa']
        : null;
    $id_turno = isset($input['id_turno']) ? (int)$input['id_turno'] : null;

    /**
     * LÓGICA NUEVA:
     *  - Un grupo es "incompleto" si tiene algún numero_mesa_X = 0.
     *  - PERO lo consideramos "lleno" (no se puede mover nada ahí) si ya
     *    tiene muchas previas dentro de sus mesas.
     *
     *  Regla práctica:
     *    - Si el total de filas en `mesas` asociadas a los números de ese
     *      grupo es >= 4, el grupo se considera COMPLETO y NO se devuelve.
     *
     *  Esto cubre:
     *    - Caso 7° (n° 46): tiene ~10 filas en `mesas` → queda fuera.
     *    - Caso 3° técnico (n° 41 con DIBUJO / ED TEC / TALLER / etc.):
     *      tiene 4 o más filas → queda fuera.
     *
     *  Los grupos normales con 1 o 2 mesas y pocas filas siguen apareciendo.
     */

    $sql = "
        SELECT
            mg.id_mesa_grupos AS id_grupo,
            mg.numero_mesa_1,
            mg.numero_mesa_2,
            mg.numero_mesa_3,
            mg.numero_mesa_4,
            mg.fecha_mesa,
            mg.id_turno,
            COUNT(m.id_mesa) AS total_filas_mesas
        FROM mesas_grupos mg
        LEFT JOIN mesas m
            ON m.numero_mesa IN (
                mg.numero_mesa_1,
                mg.numero_mesa_2,
                mg.numero_mesa_3,
                mg.numero_mesa_4
            )
        GROUP BY
            mg.id_mesa_grupos,
            mg.numero_mesa_1,
            mg.numero_mesa_2,
            mg.numero_mesa_3,
            mg.numero_mesa_4,
            mg.fecha_mesa,
            mg.id_turno
        HAVING
            -- Debe tener al menos un slot libre (número 0)
            (
                mg.numero_mesa_1 = 0
                OR mg.numero_mesa_2 = 0
                OR mg.numero_mesa_3 = 0
                OR mg.numero_mesa_4 = 0
            )
            -- Y NO debe estar ya “lleno” lógicamente
            AND total_filas_mesas < 4
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
