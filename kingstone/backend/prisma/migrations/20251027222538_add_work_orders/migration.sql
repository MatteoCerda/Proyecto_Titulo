-- CreateTable
CREATE TABLE `orden_trabajo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `tecnica` VARCHAR(60) NOT NULL,
    `maquina` VARCHAR(80) NULL,
    `estado` VARCHAR(30) NOT NULL DEFAULT 'cola',
    `programadoPara` DATETIME(3) NULL,
    `iniciaEn` DATETIME(3) NULL,
    `terminaEn` DATETIME(3) NULL,
    `notas` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `orden_trabajo_pedidoId_idx`(`pedidoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `orden_trabajo` ADD CONSTRAINT `orden_trabajo_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
