-- DropForeignKey
ALTER TABLE `cliente` DROP FOREIGN KEY `cliente_id_usuario_fkey`;

-- AlterTable
ALTER TABLE `cliente` ADD COLUMN `claim_code_hash` VARCHAR(128) NULL,
    ADD COLUMN `claim_expires_at` DATETIME(3) NULL,
    ADD COLUMN `claim_issued_at` DATETIME(3) NULL,
    ADD COLUMN `estado` VARCHAR(30) NOT NULL DEFAULT 'active',
    ADD COLUMN `metadata` JSON NULL,
    ADD COLUMN `rut_normalizado` VARCHAR(15) NULL,
    ADD COLUMN `tipo_registro` VARCHAR(30) NULL,
    MODIFY `id_usuario` INTEGER NULL;

-- AlterTable
ALTER TABLE `pedido` ADD COLUMN `cliente_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `cliente_rut_normalizado_idx` ON `cliente`(`rut_normalizado`);

-- CreateIndex
CREATE INDEX `pedido_cliente_id_idx` ON `pedido`(`cliente_id`);

-- AddForeignKey
ALTER TABLE `cliente` ADD CONSTRAINT `cliente_id_usuario_fkey` FOREIGN KEY (`id_usuario`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido` ADD CONSTRAINT `pedido_cliente_id_fkey` FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id_cliente`) ON DELETE SET NULL ON UPDATE CASCADE;
