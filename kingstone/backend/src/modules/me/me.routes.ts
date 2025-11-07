
import { Router } from 'express';
import { authGuard } from '../common/middlewares/authGuard';
import * as meController from './me.controller';

const router = Router();

router.get('/', authGuard, meController.getUserProfile);
router.put('/', authGuard, meController.updateUserProfile);
router.put('/password', authGuard, meController.updateUserPassword);
router.get('/profile', authGuard, meController.getClientProfile);
router.put('/profile', authGuard, meController.upsertClientProfile);

export default router;
