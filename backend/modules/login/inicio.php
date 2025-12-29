<?php
// backend/modules/login/inicio.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO conectado)

// ✅ En login: JAMÁS queremos 500 por credenciales. Solo 500 si realmente se cae todo.
// Si querés ver errores internos:
define('DEBUG_LOGIN', false);

function json_ok(array $payload): void {
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    // mantenemos 200 para no ensuciar consola
    json_ok(['exito' => false, 'mensaje' => 'Método no permitido.']);
  }

  // Acepta JSON o form-data
  $raw  = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) $data = $_POST ?? [];

  $nombre     = isset($data['nombre']) ? trim((string)$data['nombre']) : '';
  $contrasena = isset($data['contrasena']) ? (string)$data['contrasena'] : '';

  if ($nombre === '' || $contrasena === '') {
    // ✅ 200 + exito:false
    json_ok(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
  }

  // ✅ Detectar columnas reales de la tabla usuarios para NO tirar 500 por columnas inexistentes
  $cols = [];
  $stmtCols = $pdo->query("SHOW COLUMNS FROM usuarios");
  foreach ($stmtCols->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $cols[strtolower($r['Field'])] = true;
  }

  // Posibles columnas de "usuario"
  $userFields = [
    'nombre_completo',
    'usuario',
    'nombre',
    'email',
  ];

  $where = [];
  $params = [':nombre' => $nombre];

  foreach ($userFields as $f) {
    if (!empty($cols[$f])) {
      // Ojo: acá usamos el nombre real de columna, respetando mayúsculas si tu DB las tiene.
      // SHOW COLUMNS devuelve el nombre exacto; pero como normalizamos a lower, lo resolvemos así:
      // buscamos el match exacto recorriendo otra vez:
      foreach ($cols as $realLower => $_) {
        if ($realLower === $f) {
          $realName = null;
          // obtener nombre exacto desde SHOW COLUMNS otra vez (rápido y seguro)
          // alternativa: guardarlo al armar $cols (real => lower). Acá lo hago simple:
          // rehacemos un mapping exacto:
        }
      }
      // más simple: usar el nombre en el SQL tal cual ($f) pero en MySQL no es case-sensitive para columnas.
      $where[] = "$f = :nombre";
    }
  }

  if (!$where) {
    // No hay ninguna columna válida para buscar usuario → configuración de DB incorrecta
    // acá sí tiene sentido 500 porque no se puede loguear nadie
    http_response_code(500);
    json_ok([
      'exito' => false,
      'mensaje' => 'Error del servidor.',
      'detalle' => DEBUG_LOGIN ? 'No se encontraron columnas válidas de usuario en la tabla usuarios.' : null,
    ]);
  }

  $sql = "SELECT * FROM usuarios WHERE (" . implode(' OR ', $where) . ") LIMIT 1";
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$usuario) {
    // ✅ 200 + exito:false (NO 500)
    json_ok(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
  }

  // Detectar ID / nombre / rol con tolerancia
  $idUsuario = (int)($usuario['idUsuario'] ?? $usuario['id_usuario'] ?? $usuario['id'] ?? 0);
  $display   = (string)($usuario['Nombre_Completo'] ?? $usuario['nombre_completo'] ?? $usuario['usuario'] ?? $usuario['nombre'] ?? $nombre);
  $rol       = strtolower((string)($usuario['rol'] ?? $usuario['Rol'] ?? 'vista'));

  // Detectar password hash/plano con tolerancia
  $hashFieldCandidates  = ['Hash_Contrasena', 'hash_contrasena', 'password_hash', 'hash', 'pass_hash'];
  $plainFieldCandidates = ['Contrasena', 'contrasena', 'password', 'pass'];

  $hashGuardado = null;
  foreach ($hashFieldCandidates as $c) {
    if (array_key_exists($c, $usuario) && $usuario[$c] !== null && $usuario[$c] !== '') {
      $hashGuardado = (string)$usuario[$c];
      break;
    }
  }

  $passPlano = null;
  foreach ($plainFieldCandidates as $c) {
    if (array_key_exists($c, $usuario) && $usuario[$c] !== null && $usuario[$c] !== '') {
      $passPlano = (string)$usuario[$c];
      break;
    }
  }

  $ok = false;

  // Si hay hash, intentamos verify (si el hash es inválido, no rompe; solo devuelve false)
  if ($hashGuardado !== null) {
    $ok = password_verify($contrasena, $hashGuardado);
  }
  // fallback plano
  if (!$ok && $passPlano !== null) {
    $ok = hash_equals($passPlano, $contrasena);
  }

  if (!$ok) {
    // ✅ 200 + exito:false
    json_ok(['exito' => false, 'mensaje' => 'Credenciales incorrectas.']);
  }

  // ✅ Éxito
  json_ok([
    'exito'   => true,
    'usuario' => [
      'idUsuario'       => $idUsuario,
      'Nombre_Completo' => $display,
      'rol'             => $rol,
    ],
    // 'token' => '...' // si luego sumás JWT
  ]);

} catch (Throwable $e) {
  // Acá sí: error real de servidor (DB caida, sintaxis, etc.)
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error del servidor.',
    'detalle' => DEBUG_LOGIN ? $e->getMessage() : null,
  ], JSON_UNESCAPED_UNICODE);
}
