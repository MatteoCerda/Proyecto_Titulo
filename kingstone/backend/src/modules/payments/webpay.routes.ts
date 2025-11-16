import { Router } from 'express';
import {
  commitTransaction,
  createTransaction,
  getTransactionStatus,
} from './webpay.controller';

const router = Router();

router.post('/webpay/create', createTransaction);
router.post('/webpay/commit', commitTransaction);
router.post('/webpay/status', getTransactionStatus);
export default router;
