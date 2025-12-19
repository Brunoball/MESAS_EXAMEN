<?php
// backend/modules/previas/obtener_previas_baja.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
    if ($pdo instanceof PDO) {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec("SET NAMES utf8mb4");
    } else {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    // Filtros opcionales (mismo estilo que obtener_previas.php)
    $q    = isset($_GET['q'])    ? trim((string)$_GET['q'])    : '';
    $dni  = isset($_GET['dni'])  ? trim((string)$_GET['dni'])  : '';
    $id   = isset($_GET['id'])   ? (int)$_GET['id']            : 0;

    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.anio,
            p.fecha_carga,
            p.id_materia,
            p.id_condicion,
            COALESCE(p.inscripcion, 0) AS inscripcion,
            COALESCE(p.activo, 1)      AS activo,

            -- IDs crudos para el formulario de edición
            p.cursando_id_curso    AS cursando_id_curso,
            p.cursando_id_division AS cursando_id_division,
            p.materia_id_curso     AS materia_id_curso,
            p.materia_id_division  AS materia_id_division,

            -- Nombres mostrables
            m.materia                                   AS materia_nombre,
            c.condicion                                 AS condicion_nombre,

            -- Curso/división de la MATERIA
            cur_materia.nombre_curso                    AS materia_curso_nombre,
            div_materia.nombre_division                 AS materia_division_nombre,
            CONCAT(cur_materia.nombre_curso, '° ', div_materia.nombre_division) AS materia_curso_division,

            -- Curso/división del ALUMNO (cursando)
            cur_cursando.nombre_curso                   AS cursando_curso_nombre,
            div_cursando.nombre_division                AS cursando_division_nombre

        FROM previas   p
        LEFT JOIN materias   m           ON m.id_materia            = p.id_materia
        LEFT JOIN condicion  c           ON c.id_condicion          = p.id_condicion

        LEFT JOIN curso      cur_materia  ON cur_materia.id_curso     = p.materia_id_curso
        LEFT JOIN division   div_materia  ON div_materia.id_division  = p.materia_id_division

        LEFT JOIN curso      cur_cursando ON cur_cursando.id_curso    = p.cursando_id_curso
        LEFT JOIN division   div_cursando ON div_cursando.id_division = p.cursando_id_division

        /**WHERE**/
        ORDER BY p.fecha_carga DESC, p.alumno ASC
    ";

    $where  = [];
    $params = [];

    // ✅ SOLO BAJAS
    $where[] = "COALESCE(p.activo, 1) = 0";

    // Búsquedas específicas (opcionales)
    if ($id > 0) {
        $where[] = "p.id_previa = :id";
        $params[':id'] = $id;
    } elseif ($dni !== '') {
        $where[] = "p.dni LIKE :dni";
        $params[':dni'] = "%{$dni}%";
    } elseif ($q !== '') {
        $where[] = "p.alumno LIKE :q";
        $params[':q'] = "%{$q}%";
    }

    $sql = str_replace('/**WHERE**/', 'WHERE ' . implode(' AND ', $where), $sql);

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $previas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['exito' => true, 'previas' => $previas], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al obtener las previas dadas de baja: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
