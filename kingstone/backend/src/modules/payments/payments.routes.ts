import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  commitTransaction,
  createTransaction,
  getTransactionStatus,
} from './webpay.controller';
import {
  approveTransfer,
  downloadTransferReceipt,
  getTransferInfo,
  listTransferRequests,
  notifyTransfer,
  rejectTransfer,
  TRANSFER_UPLOAD_DIR
} from './transfer.controller';

const router = Router();

function buildReceiptFilename(originalName?: string | null) {
  const ext = originalName ? path.extname(originalName) : '';
  const safeExt = ext && ext.length <= 10 ? ext : '';
  const base = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${base}-${random}${safeExt}`;
}

if (!fs.existsSync(TRANSFER_UPLOAD_DIR)) {
  fs.mkdirSync(TRANSFER_UPLOAD_DIR, { recursive: true });
}

const transferStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TRANSFER_UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, buildReceiptFilename(file.originalname))
});

const transferUpload = multer({
  storage: transferStorage,
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de comprobante no soportado'));
    }
  }
});

router.post('/webpay/create', createTransaction);
router.post('/webpay/commit', commitTransaction);
router.post('/webpay/status', getTransactionStatus);

router.get('/transfer/info', getTransferInfo);
router.post('/transfer/notify', transferUpload.single('receipt'), notifyTransfer);
router.get('/transfer/requests', listTransferRequests);
router.get('/transfer/:pedidoId/receipt', downloadTransferReceipt);
router.post('/transfer/:pedidoId/approve', approveTransfer);
router.post('/transfer/:pedidoId/reject', rejectTransfer);

export default router;
