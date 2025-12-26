<?php
// backend/modules/previas/previas_copia_detalle.php
// Devuelve los inscriptos de una corrida snapshot_run_id + nombre de materia (JOIN materias)

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO)

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    throw new RuntimeException('No hay conexión PDO');
  }

  $raw = file_get_contents('php://input');
  $in  = json_decode($raw, true);

  $runId = trim((string)($in['snapshot_run_id'] ?? ''));
  if ($runId === '' || !preg_match('/^[a-f0-9-]{36}$/i', $runId)) {
    throw new RuntimeException('snapshot_run_id inválido');
  }

  // ✅ Traer snapshot + nombre de materia desde materias.materia
  $sql = "
    SELECT
      s.snapshot_id,
      s.snapshot_run_id,
      s.id_previa,
      s.dni,
      s.alumno,

      s.cursando_id_curso,
      s.cursando_id_division,

      s.id_materia,
      COALESCE(m.materia, CONCAT('ID ', s.id_materia)) AS materia_nombre,

      s.materia_id_curso,
      s.materia_id_division,

      s.id_condicion,
      s.inscripcion,
      s.activo,
      s.anio,
      s.fecha_carga,
      s.fecha_baja,
      s.motivo_baja
    FROM previas_inscriptos_snapshot s
    LEFT JOIN materias m
      ON m.id_materia = s.id_materia
    WHERE s.snapshot_run_id = :run
    ORDER BY s.alumno ASC, materia_nombre ASC
  ";

  $st = $pdo->prepare($sql);
  $st->execute([':run' => $runId]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  echo json_encode([
    'exito' => true,
    'rows'  => $rows,
  ]);
} catch (Throwable $e) {
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error obteniendo detalle: ' . $e->getMessage(),
  ]);
}
