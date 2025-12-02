<?php
// backend/modules/mesas/mesa_grupo_agregar_numero.php
// -----------------------------------------------------------------------------
// Agrega un numero_mesa a un grupo existente y, si la operación es exitosa,
// elimina ese numero_mesa de `mesas_no_agrupadas`.
//
// NUEVO 2025:
//   También admite crear una mesa NUEVA a partir de una PREVIA que todavía no
//   tiene mesa, y agregarla al grupo.
//
// Entradas posibles (POST JSON):
//   1) Caso clásico (mesa ya existe y está en no_agrupadas):
//      {
//        "id_grupo": 12,
//        "numero_mesa": 345,
//        "fecha_objetivo": "YYYY-MM-DD" | null
//      }
//
//   2) Caso nuevo (previa sin mesa):
//      {
//        "id_grupo": 12,
//        "id_previa": 789,
//        "fecha_objetivo": "YYYY-MM-DD" | null
//      }
//      - Se crea una mesa nueva para esa previa con:
//          * numero_mesa = MAX(numero_mesa) + 1
//          * prioridad = 0
//          * id_catedra / id_docente tomados de `catedras`
//          * fecha_mesa / id_turno copiados del grupo (o de una de sus mesas)
//        y luego se agrega ese numero_mesa recién creado al grupo.
//
// Salida:
//   { exito:true, data:{ id_grupo } }
// -----------------------------------------------------------------------------

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

function respond_json(bool $ok, $payload = null, int $status = 200): void {
    http_response_code($status);
    echo json_encode(
        $ok
            ? ['exito' => true, 'data' => $payload]
            : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond_json(false, 'Método no permitido.', 405);
    }
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        respond_json(false, 'Conexión PDO no disponible.', 500);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input') ?: '';
    $in  = json_decode($raw, true);
    if (!is_array($in)) {
        respond_json(false, 'Body JSON inválido.', 400);
    }

    $id_grupo    = isset($in['id_grupo']) ? (int)$in['id_grupo'] : 0;
    $numero_mesa = isset($in['numero_mesa']) ? (int)$in['numero_mesa'] : 0;
    $id_previa   = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;
    // fecha_objetivo queda solo por compatibilidad, pero ya no se usa para bloquear
    $fecha_obj   = isset($in['fecha_objetivo']) ? trim((string)$in['fecha_objetivo']) : '';

    if ($id_grupo <= 0) {
        respond_json(false, 'id_grupo inválido.', 400);
    }
    // Debe venir al menos numero_mesa o id_previa
    if ($numero_mesa <= 0 && $id_previa <= 0) {
        respond_json(false, 'Debe indicarse numero_mesa o id_previa.', 400);
    }

    // -----------------------------------------------------------------
    // 1) Verificar grupo
    // -----------------------------------------------------------------
    $stG = $pdo->prepare("SELECT * FROM mesas_grupos WHERE id_mesa_grupos = ?");
    $stG->execute([$id_grupo]);
    $grupo = $stG->fetch(PDO::FETCH_ASSOC);
    if (!$grupo) {
        respond_json(false, 'Grupo no encontrado.', 404);
    }

    // -----------------------------------------------------------------
    // 2) Si NO viene numero_mesa pero sí id_previa, creamos UNA MESA NUEVA
    //    para esa previa y tomamos su numero_mesa para seguir el flujo
    //    normal de "agregar numero_mesa al grupo".
    // -----------------------------------------------------------------
    if ($numero_mesa <= 0 && $id_previa > 0) {
        // 2.1) Verificar que la previa exista
        $stPrev = $pdo->prepare("
            SELECT id_previa, id_materia, materia_id_curso, materia_id_division
            FROM previas
            WHERE id_previa = ?
            LIMIT 1
        ");
        $stPrev->execute([$id_previa]);
        $previa = $stPrev->fetch(PDO::FETCH_ASSOC);
        if (!$previa) {
            respond_json(false, 'Previa no encontrada.', 404);
        }

        // 2.2) Verificar que esa previa NO tenga ya una mesa asignada
        $stPrevMesa = $pdo->prepare("SELECT numero_mesa FROM mesas WHERE id_previa = ? LIMIT 1");
        $stPrevMesa->execute([$id_previa]);
        $yaTieneMesa = $stPrevMesa->fetchColumn();
        if ($yaTieneMesa) {
            respond_json(false, 'La previa ya tiene una mesa asignada.', 409);
        }

        $idMateria   = (int)$previa['id_materia'];
        $idCursoPrev = (int)$previa['materia_id_curso'];
        $idDivPrev   = (int)$previa['materia_id_division'];

        // 2.3) Buscar cátedra y docente para esa materia/curso/división
        $stCat = $pdo->prepare("
            SELECT id_catedra, id_docente
            FROM catedras
            WHERE id_materia = ?
              AND id_curso   = ?
              AND id_division = ?
            LIMIT 1
        ");
        $stCat->execute([$idMateria, $idCursoPrev, $idDivPrev]);
        $cat = $stCat->fetch(PDO::FETCH_ASSOC);
        if (!$cat) {
            respond_json(false, 'No se encontró cátedra para la previa (materia/curso/división).', 400);
        }
        $idCatedraNuevo = (int)$cat['id_catedra'];
        $idDocenteNuevo = isset($cat['id_docente']) ? (int)$cat['id_docente'] : null;

        // 2.4) Determinar fecha_mesa / id_turno a partir del grupo
        $fechaGrupo   = $grupo['fecha_mesa'] ?? null;
        $idTurnoGrupo = isset($grupo['id_turno']) ? (int)$grupo['id_turno'] : null;

        // Si el grupo no tiene fecha/turno, intentamos tomarlo de alguna de sus mesas
        if (empty($fechaGrupo) || !$idTurnoGrupo) {
            $numsGrupo = [];
            foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $c) {
                $v = (int)($grupo[$c] ?? 0);
                if ($v > 0) {
                    $numsGrupo[] = $v;
                }
            }
            if ($numsGrupo) {
                $ph = implode(',', array_fill(0, count($numsGrupo), '?'));
                $sqlProg = "
                    SELECT fecha_mesa, id_turno
                    FROM mesas
                    WHERE numero_mesa IN ($ph)
                      AND fecha_mesa IS NOT NULL
                      AND id_turno IS NOT NULL
                    ORDER BY fecha_mesa ASC
                    LIMIT 1
                ";
                $stProg = $pdo->prepare($sqlProg);
                $stProg->execute($numsGrupo);
                $prog = $stProg->fetch(PDO::FETCH_ASSOC);
                if ($prog) {
                    $fechaGrupo   = $prog['fecha_mesa'];
                    $idTurnoGrupo = (int)$prog['id_turno'];
                }
            }
        }

        if (empty($fechaGrupo) || !$idTurnoGrupo) {
            respond_json(false, 'El grupo no tiene programación (fecha/turno) definida.', 400);
        }

        // 2.5) Obtener un nuevo numero_mesa = MAX(numero_mesa) + 1
        $stMax = $pdo->query("SELECT COALESCE(MAX(numero_mesa), 0) AS max_num FROM mesas");
        $rowMax = $stMax->fetch(PDO::FETCH_ASSOC);
        $nuevoNumeroMesa = ((int)($rowMax['max_num'] ?? 0)) + 1;

        // 2.6) Insertar la nueva mesa para esta previa
        $sqlIns = "
            INSERT INTO mesas
                (numero_mesa, prioridad, id_catedra, id_previa, id_docente, fecha_mesa, id_turno)
            VALUES
                (:numero_mesa, :prioridad, :id_catedra, :id_previa, :id_docente, :fecha_mesa, :id_turno)
        ";
        $stIns = $pdo->prepare($sqlIns);
        $stIns->execute([
            ':numero_mesa' => $nuevoNumeroMesa,
            ':prioridad'   => 0,
            ':id_catedra'  => $idCatedraNuevo,
            ':id_previa'   => $id_previa,
            ':id_docente'  => $idDocenteNuevo,
            ':fecha_mesa'  => $fechaGrupo,
            ':id_turno'    => $idTurnoGrupo,
        ]);

        // Usamos este numero_mesa recién creado para el flujo estándar
        $numero_mesa = $nuevoNumeroMesa;
    }

    // -----------------------------------------------------------------
    // 3) Verificaciones clásicas con numero_mesa ya definido
    // -----------------------------------------------------------------
    if ($numero_mesa <= 0) {
        respond_json(false, 'numero_mesa inválido luego de procesar la previa.', 400);
    }

    // 3.1) El numero_mesa existe
    $stCheckMesa = $pdo->prepare("SELECT 1 FROM mesas WHERE numero_mesa = ? LIMIT 1");
    $stCheckMesa->execute([$numero_mesa]);
    if (!$stCheckMesa->fetchColumn()) {
        respond_json(false, 'numero_mesa inexistente.', 404);
    }

    // 3.2) No esté ya dentro del mismo grupo
    foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $c) {
        if ((int)($grupo[$c] ?? 0) === $numero_mesa) {
            respond_json(false, 'El número ya pertenece a este grupo.', 409);
        }
    }

    // 🔴 IMPORTANTE:
    // La antigua "Regla PRIORIDAD-1" fue ELIMINADA para permitir agrupar libremente.

    // -----------------------------------------------------------------
    // 4) Transacción: asegurar slot libre y remover de no_agrupadas
    // -----------------------------------------------------------------
    $pdo->beginTransaction();

    // Bloqueo del grupo para evitar carreras
    $stGLock = $pdo->prepare("SELECT * FROM mesas_grupos WHERE id_mesa_grupos = ? FOR UPDATE");
    $stGLock->execute([$id_grupo]);
    $grupoLock = $stGLock->fetch(PDO::FETCH_ASSOC);
    if (!$grupoLock) {
        $pdo->rollBack();
        respond_json(false, 'Grupo no encontrado (lock).', 404);
    }

    // Re-chequeo de duplicado dentro del grupo ya bloqueado
    foreach (['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'] as $c) {
        if ((int)($grupoLock[$c] ?? 0) === $numero_mesa) {
            $pdo->rollBack();
            respond_json(false, 'El número ya pertenece a este grupo.', 409);
        }
    }

    // Buscar posición libre
    $slots    = ['numero_mesa_1', 'numero_mesa_2', 'numero_mesa_3', 'numero_mesa_4'];
    $colLibre = null;
    foreach ($slots as $col) {
        $val = (int)($grupoLock[$col] ?? 0);
        if ($val === 0) {
            $colLibre = $col;
            break;
        }
    }
    if (!$colLibre) {
        $pdo->rollBack();
        respond_json(false, 'El grupo ya tiene 4 números.', 400);
    }

    // Asignar en el grupo
    $sqlUpd = "UPDATE mesas_grupos SET $colLibre = ? WHERE id_mesa_grupos = ?";
    $stU    = $pdo->prepare($sqlUpd);
    $stU->execute([$numero_mesa, $id_grupo]);

    // Eliminar de mesas_no_agrupadas (si no existe ahí, el DELETE simplemente no hace nada)
    $stDel = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?");
    $stDel->execute([$numero_mesa]);

    $pdo->commit();

    respond_json(true, ['id_grupo' => $id_grupo]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[mesa_grupo_agregar_numero] ' . $e->getMessage());
    respond_json(false, 'Error: ' . $e->getMessage(), 500);
}
