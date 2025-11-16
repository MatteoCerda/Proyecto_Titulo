-- AlterTable
ALTER TABLE `inventory_item` ADD COLUMN `description` TEXT NULL;

-- CreateTable
CREATE TABLE `webpay_transaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `buyOrder` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `returnUrl` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'created',
    `lastResponse` JSON NULL,
    `authorizationCode` VARCHAR(191) NULL,
    `paymentTypeCode` VARCHAR(191) NULL,
    `installmentsNumber` INTEGER NULL,
    `installmentsAmount` INTEGER NULL,
    `cardNumber` VARCHAR(191) NULL,
    `accountingDate` VARCHAR(191) NULL,
    `transactionDate` DATETIME(3) NULL,
    `balance` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `webpay_transaction_buyOrder_key`(`buyOrder`),
    UNIQUE INDEX `webpay_transaction_token_key`(`token`),
    INDEX `webpay_transaction_pedidoId_idx`(`pedidoId`),
    INDEX `webpay_transaction_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `webpay_transaction` ADD CONSTRAINT `webpay_transaction_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
