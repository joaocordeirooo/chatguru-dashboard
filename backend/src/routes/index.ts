import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate, admin } from "../middlewares/security.js";
import { login, logout } from "../controllers/auth.js";
import { dashboard } from "../controllers/dashboard.js";
import * as users from "../controllers/users.js";
import { publicUser } from "../services/users.js";
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
routes.get("/users", admin, users.list);
routes.post("/users", admin, users.create);
routes.patch("/users/:id", admin, users.update);
