<?php
// backend/modules/mesas/reoptimizar_mesas_completar.php
// -----------------------------------------------------------------------------
// PASADA EXTRA DE REOPTIMIZACIÓN
//
// Objetivo: una vez que ya existen mesas, grupos y no_agrupadas,
// intentamos que las mesas que quedaron sueltas (singles en mesas_no_agrupadas)
// se sumen como 4° número de mesa a algún grupo compatible.
//
// AHORA:
//  1) Primero intenta sumar singles a grupos del MISMO día/turno (como antes).
//  2) Luego, para las que siguen sueltas, permite CAMBIARLES fecha/turno
//     para meterlas como 2º/3º/4º número en un grupo de la misma área,
//     siempre que:
//
//     - no repita DNIs en el grupo,
//     - respete docentes_bloques_no,
//     - ningún alumno rinda dos mesas en ese mismo slot,
//     - NO ROMPA CORRELATIVIDAD:
//         * Para cada alumno (dni) y cada materias.correlativa (>0),
//           la mesa base (menor materia_id_curso) debe quedar en un
//           slot ANTERIOR a las avanzadas.
//         * Se impide mover una mesa a un slot que violaría eso.
//
//  3) NUEVO: si aún quedan singles sin lugar, intenta usar grupos de 4 mesas
//     como "donantes": saca una mesa de ese grupo de 4 y la combina con la
//     mesa single para formar un grupo nuevo (2 mesas), dejando el original
//     con 3, siempre respetando TODAS las restricciones.
//
// NO se crean mesas nuevas, solo se reubican mesas y se crean nuevos grupos.
// -----------------------------------------------------------------------------


declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

// ---------------- Utils ----------------
function respondJSON(bool $ok, $payload = null, int $status = 200): void {
    if (ob_get_length()) { @ob_clean(); }
    http_response_code($status);
    echo json_encode(
        $ok ? ['exito' => true,  'data' => $payload]
           : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function bad_request(string $m): void {
    respondJSON(false, $m, 400);
}

function validarFecha(?string $s): bool {
    if (!$s) return false;
    $d = DateTime::createFromFormat('Y-m-d', $s);
    return $d && $d->format('Y-m-d') === $s;
}

/**
 * Carga docentes_bloques_no:
 *   - docNoTurn[id_docente][id_turno] = true
 *   - docNoDay[id_docente][fecha][id_turno] = true  (si turno NULL => bloquea ambos turnos ese día)
 */
function cargarBloquesDocentes(PDO $pdo): array {
    $docNoTurn = [];
    $docNoDay  = [];

    $rs = $pdo->query("SELECT id_docente, id_turno, fecha FROM docentes_bloques_no");
    if ($rs) {
        foreach ($rs->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $idd = (int)$r['id_docente'];
            $t   = isset($r['id_turno']) && $r['id_turno'] !== null ? (int)$r['id_turno'] : null;
            $f   = $r['fecha'] ?? null;

            if ($t !== null && ($f === null || $f === '')) {
                // Bloqueo por turno (todos los días)
                $docNoTurn[$idd][$t] = true;
                continue;
            }

            if ($t === null && $f !== null && $f !== '') {
                // Bloqueo por día completo (ambos turnos)
                $docNoDay[$idd][$f][1] = true;
                $docNoDay[$idd][$f][2] = true;
                continue;
            }

            if ($t !== null && $f !== null && $f !== '') {
                // Bloqueo por día + turno
                $docNoDay[$idd][$f][$t] = true;
            }
        }
    }

    return [$docNoTurn, $docNoDay];
}

/**
 * slotProhibido(id_docente, fecha, turno)
 */
function buildSlotProhibido(array $docNoTurn, array $docNoDay): callable {
    return function (int $id_docente, string $fecha, int $turno) use ($docNoTurn, $docNoDay): bool {
        if (isset($docNoTurn[$id_docente][$turno])) return true;
        if (isset($docNoDay[$id_docente][$fecha][$turno])) return true;
        return false;
    };
}

/**
 * Devuelve:
 *   - dnisPorMesa[numero_mesa] = array de DNIs (string)
 *   - areaPorMesa[numero_mesa] = id_area (int)
 *   - docsPorMesa[numero_mesa] = array de id_docente (int)
 */
function cargarInfoMesas(PDO $pdo): array {
    $sql = "
        SELECT
            m.numero_mesa,
            p.dni,
            mat.id_area,
            m.id_docente
        FROM mesas m
        INNER JOIN previas  p  ON p.id_previa   = m.id_previa
        INNER JOIN catedras c  ON c.id_catedra  = m.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c.id_materia
        GROUP BY m.numero_mesa, p.dni, mat.id_area, m.id_docente
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $dnisPorMesa = [];
    $areaPorMesa = [];
    $docsPorMesa = [];

    foreach ($rows as $r) {
        $nm   = (int)$r['numero_mesa'];
        $dni  = (string)$r['dni'];
        $area = (int)$r['id_area'];
        $doc  = (int)$r['id_docente'];

        if (!isset($dnisPorMesa[$nm])) $dnisPorMesa[$nm] = [];
        if (!in_array($dni, $dnisPorMesa[$nm], true)) {
            $dnisPorMesa[$nm][] = $dni;
        }

        $areaPorMesa[$nm] = $area;

        if (!isset($docsPorMesa[$nm])) $docsPorMesa[$nm] = [];
        if ($doc > 0 && !in_array($doc, $docsPorMesa[$nm], true)) {
            $docsPorMesa[$nm][] = $doc;
        }
    }

    return [$dnisPorMesa, $areaPorMesa, $docsPorMesa];
}

/**
 * Devuelve:
 *   - grupos[idx] = [
 *       'id'      => id_mesa_grupos,
 *       'fecha'   => fecha_mesa,
 *       'turno'   => id_turno,
 *       'area'    => id_area,
 *       'mesas'   => [n1, n2, ...],
 *     ]
 */
function cargarGrupos(PDO $pdo): array {
    $sql = "
        SELECT
            g.id_mesa_grupos,
            g.fecha_mesa,
            g.id_turno,
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
            mat.id_area
        FROM mesas_grupos g
        INNER JOIN mesas     m  ON m.numero_mesa = 
            CASE
                WHEN g.numero_mesa_1 > 0 THEN g.numero_mesa_1
                WHEN g.numero_mesa_2 > 0 THEN g.numero_mesa_2
                WHEN g.numero_mesa_3 > 0 THEN g.numero_mesa_3
                ELSE g.numero_mesa_4
            END
        INNER JOIN catedras  c  ON c.id_catedra  = m.id_catedra
        INNER JOIN materias  mat ON mat.id_materia = c.id_materia
        GROUP BY
            g.id_mesa_grupos,
            g.fecha_mesa,
            g.id_turno,
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
            mat.id_area
        ORDER BY g.fecha_mesa, g.id_turno, mat.id_area, g.id_mesa_grupos
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $grupos = [];
    foreach ($rows as $r) {
        $mesas = [];
        foreach (['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'] as $col) {
            $v = (int)$r[$col];
            if ($v > 0) $mesas[] = $v;
        }
        if (!$mesas) continue;

        $grupos[] = [
            'id'    => (int)$r['id_mesa_grupos'],
            'fecha' => $r['fecha_mesa'],
            'turno' => (int)$r['id_turno'],
            'area'  => (int)$r['id_area'],
            'mesas' => $mesas,
        ];
    }
    return $grupos;
}

/**
 * Devuelve:
 *   - singles = [
 *       [
 *         'numero_mesa' => n,
 *         'fecha'       => f,
 *         'turno'       => t,
 *         'area'        => a
 *       ],
 *       ...
 *     ]
 */
function cargarSingles(PDO $pdo): array {
    $sql = "
        SELECT
            l.numero_mesa,
            l.fecha_mesa,
            l.id_turno,
            mat.id_area
        FROM mesas_no_agrupadas l
        INNER JOIN mesas m      ON m.numero_mesa = l.numero_mesa
        INNER JOIN catedras c   ON c.id_catedra  = m.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c.id_materia
        ORDER BY l.fecha_mesa, l.id_turno, mat.id_area, l.numero_mesa
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'numero_mesa' => (int)$r['numero_mesa'],
            'fecha'       => $r['fecha_mesa'],
            'turno'       => (int)$r['id_turno'],
            'area'        => (int)$r['id_area'],
        ];
    }
    return $out;
}

/**
 * Saca la unión de DNIs de una lista de numero_mesa usando dnisPorMesa.
 */
function unionDNIsMesas(array $dnisPorMesa, array $mesas): array {
    $u = [];
    foreach ($mesas as $nm) {
        foreach ($dnisPorMesa[$nm] ?? [] as $dni) {
            $u[$dni] = true;
        }
    }
    return array_keys($u);
}

/**
 * Construye:
 *  - slotIndex["YYYY-MM-DD|turno"] = idx (0..N-1) ordenado cronológicamente
 *  - horarioAlumno[dni]["YYYY-MM-DD|turno"] = true
 */
function buildSlotsYHorario(PDO $pdo): array {
    // slots ordenados
    $rowsSlots = $pdo->query("
        SELECT DISTINCT fecha_mesa, id_turno
        FROM mesas
        WHERE fecha_mesa IS NOT NULL AND id_turno IS NOT NULL
        ORDER BY fecha_mesa, id_turno
    ")->fetchAll(PDO::FETCH_ASSOC);

    $slotIndex = [];
    $idx = 0;
    foreach ($rowsSlots as $r) {
        $key = $r['fecha_mesa'] . '|' . (int)$r['id_turno'];
        if (!isset($slotIndex[$key])) {
            $slotIndex[$key] = $idx++;
        }
    }

    // horario por alumno
    $horarioAlumno = [];
    $rowsHA = $pdo->query("
        SELECT p.dni, m.fecha_mesa, m.id_turno
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rowsHA as $r) {
        $dni = (string)$r['dni'];
        $key = $r['fecha_mesa'] . '|' . (int)$r['id_turno'];
        $horarioAlumno[$dni][$key] = true;
    }

    return [$slotIndex, $horarioAlumno];
}

/**
 * Construye restricciones de correlatividad por numero_mesa.
 *
 * Devuelve:
 *   restricciones[numero_mesa][] = [
 *       'tipo'    => 'base' | 'adv',
 *       'idx_otro'=> idx slot de la otra mesa
 *   ]
 *
 * 'base'  => esta mesa debe ir ANTES que idx_otro
 * 'adv'   => esta mesa debe ir DESPUÉS de idx_otro
 */
function buildCorrelRestricciones(PDO $pdo, array $slotIndex): array {
    $sql = "
        SELECT
            m.numero_mesa,
            p.dni,
            p.materia_id_curso,
            mat.correlativa,
            m.fecha_mesa,
            m.id_turno
        FROM mesas m
        INNER JOIN previas p    ON p.id_previa   = m.id_previa
        INNER JOIN materias mat ON mat.id_materia = p.id_materia
        WHERE p.inscripcion = 1
          AND mat.correlativa IS NOT NULL
          AND mat.correlativa <> 0
          AND m.fecha_mesa IS NOT NULL
          AND m.id_turno   IS NOT NULL
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $porClave = []; // clave = "dni|correlativa"
    foreach ($rows as $r) {
        $keySlot = $r['fecha_mesa'] . '|' . (int)$r['id_turno'];
        $idxSlot = $slotIndex[$keySlot] ?? -1;

        $clave = $r['dni'] . '|' . $r['correlativa'];
        $porClave[$clave][] = [
            'numero_mesa' => (int)$r['numero_mesa'],
            'curso'       => (int)$r['materia_id_curso'],
            'idx_slot'    => $idxSlot,
        ];
    }

    $restricciones = [];

    foreach ($porClave as $clave => $lst) {
        if (count($lst) < 2) continue;

        // Ordenamos por curso (materia_id_curso)
        usort($lst, fn($a,$b) => $a['curso'] <=> $b['curso']);

        $minCurso = $lst[0]['curso'];

        $bases = array_filter($lst, fn($x) => $x['curso'] === $minCurso);
        $avanz = array_filter($lst, fn($x) => $x['curso'] >  $minCurso);

        if (!$avanz) continue;

        foreach ($bases as $b) {
            foreach ($avanz as $a) {
                if ($b['idx_slot'] < 0 || $a['idx_slot'] < 0) continue;

                $nmBase = $b['numero_mesa'];
                $nmAdv  = $a['numero_mesa'];

                // base -> debe ir antes de la avanzada
                $restricciones[$nmBase][] = [
                    'tipo'     => 'base',
                    'idx_otro' => $a['idx_slot'],
                ];
                // avanzada -> debe ir después de la base
                $restricciones[$nmAdv][] = [
                    'tipo'     => 'adv',
                    'idx_otro' => $b['idx_slot'],
                ];
            }
        }
    }

    return $restricciones;
}

/**
 * Verifica si mover la mesa $nm al slot (fecha, turno) respeta correlatividad
 * según las restricciones precalculadas.
 */
function respetaCorrelMovimiento(
    int $nm,
    string $fecha,
    int $turno,
    array $slotIndex,
    array $restricciones
): bool {
    if (!isset($restricciones[$nm])) return true;

    $key = $fecha . '|' . $turno;
    if (!isset($slotIndex[$key])) {
        // slot no conocido, no lo usamos (en la práctica no debería pasar)
        return true;
    }
    $idxNuevo = $slotIndex[$key];

    foreach ($restricciones[$nm] as $r) {
        $idxOtro = $r['idx_otro'];
        if ($idxOtro < 0) continue;

        if ($r['tipo'] === 'base') {
            // base debe ir antes que la avanzada
            if ($idxNuevo >= $idxOtro) return false;
        } else { // 'adv'
            // avanzada debe ir después de la base
            if ($idxNuevo <= $idxOtro) return false;
        }
    }

    return true;
}

// ====================== MAIN ======================
if (!isset($pdo) || !$pdo instanceof PDO) {
    bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respondJSON(false, 'Método no permitido', 405);
    }

    $input = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($input)) $input = [];

    $dryRun      = !empty($input['dry_run']);
    $filtroFecha = $input['fecha_mesa'] ?? null;
    $filtroTurno = $input['id_turno']   ?? null;

    if ($filtroFecha !== null && !validarFecha((string)$filtroFecha)) {
        bad_request("Parámetro 'fecha_mesa' inválido (YYYY-MM-DD).");
    }
    if ($filtroTurno !== null && !in_array((int)$filtroTurno, [1,2], true)) {
        bad_request("Parámetro 'id_turno' inválido (1|2). Debe ser 1 (mañana) o 2 (tarde).");
    }

    // Bloqueos docentes
    [$docNoTurn, $docNoDay] = cargarBloquesDocentes($pdo);
    $slotProhibido = buildSlotProhibido($docNoTurn, $docNoDay);

    // Info de mesas
    [$dnisPorMesa, $areaPorMesa, $docsPorMesa] = cargarInfoMesas($pdo);

    // Slots y horario alumno
    [$slotIndex, $horarioAlumno] = buildSlotsYHorario($pdo);

    // Restricciones de correlatividad
    $correlRestricciones = buildCorrelRestricciones($pdo, $slotIndex);

    // Grupos actuales
    $grupos = cargarGrupos($pdo);

    // Singles actuales
    $singles = cargarSingles($pdo);

    // Filtrar por fecha/turno si hace falta (para esta ejecución)
    if ($filtroFecha !== null || $filtroTurno !== null) {
        $gruposFil = [];
        foreach ($grupos as $g) {
            if ($filtroFecha !== null && $g['fecha'] !== $filtroFecha) continue;
            if ($filtroTurno !== null && $g['turno'] !== (int)$filtroTurno) continue;
            $gruposFil[] = $g;
        }
        $grupos = $gruposFil;

        $singlesFil = [];
        foreach ($singles as $s) {
            if ($filtroFecha !== null && $s['fecha'] !== $filtroFecha) continue;
            if ($filtroTurno !== null && $s['turno'] !== (int)$filtroTurno) continue;
            $singlesFil[] = $s;
        }
        $singles = $singlesFil;
    }

    // Indexar grupos por (fecha|turno|area) y por área
    $gruposPorSlot = [];
    $gruposPorArea = [];

    foreach ($grupos as $idx => $g) {
        $key = $g['fecha'] . '|' . $g['turno'] . '|' . $g['area'];
        if (!isset($gruposPorSlot[$key])) $gruposPorSlot[$key] = [];
        $gruposPorSlot[$key][] = $idx;

        if (!isset($gruposPorArea[$g['area']])) $gruposPorArea[$g['area']] = [];
        $gruposPorArea[$g['area']][] = $idx;
    }

    // Singles por slot (para la pasada 1: mismo día/turno)
    $singlesPorSlot = [];
    foreach ($singles as $i => $s) {
        $key = $s['fecha'] . '|' . $s['turno'] . '|' . $s['area'];
        if (!isset($singlesPorSlot[$key])) $singlesPorSlot[$key] = [];
        $singlesPorSlot[$key][] = $i;
    }

    // Preparar SQL para actualizar mesas_grupos, borrar de mesas_no_agrupadas y mover fecha/turno en mesas
    $stGetGrupo = $pdo->prepare("
        SELECT numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
        FROM mesas_grupos
        WHERE id_mesa_grupos = :id
        LIMIT 1
    ");

    $stUpdGrupo = $pdo->prepare("
        UPDATE mesas_grupos
        SET numero_mesa_1 = :n1,
            numero_mesa_2 = :n2,
            numero_mesa_3 = :n3,
            numero_mesa_4 = :n4
        WHERE id_mesa_grupos = :id
    ");

    $stDelNoAgr = $pdo->prepare("
        DELETE FROM mesas_no_agrupadas
        WHERE numero_mesa = :n AND fecha_mesa = :f AND id_turno = :t
    ");

    $stUpdMesaSlot = $pdo->prepare("
        UPDATE mesas
        SET fecha_mesa = :f, id_turno = :t
        WHERE numero_mesa = :n
    ");

    // NUEVO: insertar un grupo 2+ (single + donante)
    $stInsGrupo = $pdo->prepare("
        INSERT INTO mesas_grupos
            (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4, fecha_mesa, id_turno)
        VALUES
            (:n1, :n2, :n3, :n4, :f, :t)
    ");

    if (!$dryRun) {
        $pdo->beginTransaction();
    }

    $movimientos = [];  // logs de movimientos
    $pendientes  = [];  // singles que no se pudieron agrupar en la pasada 1

    // -----------------------------------------------------------------
    // PASADA 1: solo dentro del MISMO slot (fecha + turno + área)
    // -----------------------------------------------------------------
    foreach ($singlesPorSlot as $slotKey => $idxSingles) {
        if (empty($gruposPorSlot[$slotKey])) {
            // No hay grupos en este slot: se van a intentar en pasada 2
            [$fecha, $turno, $area] = explode('|', $slotKey);
            $turno = (int)$turno;
            $area  = (int)$area;

            foreach ($idxSingles as $iSingle) {
                $s = $singles[$iSingle];
                $nmSingle = $s['numero_mesa'];
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'sin_grupos_en_slot',
                ];
            }
            continue;
        }

        [$fecha, $turno, $area] = explode('|', $slotKey);
        $turno = (int)$turno;
        $area  = (int)$area;

        $idxGruposSlot = $gruposPorSlot[$slotKey];

        // Para evitar agregar 2 veces el mismo single si se mapea raro
        $procesadosSingles = [];

        foreach ($idxSingles as $iSingle) {
            if (isset($procesadosSingles[$iSingle])) continue;
            $procesadosSingles[$iSingle] = true;

            $s = $singles[$iSingle];
            $nmSingle = $s['numero_mesa'];

            // Confirmar área por las dudas
            $areaMesa = $areaPorMesa[$nmSingle] ?? null;
            if ($areaMesa === null || $areaMesa !== $area) {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $areaMesa ?? -1,
                    'motivo'      => 'area_inconsistente',
                ];
                continue;
            }

            $dnisSingle = $dnisPorMesa[$nmSingle] ?? [];
            $docsSingle = $docsPorMesa[$nmSingle] ?? [];

            // Buscamos un grupo compatible EN ESTE slot
            $grupoElegidoIdx = null;

            foreach ($idxGruposSlot as $idxG) {
                $g = $grupos[$idxG];

                // Grupo debe tener 1, 2 o 3 mesas (nunca 4)
                $mesasG = $g['mesas'];
                $sizeG  = count($mesasG);
                if ($sizeG >= 4) continue;

                // Mismo área garantizado por index, pero validamos igual
                if ((int)$g['area'] !== $area) continue;

                // DNI: no puede haber repetición dentro del grupo
                $dnisGrupo = unionDNIsMesas($dnisPorMesa, $mesasG);
                if (!empty(array_intersect($dnisGrupo, $dnisSingle))) continue;

                // Docentes: ninguno de los docentes de la mesa single
                // puede estar bloqueado en este slot
                $bloqueado = false;
                foreach ($docsSingle as $idDoc) {
                    if ($slotProhibido((int)$idDoc, $fecha, $turno)) {
                        $bloqueado = true;
                        break;
                    }
                }
                if ($bloqueado) continue;

                // Este slot es el mismo en el que ya está la mesa, por lo que
                // correlatividad no se ve afectada (no cambiamos de día/turno).

                // Grupo compatible encontrado
                $grupoElegidoIdx = $idxG;
                break;
            }

            if ($grupoElegidoIdx === null) {
                // Se probará reubicar en otro día/turno (pasada 2)
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'sin_grupo_compatible_en_slot',
                ];
                continue;
            }

            // Tenemos un grupo elegido EN EL MISMO SLOT
            $g = $grupos[$grupoElegidoIdx];

            // Leemos la fila real de mesas_grupos para evitar pisar algo raro
            $stGetGrupo->execute([':id' => $g['id']]);
            $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
            if (!$actual) {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'grupo_desaparecido',
                ];
                continue;
            }

            $n1 = (int)$actual['numero_mesa_1'];
            $n2 = (int)$actual['numero_mesa_2'];
            $n3 = (int)$actual['numero_mesa_3'];
            $n4 = (int)$actual['numero_mesa_4'];

            // Si ya está dentro
            if (in_array($nmSingle, [$n1,$n2,$n3,$n4], true)) {
                if (!$dryRun) {
                    $stDelNoAgr->execute([
                        ':n' => $nmSingle,
                        ':f' => $fecha,
                        ':t' => $turno,
                    ]);
                }

                $movimientos[] = [
                    'numero_mesa'   => $nmSingle,
                    'fecha'         => $fecha,
                    'turno'         => $turno,
                    'area'          => $area,
                    'grupo_id'      => $g['id'],
                    'accion'        => 'ya_estaba_en_grupo_borrar_single',
                ];
                continue;
            }

            // Buscamos la primera posición libre
            $nNuevo1 = $n1;
            $nNuevo2 = $n2;
            $nNuevo3 = $n3;
            $nNuevo4 = $n4;

            if     ($nNuevo1 === 0) $nNuevo1 = $nmSingle;
            elseif ($nNuevo2 === 0) $nNuevo2 = $nmSingle;
            elseif ($nNuevo3 === 0) $nNuevo3 = $nmSingle;
            elseif ($nNuevo4 === 0) $nNuevo4 = $nmSingle;
            else {
                // No hay lugar, lo dejamos pendiente para la pasada 2
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'grupo_sin_posiciones_libres_en_slot',
                ];
                continue;
            }

            if ($dryRun) {
                $movimientos[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'grupo_id'    => $g['id'],
                    'antes'       => [$n1,$n2,$n3,$n4],
                    'despues'     => [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4],
                    'accion'      => 'simular_agregar_a_grupo_mismo_slot',
                ];
            } else {
                // Actualizamos la fila de mesas_grupos
                $stUpdGrupo->execute([
                    ':n1' => $nNuevo1,
                    ':n2' => $nNuevo2,
                    ':n3' => $nNuevo3,
                    ':n4' => $nNuevo4,
                    ':id' => $g['id'],
                ]);

                // Borramos la entrada de mesas_no_agrupadas en este slot
                $stDelNoAgr->execute([
                    ':n' => $nmSingle,
                    ':f' => $fecha,
                    ':t' => $turno,
                ]);

                $movimientos[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'grupo_id'    => $g['id'],
                    'antes'       => [$n1,$n2,$n3,$n4],
                    'despues'     => [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4],
                    'accion'      => 'agregado_a_grupo_mismo_slot',
                ];

                // Actualizamos en memoria el grupo ($grupos) para futuros singles en este slot
                $grupos[$grupoElegidoIdx]['mesas'][] = $nmSingle;
            }
        }
    }

    // -----------------------------------------------------------------
    // PASADA 2: reubicar singles pendientes a OTROS slots (fecha/turno)
    //           respetando DNIs, bloques de docentes, horario y
    //           CORRELATIVIDAD.
    // -----------------------------------------------------------------
    if (!empty($pendientes)) {
        foreach ($pendientes as $nmSingle => $info) {
            $fechaOriginal = $info['fecha'];
            $turnoOriginal = (int)$info['turno'];
            $areaMesa      = $areaPorMesa[$nmSingle] ?? null;

            if ($areaMesa === null || $areaMesa <= 0) {
                // no sabemos área, lo dejamos sin lugar
                continue;
            }

            // DNIs y docentes de la mesa
            $dnisSingle = $dnisPorMesa[$nmSingle] ?? [];
            $docsSingle = $docsPorMesa[$nmSingle] ?? [];

            // Todos los grupos de esta área (en cualquier slot)
            $idxGruposArea = $gruposPorArea[$areaMesa] ?? [];
            if (!$idxGruposArea) {
                // no hay grupos de esa área en todo el calendario
                continue;
            }

            $grupoElegidoIdx = null;
            $fechaDestino = null;
            $turnoDestino = null;
            $antes = null;
            $despues = null;

            // Elegimos grupo con heurística:
            //  - que tenga lugares (<4 mesas)
            //  - que cumpla DNIs, bloqueos, horario y correlatividad
            //  - preferimos grupos con menos mesas, y luego slots más tempranos
            $mejorScore = null;

            foreach ($idxGruposArea as $idxG) {
                $g = $grupos[$idxG];

                $mesasG = $g['mesas'];
                $sizeG  = count($mesasG);
                if ($sizeG >= 4) continue;

                $f = $g['fecha'];
                $t = (int)$g['turno'];

                // DNI: no puede haber repetición dentro del grupo
                $dnisGrupo = unionDNIsMesas($dnisPorMesa, $mesasG);
                if (!empty(array_intersect($dnisGrupo, $dnisSingle))) continue;

                // Bloqueo de docentes en el slot destino
                $bloqueado = false;
                foreach ($docsSingle as $idDoc) {
                    if ($slotProhibido((int)$idDoc, $f, $t)) {
                        $bloqueado = true;
                        break;
                    }
                }
                if ($bloqueado) continue;

                // Horario alumno: ningún alumno puede rendir otra cosa
                // en ese mismo slot (fecha+turno)
                $keySlot = $f . '|' . $t;
                $choqueHorario = false;
                foreach ($dnisSingle as $dni) {
                    if (isset($horarioAlumno[$dni][$keySlot])) {
                        $choqueHorario = true;
                        break;
                    }
                }
                if ($choqueHorario) continue;

                // Correlatividad: checamos que mover nmSingle a (f,t)
                // no rompa el orden base/avanzada
                if (!respetaCorrelMovimiento($nmSingle, $f, $t, $slotIndex, $correlRestricciones)) {
                    continue;
                }

                // Calculamos posición libre simulada
                $stGetGrupo->execute([':id' => $g['id']]);
                $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
                if (!$actual) continue;

                $n1 = (int)$actual['numero_mesa_1'];
                $n2 = (int)$actual['numero_mesa_2'];
                $n3 = (int)$actual['numero_mesa_3'];
                $n4 = (int)$actual['numero_mesa_4'];

                if (in_array($nmSingle, [$n1,$n2,$n3,$n4], true)) {
                    // ya está dentro en ese grupo (raro, pero podría haber basura)
                    // en este caso solo haríamos el movimiento de slot si cambia de día.
                } else {
                    if ($n1 !== 0 && $n2 !== 0 && $n3 !== 0 && $n4 !== 0) {
                        // lleno
                        continue;
                    }
                }

                // Score: preferimos grupos con menos mesas y slots más tempranos
                $slotKey   = $f . '|' . $t;
                $idxSlot   = $slotIndex[$slotKey] ?? 9999;
                $score     = $sizeG * 100 + $idxSlot; // primero tamaño, luego cronología

                if ($mejorScore === null || $score < $mejorScore) {
                    $mejorScore   = $score;
                    $grupoElegidoIdx = $idxG;
                    $fechaDestino = $f;
                    $turnoDestino = $t;
                    $antes = [$n1,$n2,$n3,$n4];

                    // simulamos cómo quedaría
                    $nNuevo1 = $n1;
                    $nNuevo2 = $n2;
                    $nNuevo3 = $n3;
                    $nNuevo4 = $n4;

                    if     ($nNuevo1 === 0) $nNuevo1 = $nmSingle;
                    elseif ($nNuevo2 === 0) $nNuevo2 = $nmSingle;
                    elseif ($nNuevo3 === 0) $nNuevo3 = $nmSingle;
                    elseif ($nNuevo4 === 0) $nNuevo4 = $nmSingle;

                    $despues = [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4];
                }
            }

            if ($grupoElegidoIdx === null || $fechaDestino === null) {
                // no encontró lugar compatible en ningún grupo
                continue;
            }

            // Aplicamos el movimiento
            $g = $grupos[$grupoElegidoIdx];

            if ($dryRun) {
                $movimientos[] = [
                    'numero_mesa'    => $nmSingle,
                    'fecha_origen'   => $fechaOriginal,
                    'turno_origen'   => $turnoOriginal,
                    'fecha_destino'  => $fechaDestino,
                    'turno_destino'  => $turnoDestino,
                    'area'           => $areaMesa,
                    'grupo_id'       => $g['id'],
                    'antes'          => $antes,
                    'despues'        => $despues,
                    'accion'         => 'simular_reubicar_y_agregar_a_grupo_otro_slot',
                ];
            } else {
                // Actualizamos slot de la mesa
                $stUpdMesaSlot->execute([
                    ':f' => $fechaDestino,
                    ':t' => $turnoDestino,
                    ':n' => $nmSingle,
                ]);

                // Actualizamos mesas_grupos
                $stUpdGrupo->execute([
                    ':n1' => $despues[0],
                    ':n2' => $despues[1],
                    ':n3' => $despues[2],
                    ':n4' => $despues[3],
                    ':id' => $g['id'],
                ]);

                // Borramos la entrada de mesas_no_agrupadas en el slot original
                $stDelNoAgr->execute([
                    ':n' => $nmSingle,
                    ':f' => $fechaOriginal,
                    ':t' => $turnoOriginal,
                ]);

                $movimientos[] = [
                    'numero_mesa'    => $nmSingle,
                    'fecha_origen'   => $fechaOriginal,
                    'turno_origen'   => $turnoOriginal,
                    'fecha_destino'  => $fechaDestino,
                    'turno_destino'  => $turnoDestino,
                    'area'           => $areaMesa,
                    'grupo_id'       => $g['id'],
                    'antes'          => $antes,
                    'despues'        => $despues,
                    'accion'         => 'reubicado_y_agregado_a_grupo_otro_slot',
                ];

                // Actualizamos estructuras en memoria:
                $grupos[$grupoElegidoIdx]['mesas'][] = $nmSingle;

                // Actualizamos horarioAlumno
                $keyOrig  = $fechaOriginal . '|' . $turnoOriginal;
                $keyDest  = $fechaDestino  . '|' . $turnoDestino;
                foreach ($dnisSingle as $dni) {
                    unset($horarioAlumno[$dni][$keyOrig]);
                    $horarioAlumno[$dni][$keyDest] = true;
                }
            }

            // Ya no es pendiente
            unset($pendientes[$nmSingle]);
        }
    }

    // -----------------------------------------------------------------
    // PASADA 3 (NUEVA):
    // Usar grupos de 4 como "donantes" para rescatar singles que
    // siguen sin lugar. Tomamos 1 mesa del grupo de 4 y la combinamos
    // con la mesa single en el slot de la single, formando un grupo
    // nuevo de 2 mesas y dejando el original con 3.
    // -----------------------------------------------------------------
    if (!empty($pendientes)) {
        foreach ($pendientes as $nmSingle => $info) {
            $fechaSingle = $info['fecha'];
            $turnoSingle = (int)$info['turno'];
            $areaMesa    = $areaPorMesa[$nmSingle] ?? null;

            if ($areaMesa === null || $areaMesa <= 0) {
                continue;
            }

            $dnisSingle = $dnisPorMesa[$nmSingle] ?? [];
            $slotKeySingle = $fechaSingle . '|' . $turnoSingle;

            // Buscamos grupos de ESTA área con 4 mesas (donantes)
            $idxGruposArea = $gruposPorArea[$areaMesa] ?? [];
            if (!$idxGruposArea) {
                continue;
            }

            $grupoDonIdx    = null;
            $nmDonor        = null;
            $dnisDonorSel   = [];
            $antesGrupo     = null;
            $despuesGrupo   = null;

            foreach ($idxGruposArea as $idxG) {
                $g = $grupos[$idxG];
                $mesasG = $g['mesas'];
                $sizeG  = count($mesasG);

                // Solo usamos grupos con 4 mesas como donantes
                if ($sizeG !== 4) continue;

                foreach ($mesasG as $candMesa) {
                    $dnisDonor = $dnisPorMesa[$candMesa] ?? [];

                    // No pueden compartir alumnos single ↔ donante
                    if (!empty(array_intersect($dnisDonor, $dnisSingle))) {
                        continue;
                    }

                    $docsDonor = $docsPorMesa[$candMesa] ?? [];

                    // Docentes del donante disponibles en el slot de la single
                    $bloqueado = false;
                    foreach ($docsDonor as $idDoc) {
                        if ($slotProhibido((int)$idDoc, $fechaSingle, $turnoSingle)) {
                            $bloqueado = true;
                            break;
                        }
                    }
                    if ($bloqueado) continue;

                    // Horario alumno: los alumnos del donante no pueden
                    // tener otra mesa en ese mismo slot
                    $choque = false;
                    foreach ($dnisDonor as $dni) {
                        if (isset($horarioAlumno[$dni][$slotKeySingle])) {
                            $choque = true;
                            break;
                        }
                    }
                    if ($choque) continue;

                    // Correlatividad al mover el DONANTE al slot de la single
                    if (!respetaCorrelMovimiento($candMesa, $fechaSingle, $turnoSingle, $slotIndex, $correlRestricciones)) {
                        continue;
                    }

                    // Encontramos candidato
                    $grupoDonIdx  = $idxG;
                    $nmDonor      = $candMesa;
                    $dnisDonorSel = $dnisDonor;
                    break 2; // salimos de ambos foreach
                }
            }

            if ($grupoDonIdx === null || $nmDonor === null) {
                // no hubo grupo donante que cumpla
                continue;
            }

            // Leemos la fila real del grupo donante
            $g = $grupos[$grupoDonIdx];

            $stGetGrupo->execute([':id' => $g['id']]);
            $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
            if (!$actual) {
                continue;
            }

            $n1 = (int)$actual['numero_mesa_1'];
            $n2 = (int)$actual['numero_mesa_2'];
            $n3 = (int)$actual['numero_mesa_3'];
            $n4 = (int)$actual['numero_mesa_4'];

            $antesGrupo = [$n1,$n2,$n3,$n4];

            // Sacamos la mesa donante del grupo original (queda en 3)
            if ($n1 === $nmDonor) {
                $n1 = 0;
            } elseif ($n2 === $nmDonor) {
                $n2 = 0;
            } elseif ($n3 === $nmDonor) {
                $n3 = 0;
            } elseif ($n4 === $nmDonor) {
                $n4 = 0;
            } else {
                // Por alguna razón no está en la fila (datos inconsistentes)
                continue;
            }

            $despuesGrupo = [$n1,$n2,$n3,$n4];

            if ($dryRun) {
                $movimientos[] = [
                    'numero_mesa_single'  => $nmSingle,
                    'numero_mesa_donante' => $nmDonor,
                    'fecha_single'        => $fechaSingle,
                    'turno_single'        => $turnoSingle,
                    'grupo_origen_id'     => $g['id'],
                    'antes_grupo'         => $antesGrupo,
                    'despues_grupo'       => $despuesGrupo,
                    'accion'              => 'simular_rearmar_grupo_lleno_con_single',
                ];
            } else {
                // 1) Actualizar grupo original (quitar donante -> 3 mesas)
                $stUpdGrupo->execute([
                    ':n1' => $n1,
                    ':n2' => $n2,
                    ':n3' => $n3,
                    ':n4' => $n4,
                    ':id' => $g['id'],
                ]);

                // 2) Mover la mesa donante al slot de la single
                $stUpdMesaSlot->execute([
                    ':f' => $fechaSingle,
                    ':t' => $turnoSingle,
                    ':n' => $nmDonor,
                ]);

                // 3) Crear el nuevo grupo con [single, donante]
                $stInsGrupo->execute([
                    ':n1' => $nmSingle,
                    ':n2' => $nmDonor,
                    ':n3' => 0,
                    ':n4' => 0,
                    ':f'  => $fechaSingle,
                    ':t'  => $turnoSingle,
                ]);
                $nuevoGrupoId = (int)$pdo->lastInsertId();

                // 4) Borrar la single de mesas_no_agrupadas en su slot
                $stDelNoAgr->execute([
                    ':n' => $nmSingle,
                    ':f' => $fechaSingle,
                    ':t' => $turnoSingle,
                ]);

                // 5) Actualizar estructuras en memoria
                //    Grupo original: quitar donante de array 'mesas'
                $grupos[$grupoDonIdx]['mesas'] = array_values(
                    array_filter($grupos[$grupoDonIdx]['mesas'], fn($x) => $x !== $nmDonor)
                );

                //    Horario de alumnos de la mesa donante:
                //    dejan el slot viejo (del grupo original) y pasan al slot de la single
                $keyOld = $g['fecha'] . '|' . (int)$g['turno'];
                foreach ($dnisDonorSel as $dni) {
                    unset($horarioAlumno[$dni][$keyOld]);
                    $horarioAlumno[$dni][$slotKeySingle] = true;
                }

                $movimientos[] = [
                    'numero_mesa_single'  => $nmSingle,
                    'numero_mesa_donante' => $nmDonor,
                    'fecha_single'        => $fechaSingle,
                    'turno_single'        => $turnoSingle,
                    'grupo_origen_id'     => $g['id'],
                    'nuevo_grupo_id'      => $nuevoGrupoId,
                    'antes_grupo'         => $antesGrupo,
                    'despues_grupo'       => $despuesGrupo,
                    'accion'              => 'rearmar_grupo_lleno_con_single',
                ];
            }

            // Esta mesa ya no es pendiente
            unset($pendientes[$nmSingle]);
        }
    }

    // Lo que quedó en $pendientes son singles que ya sea:
    //  - no tenían grupos de su área
    //  - o ningún slot disponible respetando DNIs/bloqueos/horario/correlatividad
    //  - o ningún grupo de 4 pudo ceder una mesa compatible
    $sinLugar = array_values($pendientes);

    if (!$dryRun && $pdo->inTransaction()) {
        $pdo->commit();
    }

    respondJSON(true, [
        'resumen' => [
            'dry_run'           => $dryRun ? 1 : 0,
            'movimientos'       => count($movimientos),
            'singles_sin_lugar' => count($sinLugar),
        ],
        'detalle' => [
            'movimientos'       => $movimientos,
            'singles_sin_lugar' => $sinLugar,
        ],
        'nota' => 'Reoptimización avanzada: primero agrupa singles en el mismo día/turno, ' .
                  'luego los reubica en otros slots, y finalmente usa grupos de 4 como donantes ' .
                  'para formar grupos nuevos 2+3, respetando DNIs, bloques docentes, horarios y ' .
                  'correlatividad (base antes que avanzadas).'
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondJSON(false, 'Error en el servidor: ' . $e->getMessage(), 500);
}
