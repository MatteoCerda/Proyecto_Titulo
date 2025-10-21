-- CreateTable
CREATE TABLE `cotizacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cliente_id` INTEGER NULL,
    `canal` VARCHAR(30) NOT NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'NUEVA',
    `total_estimado` DECIMAL(12, 2) NULL,
    `metadata` JSON NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cotizacion_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cotizacion_id` INTEGER NOT NULL,
    `producto` VARCHAR(200) NOT NULL,
    `variantes` JSON NULL,
    `cantidad` INTEGER NOT NULL DEFAULT 1,
    `notas` TEXT NULL,
    `archivos` JSON NULL,
    `cobertura_ink_pct` DECIMAL(5, 2) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asignacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cotizacion_id` INTEGER NOT NULL,
    `operador_id` INTEGER NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    `sla_minutos` INTEGER NOT NULL DEFAULT 10,
    `vencimiento` DATETIME(3) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aceptado_en` DATETIME(3) NULL,
    `resuelto_en` DATETIME(3) NULL,

    INDEX `asignacion_operador_id_idx`(`operador_id`),
    INDEX `asignacion_estado_idx`(`estado`),
    INDEX `asignacion_vencimiento_idx`(`vencimiento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cotizacion_id` INTEGER NOT NULL,
    `canal` VARCHAR(30) NOT NULL,
    `destino` VARCHAR(255) NOT NULL,
    `payload` JSON NULL,
    `enviado_en` DATETIME(3) NULL,
    `estado` VARCHAR(30) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oferta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `descripcion` TEXT NULL,
    `imageUrl` TEXT NULL,
    `link` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `prioridad` INTEGER NOT NULL DEFAULT 0,
    `item_id` INTEGER NULL,
    `inicio_en` DATETIME(3) NULL,
    `fin_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `oferta_activo_idx`(`activo`),
    INDEX `oferta_inicio_en_idx`(`inicio_en`),
    INDEX `oferta_fin_en_idx`(`fin_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cotizacion` ADD CONSTRAINT `cotizacion_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cotizacion_item` ADD CONSTRAINT `cotizacion_item_cotizacion_id_fkey` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asignacion` ADD CONSTRAINT `asignacion_cotizacion_id_fkey` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asignacion` ADD CONSTRAINT `asignacion_operador_id_fkey` FOREIGN KEY (`operador_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificacion` ADD CONSTRAINT `notificacion_cotizacion_id_fkey` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oferta` ADD CONSTRAINT `oferta_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `inventory_item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
