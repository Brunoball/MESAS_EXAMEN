<?php
// backend/modules/profesores/editar_profesor.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'ID inválido'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Datos básicos
        $sqlP = "
            SELECT
                d.id_docente   AS id_profesor,
                d.docente      AS nombre_completo,
                d.id_cargo,
                c.cargo        AS cargo_nombre,
                d.fecha_carga
            FROM docentes d
            LEFT JOIN cargos  c  ON c.id_cargo  = d.id_cargo
            WHERE d.id_docente = :id
            LIMIT 1
        ";
        $st = $pdo->prepare($sqlP);
        $st->execute([':id' => $id]);
        $prof = $st->fetch(PDO::FETCH_ASSOC);

        if (!$prof) {
            echo json_encode(['exito' => false, 'mensaje' => 'Profesor no encontrado'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Listas
        $sqlC = "SELECT id_cargo, cargo FROM cargos ORDER BY cargo ASC";
        $cargos = $pdo->query($sqlC)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $sqlT = "SELECT id_turno, turno FROM turnos ORDER BY turno ASC";
        $turnos = $pdo->query($sqlT)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // Bloques NO
        $sqlB = "
           SELECT dn.id_no, dn.id_turno, t.turno, dn.fecha
           FROM docentes_bloques_no dn
           LEFT JOIN turnos t ON t.id_turno = dn.id_turno
           WHERE dn.id_docente = :id
           ORDER BY dn.fecha IS NULL DESC, dn.fecha ASC, dn.id_no ASC
        ";
        $stb = $pdo->prepare($sqlB);
        $stb->execute([':id' => $id]);
        $bloques = $stb->fetchAll(PDO::FETCH_ASSOC) ?: [];

        echo json_encode([
            'exito'    => true,
            'profesor' => [
                'id_profesor'      => (int)$prof['id_profesor'],
                'nombre_completo'  => $prof['nombre_completo'],
                'id_cargo'         => isset($prof['id_cargo']) ? (int)$prof['id_cargo'] : null,
                'cargo_nombre'     => $prof['cargo_nombre'] ?? null,
                'fecha_carga'      => $prof['fecha_carga'] ?? null,
                'bloques_no'       => array_map(function($r) {
                    return [
                        'id_no'    => (int)$r['id_no'],
                        'id_turno' => isset($r['id_turno']) ? (int)$r['id_turno'] : null,
                        'turno'    => $r['turno'] ?? null,
                        'fecha'    => $r['fecha'], // puede venir NULL
                    ];
                }, $bloques),
            ],
            'cargos'   => $cargos,
            'turnos'   => $turnos,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $in  = json_decode($raw, true);

        $id_profesor = isset($in['id_profesor']) ? (int)$in['id_profesor'] : 0;
        $apellido    = isset($in['apellido']) ? trim($in['apellido']) : '';
        $nombre      = isset($in['nombre'])   ? trim((string)$in['nombre']) : '';
        $id_cargo    = isset($in['id_cargo']) ? (int)$in['id_cargo'] : 0;

        // SOLO estos campos
        $bloques_no  = isset($in['bloques_no']) && is_array($in['bloques_no']) ? $in['bloques_no'] : [];
        $fecha_carga = array_key_exists('fecha_carga', $in) ? $in['fecha_carga'] : null;

        // Normalizaciones
        $fecha_carga = ($fecha_carga === '' || is_null($fecha_carga)) ? null : $fecha_carga;

        if ($id_profesor <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'ID profesor inválido'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($apellido === '') {
            echo json_encode(['exito' => false, 'mensaje' => 'El apellido es obligatorio'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($id_cargo <= 0) {
            echo json_encode(['exito' => false, 'mensaje' => 'Debe seleccionar un cargo'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $isDate = function($d) {
            if ($d === null) return true; // permitimos NULL para "nunca en ese turno"
            return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
        };
        if (!$isDate($fecha_carga)) {
            echo json_encode(['exito' => false, 'mensaje' => 'Formato de fecha inválido (use YYYY-MM-DD)'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // "APELLIDO, NOMBRE"
        $docente = $apellido;
        if ($nombre !== '') $docente .= ', ' . $nombre;

        // Transacción
        $pdo->beginTransaction();

        // Update base
        $sqlU = "
            UPDATE docentes
               SET docente     = :docente,
                   id_cargo    = :id_cargo,
                   fecha_carga = :fecha_carga
             WHERE id_docente  = :id
        ";
        $st = $pdo->prepare($sqlU);
        $ok = $st->execute([
            ':docente'     => $docente,
            ':id_cargo'    => $id_cargo,
            ':fecha_carga' => $fecha_carga,
            ':id'          => $id_profesor,
        ]);
        if (!$ok) {
            $pdo->rollBack();
            echo json_encode(['exito' => false, 'mensaje' => 'No se pudo actualizar (base)'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Limitar a 4 bloques, validando 3 casos
        $bloques_no = array_slice($bloques_no, 0, 4);

        // Borrar bloques previos del docente
        $del = $pdo->prepare("DELETE FROM docentes_bloques_no WHERE id_docente = ?");
        $del->execute([$id_profesor]);

        if (!empty($bloques_no)) {
            $ins = $pdo->prepare("
                INSERT INTO docentes_bloques_no (id_docente, id_turno, fecha)
                VALUES (:id_docente, :id_turno, :fecha)
            ");

            foreach ($bloques_no as $b) {
                // Normalizar entradas
                $id_turno_b = (isset($b['id_turno']) && $b['id_turno'] !== '' && $b['id_turno'] !== null)
                              ? (int)$b['id_turno'] : null;
                $fecha_b    = isset($b['fecha']) ? trim((string)$b['fecha']) : null;
                if ($fecha_b === '') $fecha_b = null;

                // Si ambos nulos -> ignorar slot vacío
                if ($id_turno_b === null && $fecha_b === null) {
                    continue;
                }

                // Validar fecha (si viene)
                if (!$isDate($fecha_b)) {
                    $pdo->rollBack();
                    echo json_encode(['exito' => false, 'mensaje' => 'Bloque NO con fecha inválida (YYYY-MM-DD)'], JSON_UNESCAPED_UNICODE);
                    exit;
                }

                // Validar turno (si viene)
                if ($id_turno_b !== null) {
                    $chk = $pdo->prepare("SELECT 1 FROM turnos WHERE id_turno = ?");
                    $chk->execute([$id_turno_b]);
                    if (!$chk->fetchColumn()) {
                        $id_turno_b = null; // si no existe, lo degradamos a "día completo" si hay fecha
                    }
                }

                // Casos admitidos:
                // 1) id_turno != null, fecha == null  -> NUNCA en ese turno
                // 2) id_turno == null, fecha != null  -> NO disponible todo ese día
                // 3) id_turno != null, fecha != null  -> NO disponible en ese turno ese día
                $ins->execute([
                    ':id_docente' => $id_profesor,
                    ':id_turno'   => $id_turno_b, // puede ser NULL
                    ':fecha'      => $fecha_b,    // puede ser NULL
                ]);
            }
        }

        $pdo->commit();
        echo json_encode(['exito' => true, 'mensaje' => 'Actualizado'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido'], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
