"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webpay_controller_1 = require("./webpay.controller");
const router = (0, express_1.Router)();
router.post('/webpay/create', webpay_controller_1.createTransaction);
router.post('/webpay/commit', webpay_controller_1.commitTransaction);
router.post('/webpay/status', webpay_controller_1.getTransactionStatus);
exports.default = router;
