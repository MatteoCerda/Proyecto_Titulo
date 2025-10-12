import { Router } from 'express';
import { postRegister, postLogin, postForgotPassword, postResetPassword } from './auth.controller';

const router = Router();
router.post('/register', postRegister);
router.post('/login', postLogin);
router.post('/forgot', postForgotPassword);
router.post('/reset', postResetPassword);
export default router;
