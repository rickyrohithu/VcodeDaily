const app = require('./api/index');
const port = 3000;

app.listen(port, () => {
    console.log(`Local Backend running on http://localhost:${port}`);
});
