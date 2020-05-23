// Dependencies
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
// ------------
// Components
const about = require('./Routes/about');
const proxy = require('./Routes/proxy');

const app = express();

app.set('view engine', 'pug');
app.set('views', './Views');

app.use(express.json());
app.use(cors());
app.use('/', about);
app.use('/proxy', proxy);

const blacklistOrigin = [];
const corsOptions = {
    origin: (origin, callback) => callback(null, true)
};
app.use(cors(corsOptions));

if (app.get('env') === 'development'){
    app.use(morgan('tiny'));
    console.log('Using Morgan...');
}

const port = process.env.PORT || 3005;
app.listen(port, () => console.log(`Listening on port ${port}`));