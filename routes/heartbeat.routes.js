import express from "express";
const router = express.Router();

router.get("/", (_req, res) => res.json({ alive: true, time: new Date().toISOString() }));

export default router;
