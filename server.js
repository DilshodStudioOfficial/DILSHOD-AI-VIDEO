const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'DILSHOD AI VIDEO', status: 'online' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DILSHOD AI VIDEO running on port ${PORT}`);
});
