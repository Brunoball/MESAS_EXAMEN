<?php
// backend/modules/previas/previas_guardar_copia_inscriptos.php
// ✅ Historial de inscriptos SIN borrar
// ✅ fecha_carga = NOW() (fecha de la acción)
// ✅ snapshot_run_id = UUID() para permitir múltiples snapshots sin chocar con UNIQUE

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // debe definir $pdo (PDO)

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    throw new RuntimeException('No se pudo inicializar la conexión PDO.');
  }

  $dbName        = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
  $tablaPrevias  = 'previas';
  $tablaSnapshot = 'previas_inscriptos_snapshot';

  if ($dbName === '') {
    throw new RuntimeException('No se pudo determinar la base de datos activa.');
  }

  // ✅ ID único de esta corrida (corte)
  // Usamos UUID del lado PHP (no dependemos de funciones MySQL)
  $snapshotRunId = sprintf(
    '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
    random_int(0, 0xffff), random_int(0, 0xffff),
    random_int(0, 0xffff),
    random_int(0, 0x0fff) | 0x4000,
    random_int(0, 0x3fff) | 0x8000,
    random_int(0, 0xffff), random_int(0, 0xffff), random_int(0, 0xffff)
  );

  /* =========================================================
     1) Asegurar tabla snapshot
     ========================================================= */
  $pdo->exec("CREATE TABLE IF NOT EXISTS `$tablaSnapshot` LIKE `$tablaPrevias`");

  // Asegurar snapshot_id PK autoincrement (si aún no existe)
  $stmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = :db
      AND TABLE_NAME   = :t
      AND COLUMN_NAME  = 'snapshot_id'
  ");
  $stmt->execute([':db' => $dbName, ':t' => $tablaSnapshot]);
  $tieneSnapshotId = (int)$stmt->fetchColumn();

  if ($tieneSnapshotId === 0) {
    // Si fue clonada con PK, quitamos PK y auto_increment viejo antes
    $stmt = $pdo->prepare("
      SELECT COUNT(*)
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = :db
        AND TABLE_NAME        = :t
        AND CONSTRAINT_TYPE   = 'PRIMARY KEY'
    ");
    $stmt->execute([':db' => $dbName, ':t' => $tablaSnapshot]);
    $tienePK = ((int)$stmt->fetchColumn()) > 0;

    if ($tienePK) {
      // quitar auto_increment si existiera
      $stmt = $pdo->prepare("
        SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = :db
          AND TABLE_NAME   = :t
          AND EXTRA LIKE '%auto_increment%'
        LIMIT 1
      ");
      $stmt->execute([':db' => $dbName, ':t' => $tablaSnapshot]);
      $auto = $stmt->fetch(PDO::FETCH_ASSOC);

      if ($auto && !empty($auto['COLUMN_NAME'])) {
        $col  = $auto['COLUMN_NAME'];
        $tipo = $auto['COLUMN_TYPE'];
        $null = (strtoupper((string)$auto['IS_NULLABLE']) === 'YES') ? 'NULL' : 'NOT NULL';
        $pdo->exec("ALTER TABLE `$tablaSnapshot` MODIFY `$col` $tipo $null");
      }

      $pdo->exec("ALTER TABLE `$tablaSnapshot` DROP PRIMARY KEY");
    }

    $pdo->exec("
      ALTER TABLE `$tablaSnapshot`
      ADD COLUMN `snapshot_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST
    ");
  }

  // Asegurar snapshot_run_id (para permitir historial)
  $stmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = :db
      AND TABLE_NAME   = :t
      AND COLUMN_NAME  = 'snapshot_run_id'
  ");
  $stmt->execute([':db' => $dbName, ':t' => $tablaSnapshot]);
  $tieneRunId = (int)$stmt->fetchColumn();

  if ($tieneRunId === 0) {
    $pdo->exec("
      ALTER TABLE `$tablaSnapshot`
      ADD COLUMN `snapshot_run_id` CHAR(36) NOT NULL AFTER `snapshot_id`
    ");
    try { $pdo->exec("CREATE INDEX `idx_snapshot_run_id` ON `$tablaSnapshot` (`snapshot_run_id`)"); } catch (Throwable $e) {}
  }

  /* =========================================================
     2) Insertar historial SIN borrar nada
     - fecha_carga = NOW()
     - snapshot_run_id = valor fijo para toda la corrida
     ========================================================= */

  // columnas previas en orden
  $stmt = $pdo->prepare("
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = :db
      AND TABLE_NAME   = :t
    ORDER BY ORDINAL_POSITION
  ");
  $stmt->execute([':db' => $dbName, ':t' => $tablaPrevias]);
  $colsPrevias = $stmt->fetchAll(PDO::FETCH_COLUMN);

  if (!$colsPrevias) {
    throw new RuntimeException('No se pudieron leer columnas de previas.');
  }

  // columnas snapshot existentes
  $stmt = $pdo->prepare("
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = :db
      AND TABLE_NAME   = :t
  ");
  $stmt->execute([':db' => $dbName, ':t' => $tablaSnapshot]);
  $colsSnapshot = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));

  $destCols = ['`snapshot_run_id`'];
  $selectExpr = [':run_id AS `snapshot_run_id`'];

  foreach ($colsPrevias as $c) {
    if (!isset($colsSnapshot[$c])) continue;

    $destCols[] = "`$c`";

    if ($c === 'fecha_carga') {
      $selectExpr[] = "NOW() AS `fecha_carga`";
    } else {
      $selectExpr[] = "`$c`";
    }
  }

  $sql = "
    INSERT INTO `$tablaSnapshot` (" . implode(', ', $destCols) . ")
    SELECT " . implode(', ', $selectExpr) . "
    FROM `$tablaPrevias`
    WHERE `inscripcion` = 1
  ";

  $pdo->beginTransaction();

  $stmt = $pdo->prepare($sql);
  $stmt->execute([':run_id' => $snapshotRunId]);

  $copiados = $stmt->rowCount();

  $pdo->commit();

  echo json_encode([
    'exito' => true,
    'mensaje' => 'Snapshot guardado (historial) correctamente.',
    'copiados' => (int)$copiados,
    'snapshot_run_id' => $snapshotRunId
  ]);
} catch (Throwable $e) {
  if (isset($pdo) && ($pdo instanceof PDO) && $pdo->inTransaction()) {
    $pdo->rollBack();
  }
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error al guardar la copia: ' . $e->getMessage()
  ]);
}
