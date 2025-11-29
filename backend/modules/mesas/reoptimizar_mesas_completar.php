<?php
// backend/modules/mesas/reoptimizar_mesas_completar.php
// -----------------------------------------------------------------------------
// PASADA EXTRA DE REOPTIMIZACIÓN
//
// Objetivo: una vez que ya existen mesas, grupos y no_agrupadas,
// intentamos que las mesas que quedaron sueltas (singles en mesas_no_agrupadas)
// se sumen como 4° número de mesa a algún grupo compatible.
//
// REGLAS:
//   - Solo trabajamos dentro del MISMO slot (fecha_mesa + id_turno).
//   - Solo con mesas de la MISMA ÁREA (id_area).
//   - Solo si el grupo tiene 1, 2 o 3 mesas (nunca más de 4).
//   - No se repiten DNIs dentro del grupo (un mismo alumno no puede estar
//     en dos mesas del mismo grupo).
//   - Respetamos docentes_bloques_no (aunque en teoría ya estaban agendadas).
//
// NO se crean mesas nuevas, NO se cambian fechas, NO se tocan prioridades.
//
// Parámetros JSON opcionales (POST):
//   - dry_run: 1 | 0   (por defecto 0). Si 1 => solo simula y NO escribe.
//   - fecha_mesa: "YYYY-MM-DD" para limitar la reoptimización a un día.
//   - id_turno: 1 | 2  para limitar a un turno.
//
// Respuesta JSON:
//   {
//     exito: true/false,
//     resumen: { ... },
//     detalle: { ... }
//   }
//
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

    $dryRun     = !empty($input['dry_run']);
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

    // Grupos actuales
    $grupos = cargarGrupos($pdo);

    // Singles actuales
    $singles = cargarSingles($pdo);

    // Filtrar por fecha/turno si hace falta
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

    // Indexar grupos por (fecha|turno|area)
    $gruposPorSlot = [];
    foreach ($grupos as $idx => $g) {
        $key = $g['fecha'] . '|' . $g['turno'] . '|' . $g['area'];
        if (!isset($gruposPorSlot[$key])) $gruposPorSlot[$key] = [];
        $gruposPorSlot[$key][] = $idx;  // guardamos índice dentro de $grupos
    }

    // Singles por slot
    $singlesPorSlot = [];
    foreach ($singles as $i => $s) {
        $key = $s['fecha'] . '|' . $s['turno'] . '|' . $s['area'];
        if (!isset($singlesPorSlot[$key])) $singlesPorSlot[$key] = [];
        $singlesPorSlot[$key][] = $i;
    }

    // Preparar SQL para actualizar mesas_grupos y borrar de mesas_no_agrupadas
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

    if (!$dryRun) {
        $pdo->beginTransaction();
    }

    $movimientos = [];  // logs de movimientos
    $sinLugar    = [];  // singles que no encontraron grupo

    // Recorremos cada slot (fecha + turno + área)
    foreach ($singlesPorSlot as $slotKey => $idxSingles) {
        // slotKey = "YYYY-MM-DD|id_turno|id_area"
        if (empty($gruposPorSlot[$slotKey])) {
            // No hay grupos en este slot: no podemos sumar singles a nada
            foreach ($idxSingles as $iSingle) {
                $s = $singles[$iSingle];
                $sinLugar[] = [
                    'numero_mesa' => $s['numero_mesa'],
                    'fecha'       => $s['fecha'],
                    'turno'       => $s['turno'],
                    'area'        => $s['area'],
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
                $sinLugar[] = [
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

            // Buscamos un grupo compatible
            $grupoElegidoIdx = null;
            $tipoMotivoNo = [];

            foreach ($idxGruposSlot as $idxG) {
                $g = $grupos[$idxG];

                // Grupo debe tener 1, 2 o 3 mesas (nunca 4)
                $mesasG = $g['mesas'];
                $sizeG  = count($mesasG);
                if ($sizeG >= 4) {
                    $tipoMotivoNo[] = 'grupo_completo';
                    continue;
                }

                // Mismo área ya viene garantizado por index
                // pero igual validamos por si acaso
                if ((int)$g['area'] !== $area) {
                    $tipoMotivoNo[] = 'area_distinta';
                    continue;
                }

                // DNI: no puede haber repetición dentro del grupo
                $dnisGrupo = unionDNIsMesas($dnisPorMesa, $mesasG);
                $interseccion = array_intersect($dnisGrupo, $dnisSingle);
                if (!empty($interseccion)) {
                    $tipoMotivoNo[] = 'choque_DNI_en_grupo';
                    continue;
                }

                // Docentes: ninguno de los docentes de la mesa single
                // puede estar bloqueado en este slot
                $bloqueado = false;
                foreach ($docsSingle as $idDoc) {
                    if ($slotProhibido((int)$idDoc, $fecha, $turno)) {
                        $bloqueado = true;
                        break;
                    }
                }
                if ($bloqueado) {
                    $tipoMotivoNo[] = 'docente_bloqueado_en_slot';
                    continue;
                }

                // Grupo compatible encontrado
                $grupoElegidoIdx = $idxG;
                break;
            }

            if ($grupoElegidoIdx === null) {
                $sinLugar[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'sin_grupo_compatible',
                    'motivos_descartes' => array_values(array_unique($tipoMotivoNo)),
                ];
                continue;
            }

            // Tenemos un grupo elegido
            $g = $grupos[$grupoElegidoIdx];

            // Leemos la fila real de mesas_grupos para evitar pisar algo raro
            $stGetGrupo->execute([':id' => $g['id']]);
            $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
            if (!$actual) {
                $sinLugar[] = [
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

            // Si ya está dentro (raro, pero chequeamos)
            if (in_array($nmSingle, [$n1,$n2,$n3,$n4], true)) {
                // En teoría no debería estar a la vez en no_agrupadas
                // pero por si acaso borramos no_agrupadas
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

            if ($nNuevo1 === 0)      $nNuevo1 = $nmSingle;
            elseif ($nNuevo2 === 0) $nNuevo2 = $nmSingle;
            elseif ($nNuevo3 === 0) $nNuevo3 = $nmSingle;
            elseif ($nNuevo4 === 0) $nNuevo4 = $nmSingle;
            else {
                // Por seguridad, si no hay lugar, lo marcamos como sin lugar (no debería llegar acá)
                $sinLugar[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'grupo_sin_posiciones_libres',
                ];
                continue;
            }

            if ($dryRun) {
                // Solo logueamos la acción
                $movimientos[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'grupo_id'    => $g['id'],
                    'antes'       => [$n1,$n2,$n3,$n4],
                    'despues'     => [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4],
                    'accion'      => 'simular_agregar_a_grupo',
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

                // Borramos la entrada de mesas_no_agrupadas
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
                    'accion'      => 'agregado_a_grupo',
                ];

                // Actualizamos en memoria el grupo ($grupos) para futuros singles en este slot
                $grupos[$grupoElegidoIdx]['mesas'][] = $nmSingle;
            }
        }
    }

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
        'nota' => 'Esta reoptimización solo intenta sumar mesas sueltas a grupos ya existentes, como 4° numero de mesa, sin violar DNIs ni disponibilidad de docentes.'
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondJSON(false, 'Error en el servidor: ' . $e->getMessage(), 500);
}
