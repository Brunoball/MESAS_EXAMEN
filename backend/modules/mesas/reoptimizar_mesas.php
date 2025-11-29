<?php
// backend/modules/mesas/reoptimizar_mesas.php
// -----------------------------------------------------------------------------
// Reoptimiza mesas NO AGRUPADAS para maximizar parejas/ternas/cuaternas,
// (NUNCA crea grupos de tamaño 1: singles -> mesas_no_agrupadas)
//
// **Indisponibilidad docente tomada de docentes_bloques_no (fecha + turno opcional)**
//
// Reglas docentes_bloques_no:
//   - (id_turno != NULL, fecha != NULL) => NO en ese slot (fecha+turno).
//   - (id_turno != NULL, fecha == NULL) => NO en NINGÚN día para ese turno (NUNCA turno).
//   - (id_turno == NULL, fecha != NULL) => ese día NO en NINGÚN turno.
//   - (id_turno == NULL, fecha == NULL) => se ignora.
//
// Ajustes IMPORTANTES:
//
//   1) Cada vez que se mueve una mesa a otro día/turno o entra en un grupo,
//      se borran TODAS las filas de ese numero_mesa en mesas_no_agrupadas
//      antes de insertar la nueva (si corresponde).
//
//   2) SANIDAD final para grupos de tamaño 1:
//        - Si el grupo de 1 corresponde a una mesa ESPECIAL de 7º AÑO
//          (p.materia_id_curso = 7) o a una mesa TÉCNICA ESPECIAL DE 3º
//          (p.materia_id_curso = 3 y p.id_materia IN (18,32,132) de un solo alumno),
//          se mantiene como grupo de 1 en mesas_grupos.
//        - Sólo se pasan a mesas_no_agrupadas y se borran de mesas_grupos
//          los grupos de 1 que NO sean ni de 7º ni de 3º técnico especial.
//
//   3) Limpieza fuerte final: mesas_no_agrupadas queda alineada con la tabla
//      mesas (fecha_mesa, id_turno actuales) para que cada numero_mesa tenga
//      un ÚNICO día/turno real.
//
//   4) Limpieza fuerte en mesas_grupos: si un numero_mesa aparece en
//      grupos con fecha/turno que NO coincide con lo que dice `mesas`,
//      se borra ese grupo. De esta forma, cada numero_mesa queda asociado
//      a UNA sola fecha+turno (no se repite en distintos días/turnos).
//
//   5) Red de seguridad final:
//        - Toda mesa que tenga fecha_mesa + id_turno en `mesas` y NO esté
//          en ningún grupo ni en mesas_no_agrupadas, se inserta como
//          no_agrupada en ese mismo slot. Así NUNCA se "pierde" una mesa.
//
//   6) PASO EXTRA:
//        - Se buscan TODAS las mesas de previas inscriptas (inscripcion=1, id_condicion=3)
//          que sigan SIN fecha_mesa o SIN id_turno y se les fuerza un slot válido.
//
//   7) PASO EXTRA 2:
//        - Se toma el contenido actual de mesas_no_agrupadas y, POR CADA día+turno+área,
//          se arman grupos nuevos de 2,3 o 4 numero_mesa sin repetir DNIs, sin cambiar el slot.
//
//   8) ARREGLO (encaje en grupos existentes mismo slot):
//        - Cuando una mesa no_agrupada está en el MISMO día/turno que un grupo existente
//          del mismo área, se permite meterla en ese grupo aunque `horarioAlumno` marque
//          ese slot como ocupado para esos DNIs (porque es la misma mesa, no una nueva).
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
  if (ob_get_length()) { @ob_clean(); }
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito'=>true, 'data'=>$payload]
       : ['exito'=>false, 'mensaje'=>(is_string($payload)?$payload:'Error desconocido')],
    JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES
  );
  exit;
}
function bad_request(string $m): void { respond(false, $m, 400); }

function validarFecha(?string $s): bool {
  if(!$s) return false;
  $d = DateTime::createFromFormat('Y-m-d', $s);
  return $d && $d->format('Y-m-d') === $s;
}
function rangoFechas(string $inicio, string $fin): array {
  $di = new DateTime($inicio);
  $df = new DateTime($fin);
  if ($df < $di) return [];
  $out = [];
  while ($di <= $df) {
    $dow = (int)$di->format('N'); // 1 = lunes, 7 = domingo
    if ($dow <= 5) {              // solo lunes a viernes
      $out[] = $di->format('Y-m-d');
    }
    $di->modify('+1 day');
  }
  return $out;
}

function pad4(array $g): array {
  $n = count($g);
  if ($n === 1) return [$g[0], 0, 0, 0];
  if ($n === 2) return [$g[0], $g[1], 0, 0];
  if ($n === 3) return [$g[0], $g[1], $g[2], 0];
  return [$g[0], $g[1], $g[2], $g[3]];
}

// NUEVO: hora según turno para los INSERT en mesas_grupos y mesas_no_agrupadas
function horaSegunTurno(int $turno): string {
  return $turno === 1 ? '07:30:00' : '13:30:00';
}

if (!isset($pdo) || !$pdo instanceof PDO) {
  bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(false, 'Método no permitido', 405);

  $input = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($input)) $input = [];

  $dryRun   = !empty($input['dry_run']);
  $maxIter  = max(1, min(20, (int)($input['max_iter'] ?? 5)));
  $soloArea = isset($input['solo_area']) ? (int)$input['solo_area'] : null;

  $fi = $input['fecha_inicio'] ?? null;
  $ff = $input['fecha_fin'] ?? null;
  if (($fi && !validarFecha($fi)) || ($ff && !validarFecha($ff))) {
    bad_request("Parámetros de fecha inválidos (YYYY-MM-DD).");
  }

  // ---------------- Indisponibilidades docentes ----------------
  //   $docNoTurn[doc][turno]       => NUNCA en ese turno.
  //   $docNoDay[doc][fecha][turno] => bloqueos por día+turno.
  $docNoTurn = [];
  $docNoDay  = [];
  $rsBN = $pdo->query("SELECT id_docente, id_turno, fecha FROM docentes_bloques_no");
  if ($rsBN) {
    foreach ($rsBN->fetchAll(PDO::FETCH_ASSOC) as $r) {
      $idd = (int)$r['id_docente'];
      $t   = array_key_exists('id_turno', $r) && $r['id_turno'] !== null ? (int)$r['id_turno'] : null;
      $f   = array_key_exists('fecha',    $r) ? $r['fecha'] : null;

      // (turno != NULL, fecha == NULL)  => nunca en ese turno
      if ($t !== null && ($f === null || $f === '')) {
        $docNoTurn[$idd][$t] = true;
        continue;
      }
      // (turno == NULL, fecha != NULL)  => en ese día no puede en ningún turno
      if (($t === null) && ($f !== null && $f !== '')) {
        $docNoDay[$idd][$f][1] = true;
        $docNoDay[$idd][$f][2] = true;
        continue;
      }
      // (turno != NULL, fecha != NULL)  => no puede en ese slot
      if (($t !== null) && ($f !== null && $f !== '')) {
        $docNoDay[$idd][$f][$t] = true;
      }
      // (turno == NULL, fecha == NULL) => se ignora
    }
  }
  $slotProhibido = function (int $id_docente, string $fecha, int $turno) use ($docNoTurn, $docNoDay): bool {
    if (isset($docNoTurn[$id_docente][$turno])) return true;               // nunca ese turno
    if (isset($docNoDay[$id_docente][$fecha][$turno])) return true;        // bloqueado día+turno
    return false;
  };

  // ---------------- Mapa DNIs por numero_mesa ----------------
  $dnisPorNumero = [];
  $res = $pdo->query("
    SELECT m.numero_mesa, p.dni
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($res as $r) {
    $nm  = (int)$r['numero_mesa'];
    $dni = (string)$r['dni'];
    $dnisPorNumero[$nm][$dni] = true;
  }
  foreach ($dnisPorNumero as $nm => $set) {
    $dnisPorNumero[$nm] = array_keys($set);
  }

  $unionDNIs = function (array $numeros) use ($dnisPorNumero): array {
    $u = [];
    foreach ($numeros as $nm) {
      foreach (($dnisPorNumero[$nm] ?? []) as $dni) $u[$dni] = true;
    }
    return array_keys($u);
  };
  $numeroChocaSet = function (int $nm, array $set) use ($dnisPorNumero): bool {
    if ($nm === 0) return false;
    $A = $dnisPorNumero[$nm] ?? [];
    if (!$A || !$set) return false;
    $h = array_flip($set);
    foreach ($A as $x) {
      if (isset($h[$x])) return true;
    }
    return false;
  };

  // ---------- Horario del alumno (evitar doble mesa mismo slot) ----------
  // dni => [ "YYYY-MM-DD|turno" => true ]
  $horarioAlumno = [];
  $res2 = $pdo->query("
    SELECT p.dni, m.fecha_mesa, m.id_turno
    FROM mesas m
    INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($res2 as $r) {
    $dni = (string)$r['dni'];
    $f   = $r['fecha_mesa'];
    $t   = (int)$r['id_turno'];
    $horarioAlumno[$dni][$f . '|' . $t] = true;
  }

  // ---------- Slot actual de cada numero_mesa (para el arreglo) ----------
  $slotMesaActual = [];
  $resSlots = $pdo->query("
    SELECT numero_mesa, fecha_mesa, id_turno
    FROM mesas
    WHERE fecha_mesa IS NOT NULL AND id_turno IS NOT NULL
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($resSlots as $r) {
    $slotMesaActual[(int)$r['numero_mesa']] = [
      'fecha' => $r['fecha_mesa'],
      'turno' => (int)$r['id_turno'],
    ];
  }

  // ---------- Deducir rango de fechas si no viene ----------
  if (!$fi || !$ff) {
    $rowMin = $pdo->query("
      SELECT MIN(fecha_mesa) AS fmin, MAX(fecha_mesa) AS fmax
      FROM mesas
      WHERE fecha_mesa IS NOT NULL
    ")->fetch(PDO::FETCH_ASSOC);
    if (!$rowMin || !$rowMin['fmin'] || !$rowMin['fmax']) {
      bad_request("No hay fechas agendadas para deducir rango. Enviá 'fecha_inicio' y 'fecha_fin'.");
    }
    $fi = $fi ?: $rowMin['fmin'];
    $ff = $ff ?: $rowMin['fmax'];
  }
  $fechasRango = rangoFechas($fi, $ff);
  if (!$fechasRango) bad_request("Rango de fechas inválido.");

  $slots = [];
  foreach ($fechasRango as $f) {
    $slots[] = ['fecha' => $f, 'turno' => 1];
    $slots[] = ['fecha' => $f, 'turno' => 2];
  }
  $S = count($slots);

  // ---------- Estado actual de grupos (por slot y área) ----------
  $stGr = $pdo->prepare("
    SELECT g.id_mesa_grupos,
           g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4,
           g.fecha_mesa, g.id_turno,
           mat.id_area AS id_area
    FROM mesas_grupos g
    INNER JOIN mesas m1 ON m1.numero_mesa = g.numero_mesa_1
    INNER JOIN catedras c1 ON c1.id_catedra = m1.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c1.id_materia
  ");
  $stGr->execute();
  $grupos = $stGr->fetchAll(PDO::FETCH_ASSOC);

  $bucket = []; // "$f|$t|$area" => [ 'id_g', 'nums'=>[], 'dnis'=>set ]
  foreach ($grupos as $g) {
    $f   = $g['fecha_mesa'];
    $t   = (int)$g['id_turno'];
    $a   = (int)$g['id_area'];
    $key = "$f|$t|$a";
    $nums = array_values(array_filter([
      (int)$g['numero_mesa_1'],
      (int)$g['numero_mesa_2'],
      (int)$g['numero_mesa_3'],
      (int)$g['numero_mesa_4']
    ], fn($x) => $x > 0));

    if (!isset($bucket[$key])) {
      $bucket[$key] = [
        'id_g'  => $g['id_mesa_grupos'],
        'fecha'=> $f,
        'turno'=> $t,
        'area' => $a,
        'nums' => [],
        'dnis' => []
      ];
    }
    $bucket[$key]['nums'] = array_values(array_unique(array_merge($bucket[$key]['nums'], $nums)));
  }
  foreach ($bucket as $k => &$b) {
    $b['dnis'] = array_flip($unionDNIs($b['nums']));
  }
  unset($b);

  // ---------- No agrupadas + datos de área/docente ----------
  $sqlNo = "
    SELECT l.numero_mesa, l.fecha_mesa, l.id_turno,
           mat.id_area AS id_area,
           MIN(m.id_docente) AS id_docente
    FROM mesas_no_agrupadas l
    INNER JOIN mesas m ON m.numero_mesa = l.numero_mesa
    INNER JOIN catedras c ON c.id_catedra = m.id_catedra
    INNER JOIN materias mat ON mat.id_materia = c.id_materia
  ";
  if ($soloArea !== null) {
    $sqlNo .= " WHERE mat.id_area = " . (int)$soloArea . " ";
  }
  $sqlNo .= "
    GROUP BY l.numero_mesa, l.fecha_mesa, l.id_turno, mat.id_area
    ORDER BY mat.id_area, l.numero_mesa
  ";
  $noAgr = $pdo->query($sqlNo)->fetchAll(PDO::FETCH_ASSOC);

  // Docente por numero_mesa
  $docPorNM = [];
  $res3 = $pdo->query("
    SELECT m.numero_mesa, MIN(m.id_docente) AS id_docente
    FROM mesas m
    GROUP BY m.numero_mesa
  ")->fetchAll(PDO::FETCH_ASSOC);
  foreach ($res3 as $r) {
    $docPorNM[(int)$r['numero_mesa']] = (int)$r['id_docente'];
  }

  // ---------- Helpers SQL ----------
  $stUpdMesaSlot = $pdo->prepare("
    UPDATE mesas
       SET fecha_mesa = ?, id_turno = ?
     WHERE numero_mesa = ?
  ");
  // ⬇⬇⬇ MODIFICADO: agregamos columna hora en el INSERT
  $stInsGroup = $pdo->prepare("
    INSERT INTO mesas_grupos
      (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4, fecha_mesa, id_turno, hora)
    VALUES (:a,:b,:c,:d,:f,:t,:h)
  ");
  $stUpdGroupToAdd = $pdo->prepare("
    UPDATE mesas_grupos
       SET numero_mesa_1 = IF(numero_mesa_1=0, :nm, numero_mesa_1),
           numero_mesa_2 = IF(numero_mesa_2=0, :nm, numero_mesa_2),
           numero_mesa_3 = IF(numero_mesa_3=0, :nm, numero_mesa_3),
           numero_mesa_4 = IF(numero_mesa_4=0, :nm, numero_mesa_4)
     WHERE id_mesa_grupos = :idg
       AND (0 IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4))
  ");
  $stDelLeftExact = $pdo->prepare("
    DELETE FROM mesas_no_agrupadas
     WHERE numero_mesa = :n AND fecha_mesa = :f AND id_turno = :t
  ");
  // BORRA TODAS las filas de ese numero_mesa en no_agrupadas
  $stDelLeftByMesa = $pdo->prepare("
    DELETE FROM mesas_no_agrupadas
     WHERE numero_mesa = :n
  ");
  
  // *** MODIFICADO: ahora incluimos la columna `hora` en mesas_no_agrupadas ***
  $stInsLeft = $pdo->prepare("
    INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
    VALUES (:n,:f,:t,:h)
  ");
  $stDupGroupExact = $pdo->prepare("
    SELECT 1 FROM mesas_grupos
     WHERE fecha_mesa = :f AND id_turno = :t
       AND numero_mesa_1 = :a AND numero_mesa_2 = :b
       AND numero_mesa_3 = :c AND numero_mesa_4 = :d
     LIMIT 1
  ");

  // Carga de cada slot (para balancear)
  $slotCarga = array_fill(0, $S, 0);
  $slotIndex = function (string $f, int $t) use ($slots): int {
    for ($i = 0; $i < count($slots); $i++) {
      if ($slots[$i]['fecha'] === $f && $slots[$i]['turno'] === $t) return $i;
    }
    return -1;
  };
  foreach ($bucket as $k => $b) {
    $s = $slotIndex($b['fecha'], $b['turno']);
    if ($s >= 0) $slotCarga[$s] += count($b['nums']);
  }

  // ---------- Elegir mejor slot para un conjunto de numeros ----------
  $eligeSlot = function (array $nums, ?int $areaHint) use (&$slots, &$slotCarga, &$docPorNM, $slotProhibido, $dnisPorNumero, $horarioAlumno): int {
    $dnis = [];
    foreach ($nums as $nm) {
      foreach (($dnisPorNumero[$nm] ?? []) as $d) $dnis[$d] = true;
    }
    $dnis = array_keys($dnis);

    $cands = [];
    for ($s = 0; $s < count($slots); $s++) {
      $f = $slots[$s]['fecha'];
      $t = $slots[$s]['turno'];

      // docentes disponibles
      $ok = true;
      foreach ($nums as $nm) {
        $doc = $docPorNM[$nm] ?? 0;
        if ($doc > 0 && $slotProhibido($doc, $f, $t)) {
          $ok = false;
          break;
        }
      }
      if (!$ok) continue;

      // alumnos no choquen con otra mesa en ese slot
      foreach ($dnis as $dni) {
        if (isset($horarioAlumno[$dni]["$f|$t"])) {
          $ok = false;
          break;
        }
      }
      if (!$ok) continue;

      $score = $slotCarga[$s]; // balance simple
      $cands[] = [$s, $score];
    }

    if (!$cands) return -1;
    usort($cands, fn($A, $B) => $A[1] <=> $B[1] ?: $A[0] <=> $B[0]);
    return $cands[0][0];
  };

  // ---------- Chequear si nm cabe en un bucket/grupo existente ----------
  $cabeEnBucket = function (int $nm, array $b) use ($unionDNIs, $numeroChocaSet): bool {
    if (count($b['nums']) >= 4) return false;
    $dnisGrupo = array_keys($b['dnis']);
    if ($numeroChocaSet($nm, $dnisGrupo)) return false;
    return true;
  };

  $iter             = 0;
  $cambiosTotales   = 0;
  $detalleMov       = [];
  $detalleAgr       = [];
  $detalleFail      = [];

  if (!$dryRun) $pdo->beginTransaction();

  while ($iter < $maxIter) {
    $iter++;
    $cambiosIter = 0;

    // Refrescar no_agrupadas (puede cambiar en cada iteración)
    $noAgr = $pdo->query($sqlNo)->fetchAll(PDO::FETCH_ASSOC);

    // 1) Intentar meter cada no_agrupada en un grupo existente del MISMO área
    foreach ($noAgr as $row) {
      $nm   = (int)$row['numero_mesa'];
      $area = (int)$row['id_area'];
      $doc  = (int)$row['id_docente'];

      // buckets candidatos del mismo área
      $cands = [];
      foreach ($bucket as $k => $b) {
        if ($b['area'] !== $area) continue;
        if ($doc > 0 && $slotProhibido($doc, $b['fecha'], $b['turno'])) continue;

        // >>> ARREGLO: si el slot del bucket es EXACTAMENTE el mismo
        //              que el slot actual de esta mesa, NO consideramos
        //              que haya choque de alumnos (porque es la misma mesa).
        $esMismoSlotOriginal = false;
        if (isset($slotMesaActual[$nm])) {
          $infoSlot = $slotMesaActual[$nm];
          if ($infoSlot['fecha'] === $b['fecha'] && $infoSlot['turno'] === $b['turno']) {
            $esMismoSlotOriginal = true;
          }
        }

        // evitar que alumnos de $nm ya rindan en ese slot, salvo que sea
        // SU MISMO slot original (en ese caso no estamos creando choque nuevo)
        if (!$esMismoSlotOriginal) {
          $chocaAlumno = false;
          foreach (($dnisPorNumero[$nm] ?? []) as $dni) {
            if (isset($horarioAlumno[$dni][$b['fecha'] . '|' . $b['turno']])) {
              $chocaAlumno = true;
              break;
            }
          }
          if ($chocaAlumno) continue;
        }

        if (!$cabeEnBucket($nm, $b)) continue;
        $cands[] = [$k, count($b['nums'])];
      }

      if ($cands) {
        // meto en grupo existente
        usort($cands, fn($A, $B) => $A[1] <=> $B[1]);
        [$keyBest, $_] = $cands[0];
        $b = $bucket[$keyBest];
        $f = $b['fecha'];
        $t = $b['turno'];

        if (!$dryRun) {
          $stUpdMesaSlot->execute([$f, $t, $nm]);
          $stUpdGroupToAdd->execute([':nm' => $nm, ':idg' => $b['id_g']]);
          // borro TODAS las no_agrupadas de esa mesa
          $stDelLeftByMesa->execute([':n' => $nm]);
        }

        $bucket[$keyBest]['nums'][] = $nm;
        foreach (($dnisPorNumero[$nm] ?? []) as $dni) {
          $bucket[$keyBest]['dnis'][$dni] = true;
          $horarioAlumno[$dni][$f . '|' . $t] = true;
        }

        $detalleMov[] = [
          'numero_mesa' => $nm,
          'to_fecha'    => $f,
          'to_turno'    => $t,
          'area'        => $area,
          'motivo'      => 'encaje_en_grupo_existente'
        ];
        $cambiosIter++;
        $cambiosTotales++;
        continue;
      }

      // 2) Intentar formar grupo NUEVO con otras no_agrupadas del MISMO área
      $pool = [$nm];
      foreach ($noAgr as $row2) {
        if ((int)$row2['numero_mesa'] === $nm) continue;
        if ((int)$row2['id_area'] !== $area) continue;
        $nm2 = (int)$row2['numero_mesa'];
        $d1  = $dnisPorNumero[$nm] ?? [];
        $d2  = $dnisPorNumero[$nm2] ?? [];
        $h   = array_flip($d1);
        $ok  = true;
        foreach ($d2 as $x) {
          if (isset($h[$x])) { $ok = false; break; }
        }
        if (!$ok) continue;
        $pool[] = $nm2;
        if (count($pool) >= 6) break;
      }

      $mejorGrupo = [$nm];

      // parejas
      foreach ($pool as $a) {
        foreach ($pool as $b2) {
          if ($a >= $b2) continue;
          $dAB = array_merge($dnisPorNumero[$a] ?? [], $dnisPorNumero[$b2] ?? []);
          if (count($dAB) !== count(array_unique($dAB))) continue;
          if (count($mejorGrupo) < 2) $mejorGrupo = [$a, $b2];
        }
      }

      // ternas / cuaternas
      foreach ($pool as $a) {
        foreach ($pool as $b2) {
          foreach ($pool as $c) {
            $arr = array_unique([$nm, $a, $b2, $c]);
            if (count($arr) < 3) continue;
            $dAB = [];
            foreach ($arr as $x) {
              foreach (($dnisPorNumero[$x] ?? []) as $d) $dAB[$d] = true;
            }
            $cantEsperada = array_sum(array_map(
              fn($x) => count($dnisPorNumero[$x] ?? []),
              $arr
            ));
            if (count($dAB) !== $cantEsperada) continue;
            if (count($arr) > count($mejorGrupo)) $mejorGrupo = array_values($arr);
            if (count($mejorGrupo) === 4) break 3;
          }
        }
      }

      $slotIdx = $eligeSlot($mejorGrupo, $area);
      if ($slotIdx >= 0) {
        $f = $slots[$slotIdx]['fecha'];
        $t = $slots[$slotIdx]['turno'];

        // tamaño 1 -> solo no_agrupadas (NO crear grupo nuevo)
        if (count($mejorGrupo) === 1) {
          if (!$dryRun) {
            foreach ($mejorGrupo as $nmX) {
              $stUpdMesaSlot->execute([$f, $t, $nmX]);
              $stDelLeftByMesa->execute([':n' => $nmX]);
              $hora = horaSegunTurno($t);
              $stInsLeft->execute([':n' => $nmX, ':f' => $f, ':t' => $t, ':h' => $hora]);
            }
          }
          foreach ($mejorGrupo as $nmX) {
            foreach (($dnisPorNumero[$nmX] ?? []) as $dni) {
              $horarioAlumno[$dni][$f . '|' . $t] = true;
            }
          }
          $slotCarga[$slotIdx] += 1;
          $detalleMov[] = [
            'numero_mesa' => $mejorGrupo[0],
            'to_fecha'    => $f,
            'to_turno'    => $t,
            'area'        => $area,
            'motivo'      => 'single_no_agrupada'
          ];
          $cambiosIter++;
          $cambiosTotales++;
          continue;
        }

        // grupo de 2/3/4
        if (!$dryRun) {
          foreach ($mejorGrupo as $nmX) {
            $stUpdMesaSlot->execute([$f, $t, $nmX]);
            $stDelLeftByMesa->execute([':n' => $nmX]);
            // se inserta como no_agrupada "provisoria"; luego se purga contra grupos
            $hora = horaSegunTurno($t);
            $stInsLeft->execute([':n' => $nmX, ':f' => $f, ':t' => $t, ':h' => $hora]);
          }
          [$a1, $b1, $c1, $d1] = pad4($mejorGrupo);
          $stDupGroupExact->execute([
            ':f' => $f, ':t' => $t,
            ':a' => $a1, ':b' => $b1, ':c' => $c1, ':d' => $d1
          ]);
          if (!$stDupGroupExact->fetch()) {
            // ⬇⬇⬇ usamos horaSegunTurno($t) al crear el grupo
            $stInsGroup->execute([
              ':a' => $a1,
              ':b' => $b1,
              ':c' => $c1,
              ':d' => $d1,
              ':f' => $f,
              ':t' => $t,
              ':h' => horaSegunTurno($t),
            ]);
          }
        }

        $key = "$f|$t|$area";
        if (!isset($bucket[$key])) {
          $bucket[$key] = [
            'id_g'  => 0,
            'fecha'=> $f,
            'turno'=> $t,
            'area' => $area,
            'nums' => [],
            'dnis' => []
          ];
        }
        foreach ($mejorGrupo as $nmX) {
          $bucket[$key]['nums'][] = $nmX;
          foreach (($dnisPorNumero[$nmX] ?? []) as $dni) {
            $bucket[$key]['dnis'][$dni] = true;
            $horarioAlumno[$dni][$f . '|' . $t] = true;
          }
        }
        $slotCarga[$slotIdx] += count($mejorGrupo);

        $detalleAgr[] = [
          'nums'  => $mejorGrupo,
          'fecha' => $f,
          'turno' => $t,
          'area'  => $area,
          'tipo'  => 'nuevo_grupo'
        ];
        $cambiosIter++;
        $cambiosTotales++;
      } else {
        $detalleFail[] = [
          'numero_mesa' => $nm,
          'area'        => $area,
          'razon'       => 'sin_slot_valido_para_grupo_nuevo'
        ];
      }
    }

    if ($cambiosIter === 0) break; // convergió
  }

  // PASO EXTRA: forzar slot a mesas SIN fecha_mesa o SIN id_turno
  if (!$dryRun) {
    $sqlSinSlot = "
      SELECT DISTINCT m.numero_mesa, mat.id_area
      FROM mesas m
      INNER JOIN previas p   ON p.id_previa   = m.id_previa
      INNER JOIN catedras c  ON c.id_catedra  = m.id_catedra
      INNER JOIN materias mat ON mat.id_materia = c.id_materia
      WHERE p.inscripcion = 1
        AND p.id_condicion = 3
        AND (m.fecha_mesa IS NULL OR m.id_turno IS NULL)
        AND m.numero_mesa IS NOT NULL
    ";
    $sinSlot = $pdo->query($sqlSinSlot)->fetchAll(PDO::FETCH_ASSOC);

    foreach ($sinSlot as $rowSS) {
      $nm    = (int)$rowSS['numero_mesa'];
      $area  = (int)$rowSS['id_area'];

      if ($nm <= 0) continue;

      $slotIdx = $eligeSlot([$nm], $area);
      if ($slotIdx >= 0) {
        $f = $slots[$slotIdx]['fecha'];
        $t = $slots[$slotIdx]['turno'];

        // Actualizar mesas y marcar como no_agrupada
        $stUpdMesaSlot->execute([$f, $t, $nm]);
        $stDelLeftByMesa->execute([':n' => $nm]);
        $hora = horaSegunTurno($t);
        $stInsLeft->execute([':n' => $nm, ':f' => $f, ':t' => $t, ':h' => $hora]);

        // Actualizar horario alumnos y carga del slot
        foreach (($dnisPorNumero[$nm] ?? []) as $dni) {
          $horarioAlumno[$dni]["$f|$t"] = true;
        }
        $slotCarga[$slotIdx] += 1;

        $detalleMov[] = [
          'numero_mesa' => $nm,
          'to_fecha'    => $f,
          'to_turno'    => $t,
          'area'        => $area,
          'motivo'      => 'asignacion_forzada_sin_slot'
        ];
        $cambiosTotales++;
      } else {
        $detalleFail[] = [
          'numero_mesa' => $nm,
          'area'        => $area,
          'razon'       => 'sin_slot_valido_final'
        ];
      }
    }
  }
  // <<< FIN PASO EXTRA

  // PASO EXTRA 2: agrupar mesas_no_agrupadas que comparten día/turno/área
  if (!$dryRun) {
    $sqlSinglesSlot = "
      SELECT l.numero_mesa, l.fecha_mesa, l.id_turno, mat.id_area
      FROM mesas_no_agrupadas l
      INNER JOIN mesas m   ON m.numero_mesa = l.numero_mesa
      INNER JOIN catedras c ON c.id_catedra = m.id_catedra
      INNER JOIN materias mat ON mat.id_materia = c.id_materia
    ";
    if ($soloArea !== null) {
      $sqlSinglesSlot .= " WHERE mat.id_area = " . (int)$soloArea . " ";
    }
    $sqlSinglesSlot .= "
      ORDER BY l.fecha_mesa, l.id_turno, mat.id_area, l.numero_mesa
    ";

    $rowsSingles = $pdo->query($sqlSinglesSlot)->fetchAll(PDO::FETCH_ASSOC);

    $slotsSingles = [];
    foreach ($rowsSingles as $r) {
      $key = $r['fecha_mesa'] . '|' . $r['id_turno'] . '|' . $r['id_area'];
      $nm  = (int)$r['numero_mesa'];
      if ($nm <= 0) continue;
      if (!isset($slotsSingles[$key])) {
        $slotsSingles[$key] = [
          'fecha' => $r['fecha_mesa'],
          'turno' => (int)$r['id_turno'],
          'area'  => (int)$r['id_area'],
          'mesas' => []
        ];
      }
      $slotsSingles[$key]['mesas'][] = $nm;
    }

    foreach ($slotsSingles as $info) {
      $lista = array_values(array_unique($info['mesas']));

      // Greedy: armar grupos de 2,3 o 4 mientras se pueda
      while (count($lista) > 1) {
        $base = array_shift($lista);
        $grupo = [$base];

        // DNIs actuales del grupo
        $dnisGrupo = [];
        foreach (($dnisPorNumero[$base] ?? []) as $dni) $dnisGrupo[$dni] = true;

        $restantes = $lista;
        foreach ($restantes as $cand) {
          if (count($grupo) >= 4) break;
          $colision = false;
          foreach (($dnisPorNumero[$cand] ?? []) as $dni) {
            if (isset($dnisGrupo[$dni])) {
              $colision = true;
              break;
            }
          }
          if ($colision) continue;

          // Añadimos la mesa al grupo
          $grupo[] = $cand;
          foreach (($dnisPorNumero[$cand] ?? []) as $dni) {
            $dnisGrupo[$dni] = true;
          }

          // Quitamos el candidato de la lista global
          $idx = array_search($cand, $lista, true);
          if ($idx !== false) array_splice($lista, $idx, 1);
        }

        // Si no se logró ningún compañero, queda como single
        if (count($grupo) <= 1) {
          continue;
        }

        // Insertar grupo en mesas_grupos si no existe un grupo idéntico en ese slot
        [$a1, $b1, $c1, $d1] = pad4($grupo);
        $stDupGroupExact->execute([
          ':f' => $info['fecha'],
          ':t' => $info['turno'],
          ':a' => $a1,
          ':b' => $b1,
          ':c' => $c1,
          ':d' => $d1,
        ]);
        if (!$stDupGroupExact->fetch()) {
          $stInsGroup->execute([
            ':a' => $a1,
            ':b' => $b1,
            ':c' => $c1,
            ':d' => $d1,
            ':f' => $info['fecha'],
            ':t' => $info['turno'],
            ':h' => horaSegunTurno((int)$info['turno']),
          ]);
        }

        // Borrar esas mesas de mesas_no_agrupadas en ese mismo slot
        foreach ($grupo as $nmX) {
          $stDelLeftExact->execute([
            ':n' => $nmX,
            ':f' => $info['fecha'],
            ':t' => $info['turno'],
          ]);
        }

        $detalleAgr[] = [
          'nums'  => $grupo,
          'fecha' => $info['fecha'],
          'turno' => $info['turno'],
          'area'  => $info['area'],
          'tipo'  => 'grupo_desde_singles_mismo_slot'
        ];
        $cambiosTotales++;
      }
    }
  }
  // <<< FIN PASO EXTRA 2

  if (!$dryRun) {
    // --- SANIDAD: singles en grupos que NO son ESPECIALES (ni 7º ni 3º técnico especial)
    //     -> pasan a no_agrupadas y se borran de mesas_grupos
    $pdo->exec("
      INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
      SELECT
        CASE
          WHEN numero_mesa_1>0 THEN numero_mesa_1
          WHEN numero_mesa_2>0 THEN numero_mesa_2
          WHEN numero_mesa_3>0 THEN numero_mesa_3
          ELSE numero_mesa_4
        END AS numero_mesa,
        fecha_mesa,
        id_turno,
        hora
      FROM mesas_grupos g
      WHERE ( (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0) = 1 )
        AND EXISTS (
          SELECT 1
          FROM mesas m
          INNER JOIN previas p ON p.id_previa = m.id_previa
          WHERE m.numero_mesa = CASE
                                  WHEN g.numero_mesa_1>0 THEN g.numero_mesa_1
                                  WHEN g.numero_mesa_2>0 THEN g.numero_mesa_2
                                  WHEN g.numero_mesa_3>0 THEN g.numero_mesa_3
                                  ELSE g.numero_mesa_4
                                END
            AND NOT (
              p.materia_id_curso = 7
              OR (p.materia_id_curso = 3 AND p.id_materia IN (18,32,132))
            )
        )
    ");

    $pdo->exec("
      DELETE g
      FROM mesas_grupos g
      WHERE ( (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0) = 1 )
        AND EXISTS (
          SELECT 1
          FROM mesas m
          INNER JOIN previas p ON p.id_previa = m.id_previa
          WHERE m.numero_mesa = CASE
                                  WHEN g.numero_mesa_1>0 THEN g.numero_mesa_1
                                  WHEN g.numero_mesa_2>0 THEN g.numero_mesa_2
                                  WHEN g.numero_mesa_3>0 THEN g.numero_mesa_3
                                  ELSE g.numero_mesa_4
                                END
            AND NOT (
              p.materia_id_curso = 7
              OR (p.materia_id_curso = 3 AND p.id_materia IN (18,32,132))
            )
        )
    ");

    // --- Alinear mesas_no_agrupadas con la tabla mesas (fecha/turno actuales) ---
    $pdo->exec("
      DELETE l
      FROM mesas_no_agrupadas l
      LEFT JOIN mesas m
        ON m.numero_mesa = l.numero_mesa
       AND m.fecha_mesa = l.fecha_mesa
       AND m.id_turno   = l.id_turno
      WHERE m.numero_mesa IS NULL
    ");

    // --- Purga duplicados entre grupos y no_agrupadas ---
    $pdo->exec("
      DELETE l
      FROM mesas_no_agrupadas l
      JOIN mesas_grupos g
        ON g.fecha_mesa = l.fecha_mesa AND g.id_turno = l.id_turno
      WHERE l.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
    ");

    // --- SANIDAD FUERTE en mesas_grupos ---
    $pdo->exec("
      DELETE g
      FROM mesas_grupos g
      LEFT JOIN mesas m1
        ON g.numero_mesa_1 > 0
       AND g.numero_mesa_1 = m1.numero_mesa
       AND g.fecha_mesa    = m1.fecha_mesa
       AND g.id_turno      = m1.id_turno
      LEFT JOIN mesas m2
        ON g.numero_mesa_2 > 0
       AND g.numero_mesa_2 = m2.numero_mesa
       AND g.fecha_mesa    = m2.fecha_mesa
       AND g.id_turno      = m2.id_turno
      LEFT JOIN mesas m3
        ON g.numero_mesa_3 > 0
       AND g.numero_mesa_3 = m3.numero_mesa
       AND g.fecha_mesa    = m3.fecha_mesa
       AND g.id_turno      = m3.id_turno
      LEFT JOIN mesas m4
        ON g.numero_mesa_4 > 0
       AND g.numero_mesa_4 = m4.numero_mesa
       AND g.fecha_mesa    = m4.fecha_mesa
       AND g.id_turno      = m4.id_turno
      WHERE
        (g.numero_mesa_1 > 0 AND m1.numero_mesa IS NULL)
        OR (g.numero_mesa_2 > 0 AND m2.numero_mesa IS NULL)
        OR (g.numero_mesa_3 > 0 AND m3.numero_mesa IS NULL)
        OR (g.numero_mesa_4 > 0 AND m4.numero_mesa IS NULL)
    ");

    // --- Red de seguridad para mesas "huérfanas" --------------------
    $pdo->exec("
      INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
      SELECT m.numero_mesa, m.fecha_mesa, m.id_turno, 
             CASE 
               WHEN m.id_turno = 1 THEN '07:30:00'
               WHEN m.id_turno = 2 THEN '13:30:00'
               ELSE '07:30:00'
             END AS hora
      FROM mesas m
      WHERE m.fecha_mesa IS NOT NULL
        AND m.id_turno IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM mesas_grupos g
          WHERE g.fecha_mesa = m.fecha_mesa
            AND g.id_turno   = m.id_turno
            AND m.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM mesas_no_agrupadas l
          WHERE l.numero_mesa = m.numero_mesa
            AND l.fecha_mesa  = m.fecha_mesa
            AND l.id_turno    = m.id_turno
        )
    ");

    $pdo->commit();
  }

  respond(true, [
    'resumen' => [
      'iteraciones'      => $iter,
      'cambios_totales'  => $cambiosTotales,
      'no_agrupadas_ini' => count($noAgr),
    ],
    'detalle' => [
      'movidos_a_grupos_existentes' => $detalleMov,
      'grupos_nuevos_creados'       => $detalleAgr,
      'fallidos'                    => $detalleFail,
    ],
    'nota' =>
      'Nunca se crean grupos de tamaño 1 (van a mesas_no_agrupadas), salvo las mesas especiales de 7º ' .
      'y las mesas técnicas de 3º (materias 18,32,132 exclusivas por alumno), que se mantienen como grupos de 1 en mesas_grupos. ' .
      'Además, mesas_no_agrupadas se alinea con la tabla mesas y, con la limpieza fuerte, cada numero_mesa queda en mesas_grupos ' .
      'solo en la fecha/turno real que figura en `mesas`. ' .
      'El PASO EXTRA asegura que todas las previas inscriptas terminen con un slot válido, ' .
      'y el PASO EXTRA 2 empaqueta las mesas_no_agrupadas que comparten día/turno/área. ' .
      'El arreglo nuevo permite que mesas sueltas en el mismo día/turno/área se sumen a grupos ya existentes hasta completar 4 numeros de mesa. ' .
      'Ahora, cuando se crea un registro en mesas_grupos o mesas_no_agrupadas, la columna hora se setea automáticamente en 07:30:00 para turno 1 y 13:30:00 para turno 2.'
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  respond(false, 'Error en el servidor: ' . $e->getMessage(), 500);
}