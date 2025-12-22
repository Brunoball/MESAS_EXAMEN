<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

function respond(int $code, array $payload): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

function is_valid_date_ymd(string $s): bool {
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
  [$y, $m, $d] = array_map('intval', explode('-', $s));
  return checkdate($m, $d, $y);
}

try {
  if (!($pdo instanceof PDO)) {
    throw new RuntimeException('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $raw  = file_get_contents('php://input');
  $data = json_decode($raw ?: '[]', true);
  if (!is_array($data)) $data = [];

  $id = isset($data['id_previa']) ? (int)$data['id_previa'] : 0;
  if ($id <= 0) {
    respond(400, ['exito' => false, 'mensaje' => 'ID inválido']);
  }

  // ✅ Nuevo: tipo_motivo
  $tipo = strtoupper(trim((string)($data['tipo_motivo'] ?? '')));

  // ✅ Compatibilidad: si no viene tipo_motivo, tal vez mandan motivo_baja directo
  $motivo_baja_in = trim((string)($data['motivo_baja'] ?? ''));
  $motivo_otro    = trim((string)($data['motivo_otro'] ?? ''));
  $fecha_baja_in  = trim((string)($data['fecha_baja'] ?? '')); // YYYY-MM-DD

  $motivo_final = '';
  $fecha_final  = '';

  // Si NO viene tipo_motivo, inferimos por motivo_baja
  if ($tipo === '') {
    $mb = mb_strtoupper($motivo_baja_in);

    if ($mb === 'APROBÓ' || $mb === 'APROBO') {
      $tipo = 'APROBO_DIA';
    } elseif ($mb === 'PASE A OTRO COLEGIO') {
      $tipo = 'PASE_OTRO_COLEGIO';
    } elseif ($mb !== '') {
      $tipo = 'OTRO';
      $motivo_otro = $motivo_baja_in; // lo tratamos como texto libre
    }
  }

  // ✅ Lógica EXACTA que pediste
  if ($tipo === 'APROBO_DIA') {
    // motivo = "APROBÓ"
    $motivo_final = 'APROBÓ';

    if ($fecha_baja_in === '' || !is_valid_date_ymd($fecha_baja_in)) {
      respond(400, ['exito' => false, 'mensaje' => 'Falta o es inválida la fecha para APROBÓ EL DÍA']);
    }
    $fecha_final = $fecha_baja_in;

  } elseif ($tipo === 'PASE_OTRO_COLEGIO') {
    $motivo_final = 'PASE A OTRO COLEGIO';
    $fecha_final  = date('Y-m-d'); // hoy

  } elseif ($tipo === 'OTRO') {
    $txt = $motivo_otro !== '' ? $motivo_otro : $motivo_baja_in;
    $txt = trim((string)$txt);

    if (mb_strlen($txt) < 1) {
      respond(400, ['exito' => false, 'mensaje' => 'El motivo OTRO es obligatorio']);
    }

    if (mb_strlen($txt) > 255) {
      $txt = mb_substr($txt, 0, 255);
    }

    $motivo_final = mb_strtoupper($txt);
    $fecha_final  = date('Y-m-d'); // hoy

  } else {
    // Si sigue vacío / raro, devolvemos detalle para debug
    respond(400, [
      'exito' => false,
      'mensaje' => 'tipo_motivo inválido',
      'debug' => [
        'tipo_motivo' => $tipo,
        'motivo_baja' => $motivo_baja_in,
        'fecha_baja'  => $fecha_baja_in,
      ]
    ]);
  }

  // defensivo
  if (mb_strlen($motivo_final) > 255) {
    $motivo_final = mb_substr($motivo_final, 0, 255);
  }

  $stmt = $pdo->prepare("
    UPDATE previas
    SET activo = 0,
        inscripcion = 0,
        fecha_baja = :fecha_baja,
        motivo_baja = :motivo
    WHERE id_previa = :id
    LIMIT 1
  ");

  $stmt->execute([
    ':fecha_baja' => $fecha_final, // DATE
    ':motivo'     => $motivo_final,
    ':id'         => $id,
  ]);

  if ($stmt->rowCount() <= 0) {
    respond(409, ['exito' => false, 'mensaje' => 'No se pudo dar de baja (ya estaba de baja o no existe)']);
  }

  respond(200, [
    'exito' => true,
    'motivo_guardado' => $motivo_final,
    'fecha_baja' => $fecha_final,
  ]);

} catch (Throwable $e) {
  respond(500, [
    'exito' => false,
    'mensaje' => $e->getMessage(),
  ]);
}
