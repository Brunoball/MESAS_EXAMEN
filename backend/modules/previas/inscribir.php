<?php
// backend/modules/previas/inscribir.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Método no permitido'
        ]);
        exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);

    if (!is_array($in)) {
        throw new InvalidArgumentException('JSON de entrada inválido.');
    }

    // Puede venir "ids" (array) o "id_previa" (uno solo) o ambos
    $ids = [];

    if (isset($in['ids']) && is_array($in['ids'])) {
        foreach ($in['ids'] as $val) {
            $id = (int)$val;
            if ($id > 0) {
                $ids[] = $id;
            }
        }
    }

    if (isset($in['id_previa'])) {
        $idUnitario = (int)$in['id_previa'];
        if ($idUnitario > 0 && !in_array($idUnitario, $ids, true)) {
            $ids[] = $idUnitario;
        }
    }

    if (empty($ids)) {
        throw new InvalidArgumentException('No se recibieron previas válidas para inscribir.');
    }

    // Armamos placeholders
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    // Si querés reforzar que solo inscriba condición 3, podés usar:
    // $sql = "UPDATE previas SET inscripcion = 1
    //         WHERE id_previa IN ($placeholders) AND id_condicion = 3";

    $sql = "UPDATE previas SET inscripcion = 1 WHERE id_previa IN ($placeholders)";
    $st  = $pdo->prepare($sql);
    $st->execute($ids);

    echo json_encode(['exito' => true]);
} catch (Throwable $e) {
    http_response_code(200);
    echo json_encode([
        'exito'   => false,
        'mensaje' => $e->getMessage()
    ]);
}
