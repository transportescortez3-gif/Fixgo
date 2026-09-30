import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import categoriesRouter from "./categories";
import categoryGroupsRouter from "./category-groups";
import servicesRouter from "./services";
import messagesRouter from "./messages";
import reviewsRouter from "./reviews";
import notificationsRouter from "./notifications";
import adminRouter from "./admin";
import proposalsRouter from "./proposals";
import configRouter from "./config";
import kycRouter from "./kyc";
import storageRouter from "./storage";
import ticketsRouter from "./tickets";
import portfolioRouter from "./portfolio";
import certificationsRouter from "./certifications";
import clientErrorsRouter from "./client-errors";
import bootstrapRouter from "./bootstrap";
import logsRouter from "./logs";

const router: IRouter = Router();

router.use(bootstrapRouter);
router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(categoriesRouter);
router.use(categoryGroupsRouter);
router.use(servicesRouter);
router.use(messagesRouter);
router.use(reviewsRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(proposalsRouter);
router.use(configRouter);
router.use(kycRouter);
router.use(storageRouter);
router.use(ticketsRouter);
router.use(portfolioRouter);
router.use(certificationsRouter);
router.use(clientErrorsRouter);
router.use(logsRouter);

import firmasRouter from "./firmas";
router.use(firmasRouter);

import subscriptionsRouter from "./subscriptions";
router.use(subscriptionsRouter);

import callsRouter from "./calls";
router.use(callsRouter);

import blocksRouter from "./blocks";
router.use(blocksRouter);

import favoritesRouter from "./favorites";
router.use(favoritesRouter);

import alertSessionsRouter from "./alert-sessions";
router.use(alertSessionsRouter);

import geoipRouter from "./geoip";
router.use(geoipRouter);

import directMessagesRouter from "./direct-messages";
router.use(directMessagesRouter);

import cancellationChargesRouter from "./cancellation-charges";
import securitySelfiesRouter from "./security-selfies";
import chatAttachmentsRouter from "./chat-attachments";
import accountDeletionRouter from "./account-deletion";
router.use(cancellationChargesRouter);
router.use(securitySelfiesRouter);
router.use(chatAttachmentsRouter);
router.use(accountDeletionRouter);

export default router;
