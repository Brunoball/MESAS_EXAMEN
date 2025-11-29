<?php
// backend/modules/mesas/mesa_actualizar.php
// -----------------------------------------------------------------------------
// Actualiza **fecha_mesa** e **id_turno** de una mesa identificada por
// `numero_mesa` (NO por id_mesa) y, si existe grupo, también la **hora** en
// `mesas_grupos`.
//
// La actualización se hace en:
//   1) tabla `mesas` (todas las filas con ese numero_mesa)
//   2) tabla `mesas_grupos`  (la fila cuyo slot contenga ese numero_mesa)
//   3) tabla `mesas_no_agrupadas` (si existe ese numero, para mantener consistencia)
//
// Entrada (POST JSON o x-www-form-urlencoded):
//   {
//     "numero_mesa": 61,
//     "fecha_mesa": "YYYY-MM-DD",
//     "id_turno": 2,
//     "hora": "HH:MM"   // opcional; si viene vacío se deja en NULL
//   }
// -----------------------------------------------------------------------------

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

function out($ok, $payload = null, int $code = 200): void {
  http_response_code($code);
  echo json_encode(
    $ok ? ['exito' => true, 'data' => $payload]
       : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

/**
 * Valida formato de fecha YYYY-MM-DD
 */
function validar_fecha(string $s): bool {
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
  [$y,$m,$d] = explode('-', $s);
  return checkdate((int)$m,(int)$d,(int)$y);
}

/**
 * Verifica que la fecha sea de lunes a viernes.
 * Devuelve true si es día hábil, false si es sábado o domingo.
 */
function es_dia_habil(string $fecha): bool {
  $dt = DateTime::createFromFormat('Y-m-d', $fecha);
  if (!$dt) return false; // por las dudas
  $dow = (int)$dt->format('N'); // 1 = lunes, ..., 7 = domingo
  return $dow >= 1 && $dow <= 5;
}

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) out(false, 'Conexión PDO no disponible.', 500);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // -------- Parseo de entrada
  $raw = file_get_contents('php://input') ?: '';
  $in  = json_decode($raw, true);
  if (!is_array($in)) $in = $_POST;

  $numero_mesa = isset($in['numero_mesa']) ? (int)$in['numero_mesa'] : 0;
  $fecha_mesa  = isset($in['fecha_mesa']) ? trim((string)$in['fecha_mesa']) : '';
  $id_turno    = isset($in['id_turno']) ? (int)$in['id_turno'] : 0;
  $hora        = isset($in['hora']) ? trim((string)$in['hora']) : '';  // HH:MM

  if ($numero_mesa <= 0) out(false, 'numero_mesa inválido', 400);

  if ($fecha_mesa === '' || !validar_fecha($fecha_mesa)) {
    out(false, 'fecha_mesa debe ser YYYY-MM-DD', 400);
  }

  // 🔒 Bloqueo de fines de semana
  if (!es_dia_habil($fecha_mesa)) {
    out(false, 'No se permiten mesas en sábados ni domingos.', 400);
  }

  if ($id_turno <= 0) out(false, 'id_turno inválido', 400);

  // Validar hora si viene
  if ($hora !== '') {
    // Formato HH:MM (ignoramos segundos)
    if (!preg_match('/^\d{2}:\d{2}$/', $hora)) {
      out(false, 'Hora inválida. Use formato HH:MM', 400);
    }
  } else {
    // Hora vacía => la seteamos en NULL en el grupo / no_agrupadas
    $hora = null;
  }

  // Verificar existencia del numero_mesa en `mesas`
  $stChk = $pdo->prepare("SELECT COUNT(*) FROM mesas WHERE numero_mesa = ?");
  $stChk->execute([$numero_mesa]);
  if ((int)$stChk->fetchColumn() === 0) {
    out(false, 'Mesa no encontrada (numero_mesa inexistente).', 404);
  }

  $pdo->beginTransaction();

  // 1) Actualizar todas las filas de `mesas` con ese numero_mesa
  $stMesas = $pdo->prepare("
    UPDATE mesas
       SET fecha_mesa = :fecha_mesa,
           id_turno   = :id_turno
     WHERE numero_mesa = :numero_mesa
  ");
  $stMesas->execute([
    ':fecha_mesa'  => $fecha_mesa,
    ':id_turno'    => $id_turno,
    ':numero_mesa' => $numero_mesa,
  ]);
  $afectadasMesas = $stMesas->rowCount();

  // 2) Actualizar `mesas_grupos` si el numero está en algún grupo
  $stGrupo = $pdo->prepare("
    SELECT id_mesa_grupos
      FROM mesas_grupos
     WHERE numero_mesa_1 = :n
        OR numero_mesa_2 = :n
        OR numero_mesa_3 = :n
        OR numero_mesa_4 = :n
     LIMIT 1
     FOR UPDATE
  ");
  $stGrupo->execute([':n' => $numero_mesa]);
  $grupo = $stGrupo->fetch(PDO::FETCH_ASSOC);

  $afectadasGrupo = 0;
  if ($grupo) {
    $stUpdG = $pdo->prepare("
      UPDATE mesas_grupos
         SET fecha_mesa = :fecha_mesa,
             id_turno   = :id_turno,
             hora       = :hora
       WHERE id_mesa_grupos = :idg
    ");
    $stUpdG->execute([
      ':fecha_mesa' => $fecha_mesa,
      ':id_turno'   => $id_turno,
      ':hora'       => $hora,
      ':idg'        => (int)$grupo['id_mesa_grupos'],
    ]);
    $afectadasGrupo = $stUpdG->rowCount();
  }

  // 3) Si ese numero estuviera en `mesas_no_agrupadas`, también sincronizamos,
  //    incluyendo la HORA (si la tabla tiene esa columna).
  $stNo = $pdo->prepare("SELECT COUNT(*) FROM mesas_no_agrupadas WHERE numero_mesa = ?");
  $stNo->execute([$numero_mesa]);
  $afectadasNoAgr = 0;
  if ((int)$stNo->fetchColumn() > 0) {
    $stUpdNo = $pdo->prepare("
      UPDATE mesas_no_agrupadas
         SET fecha_mesa = :fecha_mesa,
             id_turno   = :id_turno,
             hora       = :hora
       WHERE numero_mesa = :numero_mesa
    ");
    $stUpdNo->execute([
      ':fecha_mesa'  => $fecha_mesa,
      ':id_turno'    => $id_turno,
      ':hora'        => $hora,
      ':numero_mesa' => $numero_mesa,
    ]);
    $afectadasNoAgr = $stUpdNo->rowCount();
  }

  $pdo->commit();

  out(true, [
    'numero_mesa' => $numero_mesa,
    'fecha_mesa'  => $fecha_mesa,
    'id_turno'    => $id_turno,
    'hora'        => $hora,
    'afectadas'   => [
      'mesas'         => $afectadasMesas,
      'grupos'        => $afectadasGrupo,
      'no_agrupadas'  => $afectadasNoAgr,
    ],
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  error_log('[mesa_actualizar] ' . $e->getMessage());
  out(false, 'Error interno: ' . $e->getMessage(), 500);
}
