import express from 'express';
import cors from 'cors';
// Import your routes and setup

const app = express();
app.use(cors());
app.use(express.json());

// Your API routes here...

// IMPORTANT: Export app, don't call app.listen()
export default app;