import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate, admin } from "../middlewares/security.js";
import { login, logout } from "../controllers/auth.js";
import { dashboard } from "../controllers/dashboard.js";
import * as users from "../controllers/users.js";
import { publicUser } from "../services/users.js";
import express from "express";
import * as intelligence from "../controllers/intelligence.js";
import * as billing from "../controllers/billing.js";
import { crmRoutes } from "./crm.js";
export const routes = Router();
routes.post(
  "/auth/login",
  rateLimit({
    windowMs: 900000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  login,
);
routes.post("/auth/logout", logout);
routes.use(authenticate);
routes.get("/auth/me", (req, res) => res.json(publicUser(req.user)));
routes.get("/dashboard", dashboard);
routes.use("/crm", crmRoutes);
routes.get("/users", admin, users.list);
routes.post("/users", admin, users.create);
routes.patch("/users/:id", admin, users.update);
routes.get("/billing", admin, billing.overview);
routes.post("/billing/calculate", admin, billing.calculate);
routes.get("/billing/rules", admin, billing.rules);
routes.put("/billing/rules", admin, billing.rule);
const billingLimit = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
routes.post(
  "/billing/dialogues/preview",
  admin,
  billingLimit,
  express.raw({ type: "text/csv", limit: "15mb" }),
  billing.preview,
);
routes.post(
  "/billing/dialogues/commit",
  admin,
  billingLimit,
  express.raw({ type: "text/csv", limit: "15mb" }),
  billing.commit,
);
routes.get("/intelligence/config", admin, intelligence.config);
routes.get("/intelligence/metrics", admin, intelligence.overview);
routes.get("/intelligence/imports", admin, intelligence.history);
const importLimit = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
routes.post(
  "/intelligence/imports/preview",
  admin,
  importLimit,
  express.raw({ type: "text/csv", limit: "15mb" }),
  intelligence.preview,
);
routes.post(
  "/intelligence/imports/commit",
  admin,
  importLimit,
  express.raw({ type: "text/csv", limit: "15mb" }),
  intelligence.commit,
);
routes.post(
  "/intelligence/analyze",
  admin,
  rateLimit({
    windowMs: 60000,
    limit: 3,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  intelligence.analysis,
);
