USE kingston_estampados;

-- ============================================================
-- SUCURSALES
-- ============================================================

INSERT INTO sucursal (nombre, direccion) VALUES
('Casa Matriz', 'Loreto 216, Recoleta'),
('Sucursal Centro', 'Toesca 2760, Santiago Centro');

-- ============================================================
-- BODEGAS POR SUCURSAL
-- ============================================================

INSERT INTO bodega (id_sucursal, nombre) VALUES
(1, 'Bodega Principal'),
(2, 'Bodega Centro');

-- ============================================================
-- UBICACIONES INTERNAS
-- ============================================================

INSERT INTO ubicacion (id_bodega, codigo, descripcion) VALUES
(1, 'A1', 'Pasillo principal - estante A1'),
(1, 'B1', 'Pasillo 2 - estante B1'),
(2, 'A1', 'Sección frontal Toesca'),
(2, 'B1', 'Depósito trasero Toesca');

-- ============================================================
-- CLIENTE DE EJEMPLO
-- ============================================================

INSERT INTO cliente (rut, razon_social, nombre_contacto, email, telefono, direccion, comuna, ciudad)
VALUES ('11.111.111-1', 'Cliente de Ejemplo SpA', 'Juan Pérez', 'cliente@ejemplo.cl', '+56 9 1234 5678',
        'Av. Providencia 1000', 'Providencia', 'Santiago');

-- ============================================================
-- VISTAS (solo lectura)
-- ============================================================

CREATE OR REPLACE VIEW vw_stock_actual AS
SELECT 
    v.id_variante,
    v.id_producto,
    SUM(l.cantidad_disponible) AS stock_disponible,
    SUM(l.cantidad_disponible * l.costo_unitario) AS valor_total
FROM lote_stock l
JOIN producto_variante v ON v.id_variante = l.id_variante
GROUP BY v.id_variante, v.id_producto;

CREATE OR REPLACE VIEW vw_kardex AS
SELECT 
    m.id_mov,
    m.fecha,
    m.id_variante,
    m.id_ubicacion,
    m.tipo,
    m.cantidad,
    m.costo_unitario,
    m.referencia_tipo,
    m.referencia_id
FROM mov_inventario m
ORDER BY m.fecha DESC;

CREATE OR REPLACE VIEW vw_alertas_stock AS
SELECT 
    u.id_umbral,
    u.id_variante,
    u.id_ubicacion,
    u.stock_min,
    COALESCE(SUM(l.cantidad_disponible), 0) AS stock_actual,
    CASE 
        WHEN COALESCE(SUM(l.cantidad_disponible), 0) < u.stock_min THEN 'BAJO STOCK'
        ELSE 'OK'
    END AS estado
FROM umbral_stock u
LEFT JOIN lote_stock l ON l.id_variante = u.id_variante AND l.id_ubicacion = u.id_ubicacion
GROUP BY u.id_umbral, u.id_variante, u.id_ubicacion, u.stock_min;

-- ============================================================
-- PROCEDIMIENTOS FIFO
-- ============================================================

DELIMITER //

CREATE PROCEDURE sp_salida_fifo(
    IN p_id_variante BIGINT,
    IN p_id_ubicacion INT,
    IN p_cantidad DECIMAL(14,4),
    IN p_referencia_tipo VARCHAR(40),
    IN p_referencia_id BIGINT
)
BEGIN
    DECLARE v_restante DECIMAL(14,4);
    DECLARE v_lote BIGINT;
    DECLARE v_disp DECIMAL(14,4);
    DECLARE v_costo DECIMAL(14,4);

    SET v_restante = p_cantidad;

    DECLARE cur CURSOR FOR
        SELECT id_lote, cantidad_disponible, costo_unitario
        FROM lote_stock
        WHERE id_variante = p_id_variante
          AND id_ubicacion = p_id_ubicacion
          AND cantidad_disponible > 0
        ORDER BY fecha_ingreso ASC;

    DECLARE CONTINUE HANDLER FOR NOT FOUND CLOSE cur;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_lote, v_disp, v_costo;
        IF v_restante <= 0 THEN
            LEAVE read_loop;
        END IF;

        IF v_restante > v_disp THEN
            UPDATE lote_stock
            SET cantidad_disponible = 0
            WHERE id_lote = v_lote;

            INSERT INTO mov_inventario (id_variante, id_ubicacion, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id)
            VALUES (p_id_variante, p_id_ubicacion, 'SALIDA_VENTA', -v_disp, v_costo, p_referencia_tipo, p_referencia_id);

            SET v_restante = v_restante - v_disp;
        ELSE
            UPDATE lote_stock
            SET cantidad_disponible = cantidad_disponible - v_restante
            WHERE id_lote = v_lote;

            INSERT INTO mov_inventario (id_variante, id_ubicacion, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id)
            VALUES (p_id_variante, p_id_ubicacion, 'SALIDA_VENTA', -v_restante, v_costo, p_referencia_tipo, p_referencia_id);

            SET v_restante = 0;
        END IF;
    END LOOP;
    CLOSE cur;
END //

CREATE PROCEDURE sp_ingreso_fifo(
    IN p_id_variante BIGINT,
    IN p_id_ubicacion INT,
    IN p_costo_unitario DECIMAL(14,4),
    IN p_cantidad DECIMAL(14,4),
    IN p_referencia_tipo VARCHAR(40),
    IN p_referencia_id BIGINT
)
BEGIN
    INSERT INTO lote_stock (id_variante, id_ubicacion, fecha_ingreso, costo_unitario, cantidad_inicial, cantidad_disponible)
    VALUES (p_id_variante, p_id_ubicacion, CURDATE(), p_costo_unitario, p_cantidad, p_cantidad);

    INSERT INTO mov_inventario (id_variante, id_ubicacion, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id)
    VALUES (p_id_variante, p_id_ubicacion, 'INGRESO', p_cantidad, p_costo_unitario, p_referencia_tipo, p_referencia_id);
END //

DELIMITER ;

-- ============================================================
-- FIN DEL BLOQUE DE CONFIGURACIÓN
-- ============================================================
