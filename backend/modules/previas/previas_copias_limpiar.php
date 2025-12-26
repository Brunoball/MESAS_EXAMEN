<?php
// backend/modules/previas/previas_copias_limpiar.php
// Limpia TODAS las copias del historial (snapshot). Responde 200 siempre.

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // $pdo

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    throw new RuntimeException('No hay conexión PDO');
  }

  // Contar antes (opcional)
  $stCount = $pdo->query("SELECT COUNT(*) AS c FROM previas_inscriptos_snapshot");
  $antes = (int)($stCount->fetch(PDO::FETCH_ASSOC)['c'] ?? 0);

  // ⚠️ IMPORTANTE:
  // TRUNCATE en MySQL hace COMMIT implícito => NO usar beginTransaction/commit acá.

  // Si tenés tabla de runs/cabecera, truncala también (dejado opcional)
  // Si NO existe, dejalo comentado.
  // $pdo->exec("TRUNCATE TABLE previas_inscriptos_snapshot_runs");

  // Tabla principal de snapshots
  $pdo->exec("TRUNCATE TABLE previas_inscriptos_snapshot");

  echo json_encode([
    'exito' => true,
    'mensaje' => 'Copias eliminadas',
    'eliminados' => $antes,
  ]);
} catch (Throwable $e) {
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error al eliminar copias: ' . $e->getMessage(),
  ]);
}
