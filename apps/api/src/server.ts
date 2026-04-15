import { app } from './app.js';
import { env } from './env.js';

const port = Number(env.PORT);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
