-- Create cliente table
CREATE TABLE IF NOT EXISTS `cliente` (
  `id_cliente` INT NOT NULL AUTO_INCREMENT,
  `rut` VARCHAR(15) NULL,
  `nombre_contacto` VARCHAR(150) NULL,
  `email` VARCHAR(120) NULL,
  `telefono` VARCHAR(30) NULL,
  `direccion` VARCHAR(200) NULL,
  `comuna` VARCHAR(80) NULL,
  `ciudad` VARCHAR(80) NULL,
  `id_usuario` INT NOT NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `cliente_id_usuario_key`(`id_usuario`),
  INDEX `cliente_id_usuario_idx`(`id_usuario`),
  PRIMARY KEY (`id_cliente`),
  CONSTRAINT `cliente_id_usuario_fkey` FOREIGN KEY (`id_usuario`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



