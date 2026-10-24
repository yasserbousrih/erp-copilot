const app = require('./app');
const config = require('./config');

app.listen(config.PORT, () => console.log(`ERP Copilot listening on port ${config.PORT}`));
