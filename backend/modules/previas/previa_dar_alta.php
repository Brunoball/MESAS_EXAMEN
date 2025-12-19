<?php
// backend/modules/previas/previa_dar_alta.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
  if (!($pdo instanceof PDO)) {
    throw new RuntimeException('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);

  $id_previa  = (int)($data['id_previa'] ?? 0);
  $fecha_alta = trim((string)($data['fecha_alta'] ?? ''));

  if ($id_previa <= 0) {
    throw new InvalidArgumentException('id_previa inválido.');
  }
  if ($fecha_alta === '') {
    throw new InvalidArgumentException('fecha_alta requerida.');
  }

  // Validar formato YYYY-MM-DD (input date)
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_alta)) {
    throw new InvalidArgumentException('fecha_alta inválida. Formato esperado: YYYY-MM-DD');
  }

  // ✅ Reactivar:
  //  - activo = 1
  //  - limpiar baja (fecha_baja / motivo_baja)
  //  - reemplazar fecha_carga por la fecha elegida
  $sql = "UPDATE previas
          SET activo = 1,
              fecha_baja = NULL,
              motivo_baja = NULL,
              fecha_carga = :fecha_carga
          WHERE id_previa = :id_previa
          LIMIT 1";

  $stmt = $pdo->prepare($sql);
  $stmt->execute([
    ':fecha_carga' => $fecha_alta,
    ':id_previa'   => $id_previa,
  ]);

  if ($stmt->rowCount() === 0) {
    throw new RuntimeException('No se pudo dar de alta (id inexistente o sin cambios).');
  }

  echo json_encode(['exito' => true], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error al dar de alta: ' . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
}
