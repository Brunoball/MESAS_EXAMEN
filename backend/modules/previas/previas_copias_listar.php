<?php
// backend/modules/previas/previas_copias_listar.php
// Lista corridas (snapshots) agrupadas por snapshot_run_id

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php'; // $pdo

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    throw new RuntimeException('No hay conexión PDO');
  }

  $sql = "
    SELECT
      snapshot_run_id,
      COUNT(*) AS cantidad,
      MIN(fecha_carga) AS fecha_accion
    FROM previas_inscriptos_snapshot
    GROUP BY snapshot_run_id
    ORDER BY fecha_accion DESC
  ";

  $st = $pdo->query($sql);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  echo json_encode([
    'exito' => true,
    'copias' => $rows
  ]);
} catch (Throwable $e) {
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error listando copias: ' . $e->getMessage()
  ]);
}
