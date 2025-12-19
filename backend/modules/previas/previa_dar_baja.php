<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
  if (!($pdo instanceof PDO)) {
    throw new RuntimeException('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $raw = file_get_contents('php://input');
  $data = json_decode($raw ?: '[]', true);

  $id     = isset($data['id_previa']) ? (int)$data['id_previa'] : 0;
  $fecha  = isset($data['fecha_baja']) ? trim((string)$data['fecha_baja']) : '';
  $motivo = isset($data['motivo_baja']) ? trim((string)$data['motivo_baja']) : '';

  if ($id <= 0) {
    throw new Exception('ID inválido');
  }

  if ($fecha === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    throw new Exception('Fecha inválida (formato YYYY-MM-DD)');
  }

  if (mb_strlen($motivo) < 3) {
    throw new Exception('El motivo de la baja es obligatorio (mínimo 3 caracteres)');
  }

  // ✅ Dar de baja + SIEMPRE inscripcion = 0
  // - Si ya era 0, queda igual
  // - Si era 1, pasa a 0
  $stmt = $pdo->prepare("
    UPDATE previas
    SET activo = 0,
        inscripcion = 0,
        fecha_baja = :fecha,
        motivo_baja = :motivo
    WHERE id_previa = :id
    LIMIT 1
  ");

  $stmt->execute([
    ':fecha'  => $fecha,
    ':motivo' => $motivo,
    ':id'     => $id,
  ]);

  if ($stmt->rowCount() <= 0) {
    throw new Exception('No se pudo dar de baja (ya estaba de baja o no existe)');
  }

  echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => $e->getMessage(),
  ], JSON_UNESCAPED_UNICODE);
}
