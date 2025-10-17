-- Agrega columna de umbral para aviso de bajo stock
ALTER TABLE `inventory_item`
  ADD COLUMN `umbral_bajo_stock` INT NOT NULL DEFAULT 0 COMMENT 'Umbral para aviso de bajo stock';

