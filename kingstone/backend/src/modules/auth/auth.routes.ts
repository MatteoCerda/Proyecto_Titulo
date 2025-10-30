import { Router } from 'express';
import { postRegister, postClientLogin, postAdminLogin, postOperatorLogin, postForgotPassword, postResetPassword } from './auth.controller';

const router = Router();
router.post('/register', postRegister);
router.post('/login', postClientLogin);
router.post('/login/admin', postAdminLogin);
router.post('/login/operator', postOperatorLogin);
router.post('/forgot', postForgotPassword);
router.post('/reset', postResetPassword);
export default router;
