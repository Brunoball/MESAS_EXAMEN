<?php
// backend/modules/profesores/eliminar_profesor.php
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
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Payload inválido']);
        exit;
    }

    $id = isset($body['id_profesor']) ? (int)$body['id_profesor'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'ID de profesor inválido']);
        exit;
    }

    // Verificar existencia del docente
    $st = $pdo->prepare("SELECT 1 FROM docentes WHERE id_docente = :id");
    $st->execute([':id' => $id]);
    if (!$st->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'Profesor no encontrado']);
        exit;
    }

    $pdo->beginTransaction();

    try {
        $mesasDocenteNull    = 0;
        $mesasCatedraNull    = 0;
        $catedrasNull        = 0;

        // 1) Poner en NULL las mesas donde el docente está asignado directamente
        //    mesas.id_docente -> NULL
        $updMesasDoc = $pdo->prepare("UPDATE mesas SET id_docente = NULL WHERE id_docente = :id");
        $updMesasDoc->execute([':id' => $id]);
        $mesasDocenteNull = $updMesasDoc->rowCount();

        // 2) Obtener cátedras del docente (para limpiar mesas.id_catedra)
        $getCatedras = $pdo->prepare("SELECT id_catedra FROM catedras WHERE id_docente = :id");
        $getCatedras->execute([':id' => $id]);
        $catedrasIds = $getCatedras->fetchAll(PDO::FETCH_COLUMN);

        if (!empty($catedrasIds)) {
            // 2.a) Poner en NULL las mesas que apuntan a esas cátedras
            //      mesas.id_catedra -> NULL
            $placeholders = implode(',', array_fill(0, count($catedrasIds), '?'));
            $updMesasCat = $pdo->prepare("UPDATE mesas SET id_catedra = NULL WHERE id_catedra IN ($placeholders)");
            $updMesasCat->execute($catedrasIds);
            $mesasCatedraNull = $updMesasCat->rowCount();
        }

        // 3) Poner en NULL las cátedras del docente
        //    catedras.id_docente -> NULL  (requiere que la columna permita NULL)
        $updCatedras = $pdo->prepare("UPDATE catedras SET id_docente = NULL WHERE id_docente = :id");
        $updCatedras->execute([':id' => $id]);
        $catedrasNull = $updCatedras->rowCount();

        // 4) Eliminar definitivamente el docente
        $delDoc = $pdo->prepare("DELETE FROM docentes WHERE id_docente = :id");
        $delDoc->execute([':id' => $id]);

        $pdo->commit();

        $detalles = [];
        $detalles[] = "$mesasDocenteNull mesa(s) con id_docente puestas en NULL";
        $detalles[] = "$mesasCatedraNull mesa(s) con id_catedra puestas en NULL";
        $detalles[] = "$catedrasNull cátedra(s) con id_docente puestas en NULL";

        echo json_encode([
            'exito' => true,
            'mensaje' => 'Profesor eliminado. Referencias limpiadas a NULL.',
            'detalles' => $detalles
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error al eliminar profesor: ' . $e->getMessage()
    ]);
}
