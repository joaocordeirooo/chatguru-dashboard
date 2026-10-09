import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as crm from "../controllers/crm.js";
import { admin } from "../middlewares/security.js";
import { attachmentBody } from "../middlewares/crm.js";
import { crmConfig } from "../config/crm.js";
export const crmRoutes = Router();
crmRoutes.get("/board", crm.board);
crmRoutes.post("/stages", admin, crm.createStage);
crmRoutes.put("/stages/order", admin, crm.reorder);
crmRoutes.patch("/stages/:id", admin, crm.updateStage);
crmRoutes.delete("/stages/:id", admin, crm.removeStage);
crmRoutes.get("/tasks/:id", crm.detail);
crmRoutes.post("/tasks", crm.createTask);
crmRoutes.patch("/tasks/:id", crm.updateTask);
crmRoutes.patch("/tasks/:id/move", crm.move);
crmRoutes.post(
  "/tasks/:id/attachments",
  rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  express.raw({
    type: "application/octet-stream",
    limit: crmConfig.maxFileBytes,
  }),
  attachmentBody,
  crm.upload,
);
crmRoutes.get("/attachments/:id", crm.download);
crmRoutes.delete("/attachments/:id", crm.removeAttachment);
