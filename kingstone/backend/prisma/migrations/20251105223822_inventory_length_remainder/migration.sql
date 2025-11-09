-- CreateTable
CREATE TABLE `inventory_length_remainder` (
    `inventoryId` INTEGER NOT NULL,
    `remainder_cm` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`inventoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `pedido`
    ADD COLUMN `subtotal` INTEGER NULL DEFAULT 0,
    ADD COLUMN `tax_total` INTEGER NULL DEFAULT 0,
    ADD COLUMN `moneda` VARCHAR(191) NOT NULL DEFAULT 'CLP';

-- AddForeignKey
ALTER TABLE `inventory_length_remainder` ADD CONSTRAINT `inventory_length_remainder_inventoryId_fkey` FOREIGN KEY (`inventoryId`) REFERENCES `inventory_item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
